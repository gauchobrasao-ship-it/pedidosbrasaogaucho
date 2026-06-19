// ════════════════════════════════════════
//  APP CORE
// ════════════════════════════════════════
const App = {
  user: null,
  menuOpen: false,

  async init() {
    const token = localStorage.getItem('token');
    if (token) {
      API.setToken(token);
      try {
        const user = await API.get('/auth/me');
        if (user) { this.user = user; this.showApp(); this.navigate('dashboard'); return; }
      } catch {}
    }
    this.showLogin();
  },

  showLogin() {
    document.getElementById('login-page').style.display = 'flex';
    document.getElementById('app-page').style.display = 'none';
  },

  showApp() {
    document.getElementById('login-page').style.display = 'none';
    document.getElementById('app-page').style.display = 'flex';
    this.renderNav();
    document.getElementById('topbar-user').textContent = this.user.name;
  },

  canDo(perm) {
    if (!this.user) return false;
    if (this.user.role === 'admin') return true;
    return !!this.user.permissions[perm];
  },

  renderNav() {
    const nav = [
      { id: 'dashboard',    label: 'Dashboard',   icon: '📊', always: true },
      { id: 'orders',       label: 'Pedidos',      icon: '🛒', perm: 'view_orders' },
      { id: 'quotations',   label: 'Cotações',       icon: '📋', perm: 'manage_quotations' },
      { id: 'comparative',  label: 'Comparar Preços', icon: '⚖️', perm: 'view_orders' },
      { id: 'companies',    label: 'Fornecedores',   icon: '🏢', perm: 'manage_companies' },
      { id: 'products',     label: 'Produtos',     icon: '📦', perm: 'manage_products' },
      { id: 'categories',   label: 'Categorias',   icon: '🏷️',  perm: 'manage_categories' },
      { id: 'reports',      label: 'Relatórios',   icon: '📈', perm: 'view_reports' },
      { id: 'users',        label: 'Usuários',     icon: '👥', adminOnly: true },
    ];
    document.getElementById('nav-menu').innerHTML = nav
      .filter(i => {
        if (i.always) return true;
        if (i.adminOnly) return this.user.role === 'admin';
        return this.canDo(i.perm);
      })
      .map(i => `
        <a class="nav-item" onclick="App.navigate('${i.id}')" data-sec="${i.id}">
          <span class="nav-icon">${i.icon}</span> ${i.label}
        </a>`)
      .join('');
    document.getElementById('user-name').textContent = this.user.name;
    document.getElementById('user-role').textContent = this.user.role === 'admin' ? 'Administrador' : 'Usuário';
  },

  navigate(sec) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
    const el = document.getElementById(`section-${sec}`);
    if (el) el.classList.add('active');
    const nav = document.querySelector(`.nav-item[data-sec="${sec}"]`);
    if (nav) nav.classList.add('active');

    const titles = {
      dashboard:'Dashboard', orders:'Pedidos', 'new-order':'Novo Pedido',
      quotations:'Cotações', 'new-quotation':'Nova Cotação', 'price-request':'Pedido de Cotação',
      comparative:'Cotação Comparativa',
      companies:'Fornecedores', products:'Produtos', categories:'Categorias',
      reports:'Relatórios', users:'Usuários'
    };
    document.getElementById('topbar-title').textContent = titles[sec] || '';

    if (this.menuOpen) this.toggleMenu();

    switch(sec) {
      case 'dashboard':       Dashboard.load(); break;
      case 'orders':          Orders.load(); break;
      case 'quotations':      Quotations.load(); break;
      case 'companies':       Companies.load(); break;
      case 'products':        Products.load(); break;
      case 'categories':      Categories.load(); break;
      case 'comparative':     Comparative.load(); break;
      case 'reports':         Reports.load(); break;
      case 'users':           Users.load(); break;
    }
  },

  logout(silent) {
    API.setToken(null);
    this.user = null;
    if (!silent) toast('Até logo!', 'info');
    this.showLogin();
  },

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
    document.getElementById('sidebar').classList.toggle('open', this.menuOpen);
  }
};

// ════════════════════════════════════════
//  LOGIN
// ════════════════════════════════════════
document.getElementById('login-form').addEventListener('submit', async e => {
  e.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  errEl.style.display = 'none';
  try {
    const data = await API.post('/auth/login', { email, password });
    if (data) {
      API.setToken(data.token);
      App.user = data.user;
      App.showApp();
      App.navigate('dashboard');
    }
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
});
