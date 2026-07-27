const express = require('express');
const router = express.Router();
const { pool } = require('../database/db');
const { authMiddleware } = require('../middleware/auth');

router.use(authMiddleware);

// Lista todas as contagens
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT sl.id, sl.filter_type, sl.filter_label, sl.notes, sl.created_at, sl.updated_at,
             sl.churrascaria_id, ch.name as churrascaria_name,
             u.name as created_by_name,
             COUNT(DISTINCT sli.id)::int as item_count,
             COUNT(DISTINCT sli.id) FILTER (WHERE sli.quantity IS NOT NULL)::int as filled_count,
             COUNT(DISTINCT o.id)::int as order_count
      FROM stock_lists sl
      LEFT JOIN users u ON u.id = sl.created_by
      LEFT JOIN churrascarias ch ON ch.id = sl.churrascaria_id
      LEFT JOIN stock_list_items sli ON sli.stock_list_id = sl.id
      LEFT JOIN orders o ON o.stock_list_id = sl.id
      GROUP BY sl.id, u.name, ch.name
      ORDER BY sl.created_at DESC
    `);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Retorna uma lista com seus itens
router.get('/:id', async (req, res) => {
  try {
    // As duas consultas não dependem uma da outra (ambas só usam :id), então
    // rodam em paralelo em vez de em série — cada uma paga ~1s de round-trip
    // pra API de query do Supabase, então isso corta o tempo da tela "Abrir" pela metade.
    const [{ rows: lists }, { rows: items }] = await Promise.all([
      pool.query(
        `SELECT sl.*, u.name as created_by_name, ch.name as churrascaria_name
         FROM stock_lists sl
         LEFT JOIN users u ON u.id = sl.created_by
         LEFT JOIN churrascarias ch ON ch.id = sl.churrascaria_id
         WHERE sl.id = $1`,
        [req.params.id]
      ),
      pool.query(`
        SELECT sli.id, sli.product_id, sli.quantity, sli.notes,
               p.name as product_name, p.unit,
               cat.name as category_name, cat.color as category_color,
               pst.ideal_qty
        FROM stock_list_items sli
        JOIN products p ON p.id = sli.product_id
        LEFT JOIN categories cat ON cat.id = p.category_id
        LEFT JOIN stock_lists sl ON sl.id = sli.stock_list_id
        LEFT JOIN product_stock_targets pst ON pst.product_id = sli.product_id AND pst.churrascaria_id = sl.churrascaria_id
        WHERE sli.stock_list_id = $1
        ORDER BY cat.name NULLS LAST, p.name
      `, [req.params.id]),
    ]);
    if (!lists[0]) return res.status(404).json({ error: 'Lista não encontrada' });

    res.json({ ...lists[0], items });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Calcula o que falta repor (estoque ideal - estoque atual) e agrupa por fornecedor.
// Lista "por fornecedor" (filter_type='company') sempre usa esse fornecedor fixo.
// Lista "por categoria" usa o fornecedor mais barato (ativo, sem ruptura), com
// preço > 0 tendo prioridade mas não sendo obrigatório — senão um produto sem
// preço cadastrado em lugar nenhum nunca entraria no pedido. Consulta única
// (CTEs) pra economizar round-trips.
router.get('/:id/pedido-preview', async (req, res) => {
  try {
    const { rows: listRows } = await pool.query(
      'SELECT id, churrascaria_id, filter_type, company_id FROM stock_lists WHERE id = $1', [req.params.id]
    );
    const lista = listRows[0];
    if (!lista) return res.status(404).json({ error: 'Lista não encontrada' });
    if (!lista.churrascaria_id) {
      return res.status(400).json({ error: 'Esta lista não tem churrascaria definida — crie uma lista nova pra gerar pedido' });
    }
    // Lista feita "por fornecedor": o pedido vai pra esse fornecedor mesmo que o
    // preço ainda não esteja cadastrado (fica 0,00, editável na hora de confirmar).
    // Lista "por categoria": mantém a regra de pegar o fornecedor mais barato, mas
    // sem exigir preço > 0 — senão um produto sem preço em nenhum lugar nunca
    // entra no pedido, mesmo precisando de reposição.
    const fixedCompanyId = lista.filter_type === 'company' ? lista.company_id : null;

    const { rows } = await pool.query(`
      WITH itens AS (
        SELECT sli.product_id, sli.quantity AS atual, p.name, p.unit,
               pst.ideal_qty
        FROM stock_list_items sli
        JOIN products p ON p.id = sli.product_id
        LEFT JOIN product_stock_targets pst ON pst.product_id = sli.product_id AND pst.churrascaria_id = $2
        WHERE sli.stock_list_id = $1
      ),
      fornecedor AS (
        SELECT DISTINCT ON (cp.product_id) cp.product_id, cp.company_id, co.name as company_name, cp.price
        FROM company_products cp
        JOIN companies co ON co.id = cp.company_id AND co.active = 1
        WHERE cp.churrascaria_id = $2 AND cp.active = 1 AND cp.ruptura = false
          AND cp.product_id IN (SELECT product_id FROM itens)
          AND ($3::int IS NULL OR cp.company_id = $3)
        ORDER BY cp.product_id, (cp.price > 0) DESC, cp.price ASC
      )
      SELECT i.product_id, i.name, i.unit, i.atual, i.ideal_qty,
             f.company_id, f.company_name, f.price
      FROM itens i
      LEFT JOIN fornecedor f ON f.product_id = i.product_id
      ORDER BY i.name
    `, [req.params.id, lista.churrascaria_id, fixedCompanyId]);

    const groupsMap = new Map();
    const sem_meta = [], nao_contado = [], sem_fornecedor = [];

    for (const r of rows) {
      const base = { product_id: r.product_id, name: r.name, unit: r.unit };
      if (r.ideal_qty === null) { sem_meta.push(base); continue; }
      if (r.atual === null) { nao_contado.push(base); continue; }
      const needed = Math.max(0, parseFloat(r.ideal_qty) - parseFloat(r.atual));
      if (needed <= 0) continue; // estoque já está no nível ideal
      if (!r.company_id) { sem_fornecedor.push({ ...base, needed_qty: needed }); continue; }
      if (!groupsMap.has(r.company_id)) {
        groupsMap.set(r.company_id, { company_id: r.company_id, company_name: r.company_name, items: [] });
      }
      groupsMap.get(r.company_id).items.push({
        product_id: r.product_id, name: r.name, unit: r.unit,
        needed_qty: needed, price: parseFloat(r.price)
      });
    }

    res.json({
      churrascaria_id: lista.churrascaria_id,
      groups: [...groupsMap.values()],
      sem_meta, nao_contado, sem_fornecedor
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// Cria uma nova lista de contagem
// Monta a seleção de produtos, o insert da lista e o insert dos itens numa
// única query (CTEs), em vez de 3-4 chamadas sequenciais — cada round-trip pra
// API de query do Supabase custa ~1s, então isso derruba o tempo de "Criar Lista"
// de ~4s para ~1 chamada só.
router.post('/', async (req, res) => {
  const { filter_type, company_id, category_ids, notes, churrascaria_id } = req.body;
  if (!churrascaria_id) return res.status(400).json({ error: 'Churrascaria é obrigatória' });

  try {
    let sql, params;

    if (filter_type === 'company') {
      sql = `
        WITH prods AS (
          SELECT DISTINCT p.id FROM products p
          JOIN company_products cp ON cp.product_id = p.id
          WHERE cp.company_id = $1 AND cp.active = 1 AND p.active = 1
        ), new_list AS (
          INSERT INTO stock_lists (filter_type, filter_label, company_id, notes, created_by, churrascaria_id)
          VALUES ('company', COALESCE((SELECT name FROM companies WHERE id = $1), ''), $1, $2, $3, $4)
          RETURNING id
        ), inserted AS (
          INSERT INTO stock_list_items (stock_list_id, product_id)
          SELECT nl.id, pr.id FROM new_list nl CROSS JOIN prods pr
          RETURNING 1
        )
        SELECT nl.id AS id, (SELECT COUNT(*)::int FROM prods) AS item_count FROM new_list nl
      `;
      params = [company_id, notes || null, req.user.id, churrascaria_id];
    } else {
      const catIds = (category_ids || []).map(Number).filter(Boolean);
      if (catIds.length) {
        sql = `
          WITH cats AS (
            SELECT name FROM categories WHERE id = ANY($1::int[]) ORDER BY name
          ), prods AS (
            SELECT id FROM products WHERE category_id = ANY($1::int[]) AND active = 1
          ), new_list AS (
            INSERT INTO stock_lists (filter_type, filter_label, company_id, notes, created_by, churrascaria_id)
            VALUES ('category', COALESCE((SELECT string_agg(name, ', ' ORDER BY name) FROM cats), ''), NULL, $2, $3, $4)
            RETURNING id
          ), inserted AS (
            INSERT INTO stock_list_items (stock_list_id, product_id)
            SELECT nl.id, pr.id FROM new_list nl CROSS JOIN prods pr
            RETURNING 1
          )
          SELECT nl.id AS id, (SELECT COUNT(*)::int FROM prods) AS item_count FROM new_list nl
        `;
        params = [catIds, notes || null, req.user.id, churrascaria_id];
      } else {
        sql = `
          WITH prods AS (
            SELECT id FROM products WHERE active = 1
          ), new_list AS (
            INSERT INTO stock_lists (filter_type, filter_label, company_id, notes, created_by, churrascaria_id)
            VALUES ('category', 'Todos os produtos', NULL, $1, $2, $3)
            RETURNING id
          ), inserted AS (
            INSERT INTO stock_list_items (stock_list_id, product_id)
            SELECT nl.id, pr.id FROM new_list nl CROSS JOIN prods pr
            RETURNING 1
          )
          SELECT nl.id AS id, (SELECT COUNT(*)::int FROM prods) AS item_count FROM new_list nl
        `;
        params = [notes || null, req.user.id, churrascaria_id];
      }
    }

    const { rows: result } = await pool.query(sql, params);
    res.json({ id: result[0].id, item_count: result[0].item_count });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Salva as quantidades dos itens
router.put('/:id/items', async (req, res) => {
  const { items } = req.body;
  if (!items || items.length === 0) return res.json({ ok: true });
  try {
    const valParts = [];
    const params = [req.params.id];
    for (const item of items) {
      const base = params.length;
      valParts.push(`($${base + 1}::int, $${base + 2}::numeric, $${base + 3}::text)`);
      params.push(item.product_id, item.quantity ?? null, item.notes || null);
    }
    // Uma chamada só (CTE) em vez de dois UPDATEs sequenciais — esse endpoint é
    // chamado a cada autosave, então cada round-trip evitado conta em dobro.
    await pool.query(`
      WITH upd AS (
        UPDATE stock_list_items AS sli
        SET quantity = v.qty, notes = v.note
        FROM (VALUES ${valParts.join(',')}) AS v(pid, qty, note)
        WHERE sli.stock_list_id = $1 AND sli.product_id = v.pid
        RETURNING 1
      )
      UPDATE stock_lists SET updated_at = NOW() WHERE id = $1
    `, params);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Exclui uma lista
router.delete('/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM stock_lists WHERE id = $1', [req.params.id]);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
