// ════════════════════════════════════════
//  COTAÇÕES (Internas + Pedidos externos)
// ════════════════════════════════════════
const Quotations = {

  _tab: 'requests',

  async load(tab) {
    if (tab) this._tab = tab;
    const el = document.getElementById('section-quotations');
    el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      if (this._tab === 'requests') {
        const requests = await API.get('/price-requests');
        this._renderMain(el, null, requests);
      } else {
        const quotations = await API.get('/quotations');
        this._renderMain(el, quotations, null);
      }
    } catch (err) {
      el.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

  _renderMain(el, quotations, requests) {
    const tab = this._tab;
    el.innerHTML = `
      <div class="card-tabs">
        <button class="tab-btn ${tab === 'requests' ? 'active' : ''}" onclick="Quotations.load('requests')">Cotação Externa</button>
        <button class="tab-btn ${tab === 'internal' ? 'active' : ''}" onclick="Quotations.load('internal')">Cotação Interna</button>
      </div>
      <div id="qt-content" style="margin-top:20px"></div>`;
    const content = document.getElementById('qt-content');
    if (tab === 'requests') this._renderRequests(content, requests);
    else this._renderInternal(content, quotations);
  },

  _renderRequests(el, requests) {
    const now = new Date();
    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Cotação Externa</span>
          <button class="btn btn-primary" onclick="PriceRequest.openNew()">+ Nova Cotação</button>
        </div>
        <div style="font-size:12px;color:var(--gray);padding:8px 4px 10px">
          <strong style="color:var(--white)">${(requests||[]).length}</strong> ${(requests||[]).length === 1 ? 'cotação encontrada' : 'cotações encontradas'}
        </div>
        ${!requests?.length
          ? `<div class="empty-state">
               <div class="empty-icon">📨</div>
               <p>Nenhum pedido enviado ainda.</p>
               <p style="font-size:13px;color:var(--gray);margin-top:6px">Crie um pedido e envie o link ao fornecedor via WhatsApp.</p>
             </div>`
          : `<div class="table-wrap"><table>
              <thead><tr>
                <th>Nº</th><th>Título</th><th>Churrascaria</th><th>Fornecedor</th><th>Itens</th><th>Status</th><th>Validade</th><th>Ações</th>
              </tr></thead>
              <tbody>${requests.map(r => {
                const expired = new Date(r.expires_at) < now;
                const answered = !!r.last_filled_at;
                const status = expired
                  ? '<span class="badge badge-danger">Expirado</span>'
                  : answered
                    ? '<span class="badge badge-success">Respondido</span>'
                    : '<span class="badge badge-warning">Aguardando</span>';
                const url = `${location.origin}/cotacao/${r.token}`;
                return `<tr>
                  <td><span class="badge badge-gold">#${String(r.id).padStart(4, '0')}</span></td>
                  <td>${escHtml(r.title || '—')}</td>
                  <td>${escHtml(r.churrascaria_name)}</td>
                  <td>${escHtml(r.company_name)}</td>
                  <td style="text-align:center">${r.item_count}</td>
                  <td>${status}</td>
                  <td style="font-size:12px;white-space:nowrap">${fmtDate(r.expires_at)}</td>
                  <td style="white-space:nowrap">
                    ${answered ? `<button class="btn btn-outline btn-sm" onclick="PriceRequest.view(${r.id})" title="Ver cotação">👁 Ver</button>` : ''}
                    <button class="btn btn-outline btn-sm" data-url="${escHtml(url)}"
                      onclick="PriceRequest.copyLink(this.dataset.url)" title="Copiar link">🔗 Link</button>
                    <button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger)"
                      onclick="PriceRequest.del(${r.id})" title="Excluir">🗑</button>
                  </td>
                </tr>`;
              }).join('')}</tbody>
            </table></div>`}
      </div>`;
  },

  _renderInternal(el, quotations) {
    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Cotação Interna</span>
          <button class="btn btn-primary" onclick="Quotations.openNew()">+ Nova Cotação</button>
        </div>
        <div style="font-size:12px;color:var(--gray);padding:8px 4px 10px">
          <strong style="color:var(--white)">${(quotations||[]).length}</strong> ${(quotations||[]).length === 1 ? 'cotação encontrada' : 'cotações encontradas'}
        </div>
        ${!quotations?.length
          ? '<div class="empty-state"><div class="empty-icon">📋</div><p>Nenhuma cotação ainda</p></div>'
          : `<div class="table-wrap"><table>
              <thead><tr>
                <th>Nº</th><th>Churrascaria</th><th>Fornecedor</th><th>Semana</th><th>Itens</th><th>Responsável</th><th>Data</th>
              </tr></thead>
              <tbody>${quotations.map(q => `<tr>
                <td><span class="badge badge-gold">#${String(q.id).padStart(4, '0')}</span></td>
                <td>${escHtml(q.churrascaria_name)}</td>
                <td>${escHtml(q.company_name)}</td>
                <td>${escHtml(q.week_reference || '—')}</td>
                <td style="text-align:center">${q.item_count}</td>
                <td>${escHtml(q.user_name)}</td>
                <td>${fmtDate(q.created_at)}</td>
              </tr>`).join('')}</tbody>
            </table></div>`}
      </div>`;
  },

  /* ─── Cotação Interna (fluxo existente) ─── */
  state: {},

  async openNew() {
    this.state = {};
    App.navigate('new-quotation');
    const el = document.getElementById('section-new-quotation');
    el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const [churrascarias, companies] = await Promise.all([
        API.get('/reports/churrascarias'),
        API.get('/companies'),
      ]);
      this.state.churrascarias = churrascarias;
      this.state.companies = companies;
      this.renderStep1();
    } catch (err) {
      el.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

  renderStep1() {
    const el = document.getElementById('section-new-quotation');
    const { churrascarias, companies } = this.state;
    const today = new Date();
    const weekNum = Math.ceil((((today - new Date(today.getFullYear(), 0, 1)) / 86400000) + new Date(today.getFullYear(), 0, 1).getDay() + 1) / 7);
    const weekRef = `${today.getFullYear()}-W${String(weekNum).padStart(2, '0')}`;
    el.innerHTML = `
      <div style="max-width:700px">
        <div class="flex align-center flex-gap mb-16">
          <button class="btn btn-outline btn-sm" onclick="App.navigate('quotations')">← Voltar</button>
          <h2 class="text-gold">Nova Cotação Interna</h2>
        </div>
        <div class="card">
          <div class="form-group">
            <label class="form-label">Churrascaria</label>
            <select id="nq-churr" class="form-control">
              <option value="">Selecione...</option>
              ${churrascarias.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Fornecedor</label>
            <select id="nq-company" class="form-control">
              <option value="">Selecione...</option>
              ${companies.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Referência da Semana</label>
            <input type="text" id="nq-week" class="form-control" value="${weekRef}" placeholder="ex: 2024-W24">
          </div>
          <button class="btn btn-primary" onclick="Quotations.goProducts()">Próximo →</button>
        </div>
      </div>`;
  },

  async goProducts() {
    const churrId = document.getElementById('nq-churr').value;
    const compId = document.getElementById('nq-company').value;
    const weekRef = document.getElementById('nq-week').value;
    if (!churrId || !compId) { toast('Selecione a churrascaria e o fornecedor', 'error'); return; }
    this.state.churrascaria_id = churrId;
    this.state.company_id = compId;
    this.state.week_reference = weekRef;
    this.state.churrascaria_name = document.getElementById('nq-churr').selectedOptions[0].text;
    this.state.company_name = document.getElementById('nq-company').selectedOptions[0].text;
    const el = document.getElementById('section-new-quotation');
    el.innerHTML = '<div class="empty-state">Carregando produtos...</div>';
    const products = await API.get(`/companies/${compId}/products?churrascaria_id=${this.state.churrascaria_id}`);
    this.state.products = products;
    this.renderProducts();
  },

  renderProducts() {
    const el = document.getElementById('section-new-quotation');
    const { products, company_name, churrascaria_name, week_reference } = this.state;
    const grouped = {};
    (products || []).forEach(p => {
      const cat = p.category_name || 'Sem categoria';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    });
    const rows = Object.entries(grouped).map(([cat, prods]) => `
      <div class="category-divider">${escHtml(cat)}</div>
      ${prods.map(p => `
        <div class="product-order-row">
          <div>
            <div class="product-order-name">${escHtml(p.name)}</div>
            <div style="font-size:11px;color:var(--gray)">${escHtml(p.unit || 'un')}</div>
          </div>
          <div style="font-size:12px;color:var(--gray)">Atual: <span class="text-gold">${fmtMoney(p.price)}</span></div>
          <div>
            <input type="number" step="0.01" min="0" class="form-control" style="width:120px"
              id="nqprice-${p.id}" value="${parseFloat(p.price || 0).toFixed(2)}" placeholder="Novo preço">
          </div>
        </div>`).join('')}
    `).join('');
    el.innerHTML = `
      <div style="max-width:800px">
        <div class="flex align-center flex-gap mb-16">
          <button class="btn btn-outline btn-sm" onclick="Quotations.renderStep1()">← Voltar</button>
          <h2 class="text-gold">Cotação · ${escHtml(week_reference)}</h2>
        </div>
        <div class="card">
          <div class="flex justify-between mb-16">
            <div>
              <div class="text-gold" style="font-weight:700">${escHtml(company_name)}</div>
              <div class="text-gray" style="font-size:13px">${escHtml(churrascaria_name)}</div>
            </div>
          </div>
          ${rows}
          <hr class="divider">
          <div class="form-group">
            <label class="form-label">Observações</label>
            <textarea id="nq-obs" class="form-control" placeholder="Observações da cotação..."></textarea>
          </div>
          <button class="btn btn-primary" onclick="Quotations.submit()">✓ Salvar Cotação e Atualizar Preços</button>
        </div>
      </div>`;
  },

  async submit() {
    const { products, churrascaria_id, company_id, week_reference } = this.state;
    const items = (products || []).map(p => ({
      product_id: p.id,
      previous_price: parseFloat(p.price || 0),
      new_price: parseFloat(document.getElementById(`nqprice-${p.id}`)?.value || 0)
    }));
    const observations = document.getElementById('nq-obs').value;
    try {
      await API.post('/quotations', { churrascaria_id, company_id, week_reference, observations, items });
      toast('Cotação salva e preços atualizados!');
      App.navigate('quotations');
    } catch (err) { toast(err.message, 'error'); }
  }
};


// ════════════════════════════════════════
//  PEDIDO DE COTAÇÃO (Link externo)
// ════════════════════════════════════════
const PriceRequest = {
  state: {},
  _mode: 'empresa',

  async openNew() {
    App.navigate('price-request');
    const el = document.getElementById('section-price-request');
    el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const [churrascarias, companies, products] = await Promise.all([
        API.get('/reports/churrascarias'),
        API.get('/companies'),
        API.get('/products'),
      ]);
      this.state = { churrascarias, companies, products };
      this._renderStep1();
    } catch (err) {
      el.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

  _renderStep1() {
    const el = document.getElementById('section-price-request');
    const { churrascarias } = this.state;
    el.innerHTML = `
      <div style="max-width:820px">
        <div class="flex align-center flex-gap mb-16">
          <button class="btn btn-outline btn-sm" onclick="App.navigate('quotations')">← Voltar</button>
          <h2 class="text-gold">Nova Cotação Externa</h2>
        </div>

        <div class="card mb-16">
          <div class="form-group">
            <label class="form-label">Churrascaria</label>
            <select id="pr-churr" class="form-control">
              <option value="">Selecione...</option>
              ${churrascarias.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group" style="margin-bottom:0">
            <label class="form-label">Modo de seleção</label>
            <div style="display:flex;gap:12px;margin-top:8px">
              <div id="mode-empresa-card" onclick="PriceRequest._setMode('empresa')"
                style="flex:1;background:var(--card2);border:2px solid var(--gold);border-radius:10px;padding:14px 16px;cursor:pointer;transition:all .15s">
                <div style="font-weight:700;color:var(--gold);margin-bottom:4px">Por Empresa</div>
                <div style="font-size:12px;color:var(--gray)">Seleciona todos os produtos de um fornecedor</div>
              </div>
              <div id="mode-produto-card" onclick="PriceRequest._setMode('produto')"
                style="flex:1;background:var(--card2);border:2px solid var(--border);border-radius:10px;padding:14px 16px;cursor:pointer;transition:all .15s">
                <div id="mode-produto-label" style="font-weight:700;color:var(--gray);margin-bottom:4px">Por Produto</div>
                <div style="font-size:12px;color:var(--gray)">Escolhe produtos específicos e seleciona fornecedores</div>
              </div>
            </div>
          </div>
        </div>

        <div id="pr-form-area"></div>
      </div>`;
    this._setMode('empresa');
  },

  _setMode(mode) {
    this._mode = mode;
    const eCard = document.getElementById('mode-empresa-card');
    const pCard = document.getElementById('mode-produto-card');
    const pLabel = document.getElementById('mode-produto-label');
    if (!eCard) return;
    if (mode === 'empresa') {
      eCard.style.border = '2px solid var(--gold)';
      eCard.querySelector('div').style.color = 'var(--gold)';
      pCard.style.border = '2px solid var(--border)';
      pLabel.style.color = 'var(--gray)';
    } else {
      pCard.style.border = '2px solid var(--gold)';
      pLabel.style.color = 'var(--gold)';
      eCard.style.border = '2px solid var(--border)';
      eCard.querySelector('div').style.color = 'var(--gray)';
    }
    const el = document.getElementById('pr-form-area');
    if (mode === 'empresa') this._renderEmpresaForm(el);
    else this._renderProdutoForm(el);
  },

  _renderEmpresaForm(el) {
    const { companies } = this.state;
    el.innerHTML = `
      <div class="card">
        <div class="form-group">
          <label class="form-label">Fornecedor</label>
          <select id="pr-company" class="form-control" onchange="PriceRequest._loadCompanyProducts()">
            <option value="">Selecione o fornecedor...</option>
            ${companies.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
          </select>
        </div>
        <div id="pr-empresa-products"></div>
      </div>`;
  },

  async _loadCompanyProducts() {
    const compId = document.getElementById('pr-company')?.value;
    const churrId = document.getElementById('pr-churr')?.value;
    const el = document.getElementById('pr-empresa-products');
    if (!el) return;
    if (!churrId) {
      toast('Selecione a churrascaria primeiro', 'error');
      document.getElementById('pr-company').value = '';
      el.innerHTML = '';
      return;
    }
    if (!compId) { el.innerHTML = ''; return; }

    el.innerHTML = '<div style="color:var(--gray);font-size:13px;padding:8px 0">Carregando produtos...</div>';
    try {
      const products = await API.get(`/companies/${compId}/products?churrascaria_id=${churrId}`);
      this.state._empresa_products = products;
      this.state._empresa_company_id = compId;

      if (!products.length) {
        el.innerHTML = '<div class="empty-state" style="padding:20px"><p>Nenhum produto cadastrado para este fornecedor nesta churrascaria</p></div>';
        return;
      }

      const grouped = {};
      products.forEach(p => {
        const cat = p.category_name || 'Sem categoria';
        if (!grouped[cat]) grouped[cat] = [];
        grouped[cat].push(p);
      });

      el.innerHTML = `
        <hr class="divider">
        <div class="flex justify-between align-center mb-12">
          <span style="font-size:13px;color:var(--gray)">${products.length} produto(s) encontrado(s)</span>
          <label style="display:flex;align-items:center;gap:6px;font-size:13px;cursor:pointer">
            <input type="checkbox" id="pr-all" checked onchange="PriceRequest._toggleAll(this.checked)" style="accent-color:var(--gold)">
            Selecionar todos
          </label>
        </div>
        ${Object.entries(grouped).map(([cat, prods]) => `
          <div class="category-divider">${escHtml(cat)}</div>
          ${prods.map(p => `
            <div class="product-order-row">
              <div style="display:flex;align-items:center;gap:10px">
                <input type="checkbox" class="pr-prod-ck" value="${p.id}" checked
                  style="accent-color:var(--gold);width:15px;height:15px;flex-shrink:0">
                <div>
                  <div class="product-order-name">${escHtml(p.name)}</div>
                  <div style="font-size:11px;color:var(--gray)">${escHtml(p.unit || 'un')}${p.brand ? ' · ' + escHtml(p.brand) : ''} · Atual: ${fmtMoney(p.price)}</div>
                </div>
              </div>
              <div></div>
              <div>
                <input type="number" step="0.5" min="0" class="form-control" style="width:90px"
                  id="pr-qty-${p.id}" value="1" placeholder="Qtd">
              </div>
            </div>`).join('')}
        `).join('')}
        ${this._commonFields()}
        <button class="btn btn-primary" onclick="PriceRequest._submitEmpresa()">Gerar Link de Cotação →</button>`;
    } catch (err) {
      el.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

  _toggleAll(checked) {
    document.querySelectorAll('.pr-prod-ck').forEach(cb => cb.checked = checked);
  },

  _renderProdutoForm(el) {
    const { companies, products } = this.state;
    const grouped = {};
    (products || []).forEach(p => {
      const cat = p.category_name || 'Sem categoria';
      if (!grouped[cat]) grouped[cat] = [];
      grouped[cat].push(p);
    });

    el.innerHTML = `
      <div class="card mb-12">
        <label class="form-label" style="margin-bottom:10px">
          Produtos para cotar
          <span style="font-weight:400;font-size:12px;color:var(--gray)"> — marque e informe a quantidade</span>
        </label>
        <div style="max-height:360px;overflow-y:auto;border:1px solid var(--border);border-radius:8px;padding:4px">
          ${Object.entries(grouped).map(([cat, prods]) => `
            <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.7px;color:var(--orange);padding:10px 10px 4px">${escHtml(cat)}</div>
            ${prods.map(p => `
              <div class="product-order-row">
                <div style="display:flex;align-items:center;gap:10px">
                  <input type="checkbox" class="pr-prod-ck" value="${p.id}" id="pp-${p.id}"
                    style="accent-color:var(--gold);width:15px;height:15px;flex-shrink:0">
                  <label for="pp-${p.id}" style="cursor:pointer">
                    <div class="product-order-name">${escHtml(p.name)}</div>
                    <div style="font-size:11px;color:var(--gray)">${escHtml(p.unit || 'un')}</div>
                  </label>
                </div>
                <div></div>
                <div>
                  <input type="number" step="0.5" min="0" class="form-control" style="width:90px"
                    id="pr-qty-${p.id}" value="1" placeholder="Qtd" onclick="event.stopPropagation()">
                </div>
              </div>`).join('')}
          `).join('')}
        </div>
      </div>

      <div class="card mb-12">
        <label class="form-label" style="margin-bottom:10px">
          Fornecedores
          <span style="font-weight:400;font-size:12px;color:var(--gray)"> — um link será gerado por fornecedor</span>
        </label>
        <div style="display:flex;flex-direction:column;gap:6px">
          ${companies.map(c => `
            <label style="display:flex;align-items:center;gap:10px;padding:10px 14px;background:var(--card2);border-radius:8px;cursor:pointer;border:1px solid var(--border)">
              <input type="checkbox" class="pr-comp-ck" value="${c.id}" style="accent-color:var(--gold);width:15px;height:15px;flex-shrink:0">
              <span style="font-weight:600">${escHtml(c.name)}</span>
            </label>`).join('')}
        </div>
      </div>

      <div class="card">
        ${this._commonFields()}
        <button class="btn btn-primary" onclick="PriceRequest._submitProduto()">Gerar Links de Cotação →</button>
      </div>`;
  },

  _commonFields() {
    return `
      <div class="form-group">
        <label class="form-label">Título <span style="font-weight:400;font-size:12px;color:var(--gray)">(opcional)</span></label>
        <input type="text" id="pr-title" class="form-control" placeholder="ex: Cotação Semana 24 · Carnes">
      </div>
      <div class="form-group">
        <label class="form-label">Validade do link</label>
        <select id="pr-expires" class="form-control">
          <option value="3">3 dias</option>
          <option value="7" selected>7 dias</option>
          <option value="14">14 dias</option>
          <option value="30">30 dias</option>
        </select>
      </div>
      <hr class="divider">`;
  },

  async _submitEmpresa() {
    const churrId = document.getElementById('pr-churr')?.value;
    const compId = this.state._empresa_company_id;
    if (!churrId || !compId) { toast('Selecione churrascaria e fornecedor', 'error'); return; }
    const checked = [...document.querySelectorAll('.pr-prod-ck:checked')];
    if (!checked.length) { toast('Selecione ao menos um produto', 'error'); return; }
    const items = checked.map(cb => ({
      product_id: parseInt(cb.value),
      quantity: parseFloat(document.getElementById(`pr-qty-${cb.value}`)?.value || 1) || 1
    }));
    await this._submit({ churrascaria_id: parseInt(churrId), company_ids: [parseInt(compId)], items });
  },

  async _submitProduto() {
    const churrId = document.getElementById('pr-churr')?.value;
    if (!churrId) { toast('Selecione a churrascaria', 'error'); return; }
    const prodCks = [...document.querySelectorAll('.pr-prod-ck:checked')];
    if (!prodCks.length) { toast('Selecione ao menos um produto', 'error'); return; }
    const compCks = [...document.querySelectorAll('.pr-comp-ck:checked')];
    if (!compCks.length) { toast('Selecione ao menos um fornecedor', 'error'); return; }
    const items = prodCks.map(cb => ({
      product_id: parseInt(cb.value),
      quantity: parseFloat(document.getElementById(`pr-qty-${cb.value}`)?.value || 1) || 1
    }));
    await this._submit({
      churrascaria_id: parseInt(churrId),
      company_ids: compCks.map(cb => parseInt(cb.value)),
      items
    });
  },

  async _submit(payload) {
    const title = document.getElementById('pr-title')?.value?.trim();
    const expires = parseInt(document.getElementById('pr-expires')?.value || 7);
    if (title) payload.title = title;
    payload.expires_in_days = expires;
    const btns = document.querySelectorAll('#pr-form-area .btn-primary, #section-price-request .btn-primary');
    btns.forEach(b => { b.disabled = true; b.textContent = 'Gerando...'; });
    try {
      const result = await API.post('/price-requests', payload);
      this._renderLinks(result.requests);
    } catch (err) {
      btns.forEach(b => { b.disabled = false; });
      toast(err.message || 'Erro ao criar pedido', 'error');
    }
  },

  _renderLinks(requests) {
    const el = document.getElementById('section-price-request');
    el.innerHTML = `
      <div style="max-width:760px">
        <div class="flex align-center flex-gap mb-20">
          <button class="btn btn-outline btn-sm" onclick="PriceRequest.openNew()">← Novo Pedido</button>
          <h2 class="text-gold">${requests.length > 1 ? requests.length + ' Links Gerados' : 'Link Gerado'}</h2>
        </div>
        <div class="card">
          <p style="color:var(--gray);font-size:13px;margin-bottom:20px;line-height:1.6">
            Copie o link e envie via WhatsApp. Quando o fornecedor preencher os preços, o sistema atualiza automaticamente.
          </p>
          ${requests.map(r => `
            <div style="background:var(--card2);border:1px solid var(--border);border-radius:10px;padding:16px;margin-bottom:10px">
              <div style="font-weight:700;color:var(--gold);font-size:15px;margin-bottom:12px">${escHtml(r.company_name)}</div>
              <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap">
                <input type="text" value="${escHtml(r.url)}" readonly class="form-control"
                  style="flex:1;min-width:160px;font-size:12px;font-family:monospace;background:#111;color:var(--gray);cursor:text"
                  onclick="this.select()">
                <button class="btn btn-outline btn-sm" data-url="${escHtml(r.url)}"
                  onclick="PriceRequest.copyLink(this.dataset.url)">Copiar</button>
                <a href="https://wa.me/?text=${encodeURIComponent('Olá! Segue o link para preenchimento da cotação de preços:\n\n' + r.url)}"
                  target="_blank" rel="noopener"
                  style="display:inline-flex;align-items:center;gap:6px;padding:7px 14px;border:1px solid #25D366;border-radius:8px;color:#25D366;text-decoration:none;font-size:13px;font-weight:600;background:rgba(37,211,102,0.08);white-space:nowrap">
                  WhatsApp
                </a>
              </div>
            </div>`).join('')}
          <div style="display:flex;gap:10px;margin-top:16px">
            <button class="btn btn-outline" onclick="Quotations.load('requests')">Ver Todos os Pedidos</button>
            <button class="btn btn-primary" onclick="PriceRequest.openNew()">+ Novo Pedido</button>
          </div>
        </div>
      </div>`;
  },

  async view(id) {
    try {
      const d = await API.get(`/price-requests/${id}/detail`);
      const fmt = v => v > 0 ? fmtMoney(v) : '—';
      const fmtDate2 = s => s ? new Date(s).toLocaleString('pt-BR', {day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '—';

      const grouped = {};
      (d.items||[]).forEach(i => { const c = i.category_name||'Geral'; if(!grouped[c]) grouped[c]=[]; grouped[c].push(i); });

      const rows = Object.entries(grouped).map(([cat, items]) => `
        <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--gold);padding:10px 0 5px;border-bottom:1px solid var(--border);margin-bottom:6px">${escHtml(cat)}</div>
        ${items.map(i => `
          <div style="background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:10px 14px;margin-bottom:6px">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">
              <div>
                <div style="font-weight:600;font-size:14px">${escHtml(i.product_name)}</div>
                <div style="font-size:12px;color:var(--gray);margin-top:2px">Qtd solicitada: ${i.quantity} ${escHtml(i.unit||'un')}</div>
              </div>
              <div style="text-align:right">
                <div style="font-size:13px">Unit.: <strong style="color:var(--gold)">${fmt(i.unit_price)}</strong></div>
                ${i.bulk_min_qty && i.bulk_price
                  ? `<div style="font-size:12px;color:var(--gray);margin-top:2px">
                       A partir de ${i.bulk_min_qty} ${escHtml(i.unit||'un')}: <strong style="color:var(--success)">${fmt(i.bulk_price)}</strong>
                     </div>`
                  : ''}
              </div>
            </div>
          </div>`).join('')}
      `).join('');

      showModal(`Cotação — ${escHtml(d.company_name)}`, `
        <div style="font-size:12px;color:var(--gray);margin-bottom:14px">
          ${escHtml(d.churrascaria_name)} · Respondida em ${fmtDate2(d.last_filled_at)}
        </div>
        ${rows}
        ${d.vendor_notes ? `
          <div style="margin-top:14px;background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:12px 14px">
            <div style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--gold);margin-bottom:6px">Observações do Vendedor</div>
            <div style="font-size:13px;color:var(--white);line-height:1.6;white-space:pre-wrap">${escHtml(d.vendor_notes)}</div>
          </div>` : ''}`,
        `<button class="btn btn-primary" onclick="closeModal()">Fechar</button>`
      );
    } catch (err) { toast(err.message, 'error'); }
  },

  copyLink(url) {
    navigator.clipboard.writeText(url)
      .then(() => toast('Link copiado!'))
      .catch(() => toast('Erro ao copiar o link', 'error'));
  },

  async del(id) {
    if (!confirm('Excluir este pedido de cotação?')) return;
    try {
      await API.delete(`/price-requests/${id}`);
      toast('Pedido excluído');
      Quotations.load('requests');
    } catch (err) {
      toast(err.message, 'error');
    }
  }
};
