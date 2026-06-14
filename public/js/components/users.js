// ════════════════════════════════════════
//  USERS
// ════════════════════════════════════════
const Users = {
  async load() {
    const el = document.getElementById('section-users');
    el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const users = await API.get('/users');
      el.innerHTML = `
        <div class="card">
          <div class="card-header">
            <span class="card-title">Usuários</span>
            <button class="btn btn-primary" onclick="Users.openForm()">+ Novo Usuário</button>
          </div>
          <div class="table-wrap"><table>
            <thead><tr><th>Nome</th><th>Email</th><th>Perfil</th><th>Status</th><th>Ações</th></tr></thead>
            <tbody>${(users||[]).map(u => `<tr>
              <td><strong>${escHtml(u.name)}</strong></td>
              <td class="text-gray">${escHtml(u.email)}</td>
              <td><span class="badge ${u.role==='admin'?'badge-gold':'badge-orange'}">${u.role==='admin'?'Admin':'Usuário'}</span></td>
              <td><span class="badge ${u.active?'badge-success':'badge-danger'}">${u.active?'Ativo':'Inativo'}</span></td>
              <td>
                <div class="flex flex-gap">
                  <button class="btn btn-gold btn-sm" onclick="Users.openForm(${u.id})">Editar</button>
                  ${u.id !== App.user.id ? `<button class="btn btn-danger btn-sm" onclick="Users.delete(${u.id})">Desativar</button>` : ''}
                </div>
              </td>
            </tr>`).join('')}</tbody>
          </table></div>
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

  async openForm(id) {
    let user = { permissions: {}, role: 'user', active: true };
    if (id) {
      const users = await API.get('/users');
      user = (users||[]).find(u => u.id === id) || user;
    }
    const churrascarias = await API.get('/reports/churrascarias');
    const p = user.permissions || {};
    const allowedChurr = (p.allowed_churrascarias || []).map(Number);
    const isAllChurr = allowedChurr.length === 0;
    const perms = [
      { key: 'manage_companies',   label: 'Gerenciar Fornecedores' },
      { key: 'manage_products',    label: 'Gerenciar Produtos' },
      { key: 'manage_categories',  label: 'Gerenciar Categorias' },
      { key: 'create_orders',      label: 'Fazer Pedidos' },
      { key: 'view_orders',        label: 'Ver Pedidos' },
      { key: 'view_reports',       label: 'Ver Relatórios' },
      { key: 'manage_quotations',  label: 'Gerenciar Cotações' },
    ];

    showModal(
      id ? `Editar Usuário · ${user.name}` : 'Novo Usuário',
      `<div class="form-row">
        <div class="form-group"><label class="form-label">Nome *</label>
          <input class="form-control" id="uf-name" value="${escHtml(user.name||'')}"></div>
        <div class="form-group"><label class="form-label">Email *</label>
          <input class="form-control" id="uf-email" type="email" value="${escHtml(user.email||'')}"></div>
      </div>
      <div class="form-row">
        <div class="form-group"><label class="form-label">Senha ${id?'(deixe vazio para não alterar)':' *'}</label>
          <input class="form-control" id="uf-password" type="password" placeholder="Nova senha..."></div>
        <div class="form-group"><label class="form-label">Perfil</label>
          <select class="form-control" id="uf-role">
            <option value="user" ${user.role!=='admin'?'selected':''}>Usuário</option>
            <option value="admin" ${user.role==='admin'?'selected':''}>Administrador</option>
          </select></div>
      </div>
      ${id ? `<div class="form-group"><label class="form-label">Status</label>
        <select class="form-control" id="uf-active">
          <option value="1" ${user.active?'selected':''}>Ativo</option>
          <option value="0" ${!user.active?'selected':''}>Inativo</option>
        </select></div>` : ''}
      <div class="form-group">
        <label class="form-label">Acesso às Churrascarias</label>
        <div class="perm-grid">
          ${(churrascarias||[]).map(ch => `
            <label class="perm-item">
              <input type="checkbox" id="churr-cb-${ch.id}" data-churr-id="${ch.id}"
                ${isAllChurr || allowedChurr.includes(ch.id) ? 'checked' : ''}>
              <span class="perm-label">🔥 ${escHtml(ch.name)}</span>
            </label>`).join('')}
        </div>
        <div style="font-size:11px;color:var(--gray);margin-top:4px">Marque as unidades que este usuário pode acessar.</div>
      </div>
      <div class="form-group">
        <label class="form-label">Permissões do Sistema</label>
        <div class="perm-grid">
          ${perms.map(perm => `
            <label class="perm-item">
              <input type="checkbox" id="perm-${perm.key}" ${p[perm.key]?'checked':''}>
              <span class="perm-label">${perm.label}</span>
            </label>`).join('')}
        </div>
      </div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="Users.save(${id||'null'})">Salvar</button>`
    );
  },

  async save(id) {
    const perms = ['manage_companies','manage_products','manage_categories','create_orders','view_orders','view_reports','manage_quotations'];
    const permissions = {};
    perms.forEach(k => { permissions[k] = document.getElementById(`perm-${k}`)?.checked || false; });
    const churrCbs = Array.from(document.querySelectorAll('[id^="churr-cb-"]'));
    const checkedChurr = churrCbs.filter(el => el.checked).map(el => parseInt(el.dataset.churrId));
    permissions.allowed_churrascarias = checkedChurr.length === churrCbs.length ? [] : checkedChurr;

    const data = {
      name: document.getElementById('uf-name').value.trim(),
      email: document.getElementById('uf-email').value.trim(),
      role: document.getElementById('uf-role').value,
      permissions,
    };
    if (!id && !document.getElementById('uf-password').value) { toast('Senha é obrigatória', 'error'); return; }
    if (document.getElementById('uf-password').value) data.password = document.getElementById('uf-password').value;
    if (id) {
      const activeEl = document.getElementById('uf-active');
      if (activeEl) data.active = activeEl.value === '1';
    }
    if (!data.name || !data.email) { toast('Nome e email são obrigatórios', 'error'); return; }
    try {
      if (id) await API.put(`/users/${id}`, data);
      else await API.post('/users', data);
      closeModal();
      toast(id ? 'Usuário atualizado!' : 'Usuário criado!');
      this.load();
    } catch (err) { toast(err.message, 'error'); }
  },

  async delete(id) {
    if (!confirm2('Desativar este usuário?')) return;
    try {
      await API.delete(`/users/${id}`);
      toast('Usuário desativado');
      this.load();
    } catch (err) { toast(err.message, 'error'); }
  }
};
