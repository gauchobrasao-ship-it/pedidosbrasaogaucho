// ════════════════════════════════════════
//  CONTROLE DE PERDAS
// ════════════════════════════════════════
const Perdas = {
  _churrascarias: [],

  async load() {
    const el = document.getElementById('section-perdas');
    el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const [perdas, churrs] = await Promise.all([
        API.get('/perdas'),
        API.get('/reports/churrascarias'),
      ]);
      this._churrascarias = churrs || [];
      this._render(el, perdas);
    } catch (err) {
      el.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

  _render(el, perdas) {
    const churrs = this._churrascarias;
    el.innerHTML = `
      <div class="card">
        <div class="card-header">
          <span class="card-title">Controle de Perdas</span>
          <button class="btn btn-primary" onclick="Perdas.openForm()">+ Registrar Perda</button>
        </div>
        <div class="search-bar mb-8">
          <select class="form-control" id="pe-filter-churr" style="max-width:200px" onchange="Perdas._applyFilter()">
            <option value="">Todas as unidades</option>
            ${churrs.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
          </select>
          <input type="date" class="form-control" id="pe-from" style="max-width:160px" onchange="Perdas._applyFilter()">
          <input type="date" class="form-control" id="pe-to"   style="max-width:160px" onchange="Perdas._applyFilter()">
          <button class="btn btn-outline btn-sm" onclick="Perdas._clearFilter()">Limpar</button>
        </div>
        <div style="display:flex;gap:6px;flex-wrap:wrap;margin-bottom:16px">
          ${['mes-atual','mes-passado','3-meses','6-meses'].map(k => `
            <button class="btn btn-outline btn-sm pe-period" data-period="${k}"
              onclick="Perdas._setPeriod('${k}')">${
                k === 'mes-atual'   ? 'Mês atual' :
                k === 'mes-passado' ? 'Mês passado' :
                k === '3-meses'     ? 'Últimos 3 meses' : 'Últimos 6 meses'
              }</button>`).join('')}
        </div>
        <div id="pe-table-wrap">${this._renderTable(perdas)}</div>
      </div>`;
  },

  _renderTable(perdas) {
    const n = (perdas||[]).length;
    const counter = `<div style="font-size:12px;color:var(--gray);padding:0 4px 10px"><strong style="color:var(--white)">${n}</strong> ${n === 1 ? 'registro encontrado' : 'registros encontrados'}</div>`;
    if (!perdas.length) {
      return counter + '<div class="empty-state"><div class="empty-icon">📉</div><p>Nenhuma perda registrada</p></div>';
    }
    return counter + `<div class="table-wrap"><table>
      <thead><tr>
        <th>Data</th><th>Funcionário</th><th>Produto</th><th>Qtd</th><th>Motivo</th><th>Unidade</th><th>Registrado por</th><th></th>
      </tr></thead>
      <tbody>${perdas.map(p => `<tr>
        <td style="white-space:nowrap">${fmtDate(p.data)}</td>
        <td>${escHtml(p.funcionario)}</td>
        <td><strong>${escHtml(p.produto)}</strong></td>
        <td style="white-space:nowrap">${parseFloat(p.quantidade).toLocaleString('pt-BR')}</td>
        <td style="color:var(--gray);font-size:13px">${escHtml(p.motivo || '—')}</td>
        <td style="font-size:12px;color:var(--gray)">${escHtml(p.churrascaria_name || '—')}</td>
        <td style="font-size:12px;color:var(--gray)">${escHtml(p.created_by_name || '—')}</td>
        <td>
          <button class="btn btn-outline btn-sm" style="color:var(--danger);border-color:var(--danger)"
            onclick="Perdas.delete(${p.id})">🗑</button>
        </td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  },

  async _applyFilter() {
    const churrId = document.getElementById('pe-filter-churr')?.value || '';
    const from    = document.getElementById('pe-from')?.value || '';
    const to      = document.getElementById('pe-to')?.value   || '';
    const params  = new URLSearchParams();
    if (churrId) params.set('churrascaria_id', churrId);
    if (from)    params.set('from', from);
    if (to)      params.set('to', to);
    try {
      const perdas = await API.get('/perdas?' + params);
      document.getElementById('pe-table-wrap').innerHTML = this._renderTable(perdas);
    } catch (err) { toast(err.message, 'error'); }
  },

  _setPeriod(period) {
    const now   = new Date();
    const pad   = n => String(n).padStart(2, '0');
    const ymd   = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
    let from, to;

    if (period === 'mes-atual') {
      from = ymd(new Date(now.getFullYear(), now.getMonth(), 1));
      to   = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    } else if (period === 'mes-passado') {
      from = ymd(new Date(now.getFullYear(), now.getMonth() - 1, 1));
      to   = ymd(new Date(now.getFullYear(), now.getMonth(), 0));
    } else if (period === '3-meses') {
      from = ymd(new Date(now.getFullYear(), now.getMonth() - 2, 1));
      to   = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    } else if (period === '6-meses') {
      from = ymd(new Date(now.getFullYear(), now.getMonth() - 5, 1));
      to   = ymd(new Date(now.getFullYear(), now.getMonth() + 1, 0));
    }

    document.getElementById('pe-from').value = from;
    document.getElementById('pe-to').value   = to;

    document.querySelectorAll('.pe-period').forEach(b =>
      b.classList.toggle('btn-primary', b.dataset.period === period)
    );

    this._applyFilter();
  },

  _clearFilter() {
    ['pe-filter-churr', 'pe-from', 'pe-to'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    document.querySelectorAll('.pe-period').forEach(b => b.classList.remove('btn-primary'));
    this._applyFilter();
  },

  openForm() {
    const churrs = this._churrascarias;
    const today  = new Date().toISOString().split('T')[0];

    showModal('Registrar Perda', `
      <div class="form-group">
        <label class="form-label">Data *</label>
        <input type="date" id="pe-data" class="form-control" value="${today}">
      </div>
      <div class="form-group">
        <label class="form-label">Funcionário *</label>
        <input type="text" id="pe-func" class="form-control" placeholder="Nome do funcionário...">
      </div>
      <div class="form-group">
        <label class="form-label">Churrascaria</label>
        <select id="pe-churr" class="form-control">
          <option value="">Selecione...</option>
          ${churrs.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Produto *</label>
        <input type="text" id="pe-prod" class="form-control" placeholder="Ex: Macarrão cozido, Frango grelhado...">
      </div>
      <div class="form-group">
        <label class="form-label">Quantidade *</label>
        <input type="number" id="pe-qty" class="form-control" step="0.001" min="0" placeholder="0">
      </div>
      <div class="form-group">
        <label class="form-label">Motivo</label>
        <input type="text" id="pe-motivo" class="form-control" placeholder="Ex: vencimento, queda, deterioração...">
      </div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="Perdas.save()">Registrar</button>`
    );
    document.getElementById('pe-func').focus();
  },

  async save() {
    const data       = document.getElementById('pe-data').value;
    const funcionario = document.getElementById('pe-func').value.trim();
    const churrId    = document.getElementById('pe-churr').value;
    const produto    = document.getElementById('pe-prod').value.trim();
    const quantidade = parseFloat(document.getElementById('pe-qty').value);
    const motivo     = document.getElementById('pe-motivo').value.trim();

    if (!data)                          { toast('Informe a data', 'error'); return; }
    if (!funcionario)                   { toast('Informe o funcionário', 'error'); return; }
    if (!produto)                       { toast('Informe o produto', 'error'); return; }
    if (!quantidade || quantidade <= 0) { toast('Informe uma quantidade válida', 'error'); return; }

    try {
      await API.post('/perdas', {
        data, funcionario,
        churrascaria_id: churrId || null,
        produto,
        quantidade,
        motivo: motivo || null,
      });
      toast('Perda registrada!');
      closeModal();
      this.load();
    } catch (err) { toast(err.message, 'error'); }
  },

  async delete(id) {
    if (!confirm('Excluir este registro de perda?')) return;
    try {
      await API.delete(`/perdas/${id}`);
      toast('Registro excluído');
      this.load();
    } catch (err) { toast(err.message, 'error'); }
  }
};
