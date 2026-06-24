// ════════════════════════════════════════
//  ROUTING
// ════════════════════════════════════════
const ROUTES = {
  '/':             'dashboard',
  '/pedidos':      'orders',
  '/cotacoes':     'quotations',
  '/comparar':     'comparative',
  '/fornecedores': 'companies',
  '/produtos':     'products',
  '/categorias':   'categories',
  '/relatorios':   'reports',
  '/perdas':       'perdas',
  '/usuarios':     'users',
};

const SEC_TO_PATH = {
  dashboard:   '/',
  orders:      '/pedidos',
  quotations:  '/cotacoes',
  comparative: '/comparar',
  companies:   '/fornecedores',
  products:    '/produtos',
  categories:  '/categorias',
  reports:     '/relatorios',
  perdas:      '/perdas',
  users:       '/usuarios',
};

const PARENT_SEC = {
  'new-order':     'orders',
  'new-quotation': 'quotations',
  'price-request': 'quotations',
};

// ════════════════════════════════════════
//  APP CORE
// ════════════════════════════════════════
const App = {
  user: null,
  menuOpen: false,
  _loginRedirect: null,

  async init() {
    window.addEventListener('popstate', e => {
      const sec = e.state?.sec || App._secFromPath(location.pathname);
      App._show(sec);
    });

    const token = localStorage.getItem('token');
    if (token) {
      API.setToken(token);
      try {
        const user = await API.get('/auth/me');
        if (user) {
          this.user = user;
          this.showApp();
          const sec = this._secFromPath(location.pathname);
          history.replaceState({ sec }, '', location.pathname);
          this._show(sec);
          return;
        }
      } catch {}
    }
    this._loginRedirect = location.pathname !== '/' ? location.pathname : null;
    this.showLogin();
  },

  _secFromPath(path) {
    return ROUTES[path] || 'dashboard';
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
    Notifications.init();
  },

  canDo(perm) {
    if (!this.user) return false;
    if (this.user.role === 'admin') return true;
    return !!this.user.permissions[perm];
  },

  renderNav() {
    const items = [
      { id: 'dashboard',   label: 'Dashboard',      icon: '📊', always: true },
      { id: 'orders',      label: 'Pedidos',         icon: '🛒', perm: 'view_orders' },
      { id: 'quotations',  label: 'Cotações',        icon: '📋', perm: 'manage_quotations' },
      { id: 'comparative', label: 'Comparar Preços', icon: '⚖️', perm: 'view_orders' },
      { id: 'companies',   label: 'Fornecedores',    icon: '🏢', perm: 'manage_companies' },
      { id: 'products',    label: 'Produtos',        icon: '📦', perm: 'manage_products' },
      { id: 'categories',  label: 'Categorias',      icon: '🏷️',  perm: 'manage_categories' },
      { id: 'reports',     label: 'Relatórios',      icon: '📈', perm: 'view_reports' },
      { id: 'perdas',      label: 'Controle de Perdas', icon: '📉', always: true },
      { id: 'users',       label: 'Usuários',        icon: '👥', adminOnly: true },
    ];
    document.getElementById('nav-menu').innerHTML = items
      .filter(i => {
        if (i.always) return true;
        if (i.adminOnly) return this.user.role === 'admin';
        return this.canDo(i.perm);
      })
      .map(i => `
        <a class="nav-item" href="${SEC_TO_PATH[i.id]}" data-sec="${i.id}"
          onclick="event.preventDefault(); App.navigate('${i.id}')">
          <span class="nav-icon">${i.icon}</span> ${i.label}
        </a>`)
      .join('');
    document.getElementById('user-name').textContent = this.user.name;
    document.getElementById('user-role').textContent = this.user.role === 'admin' ? 'Administrador' : 'Usuário';
  },

  // Chamado por componentes e menu — atualiza URL e mostra seção
  navigate(sec) {
    const path = SEC_TO_PATH[sec];

    if (path) {
      // Seção principal: push apenas se URL mudou
      if (location.pathname !== path) {
        history.pushState({ sec }, '', path);
      }
    } else {
      // Sub-fluxo: empurra o pai no histórico para que o botão Voltar funcione
      const parentSec = PARENT_SEC[sec];
      if (parentSec) {
        const parentPath = SEC_TO_PATH[parentSec];
        const currentSec = history.state?.sec;
        // Evita duplicatas consecutivas
        if (currentSec !== parentSec || location.pathname !== parentPath) {
          history.pushState({ sec: parentSec }, '', parentPath);
        }
      }
    }

    this._show(sec);
  },

  // Ativa a seção sem tocar no histórico — usado por popstate e init
  _show(sec) {
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

    const el = document.getElementById(`section-${sec}`);
    if (el) el.classList.add('active');

    // Destaca item do menu (usa pai para sub-fluxos)
    const navSec = PARENT_SEC[sec] || sec;
    const navEl = document.querySelector(`.nav-item[data-sec="${navSec}"]`);
    if (navEl) navEl.classList.add('active');

    const titles = {
      dashboard:        'Dashboard',
      orders:           'Pedidos',
      'new-order':      'Novo Pedido',
      quotations:       'Cotações',
      'new-quotation':  'Nova Cotação',
      'price-request':  'Pedido de Cotação',
      comparative:      'Comparar Preços',
      companies:        'Fornecedores',
      products:         'Produtos',
      categories:       'Categorias',
      reports:          'Relatórios',
      perdas:           'Controle de Perdas',
      users:            'Usuários',
    };
    document.getElementById('topbar-title').textContent = titles[sec] || '';

    if (this.menuOpen) this.toggleMenu();

    switch (sec) {
      case 'dashboard':   Dashboard.load(); break;
      case 'orders':      Orders.load(); break;
      case 'quotations':  Quotations.load(); break;
      case 'companies':   Companies.load(); break;
      case 'products':    Products.load(); break;
      case 'categories':  Categories.load(); break;
      case 'comparative': Comparative.load(); break;
      case 'reports':     Reports.load(); break;
      case 'perdas':      Perdas.load(); break;
      case 'users':       Users.load(); break;
    }
  },

  logout(silent) {
    API.setToken(null);
    this.user = null;
    if (!silent) toast('Até logo!', 'info');
    history.replaceState({}, '', '/');
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
      const redirect = App._loginRedirect;
      App._loginRedirect = null;
      const sec = redirect ? App._secFromPath(redirect) : 'dashboard';
      App.navigate(sec);
    }
  } catch (err) {
    errEl.textContent = err.message;
    errEl.style.display = 'block';
  }
});
