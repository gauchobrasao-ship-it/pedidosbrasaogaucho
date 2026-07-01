// ════════════════════════════════════════
//  COMPARATIVE
// ════════════════════════════════════════
const Comparative = {
  state: {},

  async load() {
    const el = document.getElementById('section-comparative');
    el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const [churrs, products] = await Promise.all([
        API.get('/reports/churrascarias'),
        API.get('/products')
      ]);
      this.state = { churrs, products, items: [], lastResult: null, churrId: null };
      this.renderInput();
    } catch (err) {
      el.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

  renderInput() {
    const { churrs, products } = this.state;
    const el = document.getElementById('section-comparative');
    el.innerHTML = `
      <div style="max-width:900px">
        <div class="card mb-16">
          <div class="card-header"><span class="card-title">Cesta de Compras</span></div>
          <div class="form-group">
            <label class="form-label">Churrascaria</label>
            <select class="form-control" id="cmp-churr" style="max-width:300px">
              <option value="">Selecione...</option>
              ${churrs.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Adicionar produtos à cesta</label>
            <div class="flex flex-gap" style="flex-wrap:wrap;align-items:center">
              <button class="btn btn-gold btn-sm" onclick="Comparative.openCategoryImport()">
                📋 Importar por Categoria
              </button>
              <span style="color:var(--gray);font-size:12px">ou adicionar individualmente:</span>
            </div>
            <div class="flex flex-gap" style="flex-wrap:wrap;margin-top:8px">
              <select class="form-control" id="cmp-prod-sel" style="min-width:220px">
                <option value="">Selecione o produto...</option>
                ${products.map(p => `<option value="${p.id}">${escHtml(p.name)} (${escHtml(p.unit||'un')})</option>`).join('')}
              </select>
              <input type="number" step="0.001" min="0.001" class="form-control" id="cmp-qty"
                placeholder="Quantidade" style="width:130px">
              <button class="btn btn-outline btn-sm" onclick="Comparative.addItem()">+ Adicionar</button>
            </div>
          </div>
          <div id="cmp-basket">
            <div style="color:var(--gray);font-size:13px;padding:4px 0">Nenhum produto adicionado ainda.</div>
          </div>
          <div style="margin-top:16px;display:flex;flex-wrap:wrap;gap:10px;align-items:center">
            <button class="btn btn-primary" onclick="Comparative.compare()" id="btn-cmp" disabled>
              🔍 Comparar Preços
            </button>
            <button class="btn btn-gold btn-sm" onclick="Comparative.openSendModal()" id="btn-send" disabled>
              📤 Enviar para Fornecedores
            </button>
            <button class="btn btn-outline btn-sm" onclick="Comparative.showHistory()">
              📋 Cotações Enviadas
            </button>
          </div>
        </div>
        <div id="cmp-result"></div>
      </div>`;
  },

  addItem() {
    const sel = document.getElementById('cmp-prod-sel');
    const qtyEl = document.getElementById('cmp-qty');
    const productId = parseInt(sel.value);
    const qty = parseFloat(qtyEl.value || 0);
    if (!productId) { toast('Selecione um produto', 'error'); return; }
    if (qty <= 0) { toast('Informe a quantidade', 'error'); return; }
    if (this.state.items.some(i => i.product_id === productId)) {
      toast('Produto já está na cesta', 'error'); return;
    }
    const product = this.state.products.find(p => p.id === productId);
    this.state.items.push({ product_id: productId, product_name: product.name, unit: product.unit || 'un', quantity: qty });
    sel.value = '';
    qtyEl.value = '';
    document.getElementById('cmp-result').innerHTML = '';
    this.renderBasket();
  },

  removeItem(productId) {
    this.state.items = this.state.items.filter(i => i.product_id !== productId);
    document.getElementById('cmp-result').innerHTML = '';
    this.renderBasket();
  },

  openCategoryImport() {
    const { products } = this.state;

    // Derive unique categories from loaded products
    const catsMap = {};
    products.forEach(p => {
      if (p.category_id && !catsMap[p.category_id]) {
        catsMap[p.category_id] = { id: p.category_id, name: p.category_name || 'Sem categoria' };
      }
    });
    const cats = Object.values(catsMap).sort((a, b) => a.name.localeCompare(b.name));
    if (!cats.length) { toast('Nenhuma categoria cadastrada', 'error'); return; }

    // Build product rows grouped by category
    const productRows = products.map(p => {
      const existing = this.state.items.find(i => i.product_id === p.id);
      return `<tr class="ci-row" data-cat="${p.category_id || 0}">
        <td>${escHtml(p.name)}</td>
        <td><span class="badge badge-gray">${escHtml(p.unit||'un')}</span></td>
        <td>
          <input type="number" step="0.001" min="0" class="form-control ci-qty"
            data-id="${p.id}" data-name="${escHtml(p.name)}" data-unit="${escHtml(p.unit||'un')}"
            style="width:100px" placeholder="Qtd"
            value="${existing ? existing.quantity : ''}">
        </td>
      </tr>`;
    }).join('');

    showModal(
      'Importar por Categoria',
      `<div class="form-group">
         <label class="form-label">Filtrar categorias</label>
         <div class="perm-grid">
           <label class="perm-item" style="grid-column:1/-1">
             <input type="checkbox" id="ci-all" checked onchange="Comparative.toggleAllCats(this.checked)">
             <span class="perm-label" style="font-weight:700">Todas as categorias</span>
           </label>
           ${cats.map(c => `
             <label class="perm-item">
               <input type="checkbox" class="ci-cat-cb" data-cat="${c.id}" checked
                 onchange="Comparative.toggleCatFilter()">
               <span class="perm-label">${escHtml(c.name)}</span>
             </label>`).join('')}
         </div>
       </div>
       <hr class="divider">
       <div class="table-wrap" style="max-height:340px;overflow-y:auto">
         <table id="ci-product-table">
           <thead><tr><th>Produto</th><th>UN</th><th>Quantidade</th></tr></thead>
           <tbody>${productRows}</tbody>
         </table>
       </div>
       <div style="font-size:12px;color:var(--gray);margin-top:8px">
         Preencha a quantidade desejada. Campos vazios entram com quantidade 1.
       </div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="Comparative.confirmCategoryImport()">Adicionar à Cesta</button>`
    );
  },

  toggleAllCats(checked) {
    document.querySelectorAll('.ci-cat-cb').forEach(cb => { cb.checked = checked; });
    this.toggleCatFilter();
  },

  toggleCatFilter() {
    const activeCats = new Set(
      Array.from(document.querySelectorAll('.ci-cat-cb:checked')).map(cb => cb.dataset.cat)
    );
    document.querySelectorAll('.ci-row').forEach(row => {
      row.style.display = activeCats.has(row.dataset.cat) ? '' : 'none';
    });
    // Sync "all" checkbox
    const allCbs = document.querySelectorAll('.ci-cat-cb');
    const checkedCbs = document.querySelectorAll('.ci-cat-cb:checked');
    const allEl = document.getElementById('ci-all');
    if (allEl) allEl.checked = allCbs.length === checkedCbs.length;
  },

  confirmCategoryImport() {
    const inputs = document.querySelectorAll('.ci-qty');
    let added = 0;
    let skipped = 0;
    inputs.forEach(input => {
      const row = input.closest('tr');
      if (row && row.style.display === 'none') return; // filtered out
      const qty = parseFloat(input.value) || 1;
      const productId = parseInt(input.dataset.id);
      if (this.state.items.some(i => i.product_id === productId)) {
        // Update existing
        const item = this.state.items.find(i => i.product_id === productId);
        item.quantity = qty;
        skipped++;
      } else {
        this.state.items.push({
          product_id: productId,
          product_name: input.dataset.name,
          unit: input.dataset.unit,
          quantity: qty
        });
        added++;
      }
    });
    closeModal();
    document.getElementById('cmp-result').innerHTML = '';
    this.renderBasket();
    if (added > 0 || skipped > 0) {
      toast(`${added} produto(s) adicionado(s)${skipped > 0 ? `, ${skipped} quantidade(s) atualizada(s)` : ''}`);
    } else {
      toast('Nenhum produto com quantidade preenchida', 'error');
    }
  },

  renderBasket() {
    const el = document.getElementById('cmp-basket');
    const btn = document.getElementById('btn-cmp');
    if (!this.state.items.length) {
      el.innerHTML = '<div style="color:var(--gray);font-size:13px;padding:4px 0">Nenhum produto adicionado ainda.</div>';
      if (btn) btn.disabled = true;
      const btnSend = document.getElementById('btn-send');
      if (btnSend) btnSend.disabled = true;
      return;
    }
    if (btn) btn.disabled = false;
    const btnSend = document.getElementById('btn-send');
    if (btnSend) btnSend.disabled = false;
    el.innerHTML = `
      <div class="table-wrap" style="margin-top:8px">
        <table>
          <thead><tr><th>Produto</th><th>Unidade</th><th>Quantidade</th><th></th></tr></thead>
          <tbody>
            ${this.state.items.map(i => `<tr>
              <td><strong>${escHtml(i.product_name)}</strong></td>
              <td><span class="badge badge-gray">${escHtml(i.unit)}</span></td>
              <td>${i.quantity}</td>
              <td><button class="btn btn-danger btn-sm" onclick="Comparative.removeItem(${i.product_id})">✕</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>`;
  },

  async compare() {
    const churrId = document.getElementById('cmp-churr').value;
    if (!churrId) { toast('Selecione a churrascaria', 'error'); return; }
    if (!this.state.items.length) { toast('Adicione produtos à cesta', 'error'); return; }
    const resultEl = document.getElementById('cmp-result');
    resultEl.innerHTML = '<div class="empty-state">Calculando comparativo...</div>';
    try {
      const data = await API.post('/comparative', {
        churrascaria_id: parseInt(churrId),
        items: this.state.items.map(i => ({ product_id: i.product_id, quantity: i.quantity }))
      });
      this.state.lastResult = data;
      this.state.churrId = churrId;
      this.renderResult(data, churrId);
    } catch (err) {
      resultEl.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

  renderResult(data, churrId) {
    const { products, companies } = data;
    const resultEl = document.getElementById('cmp-result');
    if (!companies.length) {
      resultEl.innerHTML = `<div class="card"><div class="empty-state"><p>Nenhuma empresa tem preços cadastrados para estes produtos nesta churrascaria.</p><div style="font-size:13px;color:var(--gray);margin-top:8px">Faça pedidos ou cotações com estas empresas para os preços aparecerem aqui.</div></div></div>`;
      return;
    }
    const withTotal = companies.filter(c => c.total > 0);
    const cheapestId = withTotal.length ? withTotal[0].id : null;

    resultEl.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Resultado da Comparação</span>
          ${cheapestId ? `<span class="badge" style="background:#43A04722;color:#43A047;border-color:#43A04744">✓ Menor custo total: ${escHtml(companies.find(c=>c.id===cheapestId)?.name||'')}</span>` : ''}
        </div>
        <div class="table-wrap">
          <table class="cmp-table">
            <thead>
              <tr>
                <th>Produto</th>
                <th style="text-align:center">Qtd</th>
                ${companies.map(c => `<th class="${c.id===cheapestId?'cmp-best-head':''}">${escHtml(c.name)}${c.id===cheapestId?' ✓':''}</th>`).join('')}
              </tr>
            </thead>
            <tbody>
              ${products.map(p => {
                const validPrices = companies.map(c => c.prices[p.id]).filter(pr => pr > 0);
                const minPrice = validPrices.length ? Math.min(...validPrices) : null;
                return `<tr>
                  <td>
                    <div style="font-weight:600">${escHtml(p.name)}</div>
                    <div style="font-size:11px;color:var(--gray)">${escHtml(p.unit||'un')}</div>
                  </td>
                  <td style="text-align:center">${p.quantity}</td>
                  ${companies.map(c => {
                    const price = c.prices[p.id];
                    const sub = (price > 0) ? price * p.quantity : null;
                    const isBest = minPrice !== null && price === minPrice;
                    return `<td class="${isBest ? 'cmp-best' : ''}">
                      ${sub !== null
                        ? `<div class="cmp-unit-price">${fmtMoney(price)}/un</div><div class="cmp-subtotal">${fmtMoney(sub)}</div>`
                        : `<span style="color:var(--gray);font-size:13px">—</span>`}
                    </td>`;
                  }).join('')}
                </tr>`;
              }).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="2" style="font-weight:700;font-size:13px">TOTAL</td>
                ${companies.map(c => `<td class="${c.id===cheapestId?'cmp-best cmp-total-cell':'cmp-total-cell'}">
                  <strong>${fmtMoney(c.total)}</strong>
                  ${c.missing_count > 0 ? `<div style="font-size:10px;color:var(--gray);margin-top:3px">${c.missing_count} sem preço</div>` : ''}
                </td>`).join('')}
              </tr>
            </tfoot>
          </table>
        </div>
        <div style="margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
          <div style="margin-bottom:14px">
            <button class="btn btn-gold" onclick="Comparative.openShoppingList()">🛒 Lista de Compras</button>
          </div>
          <div style="font-size:12px;color:var(--gray);margin-bottom:10px">Gerar pedido com os produtos desta cesta:</div>
          <div class="flex flex-gap" style="flex-wrap:wrap">
            ${companies.map(c => `
              <button class="btn ${c.id===cheapestId?'btn-primary':'btn-outline'} btn-sm"
                onclick="Comparative.makeOrder(${c.id})">
                📋 Pedir com ${escHtml(c.name)}
              </button>`).join('')}
          </div>
        </div>
      </div>`;
  },

  _buildShoppingListData() {
    const { products, companies } = this.state.lastResult;
    const assignments = {};
    const noCotacao = [];

    products.forEach(p => {
      let bestCompany = null;
      let bestPrice = Infinity;
      companies.forEach(c => {
        const price = c.prices[p.id];
        if (price > 0 && price < bestPrice) {
          bestPrice = price;
          bestCompany = c;
        }
      });
      if (!bestCompany) {
        noCotacao.push(p);
      } else {
        if (!assignments[bestCompany.id]) {
          assignments[bestCompany.id] = { company: bestCompany, items: [], subtotal: 0 };
        }
        const subtotal = bestPrice * p.quantity;
        assignments[bestCompany.id].items.push({ name: p.name, unit: p.unit || 'un', qty: p.quantity, price: bestPrice, subtotal });
        assignments[bestCompany.id].subtotal += subtotal;
      }
    });

    const grandTotal = Object.values(assignments).reduce((s, a) => s + a.subtotal, 0);
    return { assignments: Object.values(assignments), noCotacao, grandTotal };
  },

  openShoppingList() {
    const { assignments, noCotacao, grandTotal } = this._buildShoppingListData();
    this._lastShoppingList = { assignments, noCotacao, grandTotal };

    const suppliersHtml = assignments.map(a => `
      <div style="margin-bottom:20px">
        <div style="font-weight:700;font-size:14px;color:var(--gold);border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:8px">
          ${escHtml(a.company.name)}
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Produto</th><th>UN</th><th style="text-align:center">Qtd</th><th style="text-align:right">Unit.</th><th style="text-align:right">Subtotal</th></tr></thead>
            <tbody>
              ${a.items.map(i => `<tr>
                <td style="font-weight:600">${escHtml(i.name)}</td>
                <td><span class="badge badge-gray">${escHtml(i.unit)}</span></td>
                <td style="text-align:center">${i.qty}</td>
                <td style="text-align:right">${fmtMoney(i.price)}</td>
                <td style="text-align:right;font-weight:600;color:var(--success)">${fmtMoney(i.subtotal)}</td>
              </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr>
                <td colspan="4" style="text-align:right;font-weight:700;font-size:13px">Subtotal ${escHtml(a.company.name)}:</td>
                <td style="text-align:right;font-weight:700;color:var(--gold)">${fmtMoney(a.subtotal)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>`).join('');

    const noCotacaoHtml = noCotacao.length ? `
      <div style="margin-top:8px;background:#E5393514;border:1px solid #E5393540;border-radius:8px;padding:14px 16px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:#E53935;margin-bottom:10px">
          ⚠ Sem Cotação — ${noCotacao.length} produto(s)
        </div>
        <ul style="margin:0;padding-left:18px;font-size:13px;color:var(--gray);line-height:1.9">
          ${noCotacao.map(p => `<li>${escHtml(p.name)} · ${p.quantity} ${escHtml(p.unit||'un')}</li>`).join('')}
        </ul>
      </div>` : '';

    const totalHtml = `
      <div style="margin-top:16px;padding-top:12px;border-top:2px solid var(--border);text-align:right;font-size:15px;font-weight:700">
        Total Geral: <span style="color:var(--gold)">${fmtMoney(grandTotal)}</span>
      </div>`;

    showModal(
      '🛒 Lista de Compras',
      suppliersHtml + noCotacaoHtml + totalHtml,
      `<button class="btn btn-outline" onclick="closeModal()">Fechar</button>
       <button class="btn btn-gold" onclick="Comparative.printShoppingList()">🖨 Imprimir PDF</button>`
    );
  },

  printShoppingList() {
    const { assignments, noCotacao, grandTotal } = this._lastShoppingList;
    const date = new Date().toLocaleString('pt-BR');
    const esc = s => String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    const money = v => 'R$ ' + Number(v||0).toFixed(2).replace('.', ',');

    const suppliersHtml = assignments.map(a => `
      <div class="supplier">
        <div class="supplier-name">${esc(a.company.name)}</div>
        <table>
          <thead><tr><th>Produto</th><th>UN</th><th>Qtd</th><th>Unit.</th><th>Subtotal</th></tr></thead>
          <tbody>
            ${a.items.map(i => `<tr>
              <td>${esc(i.name)}</td>
              <td>${esc(i.unit)}</td>
              <td style="text-align:center">${i.qty}</td>
              <td style="text-align:right">${money(i.price)}</td>
              <td style="text-align:right;font-weight:600">${money(i.subtotal)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4" style="text-align:right">Subtotal ${esc(a.company.name)}</td>
              <td style="text-align:right;font-weight:700">${money(a.subtotal)}</td>
            </tr>
          </tfoot>
        </table>
      </div>`).join('');

    const noCotacaoHtml = noCotacao.length ? `
      <div class="no-price">
        <div class="no-price-title">⚠ Sem Cotação — ${noCotacao.length} produto(s)</div>
        <ul>${noCotacao.map(p => `<li>${esc(p.name)} · ${p.quantity} ${esc(p.unit||'un')}</li>`).join('')}</ul>
      </div>` : '';

    const html = `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <title>Lista de Compras — Brasão Gaúcho</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;font-size:13px;color:#000;padding:20px}
    h1{font-size:18px;margin-bottom:3px}
    .date{font-size:11px;color:#666;margin-bottom:22px}
    .supplier{margin-bottom:24px;page-break-inside:avoid}
    .supplier-name{font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;border-bottom:2px solid #000;padding-bottom:5px;margin-bottom:8px}
    table{width:100%;border-collapse:collapse}
    th,td{padding:5px 8px;border:1px solid #ccc;text-align:left;font-size:12px}
    th{background:#f4f4f4;font-weight:700;text-transform:uppercase;font-size:10px;letter-spacing:.4px}
    tfoot td{background:#f9f9f9;font-weight:700}
    .no-price{margin-top:20px;padding:12px 14px;border:1px solid #c00;border-radius:4px;page-break-inside:avoid}
    .no-price-title{font-weight:700;color:#c00;margin-bottom:8px;font-size:13px}
    .no-price ul{padding-left:18px}
    .no-price li{padding:2px 0}
    .grand-total{margin-top:20px;padding-top:10px;border-top:2px solid #000;text-align:right;font-size:15px;font-weight:700}
    @media print{@page{margin:15mm}body{padding:0}}
  </style>
</head>
<body>
  <h1>Lista de Compras — Brasão Gaúcho</h1>
  <div class="date">Gerada em ${date}</div>
  ${suppliersHtml}
  ${noCotacaoHtml}
  <div class="grand-total">TOTAL GERAL: ${money(grandTotal)}</div>
  <script>window.onload=function(){window.print()}<\/script>
</body>
</html>`;

    const win = window.open('', '_blank', 'width=820,height=680');
    win.document.write(html);
    win.document.close();
  },

  async openSendModal() {
    const churrId = document.getElementById('cmp-churr')?.value;
    if (!churrId) { toast('Selecione a churrascaria antes de enviar', 'error'); return; }
    if (!this.state.items.length) { toast('Adicione produtos à cesta', 'error'); return; }
    const companies = await API.get('/companies');
    const today = new Date().toLocaleDateString('pt-BR');
    showModal(
      'Enviar Cotação para Fornecedores',
      `<div class="form-group">
         <label class="form-label">Título / Referência</label>
         <input class="form-control" id="sq-title" value="Cotação ${escHtml(today)}" placeholder="Ex: Cotação Semana 23">
       </div>
       <div class="form-group">
         <label class="form-label">Validade do link</label>
         <select class="form-control" id="sq-expires" style="max-width:200px">
           <option value="3">3 dias</option>
           <option value="7" selected>7 dias</option>
           <option value="15">15 dias</option>
           <option value="30">30 dias</option>
         </select>
       </div>
       <div class="form-group">
         <label class="form-label">Selecione os fornecedores</label>
         <div class="perm-grid">
           ${companies.map(c => `
             <label class="perm-item">
               <input type="checkbox" class="sq-comp-cb" value="${c.id}">
               <span class="perm-label">${escHtml(c.name)}</span>
             </label>`).join('')}
         </div>
       </div>
       <div style="font-size:12px;color:var(--gray)">Um link único será gerado por fornecedor. Eles preenchem os preços sem precisar de login.</div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="Comparative.generateLinks(${churrId})">Gerar Links</button>`
    );
  },

  async generateLinks(churrId) {
    const companyIds = Array.from(document.querySelectorAll('.sq-comp-cb:checked')).map(cb => parseInt(cb.value));
    if (!companyIds.length) { toast('Selecione ao menos um fornecedor', 'error'); return; }
    const title = document.getElementById('sq-title').value.trim();
    const expiresInDays = parseInt(document.getElementById('sq-expires').value);
    try {
      const result = await API.post('/price-requests', {
        churrascaria_id: parseInt(churrId),
        company_ids: companyIds,
        title,
        expires_in_days: expiresInDays,
        items: this.state.items.map(i => ({ product_id: i.product_id, quantity: i.quantity }))
      });
      this._links = result.requests;
      showModal(
        '✅ Links Gerados',
        `<div style="font-size:13px;color:var(--gray);margin-bottom:14px">
           Copie e envie para cada fornecedor via WhatsApp ou e-mail:
         </div>
         ${result.requests.map((r, idx) => `
           <div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:12px 14px;margin-bottom:10px">
             <div style="font-weight:700;margin-bottom:8px">${escHtml(r.company_name)}</div>
             <div class="flex flex-gap">
               <input type="text" class="form-control" value="${escHtml(r.url)}" readonly onclick="this.select()"
                 style="font-size:12px;font-family:monospace">
               <button class="btn btn-gold btn-sm" onclick="Comparative._copyLink(${idx})">Copiar</button>
             </div>
           </div>`).join('')}`,
        `<button class="btn btn-primary" onclick="closeModal()">Fechar</button>`
      );
    } catch (err) { toast(err.message, 'error'); }
  },

  _copyLink(idx) {
    const url = this._links?.[idx]?.url;
    if (url) navigator.clipboard.writeText(url).then(() => toast('Link copiado!'));
  },

  async showHistory() {
    showModal('Cotações Enviadas', '<div class="empty-state">Carregando...</div>');
    try {
      const requests = await API.get('/price-requests');
      this._history = requests;
      if (!requests.length) {
        document.querySelector('.modal-body').innerHTML = '<div class="empty-state">Nenhuma cotação enviada ainda.</div>';
        return;
      }
      const now = new Date();
      document.querySelector('.modal-body').innerHTML = `
        <div class="table-wrap" style="max-height:420px;overflow-y:auto">
          <table>
            <thead><tr><th>Fornecedor</th><th>Itens</th><th>Status</th><th>Expira</th><th></th></tr></thead>
            <tbody>
              ${requests.map((r, idx) => {
                const expired = new Date(r.expires_at) < now;
                const filled = !!r.last_filled_at;
                const statusBadge = filled
                  ? `<span class="badge" style="background:#1565C020;color:#64B5F6;border-color:#1565C050">✓ Preenchida</span>`
                  : expired
                  ? `<span class="badge badge-gray">Expirada</span>`
                  : `<span class="badge" style="background:#E0782020;color:var(--orange);border-color:#E0782050">Aguardando</span>`;
                return `<tr>
                  <td>
                    <div style="font-weight:600">${escHtml(r.company_name)}</div>
                    <div style="font-size:11px;color:var(--gray)">${escHtml(r.churrascaria_name)}${r.title ? ' · ' + escHtml(r.title) : ''}</div>
                    ${filled ? `<div style="font-size:11px;color:#64B5F6;margin-top:2px">Preenchida em ${new Date(r.last_filled_at).toLocaleDateString('pt-BR')}</div>` : ''}
                  </td>
                  <td style="text-align:center">${r.item_count}</td>
                  <td>${statusBadge}</td>
                  <td style="font-size:12px;color:var(--gray)">${new Date(r.expires_at).toLocaleDateString('pt-BR')}</td>
                  <td>
                    <button class="btn btn-outline btn-sm" onclick="Comparative._copyHistory(${idx})">🔗</button>
                  </td>
                </tr>`;
              }).join('')}
            </tbody>
          </table>
        </div>`;
    } catch (err) {
      document.querySelector('.modal-body').innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

  _copyHistory(idx) {
    const r = this._history?.[idx];
    if (r) navigator.clipboard.writeText(`${window.location.origin}/cotacao/${r.token}`).then(() => toast('Link copiado!'));
  },

  async makeOrder(companyId) {
    const { lastResult, churrId, churrs, items } = this.state;
    const company = lastResult.companies.find(c => c.id === companyId);
    const churrName = churrs.find(c => String(c.id) === String(churrId))?.name || '';

    App.navigate('new-order');
    const el = document.getElementById('section-new-order');
    el.innerHTML = '<div class="empty-state">Carregando produtos...</div>';
    try {
      const [churrascarias, companies, products] = await Promise.all([
        API.get('/reports/churrascarias'),
        API.get('/companies'),
        API.get(`/companies/${companyId}/products?churrascaria_id=${churrId}`)
      ]);
      Orders.state = {
        churrascaria_id: String(churrId),
        company_id: String(companyId),
        churrascaria_name: churrName,
        company_name: company.name,
        churrascarias,
        companies,
        products,
        items: items.map(i => ({
          product_id: i.product_id,
          product_name: i.product_name,
          unit: i.unit,
          quantity: i.quantity,
          unit_price: company.prices[i.product_id] || 0,
          subtotal: (company.prices[i.product_id] || 0) * i.quantity
        }))
      };
      Orders.renderStep2();
    } catch (err) {
      toast(err.message, 'error');
      App.navigate('comparative');
    }
  }
};
