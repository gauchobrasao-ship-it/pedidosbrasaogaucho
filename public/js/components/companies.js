// ════════════════════════════════════════
//  COMPANIES
// ════════════════════════════════════════
const Companies = {
  async load(search = '') {
    const el = document.getElementById('section-companies');
    el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const companies = await API.get('/companies' + (search ? `?search=${encodeURIComponent(search)}` : ''));
      el.innerHTML = `
        <div class="card">
          <div class="card-header">
            <span class="card-title">Fornecedores</span>
            ${App.canDo('manage_companies') ? `<button class="btn btn-primary" onclick="Companies.openForm()">+ Novo Fornecedor</button>` : ''}
          </div>
          <div class="search-bar mb-16">
            <div class="search-input-wrap">
              <span class="search-icon">🔍</span>
              <input type="text" class="form-control" id="comp-search" placeholder="Buscar fornecedor..." value="${escHtml(search)}"
                oninput="Companies.load(this.value)">
            </div>
          </div>
          ${!companies || companies.length === 0
            ? '<div class="empty-state"><div class="empty-icon">🏢</div><p>Nenhum fornecedor encontrado</p></div>'
            : `<div class="table-wrap"><table>
              <thead><tr>
                <th>Nome</th><th>CNPJ</th><th>Telefone</th><th>Contato</th><th>Produtos</th><th>Ações</th>
              </tr></thead>
              <tbody>${companies.map(c => `<tr>
                <td><strong>${escHtml(c.name)}</strong></td>
                <td class="text-gray">${escHtml(c.cnpj||'-')}</td>
                <td>${escHtml(c.phone||'-')}</td>
                <td>${escHtml(c.contact_name||'-')}</td>
                <td><span class="badge badge-orange">${c.product_count} produto(s)</span></td>
                <td>
                  <div class="flex flex-gap">
                    <button class="btn btn-outline btn-sm" onclick="Companies.viewProducts(${c.id},'${escHtml(c.name)}')">Produtos</button>
                    ${App.canDo('manage_companies') ? `
                    <button class="btn btn-gold btn-sm" onclick="Companies.openForm(${c.id})">Editar</button>
                    <button class="btn btn-danger btn-sm" onclick="Companies.delete(${c.id})">Excluir</button>` : ''}
                  </div>
                </td>
              </tr>`).join('')}</tbody>
            </table></div>`}
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

  async openForm(id) {
    let company = {};
    if (id) {
      company = await API.get(`/companies/${id}`);
    }
    showModal(
      id ? 'Editar Fornecedor' : 'Novo Fornecedor',
      `<div class="form-row">
        <div class="form-group"><label class="form-label">Nome *</label>
          <input class="form-control" id="cf-name" value="${escHtml(company.name||'')}"></div>
        <div class="form-group"><label class="form-label">CNPJ</label>
          <input class="form-control" id="cf-cnpj" value="${escHtml(company.cnpj||'')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Telefone</label>
          <input class="form-control" id="cf-phone" value="${escHtml(company.phone||'')}"></div>
        <div class="form-group"><label class="form-label">Email</label>
          <input class="form-control" id="cf-email" value="${escHtml(company.email||'')}"></div>
      </div>
      <div class="form-group"><label class="form-label">Contato</label>
        <input class="form-control" id="cf-contact" value="${escHtml(company.contact_name||'')}"></div>
      <div class="form-group"><label class="form-label">Endereço</label>
        <input class="form-control" id="cf-address" value="${escHtml(company.address||'')}"></div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="Companies.save(${id||'null'})">Salvar</button>`
    );
  },

  async save(id) {
    const data = {
      name: document.getElementById('cf-name').value.trim(),
      cnpj: document.getElementById('cf-cnpj').value.trim(),
      phone: document.getElementById('cf-phone').value.trim(),
      email: document.getElementById('cf-email').value.trim(),
      contact_name: document.getElementById('cf-contact').value.trim(),
      address: document.getElementById('cf-address').value.trim(),
    };
    if (!data.name) { toast('Nome é obrigatório', 'error'); return; }
    try {
      if (id) await API.put(`/companies/${id}`, data);
      else await API.post('/companies', data);
      closeModal();
      toast(id ? 'Fornecedor atualizado!' : 'Fornecedor criado!');
      this.load();
    } catch (err) { toast(err.message, 'error'); }
  },

  async delete(id) {
    if (!await confirm2('Desativar este fornecedor?', 'Desativar')) return;
    try {
      await API.delete(`/companies/${id}`);
      toast('Fornecedor desativado');
      this.load();
    } catch (err) { toast(err.message, 'error'); }
  },

  async viewProducts(companyId, companyName, activeChurrId) {
    const [churrascarias, allProducts] = await Promise.all([
      API.get('/reports/churrascarias'),
      API.get('/products'),
    ]);
    if (!churrascarias || churrascarias.length === 0) { toast('Nenhuma churrascaria disponível', 'error'); return; }
    const churr = churrascarias.find(c => c.id === activeChurrId) || churrascarias[0];
    const products = await API.get(`/companies/${companyId}/products?churrascaria_id=${churr.id}`);
    const linkedIds = new Set(products.map(p => p.id));
    const available = (allProducts||[]).filter(p => !linkedIds.has(p.id) && p.active !== 0);

    showModal(
      `Produtos · ${escHtml(companyName)}`,
      `<div class="tab-bar">
        ${churrascarias.map(ch => `
          <button class="tab-btn ${ch.id === churr.id ? 'active' : ''}"
            onclick="Companies.viewProducts(${companyId},'${escHtml(companyName)}',${ch.id})">
            🔥 ${escHtml(ch.name)}
          </button>`).join('')}
      </div>
      <div style="margin-bottom:12px">
        <strong class="text-gold">${products.length}</strong>
        <span class="text-gray"> produto(s) em ${escHtml(churr.name)}</span>
      </div>
      ${products.length > 0 ? `
      <div class="table-wrap" style="max-height:240px;overflow-y:auto">
        <table>
          <thead><tr><th>Produto</th><th>Categoria</th><th>UN</th><th>Preço</th><th></th></tr></thead>
          <tbody>
            ${products.map(p => `<tr>
              <td>${escHtml(p.name)}</td>
              <td><span class="badge badge-orange">${escHtml(p.category_name||'-')}</span></td>
              <td>${escHtml(p.unit||'un')}</td>
              <td><input type="number" step="0.01" min="0" value="${parseFloat(p.price||0).toFixed(2)}"
                  style="width:90px;background:var(--bg2);border:1px solid var(--border);border-radius:6px;color:var(--white);padding:4px 8px"
                  onchange="Companies.updatePrice(${companyId},${p.id},this.value,'${escHtml(companyName)}',${churr.id})"></td>
              <td><button class="btn btn-danger btn-sm"
                onclick="Companies.unlinkProduct(${companyId},${p.id},'${escHtml(companyName)}',${churr.id})">–</button></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>` : '<div class="empty-state" style="padding:20px"><p>Nenhum produto nesta churrascaria</p></div>'}
      <hr class="divider">
      <div style="font-weight:700;color:var(--gold);margin-bottom:8px">
        Vincular produto em <span style="color:var(--orange)">${escHtml(churr.name)}</span>
      </div>
      <div class="flex flex-gap">
        <select id="add-product-sel" class="form-control">
          <option value="">Selecione um produto...</option>
          ${available.map(p => `<option value="${p.id}">${escHtml(p.name)} (${escHtml(p.unit||'un')})</option>`).join('')}
        </select>
        <input type="number" id="add-product-price" class="form-control" style="width:110px" placeholder="Preço" step="0.01" min="0">
        <button class="btn btn-primary" onclick="Companies.linkProduct(${companyId},'${escHtml(companyName)}',${churr.id})">+</button>
      </div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Fechar</button>`
    );
  },

  async linkProduct(companyId, companyName, churrId) {
    const productId = document.getElementById('add-product-sel').value;
    const price = document.getElementById('add-product-price').value;
    if (!productId) { toast('Selecione um produto', 'error'); return; }
    try {
      await API.post(`/companies/${companyId}/products`, { product_id: productId, churrascaria_id: churrId, price: price || 0 });
      toast('Produto vinculado!');
      this.viewProducts(companyId, companyName, churrId);
    } catch (err) { toast(err.message, 'error'); }
  },

  async unlinkProduct(companyId, productId, companyName, churrId) {
    if (!await confirm2('Desvincular produto desta churrascaria?', 'Desvincular')) return;
    try {
      await API.delete(`/companies/${companyId}/products/${productId}?churrascaria_id=${churrId}`);
      toast('Produto desvinculado');
      this.viewProducts(companyId, companyName, churrId);
    } catch (err) { toast(err.message, 'error'); }
  },

  async updatePrice(companyId, productId, price, companyName, churrId) {
    try {
      await API.put(`/companies/${companyId}/products/${productId}`, { price, churrascaria_id: churrId });
      toast('Preço atualizado');
    } catch (err) { toast(err.message, 'error'); }
  }
};
