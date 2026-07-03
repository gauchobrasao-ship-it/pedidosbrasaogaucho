// ════════════════════════════════════════
//  PRODUCTS
// ════════════════════════════════════════
const Products = {
  categories: [],
  companies: [],
  churrascarias: [],
  linkedCompanies: [],
  lastCategoryId: '',
  lastUnit: 'un',
  lastLinkedCompanies: [],
  _cache: { data: null, ts: 0 },
  _CACHE_TTL: 60000,

  async _loadFormData() {
    const now = Date.now();
    if (this._cache.data && (now - this._cache.ts) < this._CACHE_TTL) {
      return this._cache.data;
    }
    const [cats, companies, churrs] = await Promise.all([
      API.get('/categories'),
      API.get('/companies'),
      API.get('/reports/churrascarias'),
    ]);
    this._cache.data = { cats: cats || [], companies: companies || [], churrs: churrs || [] };
    this._cache.ts = now;
    return this._cache.data;
  },

  invalidateCache() { this._cache.ts = 0; },

  fmtDaysAgo(dateStr) {
    if (!dateStr) return '<span class="text-gray" style="font-size:12px">—</span>';
    const days = Math.floor((Date.now() - new Date(dateStr)) / 86400000);
    if (days === 0) return '<span style="font-size:12px;color:var(--success)">hoje</span>';
    if (days === 1) return '<span style="font-size:12px;color:var(--success)">há 1 dia</span>';
    const color = days <= 7 ? 'var(--success)' : days <= 30 ? 'var(--gold)' : 'var(--danger)';
    return `<span style="font-size:12px;color:${color}">há ${days} dias</span>`;
  },

  _searchTimer: null,

  _getCatIds() {
    return [...document.querySelectorAll('.prod-cat-check:checked')].map(el => el.value).join(',');
  },

  _getChurrId() {
    return document.getElementById('prod-filter-churr')?.value || '';
  },

  _catLabel(catIds) {
    if (!catIds) return 'Todas as categorias';
    const ids = catIds.split(',').filter(Boolean);
    if (!ids.length) return 'Todas as categorias';
    const names = ids.map(id => {
      const cat = this.categories.find(c => String(c.id) === String(id));
      return cat ? cat.name : '';
    }).filter(Boolean);
    if (names.length === 1) return names[0];
    return `${names.length} categorias`;
  },

  toggleCatDropdown() {
    const dd = document.getElementById('prod-cat-dropdown');
    if (!dd) return;
    const isOpen = dd.style.display !== 'none';
    dd.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
      setTimeout(() => {
        const handler = (e) => {
          if (!dd.contains(e.target) && e.target.id !== 'prod-cat-btn') {
            dd.style.display = 'none';
            document.removeEventListener('click', handler);
          }
        };
        document.addEventListener('click', handler);
      }, 0);
    }
  },

  _onCatAllChange(el) {
    if (el.checked) {
      document.querySelectorAll('.prod-cat-check').forEach(c => { c.checked = false; });
    }
    this._applyCatFilter();
  },

  _onCatChange() {
    const anyChecked = [...document.querySelectorAll('.prod-cat-check:checked')].length > 0;
    const allEl = document.getElementById('prod-cat-all');
    if (allEl) allEl.checked = !anyChecked;
    this._applyCatFilter();
  },

  _applyCatFilter() {
    const catIds = this._getCatIds();
    const label = document.getElementById('prod-cat-label');
    if (label) label.textContent = this._catLabel(catIds);
    this.load(
      document.getElementById('prod-search')?.value || '',
      catIds,
      document.getElementById('prod-filter-company')?.value || '',
      this._getChurrId()
    );
  },

  toggleExportMenu() {
    const menu = document.getElementById('prod-export-menu');
    if (!menu) return;
    const isOpen = menu.style.display !== 'none';
    menu.style.display = isOpen ? 'none' : 'block';
    if (!isOpen) {
      setTimeout(() => {
        const handler = (e) => {
          if (!menu.contains(e.target) && e.target.id !== 'prod-export-btn') {
            menu.style.display = 'none';
            document.removeEventListener('click', handler);
          }
        };
        document.addEventListener('click', handler);
      }, 0);
    }
  },

  export(format) {
    document.getElementById('prod-export-menu').style.display = 'none';
    const catIds = this._getCatIds();
    const churrId = this._getChurrId();
    const params = new URLSearchParams({ format, token: API.token });
    if (catIds) params.set('category_ids', catIds);
    if (churrId) params.set('churrascaria_id', churrId);
    const url = `/api/products/export?${params}`;
    if (format === 'pdf') {
      window.open(url, '_blank');
    } else {
      const a = document.createElement('a');
      a.href = url;
      a.download = 'produtos.xlsx';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }
  },

  debouncedLoad(search, catIds, companyId, churrId) {
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.load(search, catIds, companyId, churrId), 280);
  },

  async load(search = '', catIds = '', companyId = '', churrId = '') {
    const el = document.getElementById('section-products');
    const isFirstLoad = !el.querySelector('.card');
    if (isFirstLoad) el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (catIds) params.set('category_ids', catIds);
      if (companyId) params.set('company_id', companyId);
      if (churrId) params.set('churrascaria_id', churrId);

      const [products, cats, companies, churrascarias] = await Promise.all([
        API.get('/products?' + params),
        this._cache.data ? Promise.resolve(this._cache.data.cats) : API.get('/categories'),
        this._cache.data ? Promise.resolve(this._cache.data.companies) : API.get('/companies'),
        this._cache.data ? Promise.resolve(this._cache.data.churrs) : API.get('/reports/churrascarias'),
      ]);
      this.categories = cats || [];
      this.companies = companies || [];
      this.churrascarias = churrascarias || [];

      el.innerHTML = `
        <div class="card">
          <div class="card-header">
            <span class="card-title">Produtos</span>
            ${App.canDo('manage_products') ? `
              <div style="display:flex;gap:8px">
                <button class="btn btn-outline" onclick="Products.openBulkAssign()">⚡ Edição em massa</button>
                <button class="btn btn-primary" onclick="Products.openForm()">+ Novo Produto</button>
              </div>` : ''}
          </div>
          <div class="search-bar mb-16">
            <div class="search-input-wrap">
              <span class="search-icon">🔍</span>
              <input type="text" class="form-control" id="prod-search" placeholder="Buscar produto..."
                value="${escHtml(search)}"
                oninput="Products.debouncedLoad(this.value, Products._getCatIds(), document.getElementById('prod-filter-company').value, Products._getChurrId())">
            </div>
            <div style="position:relative">
              <button id="prod-cat-btn" class="form-control" onclick="Products.toggleCatDropdown()"
                style="max-width:200px;text-align:left;cursor:pointer;display:flex;align-items:center;justify-content:space-between;gap:8px">
                <span id="prod-cat-label">${escHtml(this._catLabel(catIds))}</span>
                <span style="font-size:10px;opacity:.6">▾</span>
              </button>
              <div id="prod-cat-dropdown" style="display:none;position:absolute;top:calc(100% + 4px);left:0;background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:8px 4px;z-index:200;min-width:200px;box-shadow:0 8px 24px rgba(0,0,0,.5)">
                <label style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;font-size:13px;color:var(--gray)">
                  <input type="checkbox" id="prod-cat-all" style="accent-color:var(--gold)"
                    ${!catIds ? 'checked' : ''}
                    onchange="Products._onCatAllChange(this)">
                  Todas as categorias
                </label>
                <div style="border-top:1px solid var(--border);margin:4px 0"></div>
                ${this.categories.map(c => `
                  <label style="display:flex;align-items:center;gap:8px;padding:6px 12px;cursor:pointer;font-size:13px;color:var(--white)">
                    <input type="checkbox" value="${c.id}" class="prod-cat-check" style="accent-color:var(--gold)"
                      ${catIds && catIds.split(',').includes(String(c.id)) ? 'checked' : ''}
                      onchange="Products._onCatChange()">
                    ${escHtml(c.name)}
                  </label>`).join('')}
              </div>
            </div>
            <select class="form-control" id="prod-filter-company" style="max-width:200px"
              onchange="Products.load(document.getElementById('prod-search').value, Products._getCatIds(), this.value, Products._getChurrId())">
              <option value="">Todos os fornecedores</option>
              ${this.companies.map(c =>
                `<option value="${c.id}" ${String(c.id) === String(companyId) ? 'selected' : ''}>${escHtml(c.name)}</option>`
              ).join('')}
            </select>
            <select class="form-control" id="prod-filter-churr" style="max-width:200px"
              title="Filtra os preços exibidos pela churrascaria selecionada"
              onchange="Products.load(document.getElementById('prod-search').value, Products._getCatIds(), document.getElementById('prod-filter-company').value, this.value)">
              <option value="">Preços: todas as churrascarias</option>
              ${this.churrascarias.map(ch =>
                `<option value="${ch.id}" ${String(ch.id) === String(churrId) ? 'selected' : ''}>🔥 ${escHtml(ch.name)}</option>`
              ).join('')}
            </select>
            <div style="position:relative">
              <button class="btn btn-outline btn-sm" onclick="Products.toggleExportMenu()" id="prod-export-btn"
                style="white-space:nowrap">⬇ Baixar</button>
              <div id="prod-export-menu" style="display:none;position:absolute;top:calc(100% + 4px);right:0;background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:8px;z-index:200;min-width:160px;box-shadow:0 8px 24px rgba(0,0,0,.5)">
                <button class="btn btn-outline btn-sm" style="width:100%;margin-bottom:6px;justify-content:flex-start;gap:8px"
                  onclick="Products.export('pdf')">📄 PDF</button>
                <button class="btn btn-outline btn-sm" style="width:100%;justify-content:flex-start;gap:8px"
                  onclick="Products.export('xlsx')">📊 Excel (.xlsx)</button>
              </div>
            </div>
          </div>
          <div style="font-size:12px;color:var(--gray);padding:0 4px 10px">
            <strong style="color:var(--white)">${(products||[]).length}</strong> ${(products||[]).length === 1 ? 'produto encontrado' : 'produtos encontrados'}
          </div>
          ${!products || products.length === 0
            ? '<div class="empty-state"><div class="empty-icon">📦</div><p>Nenhum produto encontrado</p></div>'
            : `<div class="table-wrap"><table>
              <thead><tr><th>Produto</th><th>Categoria</th><th>Unidade</th><th>Fornecedores</th><th>Menor Preço${churrId ? ` <span style="font-weight:400;color:var(--gray)">(${escHtml(this.churrascarias.find(ch => String(ch.id) === String(churrId))?.name || '')})</span>` : ''}</th><th>Atualização</th><th>Ações</th></tr></thead>
              <tbody>${products.map(p => `<tr>
                <td>
                  <strong>${escHtml(p.name)}</strong>
                  ${p.brand ? `<div style="font-size:11px;color:var(--gray);margin-top:2px">🏷 ${escHtml(p.brand)}</div>` : ''}
                </td>
                <td>${p.category_name
                  ? `<span class="badge" style="background:${p.category_color||'#E07820'}22;color:${p.category_color||'#E07820'};border-color:${p.category_color||'#E07820'}44">${escHtml(p.category_name)}</span>`
                  : '<span class="text-gray">-</span>'}</td>
                <td><span class="badge badge-gray">${escHtml(p.unit||'un')}</span></td>
                <td>${(() => {
                  const names = p.company_names || [];
                  if (!names.length) return '<span class="text-gray" style="font-size:13px">—</span>';
                  const visible = names.slice(0, 3);
                  const extra = names.length - 3;
                  return visible.map(n => `<div style="font-size:12px;color:var(--white);line-height:1.6">${escHtml(n)}</div>`).join('')
                    + (extra > 0 ? `<div style="font-size:11px;color:var(--gray)">e mais ${extra}</div>` : '');
                })()}</td>
                <td>${p.min_price != null && p.company_count > 0
                  ? `<div style="font-weight:600;color:var(--gold);font-size:12px">un ${fmtMoney(p.min_price)}</div>
                     ${p.min_bulk_price > 0 ? `<div style="font-weight:600;color:var(--orange);font-size:12px;margin-top:2px">vol ${fmtMoney(p.min_bulk_price)}</div>` : ''}
                     <div style="font-size:11px;color:var(--gray);margin-top:2px">${escHtml(p.min_price_company||'')}</div>`
                  : '<span class="text-gray" style="font-size:13px">—</span>'}</td>
                <td>${Products.fmtDaysAgo(p.min_price_updated_at)}</td>
                <td>
                  ${App.canDo('manage_products') ? `
                  <div class="flex flex-gap">
                    <button class="btn btn-gold btn-sm" onclick="Products.openForm(${p.id})">Editar</button>
                    <button class="btn btn-danger btn-sm" onclick="Products.delete(${p.id})">Excluir</button>
                  </div>` : ''}
                </td>
              </tr>`).join('')}</tbody>
            </table></div>`}
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

  buildCatOptions(selectedId) {
    return `<option value="">Sem categoria</option>` +
      this.categories.map(c =>
        `<option value="${c.id}" ${String(c.id) === String(selectedId) ? 'selected' : ''}>${escHtml(c.name)}</option>`
      ).join('');
  },

  async openForm(id, defaultCatId, defaultUnit) {
    let product = {};
    this.linkedCompanies = [];

    const formDataPromise = this._loadFormData();
    const productPromise  = id ? Promise.all([
      API.get(`/products/${id}`),
      API.get(`/products/${id}/companies`),
    ]) : Promise.resolve(null);

    const [formData, productData] = await Promise.all([formDataPromise, productPromise]);
    this.categories    = formData.cats;
    this.companies     = formData.companies;
    this.churrascarias = formData.churrs;

    if (id && productData) {
      product = productData[0] || {};
      this.linkedCompanies = productData[1] || [];
    } else if (!id) {
      this.linkedCompanies = this.lastLinkedCompanies;
    }

    // Build map: { company_id: { churrascaria_id: price } }
    const linkedMap = {};
    this.linkedCompanies.forEach(l => {
      if (!linkedMap[l.company_id]) linkedMap[l.company_id] = {};
      linkedMap[l.company_id][l.churrascaria_id] = l.price;
    });

    const selCat  = id ? product.category_id : (defaultCatId !== undefined ? defaultCatId : this.lastCategoryId);
    const selUnit = id ? (product.unit || 'un') : (defaultUnit !== undefined ? defaultUnit : this.lastUnit);
    const units = ['un','kg','g','cx','lt','ml','pc','saco','fardo','bd'];
    const isNew = !id;

    const companyList = this.companies.length === 0
      ? `<div style="padding:12px;color:var(--gray);text-align:center;font-size:13px">Nenhum fornecedor cadastrado</div>`
      : `<table class="company-churr-table">
          <thead><tr>
            <th>Fornecedor</th>
            ${this.churrascarias.map(ch => `<th>🔥 ${escHtml(ch.name)}</th>`).join('')}
          </tr></thead>
          <tbody>
            ${this.companies.map(comp => `
              <tr>
                <td style="font-weight:500">${escHtml(comp.name)}</td>
                ${this.churrascarias.map(ch => {
                  const hasLink = linkedMap[comp.id]?.[ch.id] !== undefined;
                  const price = parseFloat(linkedMap[comp.id]?.[ch.id] ?? 0).toFixed(2);
                  return `<td>
                    <div class="churr-cell">
                      <input type="checkbox" class="pf-company-cb"
                        data-company-id="${comp.id}" data-churr-id="${ch.id}"
                        style="width:16px;height:16px;accent-color:var(--orange);cursor:pointer;flex-shrink:0"
                        ${hasLink ? 'checked' : ''}
                        onchange="Products.toggleChurrPrice(${comp.id},${ch.id})">
                      <div id="pf-pw-${comp.id}-${ch.id}"
                        style="display:${hasLink ? 'flex' : 'none'};align-items:center;gap:3px">
                        <span style="font-size:11px;color:var(--gray)">R$</span>
                        <input type="number" step="0.01" min="0"
                          id="pf-price-${comp.id}-${ch.id}"
                          value="${price}"
                          style="width:72px;background:var(--card);border:1px solid var(--border);border-radius:5px;color:var(--white);padding:3px 6px;font-size:12px"
                          onclick="event.stopPropagation()">
                      </div>
                    </div>
                  </td>`;
                }).join('')}
              </tr>`).join('')}
          </tbody>
        </table>`;

    showModal(
      id ? 'Editar Produto' : 'Novo Produto',
      `<div class="form-group">
         <label class="form-label">Nome${isNew ? '(s)' : ''} *</label>
         ${isNew
           ? `<div id="pf-names-container" style="display:flex;flex-direction:column;gap:6px">
                <div class="pf-name-row" style="display:flex;gap:6px;align-items:center">
                  <input class="form-control pf-name-input" placeholder="Nome do produto...">
                </div>
              </div>
              <button type="button" class="btn btn-outline btn-sm" id="pf-add-name-btn" onclick="Products.addNameField()" style="margin-top:8px">+ Adicionar produto</button>
              <div style="font-size:11px;color:var(--gray);margin-top:3px">Mesma categoria, unidade e fornecedores — até 5 de uma vez</div>`
           : `<input class="form-control" id="pf-name" value="${escHtml(product.name || '')}" placeholder="Nome do produto...">`}
       </div>
       <div class="form-group">
         <label class="form-label">Marca(s)</label>
         <input class="form-control" id="pf-brand" value="${escHtml(product.brand || '')}" placeholder="Ex: Seara, Friboi, Aurora">
         <div style="font-size:11px;color:var(--gray);margin-top:3px">Separe múltiplas marcas por vírgula</div>
       </div>
       <div class="form-row">
         <div class="form-group">
           <label class="form-label">Categoria</label>
           <select class="form-control" id="pf-cat">${this.buildCatOptions(selCat)}</select>
           ${isNew ? `<button type="button" class="btn btn-outline btn-sm" style="margin-top:6px;width:100%"
             onclick="Products.toggleNewCatForm()">+ Nova categoria</button>
           <div id="pf-new-cat-form" style="display:none;margin-top:8px;background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px">
             <div class="form-group" style="margin-bottom:8px">
               <label class="form-label">Nome da nova categoria</label>
               <input class="form-control" id="pf-new-cat-name" placeholder="Ex: Vinhos, Carnes...">
             </div>
             <button class="btn btn-primary btn-sm" onclick="Products.createCategoryInline()">Criar categoria</button>
           </div>` : ''}
         </div>
         <div class="form-group">
           <label class="form-label">Unidade</label>
           <select class="form-control" id="pf-unit">
             ${units.map(u => `<option ${u === selUnit ? 'selected' : ''}>${u}</option>`).join('')}
           </select>
         </div>
       </div>
       <div class="form-group" style="margin-top:4px">
         <label class="form-label">Fornecedores por Churrascaria</label>
         <div style="border:1px solid var(--border);border-radius:8px;max-height:240px;overflow-y:auto;background:var(--bg2)">
           ${companyList}
         </div>
         <div style="font-size:11px;color:var(--gray);margin-top:4px">
           Marque em quais churrascarias cada fornecedor vende este produto, com o preço correspondente.
         </div>
       </div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
       ${isNew ? `<button class="btn btn-gold" onclick="Products.saveAndNew()">Salvar e criar outro</button>` : ''}
       <button class="btn btn-primary" onclick="Products.save(${id || 'null'})">Salvar</button>`
    );
    const firstInput = document.getElementById('pf-name') || document.querySelector('.pf-name-input');
    if (firstInput) firstInput.focus();
  },

  toggleChurrPrice(companyId, churrId) {
    const cb   = document.querySelector(`.pf-company-cb[data-company-id="${companyId}"][data-churr-id="${churrId}"]`);
    const wrap = document.getElementById(`pf-pw-${companyId}-${churrId}`);
    if (wrap) wrap.style.display = cb && cb.checked ? 'flex' : 'none';
  },

  async _saveCompanyLinks(productId) {
    const checkboxes = document.querySelectorAll('.pf-company-cb');
    const prevSet    = new Set(this.linkedCompanies.map(l => `${l.company_id}-${l.churrascaria_id}`));
    const links = [], unlinks = [];
    checkboxes.forEach(cb => {
      const companyId = Number(cb.dataset.companyId);
      const churrId   = Number(cb.dataset.churrId);
      const price     = parseFloat(document.getElementById(`pf-price-${companyId}-${churrId}`)?.value || 0);
      if (cb.checked) {
        links.push({ company_id: companyId, churrascaria_id: churrId, price });
      } else if (prevSet.has(`${companyId}-${churrId}`)) {
        unlinks.push({ company_id: companyId, churrascaria_id: churrId });
      }
    });
    this.lastLinkedCompanies = links;
    if (links.length || unlinks.length) {
      await API.post(`/products/${productId}/companies/batch`, { links, unlinks });
    }
  },

  toggleNewCatForm() {
    const form = document.getElementById('pf-new-cat-form');
    form.style.display = form.style.display === 'none' ? 'block' : 'none';
    if (form.style.display === 'block') document.getElementById('pf-new-cat-name').focus();
  },

  async createCategoryInline() {
    const name = document.getElementById('pf-new-cat-name').value.trim();
    if (!name) { toast('Digite o nome da categoria', 'error'); return; }
    try {
      const result = await API.post('/categories', { name, color: '#E07820' });
      this.invalidateCache();
      const cats = await API.get('/categories');
      this.categories = cats || [];
      document.getElementById('pf-cat').innerHTML = this.buildCatOptions(result.id);
      document.getElementById('pf-new-cat-form').style.display = 'none';
      document.getElementById('pf-new-cat-name').value = '';
      toast(`Categoria "${name}" criada!`);
    } catch (err) { toast(err.message, 'error'); }
  },

  async save(id) {
    const category_id = document.getElementById('pf-cat').value || null;
    const unit        = document.getElementById('pf-unit').value;
    const brand       = document.getElementById('pf-brand')?.value.trim() || null;

    if (id) {
      const name = document.getElementById('pf-name').value.trim();
      if (!name) { toast('Nome é obrigatório', 'error'); return; }
      try {
        await API.put(`/products/${id}`, { name, category_id, unit, brand });
        await this._saveCompanyLinks(id);
        this.lastCategoryId = category_id || '';
        this.lastUnit = unit;
        closeModal();
        toast('Produto atualizado!');
        this.load(document.getElementById('prod-search')?.value || '',
                  this._getCatIds(),
                  document.getElementById('prod-filter-company')?.value || '',
                  this._getChurrId());
      } catch (err) { toast(err.message, 'error'); }
      return;
    }

    const names = [...document.querySelectorAll('.pf-name-input')]
      .map(el => el.value.trim()).filter(Boolean);
    if (!names.length) { toast('Nome é obrigatório', 'error'); return; }
    try {
      for (const name of names) {
        const result = await API.post('/products', { name, category_id, unit, brand });
        await this._saveCompanyLinks(result.id);
      }
      this.lastCategoryId = category_id || '';
      this.lastUnit = unit;
      closeModal();
      toast(names.length > 1 ? `${names.length} produtos criados!` : 'Produto criado!');
      this.load(document.getElementById('prod-search')?.value || '',
                this._getCatIds(),
                document.getElementById('prod-filter-company')?.value || '',
                this._getChurrId());
    } catch (err) { toast(err.message, 'error'); }
  },

  async saveAndNew() {
    const category_id = document.getElementById('pf-cat').value || null;
    const unit        = document.getElementById('pf-unit').value;
    const brand       = document.getElementById('pf-brand')?.value.trim() || null;
    const names = [...document.querySelectorAll('.pf-name-input')]
      .map(el => el.value.trim()).filter(Boolean);
    if (!names.length) { toast('Nome é obrigatório', 'error'); return; }
    try {
      for (const name of names) {
        const result = await API.post('/products', { name, category_id, unit, brand });
        await this._saveCompanyLinks(result.id);
      }
      this.lastCategoryId = category_id || '';
      this.lastUnit = unit;
      toast(names.length > 1 ? `${names.length} produtos criados! Abrindo novo cadastro...` : 'Produto criado! Abrindo novo cadastro...');
      this.load(document.getElementById('prod-search')?.value || '',
                this._getCatIds(),
                document.getElementById('prod-filter-company')?.value || '',
                this._getChurrId());
      this.openForm(null, category_id, unit);
    } catch (err) { toast(err.message, 'error'); }
  },

  async openBulkAssign() {
    const { cats, companies, churrs } = await this._loadFormData();

    showModal(
      '⚡ Edição em Massa — Vincular Fornecedor',
      `<div style="font-size:13px;color:var(--gray);margin-bottom:16px;line-height:1.6">
         Selecione uma categoria, um fornecedor e as churrascarias.<br>
         O fornecedor será adicionado a <strong style="color:var(--white)">todos os produtos</strong> da categoria selecionada.<br>
         Vínculos existentes não serão alterados.
       </div>
       <div class="form-group">
         <label class="form-label">Categoria *</label>
         <select class="form-control" id="ba-cat" onchange="Products._bulkPreview()">
           <option value="">Selecione uma categoria...</option>
           ${cats.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
         </select>
       </div>
       <div class="form-group">
         <label class="form-label">Fornecedor a vincular *</label>
         <select class="form-control" id="ba-company" onchange="Products._bulkPreview()">
           <option value="">Selecione um fornecedor...</option>
           ${companies.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
         </select>
       </div>
       <div class="form-group">
         <label class="form-label">Churrascarias *</label>
         <div style="display:flex;flex-direction:column;gap:8px;margin-top:4px">
           ${churrs.map(ch => `
             <label style="display:flex;align-items:center;gap:10px;cursor:pointer;font-size:14px;color:var(--white)">
               <input type="checkbox" class="ba-churr-cb" value="${ch.id}"
                 style="width:16px;height:16px;accent-color:var(--orange);cursor:pointer"
                 onchange="Products._bulkPreview()" checked>
               🔥 ${escHtml(ch.name)}
             </label>`).join('')}
         </div>
       </div>
       <div id="ba-preview" style="margin-top:4px"></div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="Products.bulkAssign()">Vincular</button>`
    );
  },

  async _bulkPreview() {
    const catId = document.getElementById('ba-cat').value;
    const el = document.getElementById('ba-preview');
    if (!catId) { el.innerHTML = ''; return; }
    try {
      const params = new URLSearchParams({ category_id: catId });
      const products = await API.get('/products?' + params);
      const count = (products || []).length;
      el.innerHTML = count > 0
        ? `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:13px;color:var(--gray)">
             <strong style="color:var(--gold);font-size:15px">${count}</strong> produto${count !== 1 ? 's' : ''} serão afetados nesta categoria.
           </div>`
        : `<div style="background:var(--bg2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;font-size:13px;color:var(--gray)">
             Nenhum produto nesta categoria.
           </div>`;
    } catch (_) {}
  },

  async bulkAssign() {
    const catId = document.getElementById('ba-cat').value;
    const companyId = document.getElementById('ba-company').value;
    const churrIds = [...document.querySelectorAll('.ba-churr-cb:checked')].map(cb => Number(cb.value));
    if (!catId) { toast('Selecione uma categoria', 'error'); return; }
    if (!companyId) { toast('Selecione um fornecedor', 'error'); return; }
    if (!churrIds.length) { toast('Selecione pelo menos uma churrascaria', 'error'); return; }
    try {
      const result = await API.post('/products/bulk-assign', {
        category_id: Number(catId),
        company_id: Number(companyId),
        churrascaria_ids: churrIds,
      });
      closeModal();
      toast(`Fornecedor vinculado a ${result.affected} produto${result.affected !== 1 ? 's' : ''}!`);
      this.load(
        document.getElementById('prod-search')?.value || '',
        this._getCatIds(),
        document.getElementById('prod-filter-company')?.value || '',
        this._getChurrId()
      );
    } catch (err) { toast(err.message, 'error'); }
  },

  addNameField() {
    const container = document.getElementById('pf-names-container');
    const rows = container.querySelectorAll('.pf-name-row');
    if (rows.length >= 5) { toast('Máximo de 5 produtos por vez', 'warning'); return; }
    const row = document.createElement('div');
    row.className = 'pf-name-row';
    row.style.cssText = 'display:flex;gap:6px;align-items:center';
    row.innerHTML = `<input class="form-control pf-name-input" placeholder="Nome do produto ${rows.length + 1}...">
      <button type="button" onclick="this.parentElement.remove();Products._updateAddBtn()"
        style="background:none;border:1px solid var(--border);border-radius:6px;color:var(--gray);cursor:pointer;padding:5px 10px;font-size:18px;line-height:1;flex-shrink:0" title="Remover">×</button>`;
    container.appendChild(row);
    row.querySelector('input').focus();
    if (container.querySelectorAll('.pf-name-row').length >= 5) {
      document.getElementById('pf-add-name-btn').style.display = 'none';
    }
  },

  _updateAddBtn() {
    const container = document.getElementById('pf-names-container');
    if (!container) return;
    const btn = document.getElementById('pf-add-name-btn');
    if (btn) btn.style.display = container.querySelectorAll('.pf-name-row').length >= 5 ? 'none' : '';
  },

  async delete(id) {
    if (!await confirm2('Desativar este produto?', 'Desativar')) return;
    try {
      await API.delete(`/products/${id}`);
      toast('Produto desativado');
      this.load(document.getElementById('prod-search')?.value || '',
                this._getCatIds(),
                document.getElementById('prod-filter-company')?.value || '',
                this._getChurrId());
    } catch (err) { toast(err.message, 'error'); }
  }
};
