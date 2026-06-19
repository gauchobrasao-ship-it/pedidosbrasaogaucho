// ════════════════════════════════════════
//  CONTROLE DE PERDAS
// ════════════════════════════════════════
const Perdas = {
  _products: [],
  _churrascarias: [],

  async load() {
    const el = document.getElementById('section-perdas');
    el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const [perdas, products, churrs] = await Promise.all([
        API.get('/perdas'),
        API.get('/products'),
        API.get('/reports/churrascarias'),
      ]);
      this._products      = products      || [];
      this._churrascarias = churrs        || [];
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

        <div class="search-bar mb-16">
          <select class="form-control" id="pe-filter-churr" style="max-width:200px" onchange="Perdas._applyFilter()">
            <option value="">Todas as unidades</option>
            ${churrs.map(c => `<option value="${c.id}">${escHtml(c.name)}</option>`).join('')}
          </select>
          <input type="date" class="form-control" id="pe-from" style="max-width:160px" onchange="Perdas._applyFilter()">
          <input type="date" class="form-control" id="pe-to"   style="max-width:160px" onchange="Perdas._applyFilter()">
          <button class="btn btn-outline btn-sm" onclick="Perdas._clearFilter()">Limpar</button>
        </div>

        <div id="pe-table-wrap">
          ${this._renderTable(perdas)}
        </div>
      </div>`;
  },

  _renderTable(perdas) {
    if (!perdas.length) {
      return '<div class="empty-state"><div class="empty-icon">📉</div><p>Nenhuma perda registrada</p></div>';
    }
    return `<div class="table-wrap"><table>
      <thead><tr>
        <th>Data</th><th>Funcionário</th><th>Produto</th><th>Qtd</th><th>Motivo</th><th>Unidade</th><th>Registrado por</th><th></th>
      </tr></thead>
      <tbody>${perdas.map(p => `<tr>
        <td style="white-space:nowrap">${fmtDate(p.data)}</td>
        <td>${escHtml(p.funcionario)}</td>
        <td><strong>${escHtml(p.produto_name)}</strong></td>
        <td style="white-space:nowrap">${parseFloat(p.quantidade).toLocaleString('pt-BR')} ${escHtml(p.produto_unit || 'un')}</td>
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
    const churrId   = document.getElementById('pe-filter-churr')?.value || '';
    const from      = document.getElementById('pe-from')?.value || '';
    const to        = document.getElementById('pe-to')?.value || '';
    const params    = new URLSearchParams();
    if (churrId) params.set('churrascaria_id', churrId);
    if (from)    params.set('from', from);
    if (to)      params.set('to', to);
    try {
      const perdas = await API.get('/perdas?' + params);
      document.getElementById('pe-table-wrap').innerHTML = this._renderTable(perdas);
    } catch (err) { toast(err.message, 'error'); }
  },

  _clearFilter() {
    ['pe-filter-churr','pe-from','pe-to'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = '';
    });
    this._applyFilter();
  },

  openForm() {
    const churrs   = this._churrascarias;
    const products = this._products;
    const today    = new Date().toISOString().split('T')[0];

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
        <select id="pe-prod" class="form-control">
          <option value="">Selecione o produto...</option>
          ${products.map(p => `<option value="${p.id}" data-unit="${escHtml(p.unit||'un')}">${escHtml(p.name)}</option>`).join('')}
        </select>
      </div>
      <div class="form-group">
        <label class="form-label">Quantidade * <span id="pe-unit-label" style="color:var(--gray);font-weight:400"></span></label>
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
    document.getElementById('pe-prod').addEventListener('change', function() {
      const opt = this.selectedOptions[0];
      const unit = opt?.dataset?.unit || '';
      document.getElementById('pe-unit-label').textContent = unit ? `(${unit})` : '';
    });
  },

  async save() {
    const data        = document.getElementById('pe-data').value;
    const funcionario = document.getElementById('pe-func').value.trim();
    const churrId     = document.getElementById('pe-churr').value;
    const prodId      = document.getElementById('pe-prod').value;
    const quantidade  = parseFloat(document.getElementById('pe-qty').value);
    const motivo      = document.getElementById('pe-motivo').value.trim();

    if (!data)          { toast('Informe a data', 'error'); return; }
    if (!funcionario)   { toast('Informe o funcionário', 'error'); return; }
    if (!prodId)        { toast('Selecione o produto', 'error'); return; }
    if (!quantidade || quantidade <= 0) { toast('Informe uma quantidade válida', 'error'); return; }

    try {
      await API.post('/perdas', {
        data, funcionario,
        churrascaria_id: churrId || null,
        produto_id: parseInt(prodId),
        quantidade, motivo: motivo || null
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
