// ════════════════════════════════════════
//  CATEGORIES
// ════════════════════════════════════════
const Categories = {
  colors: ['#E07820','#D4AF37','#C8961E','#E53935','#43A047','#1E88E5','#8E24AA','#00ACC1','#F4511E','#6D4C41'],

  async load() {
    const el = document.getElementById('section-categories');
    el.innerHTML = '<div class="empty-state">Carregando...</div>';
    try {
      const cats = await API.get('/categories');
      el.innerHTML = `
        <div class="card">
          <div class="card-header">
            <span class="card-title">Categorias</span>
            ${App.canDo('manage_categories') ? `<button class="btn btn-primary" onclick="Categories.openForm()">+ Nova Categoria</button>` : ''}
          </div>
          <div style="font-size:12px;color:var(--gray);padding:8px 4px 10px">
            <strong style="color:var(--white)">${(cats||[]).length}</strong> ${(cats||[]).length === 1 ? 'categoria' : 'categorias'}
          </div>
          ${!cats || cats.length === 0
            ? '<div class="empty-state"><div class="empty-icon">🏷️</div><p>Nenhuma categoria</p></div>'
            : `<div class="table-wrap"><table>
              <thead><tr><th>Cor</th><th>Nome</th><th>Produtos</th><th>Ações</th></tr></thead>
              <tbody>${cats.map(c => `<tr>
                <td><span style="display:inline-block;width:24px;height:24px;border-radius:50%;background:${c.color||'#E07820'}"></span></td>
                <td><strong>${escHtml(c.name)}</strong></td>
                <td><span class="badge badge-orange">${c.product_count||0}</span></td>
                <td>
                  ${App.canDo('manage_categories') ? `
                  <div class="flex flex-gap">
                    <button class="btn btn-gold btn-sm" onclick="Categories.openForm(${c.id},'${escHtml(c.name)}','${c.color||'#E07820'}')">Editar</button>
                    <button class="btn btn-danger btn-sm" onclick="Categories.delete(${c.id})">Excluir</button>
                  </div>` : ''}
                </td>
              </tr>`).join('')}</tbody>
            </table></div>`}
        </div>`;
    } catch (err) {
      el.innerHTML = `<div class="empty-state text-danger">${err.message}</div>`;
    }
  },

  openForm(id, name = '', color = '#E07820') {
    showModal(
      id ? 'Editar Categoria' : 'Nova Categoria',
      `<div class="form-group"><label class="form-label">Nome *</label>
        <input class="form-control" id="catf-name" value="${escHtml(name)}"></div>
       <div class="form-group">
         <label class="form-label">Cor</label>
         <div class="color-options">
           ${this.colors.map(c => `
             <div class="color-opt ${c===color?'selected':''}" style="background:${c}" data-color="${c}"
               onclick="Categories.selectColor(this)"></div>`).join('')}
         </div>
         <input type="hidden" id="catf-color" value="${color}">
       </div>`,
      `<button class="btn btn-outline" onclick="closeModal()">Cancelar</button>
       <button class="btn btn-primary" onclick="Categories.save(${id||'null'})">Salvar</button>`
    );
  },

  selectColor(el) {
    document.querySelectorAll('.color-opt').forEach(e => e.classList.remove('selected'));
    el.classList.add('selected');
    document.getElementById('catf-color').value = el.dataset.color;
  },

  async save(id) {
    const name = document.getElementById('catf-name').value.trim();
    const color = document.getElementById('catf-color').value;
    if (!name) { toast('Nome é obrigatório', 'error'); return; }
    try {
      if (id) await API.put(`/categories/${id}`, { name, color });
      else await API.post('/categories', { name, color });
      closeModal();
      toast(id ? 'Categoria atualizada!' : 'Categoria criada!');
      this.load();
    } catch (err) { toast(err.message, 'error'); }
  },

  async delete(id) {
    if (!await confirm2('Excluir esta categoria?', 'Excluir')) return;
    try {
      await API.delete(`/categories/${id}`);
      toast('Categoria excluída');
      this.load();
    } catch (err) { toast(err.message, 'error'); }
  }
};
