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
function confirm2(msg) { return window.confirm(msg); }

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
