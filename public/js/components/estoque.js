// ════════════════════════════════════════
//  CONTROLE DE ESTOQUE
// ════════════════════════════════════════
const Estoque = {
  _categories: [],
  _companies: [],
  _churrascarias: [],

  // ── AUTOSAVE STATE ─────────────────────────────
  _dirty: false,
  _saving: false,
  _currentListId: null,
  _debounceTimer: null,
  _intervalId: null,
  AUTOSAVE_DEBOUNCE_MS: 2500,
  AUTOSAVE_INTERVAL_MS: 20000,

  _clearAutosaveTimers() {
    if (this._debounceTimer) { clearTimeout(this._debounceTimer); this._debounceTimer = null; }
    if (this._intervalId) { clearInterval(this._intervalId); this._intervalId = null; }
  },

  async load() {
    this._clearAutosaveTimers();
    const el = document.getElementById('section-estoque');
    el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const [listas, cats, companies, churrs] = await Promise.all([
        API.get('/estoque'),
        API.get('/categories'),
        API.get('/companies'),
        API.get('/reports/churrascarias'),
      ]);
      this._categories = cats || [];
      this._companies = companies || [];
      this._churrascarias = churrs || [];
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
                <th>Pedido</th>
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
                    <div style="font-size:11px;color:var(--gray);margin-top:2px">
                      ${l.filter_type === 'company' ? 'Por fornecedor' : 'Por categoria'}
                      ${l.churrascaria_name ? ` · 🔥 ${escHtml(l.churrascaria_name)}` : ''}
                    </div>
                  </td>
                  <td style="font-size:13px">${l.item_count}</td>
                  <td>
                    <span style="font-size:13px;color:${pctColor};font-weight:600">${l.filled_count}/${l.item_count}</span>
                    <span style="font-size:11px;color:var(--gray);margin-left:4px">(${pct}%)</span>
                  </td>
                  <td>
                    ${l.order_count > 0
                      ? `<span class="badge badge-success" style="cursor:pointer" onclick="Estoque._viewOrders(${l.id})">✅ Pedido feito${l.order_count > 1 ? ` (${l.order_count})` : ''}</span>`
                      : '<span style="font-size:12px;color:var(--gray)">—</span>'}
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
    const churrs = this._churrascarias;

    showModal(
      'Nova Lista de Estoque',
      `<div class="form-group">
         <label class="form-label">Churrascaria *</label>
         <select class="form-control" id="est-churr-select">
           <option value="">Selecione a churrascaria...</option>
           ${churrs.map(ch => `<option value="${ch.id}">🔥 ${escHtml(ch.name)}</option>`).join('')}
         </select>
         <div style="font-size:11px;color:var(--gray);margin-top:4px">Necessária pra calcular o estoque ideal e gerar pedido a partir desta contagem.</div>
       </div>

       <div class="form-group">
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
    const churrascaria_id = document.getElementById('est-churr-select')?.value;
    if (!churrascaria_id) { toast('Selecione a churrascaria', 'error'); return; }
    const filter_type = document.querySelector('input[name="est-filter-type"]:checked')?.value || 'category';
    const notes = document.getElementById('est-notes')?.value.trim() || null;

    let body = { filter_type, notes, churrascaria_id: Number(churrascaria_id) };

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
    this._clearAutosaveTimers();
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
              ${lista.churrascaria_name ? ` &nbsp;·&nbsp; 🔥 ${escHtml(lista.churrascaria_name)}` : ''}
            </div>
          </div>
          <div style="display:flex;align-items:center;gap:12px">
            <div style="text-align:right">
              <div style="font-size:13px;color:var(--gold);font-weight:600">${filled}/${items.length} preenchidos</div>
              <div style="font-size:11px;color:var(--gray)">${pct}% completo</div>
              <div id="est-autosave-status" style="font-size:11px;color:var(--gray);margin-top:2px">&nbsp;</div>
            </div>
            <button class="btn btn-outline" onclick="Estoque._back(${lista.id})">← Voltar</button>
            ${lista.churrascaria_id && App.canDo('create_orders')
              ? `<button class="btn btn-gold" id="est-pedido-btn" onclick="Estoque._openPedidoPreview(${lista.id})">📋 Criar Pedido</button>`
              : ''}
            <button class="btn btn-primary" id="est-save-btn-top" onclick="Estoque._save(${lista.id})">Salvar</button>
          </div>
        </div>

        ${!lista.churrascaria_id ? `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:16px;font-size:12px;color:var(--gray)">
          ℹ Esta lista foi criada antes do campo de churrascaria existir, então não dá pra gerar pedido automático a partir dela.
        </div>` : ''}

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
                  <thead><tr><th>Produto</th><th>Unidade</th><th style="width:90px">Meta</th><th style="width:130px">Quantidade</th><th>Observação</th></tr></thead>
                  <tbody>
                    ${group.items.map(item => `<tr>
                      <td><strong style="font-size:13px">${escHtml(item.product_name)}</strong></td>
                      <td><span class="badge badge-gray">${escHtml(item.unit || 'un')}</span></td>
                      <td style="font-size:13px;color:var(--gray)">${item.ideal_qty !== null && item.ideal_qty !== undefined ? fmtQty(item.ideal_qty) : '—'}</td>
                      <td>
                        <input type="number" step="0.001" min="0"
                          id="est-qty-${item.product_id}"
                          value="${item.quantity !== null ? fmtQty(item.quantity) : ''}"
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
          <button class="btn btn-outline" onclick="Estoque._back(${lista.id})">← Voltar</button>
          <button class="btn btn-primary" id="est-save-btn" onclick="Estoque._save(${lista.id})">Salvar</button>
        </div>
      </div>`;

    this._dirty = false;
    this._currentListId = lista.id;
    this._intervalId = setInterval(() => this._autoSave(lista.id), this.AUTOSAVE_INTERVAL_MS);
  },

  _markDirty() {
    this._dirty = true;
    this._setAutosaveStatus('pending');
    if (this._debounceTimer) clearTimeout(this._debounceTimer);
    this._debounceTimer = setTimeout(() => this._autoSave(this._currentListId), this.AUTOSAVE_DEBOUNCE_MS);
  },

  _collectItems() {
    const items = [];
    document.querySelectorAll('.est-qty-input').forEach(input => {
      const product_id = Number(input.dataset.productId);
      const rawVal = input.value.trim();
      const quantity = rawVal === '' ? null : parseFloat(rawVal);
      const noteEl = document.getElementById(`est-note-${product_id}`);
      const notes = noteEl ? noteEl.value.trim() || null : null;
      items.push({ product_id, quantity, notes });
    });
    return items;
  },

  _setAutosaveStatus(status) {
    const el = document.getElementById('est-autosave-status');
    if (!el) return;
    if (status === 'pending') {
      el.textContent = 'Alterações não salvas';
      el.style.color = 'var(--gold)';
    } else if (status === 'saving') {
      el.textContent = 'Salvando...';
      el.style.color = 'var(--gray)';
    } else if (status === 'saved') {
      const time = new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
      el.textContent = `Salvo automaticamente às ${time}`;
      el.style.color = 'var(--success)';
    } else if (status === 'error') {
      el.textContent = 'Falha ao salvar — tentando novamente...';
      el.style.color = 'var(--danger)';
    }
  },

  // Salvamento automático em segundo plano (debounce + intervalo de segurança).
  // Não navega nem mostra toast, para não interromper o preenchimento.
  async _autoSave(id) {
    if (!id || !this._dirty || this._saving) return;
    this._saving = true;
    this._setAutosaveStatus('saving');
    const items = this._collectItems();
    try {
      await API.put(`/estoque/${id}/items`, { items });
      this._dirty = false;
      this._setAutosaveStatus('saved');
    } catch (err) {
      this._setAutosaveStatus('error');
    } finally {
      this._saving = false;
    }
  },

  // Sai da tela de edição, garantindo que nada fique sem salvar.
  async _back(id) {
    this._clearAutosaveTimers();
    if (this._dirty) await this._autoSave(id);
    this.load();
  },

  async _save(id) {
    this._clearAutosaveTimers();
    const items = this._collectItems();

    const btn = document.getElementById('est-save-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Salvando...'; }

    try {
      await API.put(`/estoque/${id}/items`, { items });
      this._dirty = false;
      toast('Contagem salva!');
      this.load();
    } catch (err) {
      if (btn) { btn.disabled = false; btn.textContent = 'Salvar'; }
      toast(err.message, 'error');
    }
  },

  // ── CRIAR PEDIDO A PARTIR DA CONTAGEM ──────────
  async _openPedidoPreview(id) {
    // garante que a contagem em tela foi salva antes de calcular o pedido
    this._clearAutosaveTimers();
    if (this._dirty) await this._autoSave(id);

    const btn = document.getElementById('est-pedido-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Calculando...'; }
    try {
      const preview = await API.get(`/estoque/${id}/pedido-preview`);
      this._pedidoPreview = preview;
      this._renderPedidoPreviewModal(preview);
    } catch (err) {
      toast(err.message, 'error');
    } finally {
      if (btn) { btn.disabled = false; btn.textContent = '📋 Criar Pedido'; }
    }
  },

  _pedidoWarnings(preview) {
    const box = (title, list) => !list.length ? '' : `
      <div style="margin-top:8px;background:#E5393514;border:1px solid #E5393540;border-radius:8px;padding:12px 14px;margin-bottom:10px">
        <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.6px;color:#E53935;margin-bottom:8px">${title} — ${list.length}</div>
        <ul style="margin:0;padding-left:18px;font-size:12px;color:var(--gray);line-height:1.8">
          ${list.map(p => `<li>${escHtml(p.name)}</li>`).join('')}
        </ul>
      </div>`;
    return box('Sem estoque ideal definido', preview.sem_meta)
         + box('Ainda não contados', preview.nao_contado)
         + box('Sem fornecedor vinculado', preview.sem_fornecedor);
  },

  _renderPedidoPreviewModal(preview) {
    const { groups } = preview;

    if (!groups.length) {
      const hasPendencias = preview.sem_meta.length || preview.nao_contado.length || preview.sem_fornecedor.length;
      const body = hasPendencias
        ? `<div class="empty-state"><div class="empty-icon">⚠️</div><p>Nenhum pedido pôde ser gerado — veja os itens que precisam de atenção abaixo.</p></div>`
        : `<div class="empty-state"><div class="empty-icon">✅</div><p>Nada precisa ser reposto agora.</p></div>`;
      showModal('📋 Criar Pedido',
        `${body}${this._pedidoWarnings(preview)}`,
        `<button class="btn btn-outline" onclick="closeModal()">Fechar</button>`);
      return;
    }

    const groupsHtml = groups.map((g, gi) => {
      const subtotal = g.items.reduce((s, it) => s + it.needed_qty * (it.price || 0), 0);
      return `
      <div style="margin-bottom:20px">
        <div style="font-weight:700;font-size:14px;color:var(--gold);border-bottom:1px solid var(--border);padding-bottom:6px;margin-bottom:8px">
          ${escHtml(g.company_name)}
        </div>
        <div class="table-wrap">
          <table>
            <thead><tr><th>Produto</th><th>UN</th><th style="width:100px">Qtd</th><th style="width:110px">Preço Unit.</th><th style="width:100px">Subtotal</th></tr></thead>
            <tbody>
              ${g.items.map(it => `<tr>
                <td style="font-weight:600">${escHtml(it.name)}</td>
                <td><span class="badge badge-gray">${escHtml(it.unit||'un')}</span></td>
                <td><input type="number" step="0.001" min="0" class="form-control"
                      id="pp-qty-${gi}-${it.product_id}" value="${it.needed_qty}"
                      style="width:90px" oninput="Estoque._recalcPedidoPreview(${gi})"></td>
                <td><input type="number" step="0.01" min="0" class="form-control"
                      id="pp-price-${gi}-${it.product_id}" value="${Number(it.price||0).toFixed(2)}"
                      style="width:100px" oninput="Estoque._recalcPedidoPreview(${gi})"></td>
                <td class="text-gold" id="pp-sub-${gi}-${it.product_id}">${fmtMoney(it.needed_qty*(it.price||0))}</td>
              </tr>`).join('')}
            </tbody>
            <tfoot>
              <tr><td colspan="4" style="text-align:right;font-weight:700;font-size:13px">Subtotal:</td>
                <td style="text-align:right;font-weight:700;color:var(--gold)" id="pp-group-total-${gi}">${fmtMoney(subtotal)}</td></tr>
            </tfoot>
          </table>
        </div>
      </div>`;
    }).join('');

    showModal(
      '📋 Criar Pedido',
      `<div style="font-size:13px;color:var(--gray);margin-bottom:14px">
         Calculado como <strong style="color:var(--white)">estoque ideal − estoque atual</strong>. Revise quantidades e preços antes de confirmar — um pedido será criado por fornecedor.
       </div>
       ${groupsHtml}
       ${this._pedidoWarnings(preview)}`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
       <button class="btn btn-primary" id="pp-confirm-btn" onclick="Estoque._confirmarPedidos()">Confirmar e Criar Pedido(s)</button>`
    );
  },

  _recalcPedidoPreview(gi) {
    const g = this._pedidoPreview?.groups?.[gi];
    if (!g) return;
    let total = 0;
    g.items.forEach(it => {
      const qty = parseFloat(document.getElementById(`pp-qty-${gi}-${it.product_id}`)?.value || 0);
      const price = parseFloat(document.getElementById(`pp-price-${gi}-${it.product_id}`)?.value || 0);
      const sub = qty * price;
      total += sub;
      const subEl = document.getElementById(`pp-sub-${gi}-${it.product_id}`);
      if (subEl) subEl.textContent = fmtMoney(sub);
    });
    const totalEl = document.getElementById(`pp-group-total-${gi}`);
    if (totalEl) totalEl.textContent = fmtMoney(total);
  },

  async _confirmarPedidos() {
    const preview = this._pedidoPreview;
    if (!preview) return;
    const btn = document.getElementById('pp-confirm-btn');
    if (btn) { btn.disabled = true; btn.textContent = 'Criando...'; }
    const createdIds = [];
    try {
      for (let gi = 0; gi < preview.groups.length; gi++) {
        const g = preview.groups[gi];
        const items = g.items.map(it => {
          const quantity = parseFloat(document.getElementById(`pp-qty-${gi}-${it.product_id}`)?.value || 0);
          const unit_price = parseFloat(document.getElementById(`pp-price-${gi}-${it.product_id}`)?.value || 0);
          return { product_id: it.product_id, quantity, unit_price };
        }).filter(i => i.quantity > 0);
        if (!items.length) continue;
        const result = await API.post('/orders', {
          churrascaria_id: preview.churrascaria_id,
          company_id: g.company_id,
          items,
          stock_list_id: this._currentListId
        });
        createdIds.push(result.id);
      }
      closeModal();
      if (!createdIds.length) {
        toast('Nenhum pedido gerado (quantidades zeradas)', 'warning');
        return;
      }
      toast(`${createdIds.length} pedido${createdIds.length > 1 ? 's' : ''} criado${createdIds.length > 1 ? 's' : ''}!`);
      createdIds.forEach((id, idx) => {
        setTimeout(() => window.open(`/api/orders/${id}/pdf?token=${API.token}`, '_blank'), 400 * idx);
      });
      this.openEdit(this._currentListId);
    } catch (err) {
      toast(err.message, 'error');
      if (btn) { btn.disabled = false; btn.textContent = 'Confirmar e Criar Pedido(s)'; }
    }
  },

  // Mostra os pedidos gerados a partir de uma contagem, com acesso rápido a PDF/WhatsApp
  async _viewOrders(listId) {
    try {
      const orders = await API.get(`/orders?stock_list_id=${listId}`);
      if (!orders || !orders.length) { toast('Nenhum pedido encontrado para esta lista', 'warning'); return; }
      const rows = orders.map(o => `
        <tr>
          <td><span class="badge badge-gold">#${String(o.id).padStart(6, '0')}</span></td>
          <td style="font-size:13px">${escHtml(o.company_name)}</td>
          <td class="text-gold" style="font-size:13px">${fmtMoney(o.total)}</td>
          <td style="font-size:13px;white-space:nowrap">${this._fmtDate(o.created_at)}</td>
          <td>
            <div class="flex flex-gap">
              <button class="btn btn-gold btn-sm" onclick="Orders.viewPDF(${o.id})">📄 PDF</button>
              <button class="btn btn-success btn-sm" onclick="Orders.shareWhatsApp(${o.id})">WhatsApp</button>
            </div>
          </td>
        </tr>`).join('');
      showModal('✅ Pedido(s) desta contagem',
        `<div class="table-wrap"><table>
           <thead><tr><th>Nº</th><th>Fornecedor</th><th>Total</th><th>Data</th><th>Ações</th></tr></thead>
           <tbody>${rows}</tbody>
         </table></div>`,
        `<button class="btn btn-outline" onclick="closeModal()">Fechar</button>`);
    } catch (err) {
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
