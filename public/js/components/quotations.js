// ════════════════════════════════════════
//  QUOTATIONS
// ════════════════════════════════════════
const Quotations = {
  async load() {
    const el = document.getElementById('section-quotations');
    el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const quotations = await API.get('/quotations');
      el.innerHTML = `
        <div class="card">
          <div class="card-header">
            <span class="card-title">Cotações de Preços</span>
            <button class="btn btn-primary" onclick="Quotations.openNew()">+ Nova Cotação</button>
          </div>
          ${!quotations || quotations.length === 0
            ? '<div class="empty-state"><div class="empty-icon">📋</div><p>Nenhuma cotação ainda</p></div>'
            : `<div class="table-wrap"><table>
              <thead><tr>
                <th>Nº</th><th>Churrascaria</th><th>Fornecedor</th><th>Semana</th><th>Itens</th><th>Responsável</th><th>Data</th>
              </tr></thead>
              <tbody>${quotations.map(q => `<tr>
                <td><span class="badge badge-gold">#${String(q.id).padStart(4,'0')}</span></td>
                <td>${escHtml(q.churrascaria_name)}</td>
                <td>${escHtml(q.company_name)}</td>
                <td>${escHtml(q.week_reference||'-')}</td>
                <td>${q.item_count}</td>
                <td>${escHtml(q.user_name)}</td>
                <td>${fmtDate(q.created_at)}</td>
              </tr>`).join('')}</tbody>
            </table></div>`}
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

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
    const weekNum = Math.ceil((((today - new Date(today.getFullYear(),0,1)) / 86400000) + new Date(today.getFullYear(),0,1).getDay()+1)/7);
    const weekRef = `${today.getFullYear()}-W${String(weekNum).padStart(2,'0')}`;

    el.innerHTML = `
      <div style="max-width:700px">
        <div class="flex align-center flex-gap mb-16">
          <button class="btn btn-outline btn-sm" onclick="App.navigate('quotations')">← Voltar</button>
          <h2 class="text-gold">Nova Cotação</h2>
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
    (products||[]).forEach(p => {
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
            <div style="font-size:11px;color:var(--gray)">${escHtml(p.unit||'un')}</div>
          </div>
          <div style="font-size:12px;color:var(--gray)">Atual: <span class="text-gold">${fmtMoney(p.price)}</span></div>
          <div>
            <input type="number" step="0.01" min="0" class="form-control" style="width:120px"
              id="nqprice-${p.id}" value="${parseFloat(p.price||0).toFixed(2)}"
              placeholder="Novo preço">
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
    const items = (products||[]).map(p => ({
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
