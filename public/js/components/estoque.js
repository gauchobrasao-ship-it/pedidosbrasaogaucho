// ════════════════════════════════════════
//  CONTROLE DE ESTOQUE
// ════════════════════════════════════════
const Estoque = {
  _categories: [],
  _companies: [],

  async load() {
    const el = document.getElementById('section-estoque');
    el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const [listas, cats, companies] = await Promise.all([
        API.get('/estoque'),
        API.get('/categories'),
        API.get('/companies'),
      ]);
      this._categories = cats || [];
      this._companies = companies || [];
      this._renderList(el, listas || []);
    } catch (err) {
      el.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

  _fmtDate(dateStr) {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  },

  _renderList(el, listas) {
    const n = listas.length;
    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Contagem de Estoque</span>
          <button class="btn btn-primary" onclick="Estoque.openCreate()">+ Criar Lista</button>
        </div>
        <div style="font-size:12px;color:var(--gray);padding:0 4px 10px">
          <strong style="color:var(--white)">${n}</strong> ${n === 1 ? 'lista encontrada' : 'listas encontradas'}
        </div>
        ${n === 0
          ? `<div class="empty-state"><div class="empty-icon">📋</div><p>Nenhuma lista de estoque criada</p></div>`
          : `<div class="table-wrap"><table>
              <thead><tr>
                <th>Data</th>
                <th>Filtro</th>
                <th>Itens</th>
                <th>Preenchidos</th>
                <th>Criado por</th>
                <th>Ações</th>
              </tr></thead>
              <tbody>${listas.map(l => {
                const pct = l.item_count > 0 ? Math.round((l.filled_count / l.item_count) * 100) : 0;
                const pctColor = pct === 100 ? 'var(--success)' : pct > 0 ? 'var(--gold)' : 'var(--gray)';
                return `<tr>
                  <td style="white-space:nowrap;font-size:13px">${this._fmtDate(l.created_at)}</td>
                  <td>
                    <div style="font-size:13px;color:var(--white)">${escHtml(l.filter_label || '—')}</div>
                    <div style="font-size:11px;color:var(--gray);margin-top:2px">${l.filter_type === 'company' ? 'Por fornecedor' : 'Por categoria'}</div>
                  </td>
                  <td style="font-size:13px">${l.item_count}</td>
                  <td>
                    <span style="font-size:13px;color:${pctColor};font-weight:600">${l.filled_count}/${l.item_count}</span>
                    <span style="font-size:11px;color:var(--gray);margin-left:4px">(${pct}%)</span>
                  </td>
                  <td style="font-size:13px;color:var(--gray)">${escHtml(l.created_by_name || '—')}</td>
                  <td>
                    <div class="flex flex-gap">
                      <button class="btn btn-gold btn-sm" onclick="Estoque.openEdit(${l.id})">Abrir</button>
                      <button class="btn btn-danger btn-sm" onclick="Estoque.delete(${l.id})">Excluir</button>
                    </div>
                  </td>
                </tr>`;
              }).join('')}</tbody>
            </table></div>`}
      </div>`;
  },

  // ── CREATE MODAL ──────────────────────────────
  openCreate() {
    const cats = this._categories;
    const companies = this._companies;

    showModal(
      'Nova Lista de Estoque',
      `<div class="form-group">
         <label class="form-label">Filtrar por</label>
         <div style="display:flex;gap:12px;margin-bottom:4px">
           <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;color:var(--white)">
             <input type="radio" name="est-filter-type" value="category" checked
               style="accent-color:var(--gold)" onchange="Estoque._onFilterTypeChange()">
             Por Categoria
           </label>
           <label style="display:flex;align-items:center;gap:8px;cursor:pointer;font-size:14px;color:var(--white)">
             <input type="radio" name="est-filter-type" value="company"
               style="accent-color:var(--gold)" onchange="Estoque._onFilterTypeChange()">
             Por Fornecedor
           </label>
         </div>
       </div>

       <div id="est-cat-panel">
         <div class="form-group">
           <label class="form-label">Categorias</label>
           <div style="border:1px solid var(--border);border-radius:8px;padding:8px 4px;background:var(--bg2);max-height:220px;overflow-y:auto">
             <label style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;font-size:13px;color:var(--gray)">
               <input type="checkbox" id="est-cat-all" style="accent-color:var(--gold)" checked
                 onchange="Estoque._onCatAllChange(this)">
               Todas as categorias
             </label>
             <div style="border-top:1px solid var(--border);margin:4px 0"></div>
             ${cats.length === 0
               ? '<div style="padding:8px 12px;font-size:13px;color:var(--gray)">Nenhuma categoria cadastrada</div>'
               : cats.map(c => `
                 <label style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;font-size:13px;color:var(--white)">
                   <input type="checkbox" value="${c.id}" class="est-cat-check" style="accent-color:var(--gold)"
                     onchange="Estoque._onCatChange()">
                   ${escHtml(c.name)}
                 </label>`).join('')}
           </div>
         </div>
       </div>

       <div id="est-company-panel" style="display:none">
         <div class="form-group">
           <label class="form-label">Fornecedor *</label>
           <select class="form-control" id="est-company-select">
             <option value="">Selecione um fornecedor...</option>
             ${companies.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
           </select>
         </div>
       </div>

       <div class="form-group">
         <label class="form-label">Observação (opcional)</label>
         <input class="form-control" id="est-notes" placeholder="Ex: Contagem semana 26...">
       </div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="Estoque._submitCreate()">Criar Lista</button>`
    );
  },

  _onFilterTypeChange() {
    const type = document.querySelector('input[name="est-filter-type"]:checked')?.value;
    document.getElementById('est-cat-panel').style.display = type === 'category' ? '' : 'none';
    document.getElementById('est-company-panel').style.display = type === 'company' ? '' : 'none';
  },

  _onCatAllChange(el) {
    if (el.checked) document.querySelectorAll('.est-cat-check').forEach(c => { c.checked = false; });
  },

  _onCatChange() {
    const anyChecked = [...document.querySelectorAll('.est-cat-check:checked')].length > 0;
    const allEl = document.getElementById('est-cat-all');
    if (allEl) allEl.checked = !anyChecked;
  },

  async _submitCreate() {
    const filter_type = document.querySelector('input[name="est-filter-type"]:checked')?.value || 'category';
    const notes = document.getElementById('est-notes')?.value.trim() || null;

    let body = { filter_type, notes };

    if (filter_type === 'company') {
      const company_id = document.getElementById('est-company-select')?.value;
      if (!company_id) { toast('Selecione um fornecedor', 'error'); return; }
      body.company_id = Number(company_id);
    } else {
      const catIds = [...document.querySelectorAll('.est-cat-check:checked')].map(el => Number(el.value));
      body.category_ids = catIds;
    }

    try {
      const result = await API.post('/estoque', body);
      closeModal();
      if (result.item_count === 0) {
        toast('Nenhum produto encontrado para este filtro', 'warning');
        this.load();
        return;
      }
      toast(`Lista criada com ${result.item_count} produto${result.item_count !== 1 ? 's' : ''}!`);
      this.openEdit(result.id);
    } catch (err) {
      toast(err.message, 'error');
    }
  },

  // ── EDIT VIEW ────────────────────────────────
  async openEdit(id) {
    const el = document.getElementById('section-estoque');
    el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const lista = await API.get(`/estoque/${id}`);
      this._renderEdit(el, lista);
    } catch (err) {
      el.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

  _renderEdit(el, lista) {
    const items = lista.items || [];

    // Agrupa por categoria
    const groups = {};
    items.forEach(item => {
      const key = item.category_name || '— Sem categoria';
      if (!groups[key]) groups[key] = { color: item.category_color, items: [] };
      groups[key].items.push(item);
    });

    const filled = items.filter(i => i.quantity !== null).length;
    const pct = items.length > 0 ? Math.round((filled / items.length) * 100) : 0;

    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <div>
            <span class="card-title">Contagem de Estoque</span>
            <div style="font-size:12px;color:var(--gray);margin-top:4px">
              ${escHtml(lista.filter_label || '—')} &nbsp;·&nbsp;
              ${lista.filter_type === 'company' ? 'Por fornecedor' : 'Por categoria'} &nbsp;·&nbsp;
              ${this._fmtDate(lista.created_at)}
              ${lista.created_by_name ? ` &nbsp;·&nbsp; ${escHtml(lista.created_by_name)}` : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <div style="text-align:right">
              <div style="font-size:13px;color:var(--gold);font-weight:600">${filled}/${items.length} preenchidos</div>
              <div style="font-size:11px;color:var(--gray)">${pct}% completo</div>
            </div>
            <button class="btn btn-outline" onclick="Estoque.load()">← Voltar</button>
            <button class="btn btn-primary" onclick="Estoque._save(${lista.id})">Salvar</button>
          </div>
        </div>

        ${lista.notes ? `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:13px;color:var(--gray)">${escHtml(lista.notes)}</div>` : ''}

        ${items.length === 0
          ? '<div class="empty-state"><div class="empty-icon">📦</div><p>Nenhum produto nesta lista</p></div>'
          : Object.entries(groups).map(([catName, group]) => `
            <div style="margin-bottom:24px">
              <div style="display:flex;align-items:center;gap:8px;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)">
                <span class="badge" style="background:${group.color || '#E07820'}22;color:${group.color || '#E07820'};border-color:${group.color || '#E07820'}44;font-size:12px">${escHtml(catName)}</span>
                <span style="font-size:12px;color:var(--gray)">${group.items.length} produto${group.items.length !== 1 ? 's' : ''}</span>
              </div>
              <div class="table-wrap">
                <table>
                  <thead><tr><th>Produto</th><th>Unidade</th><th style="width:130px">Quantidade</th><th>Observação</th></tr></thead>
                  <tbody>
                    ${group.items.map(item => `<tr>
                      <td><strong style="font-size:13px">${escHtml(item.product_name)}</strong></td>
                      <td><span class="badge badge-gray">${escHtml(item.unit || 'un')}</span></td>
                      <td>
                        <input type="number" step="0.001" min="0"
                          id="est-qty-${item.product_id}"
                          value="${item.quantity !== null ? item.quantity : ''}"
                          placeholder="0"
                          class="form-control est-qty-input"
                          data-product-id="${item.product_id}"
                          style="width:120px;padding:5px 10px;font-size:13px"
                          oninput="Estoque._markDirty()">
                      </td>
                      <td>
                        <input type="text"
                          id="est-note-${item.product_id}"
                          value="${escHtml(item.notes || '')}"
                          placeholder="Opcional..."
                          class="form-control"
                          data-product-id="${item.product_id}"
                          style="font-size:13px"
                          oninput="Estoque._markDirty()">
                      </td>
                    </tr>`).join('')}
                  </tbody>
                </table>
              </div>
            </div>`).join('')}

        <div style="display:flex;justify-content:flex-end;gap:8px;margin-top:8px;padding-top:16px;border-top:1px solid var(--border)">
          <button class="btn btn-outline" onclick="Estoque.load()">← Voltar</button>
          <button class="btn btn-primary" id="est-save-btn" onclick="Estoque._save(${lista.id})">Salvar</button>
        </div>
      </div>`;

    this._dirty = false;
  },

  _dirty: false,
  _markDirty() { this._dirty = true; },

  async _save(id) {
    const items = [];
    document.querySelectorAll('.est-qty-input').forEach(input => {
      const product_id = Number(input.dataset.productId);
      const rawVal = input.value.trim();
      const quantity = rawVal === '' ? null : parseFloat(rawVal);
      const noteEl = document.getElementById(`est-note-${product_id}`);
      const notes = noteEl ? noteEl.value.trim() || null : null;
      items.push({ product_id, quantity, notes });
    });

    const btn = document.getElementById('est-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      await API.put(`/estoque/${id}/items`, { items });
      toast('Contagem salva!');
      this.load();
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
      toast(err.message, 'error');
    }
  },

  async delete(id) {
    if (!await confirm2('Excluir esta lista de estoque?', 'Excluir')) return;
    try {
      await API.delete(`/estoque/${id}`);
      toast('Lista excluída');
      this.load();
    } catch (err) {
      toast(err.message, 'error');
    }
  },
};
