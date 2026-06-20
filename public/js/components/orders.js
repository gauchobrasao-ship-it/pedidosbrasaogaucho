// ════════════════════════════════════════
//  ORDERS
// ════════════════════════════════════════
const Orders = {
  async load() {
    const el = document.getElementById('section-orders');
    el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const [orders, churrascarias, companies] = await Promise.all([
        API.get('/orders'),
        API.get('/reports/churrascarias'),
        API.get('/companies'),
      ]);

      el.innerHTML = `
        <div class="card">
          <div class="card-header">
            <span class="card-title">Pedidos</span>
            ${App.canDo('create_orders') ? `<button class="btn btn-primary" onclick="Orders.openNew()">+ Novo Pedido</button>` : ''}
          </div>
          <div class="search-bar mb-16">
            <select class="form-control" id="ord-filter-churr" style="max-width:200px" onchange="Orders.applyFilter()">
              <option value="">Todas as churrascarias</option>
              ${(churrascarias||[]).map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
            </select>
            <select class="form-control" id="ord-filter-comp" style="max-width:200px" onchange="Orders.applyFilter()">
              <option value="">Todos os fornecedores</option>
              ${(companies||[]).map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
            </select>
            <input type="date" class="form-control" id="ord-from" style="max-width:160px" onchange="Orders.applyFilter()">
            <input type="date" class="form-control" id="ord-to" style="max-width:160px" onchange="Orders.applyFilter()">
          </div>
          <div id="orders-table-wrap">
            ${this.renderTable(orders)}
          </div>
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

  renderTable(orders) {
    if (!orders || orders.length === 0)
      return '<div class="empty-state"><div class="empty-icon">🛒</div><p>Nenhum pedido encontrado</p></div>';
    return `<div class="table-wrap"><table>
      <thead><tr>
        <th>Nº</th><th>Churrascaria</th><th>Fornecedor</th><th>Responsável</th>
        <th>Total</th><th>Data</th><th>Ações</th>
      </tr></thead>
      <tbody>${orders.map(o => `
        <tr>
          <td><span class="badge badge-gold">#${String(o.id).padStart(6,'0')}</span></td>
          <td>${escHtml(o.churrascaria_name)}</td>
          <td>${escHtml(o.company_name)}</td>
          <td>${escHtml(o.user_name)}</td>
          <td class="text-gold">${fmtMoney(o.total)}</td>
          <td>${fmtDate(o.created_at)}</td>
          <td>
            <div class="flex flex-gap">
              <button class="btn btn-gold btn-sm" onclick="Orders.viewPDF(${o.id})">📄 PDF</button>
              <button class="btn btn-success btn-sm" onclick="Orders.shareWhatsApp(${o.id})">WhatsApp</button>
              ${App.canDo('view_orders') ? `<button class="btn btn-danger btn-sm" onclick="Orders.delete(${o.id})">Excluir</button>` : ''}
            </div>
          </td>
        </tr>`).join('')}
      </tbody></table></div>`;
  },

  async applyFilter() {
    const churr = document.getElementById('ord-filter-churr').value;
    const comp = document.getElementById('ord-filter-comp').value;
    const from = document.getElementById('ord-from').value;
    const to = document.getElementById('ord-to').value;
    const params = new URLSearchParams();
    if (churr) params.set('churrascaria_id', churr);
    if (comp) params.set('company_id', comp);
    if (from) params.set('from', from);
    if (to) params.set('to', to);
    const orders = await API.get('/orders?' + params.toString());
    document.getElementById('orders-table-wrap').innerHTML = this.renderTable(orders);
  },

  viewPDF(id) {
    window.open(`/api/orders/${id}/pdf?token=${API.token}`, '_blank');
  },

  shareWhatsApp(id) {
    const url = `${window.location.origin}/api/orders/${id}/pdf`;
    const msg = encodeURIComponent(`Pedido #${String(id).padStart(6,'0')} - Brasão Gaúcho\nVer PDF: ${url}`);
    window.open(`https://wa.me/?text=${msg}`, '_blank');
  },

  async delete(id) {
    if (!confirm2(`Excluir pedido #${String(id).padStart(6,'0')}? Esta ação não pode ser desfeita.`)) return;
    try {
      await API.delete(`/orders/${id}`);
      toast('Pedido excluído');
      this.load();
    } catch (err) { toast(err.message, 'error'); }
  },

  // ── NEW ORDER FLOW ─────────────────────────────
  state: {},

  async openNew() {
    this.state = {};
    App.navigate('new-order');
    const el = document.getElementById('section-new-order');
    el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const churrascarias = await API.get('/reports/churrascarias');
      const companies = await API.get('/companies');
      this.state.churrascarias = churrascarias;
      this.state.companies = companies;
      this.renderStep1();
    } catch (err) {
      el.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

  renderStep1() {
    const el = document.getElementById('section-new-order');
    const { churrascarias, companies } = this.state;
    el.innerHTML = `
      <div style="max-width:700px">
        <div class="flex align-center flex-gap mb-16">
          <button class="btn btn-outline btn-sm" onclick="App.navigate('orders')">← Voltar</button>
          <h2 class="text-gold">Novo Pedido</h2>
        </div>
        <div class="order-steps">
          <div class="order-step active">1 · Selecionar</div>
          <div class="order-step">2 · Produtos</div>
          <div class="order-step">3 · Confirmar</div>
        </div>
        <div class="card">
          <div class="form-group">
            <label class="form-label">Churrascaria</label>
            <select id="no-churr" class="form-control">
              <option value="">Selecione a churrascaria...</option>
              ${churrascarias.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
            </select>
          </div>
          <div class="form-group">
            <label class="form-label">Fornecedor</label>
            <select id="no-company" class="form-control">
              <option value="">Selecione o fornecedor...</option>
              ${companies.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-primary" onclick="Orders.goStep2()">Próximo →</button>
        </div>
      </div>`;
  },

  async goStep2() {
    const churrId = document.getElementById('no-churr').value;
    const compId = document.getElementById('no-company').value;
    if (!churrId || !compId) { toast('Selecione a churrascaria e o fornecedor', 'error'); return; }
    if (this.state.company_id && this.state.company_id !== compId) {
      delete this.state.items;
      delete this.state.observations;
    }
    this.state.churrascaria_id = churrId;
    this.state.company_id = compId;
    this.state.churrascaria_name = document.getElementById('no-churr').selectedOptions[0].text;
    this.state.company_name = document.getElementById('no-company').selectedOptions[0].text;

    const el = document.getElementById('section-new-order');
    el.innerHTML = '<div class="empty-state">Carregando produtos...</div>';
    try {
      const products = await API.get(`/companies/${compId}/products?churrascaria_id=${churrId}`);
      this.state.products = products;
      this.renderStep2();
    } catch (err) {
      toast(err.message, 'error');
      this.renderStep1();
    }
  },

  renderStep2() {
    const el = document.getElementById('section-new-order');
    const { products, company_name, churrascaria_name } = this.state;

    if (!products || products.length === 0) {
      el.innerHTML = `
        <div style="max-width:700px">
          <div class="flex align-center flex-gap mb-16">
            <button class="btn btn-outline btn-sm" onclick="Orders.renderStep1()">← Voltar</button>
            <h2 class="text-gold">Novo Pedido</h2>
          </div>
          <div class="card">
            <div class="empty-state">
              <div class="empty-icon">📦</div>
              <p>Este fornecedor não tem produtos cadastrados.</p>
              <button class="btn btn-outline mt-16" onclick="Orders.renderStep1()">Escolher outro</button>
            </div>
          </div>
        </div>`;
      return;
    }

    // Group by category
    const grouped = {};
    products.forEach(p => {
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
            ${p.bulk_min_qty && p.bulk_price
              ? `<div style="font-size:11px;color:var(--gold);margin-top:3px">
                   🏷 A partir de ${p.bulk_min_qty} ${escHtml(p.unit||'un')}: ${fmtMoney(p.bulk_price)}
                 </div>`
              : ''}
            <div id="bulk-badge-${p.id}" style="display:none;font-size:11px;color:var(--success);margin-top:2px">✓ Desconto por volume aplicado</div>
          </div>
          <div class="product-order-unit">${escHtml(p.unit || 'un')}</div>
          <div class="product-order-price">
            <input type="number" step="0.01" min="0" class="form-control" style="width:100px"
              id="price-${p.id}" value="${parseFloat(p.price||0).toFixed(2)}"
              placeholder="Preço" onchange="Orders.calcTotal()">
          </div>
          <div class="product-order-qty">
            <input type="number" step="0.001" min="0" class="form-control"
              id="qty-${p.id}" placeholder="Qtd" oninput="Orders._checkBulk(${p.id})">
          </div>
        </div>`).join('')}
    `).join('');

    el.innerHTML = `
      <div style="max-width:800px">
        <div class="flex align-center flex-gap mb-16">
          <button class="btn btn-outline btn-sm" onclick="Orders.renderStep1()">← Voltar</button>
          <h2 class="text-gold">Novo Pedido</h2>
        </div>
        <div class="order-steps">
          <div class="order-step done">1 · Selecionar</div>
          <div class="order-step active">2 · Produtos</div>
          <div class="order-step">3 · Confirmar</div>
        </div>
        <div class="card">
          <div class="flex justify-between align-center mb-16">
            <div>
              <div class="text-gold" style="font-weight:700">${escHtml(company_name)}</div>
              <div class="text-gray" style="font-size:13px">${escHtml(churrascaria_name)}</div>
            </div>
            <div style="text-align:right">
              <div class="text-gray" style="font-size:12px">TOTAL</div>
              <div class="text-gold" style="font-size:20px;font-weight:800" id="no-total">R$ 0,00</div>
            </div>
          </div>
          <div id="no-products">${rows}</div>
          <hr class="divider">
          <div class="form-group">
            <label class="form-label">Observações</label>
            <textarea id="no-obs" class="form-control" placeholder="Observações gerais do pedido..."></textarea>
          </div>
          <button class="btn btn-primary" onclick="Orders.goStep3()">Revisar Pedido →</button>
        </div>
      </div>`;

    if (this.state.items) {
      this.state.items.forEach(item => {
        const qEl = document.getElementById(`qty-${item.product_id}`);
        const pEl = document.getElementById(`price-${item.product_id}`);
        if (qEl) qEl.value = item.quantity;
        if (pEl && parseFloat(item.unit_price) > 0) pEl.value = parseFloat(item.unit_price).toFixed(2);
      });
      const obsEl = document.getElementById('no-obs');
      if (obsEl && this.state.observations) obsEl.value = this.state.observations;
      this.calcTotal();
    }
  },

  _checkBulk(id) {
    const p = this.state.products?.find(x => x.id === id);
    if (!p) { this.calcTotal(); return; }
    const qty     = parseFloat(document.getElementById(`qty-${id}`)?.value || 0);
    const priceEl = document.getElementById(`price-${id}`);
    const badge   = document.getElementById(`bulk-badge-${id}`);
    if (p.bulk_min_qty && p.bulk_price && qty >= parseFloat(p.bulk_min_qty)) {
      if (priceEl) priceEl.value = parseFloat(p.bulk_price).toFixed(2);
      if (badge)   badge.style.display = 'block';
    } else {
      if (priceEl) priceEl.value = parseFloat(p.price || 0).toFixed(2);
      if (badge)   badge.style.display = 'none';
    }
    this.calcTotal();
  },

  calcTotal() {
    const { products } = this.state;
    let total = 0;
    (products || []).forEach(p => {
      const qty = parseFloat(document.getElementById(`qty-${p.id}`)?.value || 0);
      const price = parseFloat(document.getElementById(`price-${p.id}`)?.value || 0);
      total += qty * price;
    });
    const el = document.getElementById('no-total');
    if (el) el.textContent = fmtMoney(total);
  },

  goStep3() {
    const { products } = this.state;
    const items = [];
    (products || []).forEach(p => {
      const qty = parseFloat(document.getElementById(`qty-${p.id}`)?.value || 0);
      const price = parseFloat(document.getElementById(`price-${p.id}`)?.value || 0);
      if (qty > 0) items.push({ product_id: p.id, product_name: p.name, unit: p.unit, category_name: p.category_name, quantity: qty, unit_price: price, subtotal: qty * price });
    });
    if (items.length === 0) { toast('Informe a quantidade de pelo menos um produto', 'error'); return; }
    this.state.items = items;
    this.state.observations = document.getElementById('no-obs').value;
    this.renderStep3();
  },

  renderStep3() {
    const el = document.getElementById('section-new-order');
    const { items, company_name, churrascaria_name, observations } = this.state;
    const total = items.reduce((s, i) => s + i.subtotal, 0);

    el.innerHTML = `
      <div style="max-width:800px">
        <div class="flex align-center flex-gap mb-16">
          <h2 class="text-gold">Confirmar Pedido</h2>
        </div>
        <div class="order-steps">
          <div class="order-step done">1 · Selecionar</div>
          <div class="order-step done">2 · Produtos</div>
          <div class="order-step active">3 · Confirmar</div>
        </div>
        <div class="card">
          <div class="flex justify-between align-center mb-16">
            <div>
              <div class="text-gold" style="font-weight:700">${escHtml(company_name)}</div>
              <div class="text-gray" style="font-size:13px">${escHtml(churrascaria_name)}</div>
            </div>
            <div style="text-align:right">
              <div class="text-gray" style="font-size:12px">TOTAL</div>
              <div class="text-gold" style="font-size:20px;font-weight:800" id="c3-total">${fmtMoney(total)}</div>
            </div>
          </div>
          <div class="table-wrap">
            <table>
              <thead><tr>
                <th>Produto</th><th>Categoria</th><th>UN</th>
                <th style="width:110px">Qtd</th>
                <th style="width:120px">Preço Unit.</th>
                <th style="width:110px">Subtotal</th>
              </tr></thead>
              <tbody>
                ${items.map(i => `<tr>
                  <td>${escHtml(i.product_name)}</td>
                  <td><span class="badge badge-orange">${escHtml(i.category_name||'-')}</span></td>
                  <td>${escHtml(i.unit||'un')}</td>
                  <td>
                    <input type="number" step="0.001" min="0" class="form-control"
                      id="c3-qty-${i.product_id}" value="${i.quantity}"
                      style="width:90px" oninput="Orders.calcStep3()">
                  </td>
                  <td>
                    <input type="number" step="0.01" min="0" class="form-control"
                      id="c3-price-${i.product_id}" value="${parseFloat(i.unit_price).toFixed(2)}"
                      style="width:100px" oninput="Orders.calcStep3()">
                  </td>
                  <td class="text-gold" id="c3-sub-${i.product_id}">${fmtMoney(i.subtotal)}</td>
                </tr>`).join('')}
              </tbody>
            </table>
          </div>
          <div class="form-group mt-16">
            <label class="form-label">Observações</label>
            <textarea id="c3-obs" class="form-control" placeholder="Observações gerais do pedido...">${escHtml(observations||'')}</textarea>
          </div>
          <hr class="divider">
          <div style="display:flex;align-items:flex-start;gap:10px;background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:11px 14px;margin-bottom:14px;font-size:13px;color:var(--gray)">
            <span style="flex-shrink:0">💡</span>
            <span>Os preços confirmados neste pedido serão salvos automaticamente como referência para os próximos pedidos deste fornecedor.</span>
          </div>
          <div class="flex flex-gap">
            <button class="btn btn-primary" onclick="Orders.submit()" id="btn-submit-order">✓ Confirmar Pedido</button>
          </div>
        </div>
      </div>`;
  },

  calcStep3() {
    let total = 0;
    (this.state.items || []).forEach(i => {
      const qty = parseFloat(document.getElementById(`c3-qty-${i.product_id}`)?.value || 0);
      const price = parseFloat(document.getElementById(`c3-price-${i.product_id}`)?.value || 0);
      const sub = qty * price;
      total += sub;
      const subEl = document.getElementById(`c3-sub-${i.product_id}`);
      if (subEl) subEl.textContent = fmtMoney(sub);
    });
    const totalEl = document.getElementById('c3-total');
    if (totalEl) totalEl.textContent = fmtMoney(total);
  },

  async submit() {
    const items = (this.state.items || []).map(i => {
      const qty = parseFloat(document.getElementById(`c3-qty-${i.product_id}`)?.value || 0);
      const price = parseFloat(document.getElementById(`c3-price-${i.product_id}`)?.value || 0);
      return { ...i, quantity: qty, unit_price: price, subtotal: qty * price };
    }).filter(i => i.quantity > 0);

    if (items.length === 0) { toast('Informe a quantidade de pelo menos um produto', 'error'); return; }

    const observations = document.getElementById('c3-obs')?.value || '';

    const btn = document.getElementById('btn-submit-order');
    btn.disabled = true;
    btn.textContent = 'Salvando...';
    try {
      const result = await API.post('/orders', {
        churrascaria_id: this.state.churrascaria_id,
        company_id: this.state.company_id,
        items,
        observations
      });
      toast('Pedido criado com sucesso!');
      setTimeout(() => window.open(`/api/orders/${result.id}/pdf?token=${API.token}`, '_blank'), 500);
      App.navigate('orders');
    } catch (err) {
      toast(err.message, 'error');
      btn.disabled = false;
      btn.textContent = '✓ Confirmar Pedido';
    }
  }
};
