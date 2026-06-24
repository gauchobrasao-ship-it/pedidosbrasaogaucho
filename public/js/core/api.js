// ════════════════════════════════════════
//  API MODULE
// ════════════════════════════════════════
const API = {
  base: '/api',
  token: localStorage.getItem('token'),

  setToken(t) {
    this.token = t;
    if (t) localStorage.setItem('token', t);
    else localStorage.removeItem('token');
  },

  async req(method, path, data) {
    const opts = {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(this.token ? { Authorization: `Bearer ${this.token}` } : {})
      }
    };
    if (data !== undefined) opts.body = JSON.stringify(data);
    const res = await fetch(this.base + path, opts);
    if (res.status === 401) { App.logout(true); return null; }
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error || 'Erro na requisição');
    return json;
  },

  get:    (p)    => API.req('GET', p),
  post:   (p, d) => API.req('POST', p, d),
  put:    (p, d) => API.req('PUT', p, d),
  patch:  (p, d) => API.req('PATCH', p, d),
  delete: (p)    => API.req('DELETE', p),
};

// ════════════════════════════════════════
//  UTILS
// ════════════════════════════════════════
function fmtMoney(v) {
  return 'R$ ' + parseFloat(v || 0).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function fmtDate(d) {
  return new Date(d).toLocaleDateString('pt-BR');
}
function fmtDateTime(d) {
  return new Date(d).toLocaleString('pt-BR');
}
function escHtml(s) {
  return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
function toast(msg, type = 'success') {
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.textContent = msg;
  document.getElementById('toast-container').appendChild(el);
  setTimeout(() => el.remove(), 3500);
}
function confirm2(msg, confirmLabel = 'Confirmar', danger = true) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:20px';
    overlay.innerHTML = `
      <div style="background:var(--card2);border:1px solid var(--border);border-radius:14px;padding:28px 24px;max-width:340px;width:100%;text-align:center">
        <div style="font-size:36px;margin-bottom:12px">${danger ? '⚠️' : '❓'}</div>
        <div style="font-size:15px;font-weight:700;color:var(--white);margin-bottom:8px">Confirmação</div>
        <div style="font-size:13px;color:var(--gray);line-height:1.6;margin-bottom:22px">${escHtml(msg)}</div>
        <div style="display:flex;gap:10px">
          <button id="_conf_cancel" style="flex:1;background:transparent;border:1px solid var(--border);color:var(--gray);font-weight:600;font-size:14px;padding:12px;border-radius:8px;cursor:pointer">Cancelar</button>
          <button id="_conf_ok" style="flex:1;background:${danger ? 'var(--danger)' : 'var(--gold)'};color:${danger ? '#fff' : '#000'};font-weight:700;font-size:14px;padding:12px;border-radius:8px;cursor:pointer;border:none">${escHtml(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    const close = (result) => { overlay.remove(); resolve(result); };
    overlay.querySelector('#_conf_ok').onclick = () => close(true);
    overlay.querySelector('#_conf_cancel').onclick = () => close(false);
    overlay.onclick = (e) => { if (e.target === overlay) close(false); };
  });
}

function showModal(title, bodyHtml, footerHtml = '') {
  closeModal();
  const c = document.getElementById('modal-container');
  c.innerHTML = `
    <div class="modal-overlay" id="modal-overlay">
      <div class="modal">
        <div class="modal-header">
          <span class="modal-title">${title}</span>
          <button class="btn btn-outline btn-sm btn-icon" onclick="closeModal()">✕</button>
        </div>
        <div class="modal-body">${bodyHtml}</div>
        ${footerHtml ? `<div class="modal-footer">${footerHtml}</div>` : ''}
      </div>
    </div>`;
  document.getElementById('modal-overlay').addEventListener('click', e => {
    if (e.target.id === 'modal-overlay') closeModal();
  });
}
function closeModal() {
  document.getElementById('modal-container').innerHTML = '';
}
