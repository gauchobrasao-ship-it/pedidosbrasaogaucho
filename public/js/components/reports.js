// ════════════════════════════════════════
//  REPORTS
// ════════════════════════════════════════
const Reports = {
  _priceChart: null,
  _allProducts: [],
  _allCategories: [],
  _phSearchTimer: null,

  async load() {
    const el = document.getElementById('section-reports');
    el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const [churrascarias, companies, categories] = await Promise.all([
        API.get('/reports/churrascarias'),
        API.get('/companies'),
        API.get('/categories'),
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
        <div id="rep-results"></div>

        <div class="card" style="margin-top:16px">
          <div class="card-title mb-16">Histórico de Preços por Produto</div>
          <div class="form-group" style="max-width:420px;position:relative">
            <label class="form-label">Buscar produto</label>
            <input type="text" class="form-control" id="ph-search"
              placeholder="Digite o nome do produto..."
              oninput="Reports.onPhSearch(this.value)"
              autocomplete="off">
            <div id="ph-dropdown" style="display:none;position:absolute;top:100%;left:0;right:0;background:var(--card2);border:1px solid var(--border);border-radius:8px;z-index:50;max-height:220px;overflow-y:auto;box-shadow:0 8px 24px rgba(0,0,0,.4)"></div>
          </div>
          <div id="ph-chart-wrap" style="display:none">
            <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">
              <div id="ph-product-label" style="font-size:14px;font-weight:700;color:var(--white)"></div>
              <button class="btn btn-outline btn-sm" onclick="Reports.clearPriceHistory()">✕ Limpar</button>
            </div>
            <div style="position:relative;height:320px">
              <canvas id="ph-chart"></canvas>
            </div>
            <div id="ph-legend" style="display:flex;flex-wrap:wrap;gap:12px;margin-top:12px"></div>
          </div>
          <div id="ph-empty" style="display:none;padding:20px;text-align:center;color:var(--gray);font-size:13px">
            Nenhuma cotação encontrada para este produto.
          </div>
        </div>`;

      this._allCategories = categories;

      el.innerHTML += `
        <div class="card" style="margin-top:16px">
          <div class="card-header"><span class="card-title">Relatório de Preços por Categoria</span></div>
          <div class="form-row">
            <div class="form-group">
              <label class="form-label">Churrascaria <span style="color:var(--orange)">*</span></label>
              <select class="form-control" id="cat-rep-churr" style="max-width:280px">
                <option value="">Selecione...</option>
                ${churrascarias.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
              </select>
            </div>
          </div>
          <div class="form-group">
            <label class="form-label">Categorias <span style="color:var(--gray);font-size:11px">(deixe em branco para todas)</span></label>
            <div style="display:flex;flex-wrap:wrap;gap:8px;margin-top:4px">
              ${categories.map(c => `
                <label style="display:flex;align-items:center;gap:6px;cursor:pointer;background:var(--card2);border:1px solid var(--border);border-radius:8px;padding:6px 12px;font-size:13px">
                  <input type="checkbox" value="${c.id}" class="cat-rep-check" style="accent-color:var(--gold)">
                  ${escHtml(c.name)}
                </label>`).join('')}
            </div>
          </div>
          <div style="display:flex;gap:10px;margin-top:16px;flex-wrap:wrap">
            <button class="btn btn-primary btn-sm" onclick="Reports.runCatalog()">🔎 Visualizar</button>
            <button class="btn btn-gold btn-sm" onclick="Reports.pdfCatalog()">📄 Gerar PDF</button>
          </div>
          <div id="cat-rep-result" style="margin-top:16px"></div>
        </div>`;

      this.run();
      this._loadProducts();
    } catch (err) {
      el.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

  async _loadProducts() {
    try {
      this._allProducts = await API.get('/products');
    } catch (_) {}
  },

  _catalogParams() {
    const churrId = document.getElementById('cat-rep-churr')?.value;
    if (!churrId) { toast('Selecione a churrascaria', 'error'); return null; }
    const checked = [...document.querySelectorAll('.cat-rep-check:checked')].map(el => el.value);
    const params = new URLSearchParams({ churrascaria_id: churrId });
    if (checked.length) params.set('category_ids', checked.join(','));
    return params;
  },

  async runCatalog() {
    const params = this._catalogParams();
    if (!params) return;
    const el = document.getElementById('cat-rep-result');
    el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const rows = await API.get('/reports/products-by-category?' + params);
      if (!rows.length) { el.innerHTML = '<div class="empty-state" style="padding:16px">Nenhum produto encontrado com preço cadastrado para os filtros selecionados.</div>'; return; }

      // Group by category
      const catMap = new Map();
      rows.forEach(r => {
        if (!catMap.has(r.category_name)) catMap.set(r.category_name, new Map());
        const pm = catMap.get(r.category_name);
        if (!pm.has(r.product_id)) pm.set(r.product_id, { name: r.product_name, unit: r.unit, suppliers: [] });
        pm.get(r.product_id).suppliers.push(r);
      });

      let html = '<div class="table-wrap">';
      for (const [catName, prodMap] of catMap) {
        html += `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.8px;color:var(--gold);padding:10px 0 5px;border-bottom:1px solid var(--border);margin-bottom:4px;margin-top:12px">${escHtml(catName)}</div>`;
        html += `<table style="margin-bottom:0"><thead><tr>
          <th>Produto</th><th>Un</th><th>Fornecedor</th><th>Preço Unit.</th><th>Emb. a partir</th><th>Preço Emb.</th>
        </tr></thead><tbody>`;
        for (const [, prod] of prodMap) {
          prod.suppliers.forEach((s, si) => {
            html += `<tr>
              <td>${si === 0 ? `<strong>${escHtml(prod.name)}</strong>` : ''}</td>
              <td>${si === 0 ? escHtml(prod.unit || 'un') : ''}</td>
              <td>${escHtml(s.company_name)}</td>
              <td class="text-gold">${fmtMoney(s.price)}</td>
              <td style="color:var(--gray)">${s.bulk_min_qty ? `${s.bulk_min_qty} ${escHtml(prod.unit || 'un')}` : '—'}</td>
              <td>${s.bulk_price ? `<span class="text-gold">${fmtMoney(s.bulk_price)}</span>` : '—'}</td>
            </tr>`;
          });
        }
        html += '</tbody></table>';
      }
      html += '</div>';
      el.innerHTML = html;
    } catch (err) { toast(err.message, 'error'); el.innerHTML = ''; }
  },

  pdfCatalog() {
    const params = this._catalogParams();
    if (!params) return;
    params.set('token', API.token);
    window.open(`/api/reports/products-by-category/pdf?${params}`, '_blank');
  },

  onPhSearch(val) {
    clearTimeout(this._phSearchTimer);
    const dd = document.getElementById('ph-dropdown');
    if (!val.trim()) { dd.style.display = 'none'; return; }
    this._phSearchTimer = setTimeout(() => {
      const q = val.toLowerCase();
      const matches = this._allProducts.filter(p => p.name.toLowerCase().includes(q)).slice(0, 12);
      if (!matches.length) { dd.style.display = 'none'; return; }
      dd.innerHTML = matches.map(p =>
        `<div style="padding:10px 14px;cursor:pointer;font-size:13px;color:var(--white);border-bottom:1px solid var(--border)"
          onmousedown="Reports.selectProduct(${p.id}, '${escHtml(p.name).replace(/'/g,"\\'")}')">
          ${escHtml(p.name)}
          ${p.category_name ? `<span style="font-size:11px;color:var(--gray);margin-left:6px">${escHtml(p.category_name)}</span>` : ''}
        </div>`
      ).join('');
      dd.style.display = 'block';
    }, 200);
  },

  async selectProduct(id, name) {
    document.getElementById('ph-search').value = name;
    document.getElementById('ph-dropdown').style.display = 'none';
    document.getElementById('ph-product-label').textContent = name;
    document.getElementById('ph-chart-wrap').style.display = 'none';
    document.getElementById('ph-empty').style.display = 'none';

    try {
      const rows = await API.get(`/reports/price-history?product_id=${id}`);
      if (!rows.length) { document.getElementById('ph-empty').style.display = 'block'; return; }
      this._renderPriceChart(rows);
    } catch (err) {
      document.getElementById('ph-empty').style.display = 'block';
    }
  },

  _renderPriceChart(rows) {
    const COLORS = [
      '#F5A623','#43A047','#2196F3','#E53935','#9C27B0',
      '#00BCD4','#FF5722','#8BC34A','#3F51B5','#F06292',
    ];
    // Agrupar por empresa
    const companies = [...new Set(rows.map(r => r.company_name))];
    const allDates  = [...new Set(rows.map(r => r.date))].sort();

    const datasets = companies.map((name, i) => {
      const compRows = rows.filter(r => r.company_name === name);
      const dateMap  = Object.fromEntries(compRows.map(r => [r.date, parseFloat(r.unit_price)]));
      return {
        label: name,
        data: allDates.map(d => dateMap[d] ?? null),
        borderColor: COLORS[i % COLORS.length],
        backgroundColor: COLORS[i % COLORS.length] + '22',
        borderWidth: 2,
        pointRadius: 5,
        pointHoverRadius: 7,
        tension: 0.3,
        spanGaps: false,
      };
    });

    if (this._priceChart) { this._priceChart.destroy(); this._priceChart = null; }

    const ctx = document.getElementById('ph-chart').getContext('2d');
    this._priceChart = new Chart(ctx, {
      type: 'line',
      data: { labels: allDates.map(d => new Date(d + 'T12:00:00').toLocaleDateString('pt-BR')), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: ctx => ` ${ctx.dataset.label}: R$ ${ctx.parsed.y?.toFixed(2).replace('.',',') ?? '-'}`,
            }
          }
        },
        scales: {
          x: { ticks: { color: '#9E9E9E', font: { size: 11 } }, grid: { color: '#ffffff10' } },
          y: {
            ticks: {
              color: '#9E9E9E', font: { size: 11 },
              callback: v => 'R$ ' + v.toFixed(2).replace('.', ','),
            },
            grid: { color: '#ffffff10' },
          }
        }
      }
    });

    // Legenda manual
    document.getElementById('ph-legend').innerHTML = companies.map((name, i) =>
      `<div style="display:flex;align-items:center;gap:6px;font-size:12px;color:var(--white)">
        <div style="width:14px;height:14px;border-radius:3px;background:${COLORS[i % COLORS.length]}"></div>
        ${escHtml(name)}
      </div>`
    ).join('');

    document.getElementById('ph-chart-wrap').style.display = 'block';
  },

  clearPriceHistory() {
    document.getElementById('ph-search').value = '';
    document.getElementById('ph-chart-wrap').style.display = 'none';
    document.getElementById('ph-empty').style.display = 'none';
    if (this._priceChart) { this._priceChart.destroy(); this._priceChart = null; }
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
