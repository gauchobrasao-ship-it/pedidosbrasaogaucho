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

  debouncedLoad(search, categoryId, companyId) {
    clearTimeout(this._searchTimer);
    this._searchTimer = setTimeout(() => this.load(search, categoryId, companyId), 280);
  },

  async load(search = '', categoryId = '', companyId = '') {
    const el = document.getElementById('section-products');
    const isFirstLoad = !el.querySelector('.card');
    if (isFirstLoad) el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (categoryId) params.set('category_id', categoryId);
      if (companyId) params.set('company_id', companyId);

      const [products, cats, companies] = await Promise.all([
        API.get('/products?' + params),
        this._cache.data ? Promise.resolve(this._cache.data.cats) : API.get('/categories'),
        this._cache.data ? Promise.resolve(this._cache.data.companies) : API.get('/companies'),
      ]);
      this.categories = cats || [];
      this.companies = companies || [];

      el.innerHTML = `
        <div class="card">
          <div class="card-header">
            <span class="card-title">Produtos</span>
            ${App.canDo('manage_products') ? `<button class="btn btn-primary" onclick="Products.openForm()">+ Novo Produto</button>` : ''}
          </div>
          <div class="search-bar mb-16">
            <div class="search-input-wrap">
              <span class="search-icon">🔍</span>
              <input type="text" class="form-control" id="prod-search" placeholder="Buscar produto..."
                value="${escHtml(search)}"
                oninput="Products.debouncedLoad(this.value, document.getElementById('prod-filter-cat').value, document.getElementById('prod-filter-company').value)">
            </div>
            <select class="form-control" id="prod-filter-cat" style="max-width:200px"
              onchange="Products.load(document.getElementById('prod-search').value, this.value, document.getElementById('prod-filter-company').value)">
              <option value="">Todas as categorias</option>
              ${this.categories.map(c =>
                `<option value="${c.id}" ${String(c.id) === String(categoryId) ? 'selected' : ''}>${escHtml(c.name)}</option>`
              ).join('')}
            </select>
            <select class="form-control" id="prod-filter-company" style="max-width:200px"
              onchange="Products.load(document.getElementById('prod-search').value, document.getElementById('prod-filter-cat').value, this.value)">
              <option value="">Todos os fornecedores</option>
              ${this.companies.map(c =>
                `<option value="${c.id}" ${String(c.id) === String(companyId) ? 'selected' : ''}>${escHtml(c.name)}</option>`
              ).join('')}
            </select>
          </div>
          <div style="font-size:12px;color:var(--gray);padding:0 4px 10px">
            <strong style="color:var(--white)">${(products||[]).length}</strong> ${(products||[]).length === 1 ? 'produto encontrado' : 'produtos encontrados'}
          </div>
          ${!products || products.length === 0
            ? '<div class="empty-state"><div class="empty-icon">📦</div><p>Nenhum produto encontrado</p></div>'
            : `<div class="table-wrap"><table>
              <thead><tr><th>Produto</th><th>Categoria</th><th>Unidade</th><th>Fornecedores</th><th>Menor Preço</th><th>Atualização</th><th>Ações</th></tr></thead>
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
         <label class="form-label">Nome *</label>
         <input class="form-control" id="pf-name" value="${escHtml(product.name || '')}" placeholder="Nome do produto...">
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
    document.getElementById('pf-name').focus();
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
    const data = {
      name: document.getElementById('pf-name').value.trim(),
      category_id: document.getElementById('pf-cat').value || null,
      unit: document.getElementById('pf-unit').value,
      brand: document.getElementById('pf-brand')?.value.trim() || null,
    };
    if (!data.name) { toast('Nome é obrigatório', 'error'); return; }
    try {
      let productId = id;
      if (id) {
        await API.put(`/products/${id}`, data);
      } else {
        const result = await API.post('/products', data);
        productId = result.id;
      }
      await this._saveCompanyLinks(productId);
      this.lastCategoryId = data.category_id || '';
      this.lastUnit = data.unit;
      closeModal();
      toast(id ? 'Produto atualizado!' : 'Produto criado!');
      this.load(document.getElementById('prod-search')?.value || '',
                document.getElementById('prod-filter-cat')?.value || '',
                document.getElementById('prod-filter-company')?.value || '');
    } catch (err) { toast(err.message, 'error'); }
  },

  async saveAndNew() {
    const data = {
      name: document.getElementById('pf-name').value.trim(),
      category_id: document.getElementById('pf-cat').value || null,
      unit: document.getElementById('pf-unit').value,
      brand: document.getElementById('pf-brand')?.value.trim() || null,
    };
    if (!data.name) { toast('Nome é obrigatório', 'error'); return; }
    try {
      const result = await API.post('/products', data);
      await this._saveCompanyLinks(result.id);
      this.lastCategoryId = data.category_id || '';
      this.lastUnit = data.unit;
      toast('Produto criado! Abrindo novo cadastro...');
      this.load(document.getElementById('prod-search')?.value || '',
                document.getElementById('prod-filter-cat')?.value || '',
                document.getElementById('prod-filter-company')?.value || '');
      this.openForm(null, data.category_id, data.unit);
    } catch (err) { toast(err.message, 'error'); }
  },

  async delete(id) {
    if (!await confirm2('Desativar este produto?', 'Desativar')) return;
    try {
      await API.delete(`/products/${id}`);
      toast('Produto desativado');
      this.load(document.getElementById('prod-search')?.value || '',
                document.getElementById('prod-filter-cat')?.value || '',
                document.getElementById('prod-filter-company')?.value || '');
    } catch (err) { toast(err.message, 'error'); }
  }
};
