/* ==========================================================
   usermanagement.js — admin-only page for managing login
   accounts (App.state.settings.users).
   ========================================================== */

const UserManagementModule = {
  editingEmail: null,

  render(){
    if (!Auth.isAdmin()){
      document.getElementById('page-usermanagement').innerHTML = `<p class="text-faint" style="padding:24px 0; text-align:center;">Hanya untuk Admin.</p>`;
      return;
    }
    this.renderUsers();
  },

  countAdmins(users){ return users.filter(u => u.role === 'admin').length; },

  renderUsers(){
    const users = App.state.settings.users || [];
    const body = document.getElementById('settUsersTableBody');
    if (!body) return;
    body.innerHTML = users.length ? users.map(u => `
      <tr>
        <td>${escapeHtml(u.email)}</td>
        <td>${escapeHtml(u.role)}</td>
        <td>
          <button class="btn sm ghost" data-edit-user="${escapeHtml(u.email)}">Edit</button>
          <button class="btn sm danger" data-del-user="${escapeHtml(u.email)}">Hapus</button>
        </td>
      </tr>
    `).join('') : `<tr><td colspan="3" class="text-faint" style="font-size:12.5px;">Belum ada user.</td></tr>`;
    body.querySelectorAll('[data-edit-user]').forEach(btn => {
      btn.onclick = () => this.startEditUser(btn.dataset.editUser);
    });
    body.querySelectorAll('[data-del-user]').forEach(btn => {
      btn.onclick = () => this.deleteUser(btn.dataset.delUser);
    });
  },

  openUserModal(){
    document.getElementById('userFormModalOverlay').classList.add('active');
  },
  closeUserModal(){
    document.getElementById('userFormModalOverlay').classList.remove('active');
  },

  startCreateUser(){
    this.resetUserForm();
    this.openUserModal();
  },

  startEditUser(email){
    const user = Auth.findByEmail(App.state.settings.users || [], email);
    if (!user) return;
    this.editingEmail = user.email;
    document.getElementById('userFormTitle').textContent = 'Edit User';
    const emailInput = document.getElementById('settUserEmail');
    emailInput.value = user.email;
    emailInput.disabled = true;
    const pwInput = document.getElementById('settUserPassword');
    pwInput.value = '';
    pwInput.placeholder = 'Kosongkan jika tidak diubah';
    document.getElementById('settUserRole').value = user.role;
    document.getElementById('settUserSaveBtn').textContent = 'Simpan Perubahan';
    this.openUserModal();
  },

  resetUserForm(){
    this.editingEmail = null;
    document.getElementById('userFormTitle').textContent = 'Tambah User';
    const emailInput = document.getElementById('settUserEmail');
    emailInput.value = '';
    emailInput.disabled = false;
    const pwInput = document.getElementById('settUserPassword');
    pwInput.value = '';
    pwInput.placeholder = 'Min 4 karakter';
    document.getElementById('settUserRole').value = 'user';
    document.getElementById('settUserSaveBtn').textContent = 'Simpan';
  },

  saveUser(){
    const users = App.state.settings.users || (App.state.settings.users = []);
    const emailInput = document.getElementById('settUserEmail');
    const email = Auth.normalizeEmail(emailInput.value);
    const password = document.getElementById('settUserPassword').value;
    const role = document.getElementById('settUserRole').value;

    if (this.editingEmail){
      const user = Auth.findByEmail(users, this.editingEmail);
      if (!user) return;
      if (user.role === 'admin' && role !== 'admin' && this.countAdmins(users) <= 1){
        Toast.show('Minimal harus ada 1 admin.', 'error'); return;
      }
      if (password){
        if (password.length < 4){ Toast.show('Password minimal 4 karakter.', 'error'); return; }
        user.password = password;
      }
      user.role = role;
      App.saveSettings();
      this.resetUserForm();
      this.closeUserModal();
      this.renderUsers();
      Toast.show('User diperbarui.', 'success');
      return;
    }

    if (!Auth.isValidEmail(email)){ Toast.show('Format email tidak valid.', 'error'); return; }
    if (Auth.findByEmail(users, email)){ Toast.show('Email sudah terdaftar.', 'error'); return; }
    if (password.length < 4){ Toast.show('Password minimal 4 karakter.', 'error'); return; }

    users.push({ email, password, role });
    App.saveSettings();
    this.resetUserForm();
    this.closeUserModal();
    this.renderUsers();
    Toast.show('User ditambahkan.', 'success');
  },

  async deleteUser(email){
    const users = App.state.settings.users || [];
    const user = Auth.findByEmail(users, email);
    if (!user) return;
    if (Auth.normalizeEmail(email) === Auth.currentEmail()){
      Toast.show('Tidak bisa menghapus akun yang sedang login.', 'error'); return;
    }
    if (user.role === 'admin' && this.countAdmins(users) <= 1){
      Toast.show('Minimal harus ada 1 admin.', 'error'); return;
    }
    const ok = await confirmDialog('Hapus User?', `User "${user.email}" akan dihapus permanen.`, 'Hapus');
    if (!ok) return;
    App.state.settings.users = users.filter(u => u !== user);
    App.saveSettings();
    if (this.editingEmail === user.email) this.resetUserForm();
    this.renderUsers();
    Toast.show('User dihapus.', 'info');
  },

  bindStaticEvents(){
    document.getElementById('settUserCreateBtn').addEventListener('click', () => this.startCreateUser());
    document.getElementById('settUserSaveBtn').addEventListener('click', () => this.saveUser());
    const userModal = document.getElementById('userFormModalOverlay');
    userModal.querySelectorAll('[data-close]').forEach(btn => {
      btn.addEventListener('click', () => this.resetUserForm());
    });
    userModal.addEventListener('click', e => { if (e.target === userModal) this.resetUserForm(); });
  }
};

document.addEventListener('DOMContentLoaded', () => {
  UserManagementModule.bindStaticEvents();
  const origGoTo = App.goTo.bind(App);
  App.goTo = (page) => { origGoTo(page); if (page === 'usermanagement') UserManagementModule.render(); };
});
