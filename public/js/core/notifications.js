// ════════════════════════════════════════
//  NOTIFICATIONS
// ════════════════════════════════════════
const Notifications = {
  _items: [],
  _open: false,
  _seenExpiry: new Set(JSON.parse(sessionStorage.getItem('_seenExpiry') || '[]')),

  async init() {
    await this.fetch();
    setInterval(() => this.fetch(), 120000);

    document.addEventListener('click', e => {
      if (this._open && !e.target.closest('#notif-btn') && !e.target.closest('#notif-panel')) {
        this._close();
      }
    });
  },

  async fetch() {
    try {
      this._items = await API.get('/notifications');
      this._updateBadge();
    } catch (_) {}
  },

  _unreadCount() {
    return this._items.filter(n => {
      if (n.type === 'expiring') return !this._seenExpiry.has(n.id);
      return !n.read;
    }).length;
  },

  _updateBadge() {
    const count = this._unreadCount();
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    badge.textContent = count > 9 ? '9+' : count;
    badge.style.display = count > 0 ? 'flex' : 'none';
  },

  toggle() {
    this._open ? this._close() : this._openPanel();
  },

  _openPanel() {
    this._open = true;
    this._seenExpiry = new Set(
      this._items.filter(n => n.type === 'expiring').map(n => n.id)
    );
    sessionStorage.setItem('_seenExpiry', JSON.stringify([...this._seenExpiry]));
    this._render();
    document.getElementById('notif-panel').style.display = 'block';
    this._updateBadge();
  },

  _close() {
    this._open = false;
    const panel = document.getElementById('notif-panel');
    if (panel) panel.style.display = 'none';
  },

  _render() {
    const panel = document.getElementById('notif-panel');
    const items = this._items;
    const hasUnread = items.some(n => n.type !== 'expiring' && !n.read);

    panel.innerHTML = `
      <div class="notif-header">
        <span class="notif-header-title">Notificações</span>
        ${hasUnread ? `<button class="notif-read-all" onclick="Notifications.readAll()">Marcar todas como lidas</button>` : ''}
      </div>
      <div class="notif-list">
        ${!items.length
          ? '<div class="notif-empty">Nenhuma notificação</div>'
          : items.map(n => {
              const icon = n.type === 'price_increase' ? '📈' : '⏰';
              const isUnread = n.type === 'expiring' ? false : !n.read;
              const time = n.created_at ? `<div class="notif-time">${fmtDate(n.created_at)}</div>` : '';
              return `<div class="notif-item${isUnread ? ' notif-unread' : ''}" onclick="Notifications._handleClick('${n.id}', '${n.type}', ${n.entity_id || 'null'})">
                <div class="notif-icon">${icon}</div>
                <div class="notif-content">
                  <div class="notif-title">${escHtml(n.title)}</div>
                  <div class="notif-body">${escHtml(n.body)}</div>
                  ${time}
                </div>
                ${isUnread ? '<div class="notif-dot"></div>' : ''}
              </div>`;
            }).join('')}
      </div>`;
  },

  async _handleClick(id, type, entityId) {
    if (type !== 'expiring' && !String(id).startsWith('exp_')) {
      await this.markRead(id);
    }
    if (entityId) {
      this._close();
      App.navigate('price-request');
      PriceRequest.view(entityId);
    }
  },

  async readAll() {
    try {
      await API.post('/notifications/read-all', {});
      this._items = this._items.map(n => ({ ...n, read: true }));
      this._updateBadge();
      this._render();
    } catch (_) {}
  },

  async markRead(id) {
    try {
      await API.patch(`/notifications/${id}/read`, {});
      const item = this._items.find(n => String(n.id) === String(id));
      if (item) item.read = true;
      this._updateBadge();
    } catch (_) {}
  },
};
