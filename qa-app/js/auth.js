/* ==========================================================
   auth.js — per-account email+password login gate.
   Client-side only: no real security, just an access gate to
   stop accidental destructive actions (e.g. delete file/folder).
   Accounts persist in localStorage (settings.users). Session
   role/email live in sessionStorage — reset when the tab closes.
   ========================================================== */

const Auth = {
  ROLE_KEY: 'qa_role',
  EMAIL_KEY: 'qa_email',
  DEFAULT_USERS: [
    { email: 'admin@bugrail.local', password: 'admin123', role: 'admin' }
  ],

  /* ---- Session ---- */
  role(){ return sessionStorage.getItem(this.ROLE_KEY); },
  isAdmin(){ return this.role() === 'admin'; },
  currentEmail(){ return sessionStorage.getItem(this.EMAIL_KEY); },

  /* ---- Pure helpers (no storage/DOM access — unit-testable) ---- */
  normalizeEmail(email){ return String(email || '').trim().toLowerCase(); },

  isValidEmail(email){
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
  },

  findByEmail(users, email){
    const target = this.normalizeEmail(email);
    return (users || []).find(u => this.normalizeEmail(u.email) === target) || null;
  },

  matchCredentials(users, email, password){
    const user = this.findByEmail(users, email);
    if (!user || user.password !== password) return null;
    return user;
  },

  /* ---- Storage access (reads settings directly — App.state.settings
     isn't loaded yet at pre-login time, App.init() runs after login) ---- */
  loadSettingsRaw(){
    return Storage.get(STORAGE_KEYS.SETTINGS, { theme: 'light', customFieldDefs: [], users: [] });
  },

  ensureSeedUsers(){
    const settings = this.loadSettingsRaw();
    if (!settings.users || !settings.users.length){
      settings.users = this.DEFAULT_USERS.slice();
      Storage.set(STORAGE_KEYS.SETTINGS, settings);
    }
  },

  /* ---- Login/session lifecycle ---- */
  enter(role, email){
    sessionStorage.setItem(this.ROLE_KEY, role);
    sessionStorage.setItem(this.EMAIL_KEY, email);
    document.body.classList.remove('pre-auth');
    App.init();
    this.renderBadge();
  },

  login(email, password){
    this.ensureSeedUsers();
    const settings = this.loadSettingsRaw();
    const user = this.matchCredentials(settings.users, email, password);
    const errEl = document.getElementById('loginError');
    if (!user){
      errEl.textContent = 'Email atau password salah.';
      return;
    }
    errEl.textContent = '';
    this.enter(user.role, this.normalizeEmail(email));
  },

  logout(){
    sessionStorage.removeItem(this.ROLE_KEY);
    sessionStorage.removeItem(this.EMAIL_KEY);
    location.reload();
  },

  renderBadge(){
    const el = document.getElementById('authBadge');
    if (!el) return;
    const role = this.role();
    el.innerHTML = `
      <span class="auth-role">${role === 'admin' ? '🔑 Admin' : '👤 User'}</span>
      <button class="btn sm ghost" id="authLogoutBtn">Logout</button>
    `;
    document.getElementById('authLogoutBtn').addEventListener('click', () => this.logout());
    const navUM = document.getElementById('navUserManagement');
    if (navUM) navUM.style.display = this.isAdmin() ? 'flex' : 'none';
  },

  bindLoginScreen(){
    const form = document.getElementById('loginForm');
    form.addEventListener('submit', e => {
      e.preventDefault();
      this.login(
        document.getElementById('loginEmail').value,
        document.getElementById('loginPassword').value
      );
    });
    const pwToggle = document.getElementById('loginPwToggle');
    const pwInput = document.getElementById('loginPassword');
    pwToggle.addEventListener('click', () => {
      pwInput.type = pwInput.type === 'password' ? 'text' : 'password';
    });
  },

  init(){
    this.ensureSeedUsers();
    this.bindLoginScreen();
    if (this.role()){
      document.body.classList.remove('pre-auth');
      App.init();
      this.renderBadge();
    }
    // else: stays in pre-auth state, login screen visible, App.init() deferred until login().
  },

  /* ---- Self-check for the pure matching/validation logic.
     Run manually from the browser console: Auth.selfTest() ---- */
  selfTest(){
    const users = [
      { email: 'Admin@Bugrail.local', password: 'admin123', role: 'admin' },
      { email: 'tester@bugrail.local', password: 'test1234', role: 'user' }
    ];
    let pass = 0, total = 0;
    const check = (label, cond) => {
      total++;
      if (cond) pass++; else console.error('FAIL:', label);
    };
    check('matches correct credentials', !!this.matchCredentials(users, 'tester@bugrail.local', 'test1234'));
    check('rejects wrong password', this.matchCredentials(users, 'tester@bugrail.local', 'nope') === null);
    check('rejects unknown email', this.matchCredentials(users, 'nobody@x.com', 'test1234') === null);
    check('email match is case-insensitive', !!this.matchCredentials(users, 'ADMIN@bugrail.local', 'admin123'));
    check('findByEmail trims/lowercases', !!this.findByEmail(users, '  Tester@Bugrail.Local  '));
    check('isValidEmail accepts valid address', this.isValidEmail('a@b.com') === true);
    check('isValidEmail rejects missing @', this.isValidEmail('a-b.com') === false);
    check('isValidEmail rejects missing domain dot', this.isValidEmail('a@b') === false);
    console.log(`Auth self-test: ${pass}/${total} passed`);
    return pass === total;
  }
};

document.addEventListener('DOMContentLoaded', async () => {
  await Storage.hydrate();
  Auth.init();
  document.getElementById('loadingOverlay').style.display = 'none';
});
