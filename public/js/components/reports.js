// ════════════════════════════════════════
//  REPORTS
// ════════════════════════════════════════
const Reports = {
  async load() {
    const el = document.getElementById('section-reports');
    el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const [churrascarias, companies] = await Promise.all([
        API.get('/reports/churrascarias'),
        API.get('/companies'),
      ]);

      el.innerHTML = `
        <div class="card mb-16">
          <div class="card-title mb-16">Filtros</div>
          <div class="form-row">
            <div class="form-group"><label class="form-label">Churrascaria</label>
              <select class="form-control" id="rep-churr" onchange="Reports.run()">
                <option value="">Todas</option>
                ${churrascarias.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
              </select></div>
            <div class="form-group"><label class="form-label">Fornecedor</label>
              <select class="form-control" id="rep-comp" onchange="Reports.run()">
                <option value="">Todos</option>
                ${companies.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
              </select></div>
            <div class="form-group"><label class="form-label">De</label>
              <input type="date" class="form-control" id="rep-from" onchange="Reports.run()"></div>
            <div class="form-group"><label class="form-label">Até</label>
              <input type="date" class="form-control" id="rep-to" onchange="Reports.run()"></div>
          </div>
          <div class="flex flex-gap">
            <button class="btn btn-primary btn-sm" onclick="Reports.run()">🔎 Gerar</button>
            <button class="btn btn-outline btn-sm" onclick="Reports.clear()">Limpar</button>
          </div>
        </div>
        <div id="rep-results"></div>`;

      this.run();
    } catch (err) {
      el.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

  clear() {
    document.getElementById('rep-churr').value = '';
    document.getElementById('rep-comp').value = '';
    document.getElementById('rep-from').value = '';
    document.getElementById('rep-to').value = '';
    this.run();
  },

  async run() {
    const churr = document.getElementById('rep-churr').value;
    const comp = document.getElementById('rep-comp').value;
    const from = document.getElementById('rep-from').value;
    const to = document.getElementById('rep-to').value;
    const params = new URLSearchParams();
    if (churr) params.set('churrascaria_id', churr);
    if (comp) params.set('company_id', comp);
    if (from) params.set('from', from);
    if (to) params.set('to', to);

    const el = document.getElementById('rep-results');
    el.innerHTML = '<div class="empty-state">Processando...</div>';

    try {
      const [byCompany, byProduct, summary] = await Promise.all([
        API.get('/reports/by-company?' + params),
        API.get('/reports/by-product?' + params),
        API.get('/reports/summary?' + params),
      ]);

      const totOrders = summary.totals?.orders || 0;
      const totValue = summary.totals?.value || 0;

      el.innerHTML = `
        <div class="stat-grid mb-16">
          <div class="stat-card">
            <div class="stat-value">${totOrders}</div>
            <div class="stat-label">Pedidos no período</div>
          </div>
          <div class="stat-card" style="grid-column:span 2">
            <div class="stat-value" style="font-size:22px">${fmtMoney(totValue)}</div>
            <div class="stat-label">Total comprado</div>
          </div>
        </div>

        <div class="card mb-16">
          <div class="card-title mb-16">Por Fornecedor</div>
          ${!byCompany || byCompany.length === 0
            ? '<div class="empty-state" style="padding:20px">Sem dados</div>'
            : `<div class="table-wrap"><table>
              <thead><tr><th>Fornecedor</th><th>Churrascaria</th><th>Pedidos</th><th>Itens</th><th>Total</th></tr></thead>
              <tbody>${byCompany.map(r => `<tr>
                <td><strong>${escHtml(r.company_name)}</strong></td>
                <td>${escHtml(r.churrascaria_name)}</td>
                <td>${r.total_orders}</td>
                <td>${r.total_items||'-'}</td>
                <td class="text-gold">${fmtMoney(r.total_value)}</td>
              </tr>`).join('')}</tbody>
            </table></div>`}
        </div>

        <div class="card">
          <div class="card-title mb-16">Por Produto</div>
          ${!byProduct || byProduct.length === 0
            ? '<div class="empty-state" style="padding:20px">Sem dados</div>'
            : `<div class="table-wrap"><table>
              <thead><tr><th>Produto</th><th>Categoria</th><th>Fornecedor</th><th>Churrascaria</th><th>Qtd Total</th><th>Preço Médio</th><th>Total</th></tr></thead>
              <tbody>${byProduct.map(r => `<tr>
                <td><strong>${escHtml(r.product_name)}</strong></td>
                <td><span class="badge badge-orange">${escHtml(r.category_name||'-')}</span></td>
                <td>${escHtml(r.company_name)}</td>
                <td>${escHtml(r.churrascaria_name)}</td>
                <td>${parseFloat(r.total_quantity||0).toFixed(3).replace('.',',')} ${escHtml(r.unit||'un')}</td>
                <td>${fmtMoney(r.avg_price)}</td>
                <td class="text-gold">${fmtMoney(r.total_value)}</td>
              </tr>`).join('')}</tbody>
            </table></div>`}
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  }
};
