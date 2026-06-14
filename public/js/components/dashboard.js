// ════════════════════════════════════════
//  DASHBOARD
// ════════════════════════════════════════
let _ordersChart = null;

const Dashboard = {
  async load() {
    const el = document.getElementById('section-dashboard');
    el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const s = await API.get('/reports/dashboard');
      const { todayStats, yesterdayStats, monthStats, last7, byChurr, recentOrders, companyCount, productCount } = s;

      function trend(now, prev, isVal) {
        const diff = now - prev;
        if (prev === 0 && diff === 0) return `<span class="kpi-trend kpi-neutral">— sem dados ontem</span>`;
        if (diff === 0) return `<span class="kpi-trend kpi-neutral">→ igual a ontem</span>`;
        const sign = diff > 0 ? '↑' : '↓';
        const cls  = diff > 0 ? 'kpi-up' : 'kpi-down';
        const val  = isVal ? fmtMoney(Math.abs(diff)) : Math.abs(diff);
        return `<span class="kpi-trend ${cls}">${sign} ${val} vs ontem</span>`;
      }

      const monthName = new Date().toLocaleDateString('pt-BR', { month: 'long', year: 'numeric' });

      el.innerHTML = `
        ${App.canDo('create_orders') || App.canDo('manage_quotations') ? `
        <div class="quick-actions">
          ${App.canDo('create_orders') ? `<button class="btn btn-primary" onclick="Orders.openNew()">🛒 Novo Pedido</button>` : ''}
          ${App.canDo('manage_quotations') ? `<button class="btn btn-outline" onclick="Quotations.openNew()">📋 Nova Cotação</button>` : ''}
        </div>` : ''}

        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-icon">🛒</div>
            <div class="kpi-value">${todayStats.orders}</div>
            <div class="kpi-label">Pedidos Hoje</div>
            ${trend(todayStats.orders, yesterdayStats.orders, false)}
          </div>
          <div class="kpi-card">
            <div class="kpi-icon">💰</div>
            <div class="kpi-value" style="font-size:20px">${fmtMoney(todayStats.value)}</div>
            <div class="kpi-label">Valor Hoje</div>
            ${trend(todayStats.value, yesterdayStats.value, true)}
          </div>
          <div class="kpi-card">
            <div class="kpi-icon">📅</div>
            <div class="kpi-value">${monthStats.orders}</div>
            <div class="kpi-label">Pedidos no Mês</div>
            <span class="kpi-trend kpi-neutral">${monthName}</span>
          </div>
          <div class="kpi-card">
            <div class="kpi-icon">📈</div>
            <div class="kpi-value" style="font-size:20px">${fmtMoney(monthStats.value)}</div>
            <div class="kpi-label">Total do Mês</div>
            <span class="kpi-trend kpi-neutral">${companyCount} fornecedores · ${productCount} produtos</span>
          </div>
        </div>

        ${byChurr.length > 1 ? `
        <div class="churr-split">
          ${byChurr.map(ch => `
            <div class="churr-card">
              <div class="churr-name">${escHtml(ch.name)}</div>
              <div class="churr-value">${fmtMoney(ch.value)}</div>
              <div class="churr-meta">${ch.orders} pedido(s) no total</div>
            </div>`).join('')}
        </div>` : ''}

        <div class="card mb-16">
          <div class="card-title mb-16">Pedidos — Últimos 7 dias</div>
          <canvas id="orders-chart" style="max-height:160px"></canvas>
        </div>

        <div class="card">
          <div class="card-header">
            <span class="card-title">Últimos Pedidos</span>
            ${App.canDo('create_orders') ? `<button class="btn btn-primary btn-sm" onclick="Orders.openNew()">+ Novo Pedido</button>` : ''}
          </div>
          ${recentOrders.length === 0
            ? '<div class="empty-state"><div class="empty-icon">📋</div><p>Nenhum pedido ainda</p></div>'
            : `<div class="order-feed">
              ${recentOrders.map(o => `
                <div class="order-feed-item">
                  <div class="order-feed-num">
                    <span class="badge badge-gold">#${String(o.id).padStart(6,'0')}</span>
                  </div>
                  <div class="order-feed-info">
                    <div class="order-feed-company">${escHtml(o.company_name)}</div>
                    <div class="order-feed-meta">${escHtml(o.churrascaria_name)} · ${escHtml(o.user_name)}</div>
                  </div>
                  <div class="order-feed-right">
                    <div class="order-feed-value">${fmtMoney(o.total)}</div>
                    <div class="order-feed-date">${fmtDateTime(o.created_at)}</div>
                  </div>
                  <button class="btn btn-outline btn-sm" onclick="Orders.viewPDF(${o.id})">PDF</button>
                </div>`).join('')}
            </div>`}
        </div>`;

      this._buildChart(last7);
    } catch (err) {
      el.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

  _buildChart(last7) {
    const ctx = document.getElementById('orders-chart');
    if (!ctx) return;
    if (_ordersChart) { _ordersChart.destroy(); _ordersChart = null; }

    const labels = [], ordersData = [], valueData = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(Date.now() - i * 86400000);
      const dateStr = d.toISOString().split('T')[0];
      const found = last7.find(r => r.date === dateStr);
      labels.push(d.toLocaleDateString('pt-BR', { weekday: 'short', day: 'numeric' }));
      ordersData.push(found ? found.orders : 0);
      valueData.push(found ? found.value : 0);
    }

    _ordersChart = new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          {
            label: 'Pedidos',
            data: ordersData,
            backgroundColor: 'rgba(224,120,32,0.75)',
            borderColor: '#E07820',
            borderWidth: 1,
            borderRadius: 5,
            yAxisID: 'y',
          },
          {
            label: 'Valor (R$)',
            data: valueData,
            type: 'line',
            borderColor: '#D4AF37',
            backgroundColor: 'rgba(212,175,55,0.1)',
            borderWidth: 2,
            pointBackgroundColor: '#D4AF37',
            pointRadius: 4,
            tension: 0.35,
            fill: true,
            yAxisID: 'y2',
          }
        ]
      },
      options: {
        responsive: true,
        interaction: { mode: 'index', intersect: false },
        plugins: {
          legend: { display: true, labels: { color: '#888', font: { size: 11 }, boxWidth: 12 } },
          tooltip: {
            callbacks: {
              label: ctx => ctx.datasetIndex === 1
                ? ` ${fmtMoney(ctx.parsed.y)}`
                : ` ${ctx.parsed.y} pedido(s)`
            }
          }
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#888', font: { size: 11 } } },
          y: {
            grid: { color: 'rgba(255,255,255,0.04)' },
            ticks: { color: '#888', precision: 0, font: { size: 11 } },
            beginAtZero: true,
            title: { display: true, text: 'Pedidos', color: '#888', font: { size: 10 } }
          },
          y2: {
            position: 'right',
            grid: { drawOnChartArea: false },
            ticks: { color: '#D4AF37', font: { size: 10 }, callback: v => 'R$' + v.toLocaleString('pt-BR') },
            beginAtZero: true,
            title: { display: true, text: 'Valor', color: '#D4AF37', font: { size: 10 } }
          }
        }
      }
    });
  }
};
