# Login & Auth Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the current role-only login (free "User" entry + single shared admin password) with per-account email+password login, provisioned by an admin, with a redesigned split-screen login page and no social sign-in / self sign-up.

**Architecture:** Plain HTML/CSS/JS, no build step, no backend — everything already persists to `localStorage` via the existing `Storage`/`STORAGE_KEYS` helpers in `js/utils.js`. Accounts live in `App.state.settings.users` (new array field), same persistence path as existing settings. `js/auth.js` owns credential matching and session state (`sessionStorage`); `js/settings.js` owns admin CRUD UI for the account list; `index.html`/`css/style.css` own the visual redesign.

**Tech Stack:** Vanilla JS, vanilla CSS, `localStorage`/`sessionStorage`. No test framework exists in this project — verification is manual (open in browser) plus one pure-logic self-check function for the credential-matching code (no DOM/storage dependency, runnable from the browser console).

## Global Constraints

- No backend, no network calls — everything client-side, matches existing app posture (spec: "no real security, access gate only").
- Passwords stored in plaintext in `localStorage`, consistent with existing `adminPassword` handling — do not add hashing (out of scope per spec).
- Must not lock the admin out: seed one default admin account (`admin@bugrail.local` / `admin123`) when `users` is empty (spec: "Akun awal").
- Login screen must NOT include: "Remember me" checkbox, "Forgot password?" link, Google/Microsoft buttons, "Sign up" link (spec: explicitly excluded).
- At least one `admin`-role account must always exist — enforced at edit/delete time.
- Password minimum length: 4 characters (matches existing app convention).
- Email uniqueness enforced case-insensitively, trimmed.

---

### Task 1: Auth data model & credential login (`js/auth.js`)

**Files:**
- Modify: `qa-app/js/auth.js` (full rewrite of the file — current content is the old role-only gate)

**Interfaces:**
- Consumes: `Storage.get`/`Storage.set` and `STORAGE_KEYS.SETTINGS` from `js/utils.js` (already loaded before `auth.js` in `index.html`'s script order); `App.init()` and `App.state.settings` from `js/app.js` (loaded before `auth.js`).
- Produces (used by Task 2 and Task 3):
  - `Auth.login(email, password)` — void, drives the login form submit handler.
  - `Auth.logout()` — void (unchanged behavior, now also clears stored email).
  - `Auth.isAdmin()` — boolean (unchanged signature, used by `settings.js` to show/hide the user-management card).
  - `Auth.currentEmail()` — returns the logged-in user's normalized email string, or `null`.
  - `Auth.isValidEmail(email)` — boolean, used by `settings.js` when validating the "add user" form.
  - `Auth.matchCredentials(users, email, password)` — pure function, `(array, string, string) => user object | null`. Used internally by `login()`; exposed so `Auth.selfTest()` can exercise it without touching storage.
  - `Auth.findByEmail(users, email)` — pure function, `(array, string) => user object | null`, case-insensitive/trimmed lookup. Used by `settings.js` for the uniqueness check when adding a user.
  - `Auth.selfTest()` — runs `console.assert`-based checks on the pure functions above, logs `Auth self-test: N/N passed`. No side effects (does not read/write storage).

**Why credential reads bypass `App.state.settings`:** `App.state.settings` is only populated by `App.loadAll()`, which runs inside `App.init()` — and `App.init()` is only called *after* a successful login (see old `enter()`). At the moment the login form is shown, `App.state.settings` is still just the hardcoded default (`{theme:'light', customFieldDefs:[]}`), so it would never contain a persisted user list. `Auth` therefore reads/writes the settings blob directly via `Storage.get`/`Storage.set` for anything needed pre-login (seeding, credential match). Once logged in, `App.loadAll()` re-reads the same storage key, so `App.state.settings.users` ends up consistent — `settings.js` (Task 3) can safely use `App.state.settings.users` + `App.saveSettings()` since it only runs post-login.

- [ ] **Step 1: Write `js/auth.js` with the new data model, pure helpers, and self-test**

Replace the entire file content with:

```js
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

  /* ---- Storage access (reads settings directly — see plan notes:
     App.state.settings isn't loaded yet at pre-login time) ---- */
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

document.addEventListener('DOMContentLoaded', () => Auth.init());
```

- [ ] **Step 2: Run the self-test**

Run: open `qa-app/index.html` in a browser, open the devtools console, execute `Auth.selfTest()`.
Expected: console logs `Auth self-test: 8/8 passed` and returns `true`. No `FAIL:` lines.

(This step will fail right now because `index.html` still has the old login markup — `#loginForm`/`#loginEmail`/`#loginPassword`/`#loginPwToggle` don't exist yet, so `bindLoginScreen()` throws on load. That's expected; Task 2 adds that markup. `Auth.selfTest()` itself only touches the pure functions, so it's fine to verify Step 2 by pasting just the `Auth` object's pure-function calls in the console at this point, or defer running it until after Task 2's markup is in place — do the latter, and note it as "deferred to Task 2 Step 2" in your task notes.)

- [ ] **Step 3: Commit**

```bash
git add qa-app/js/auth.js
git commit -m "feat: replace role-only login with per-account email/password auth"
```

---

### Task 2: Split-screen login page (`index.html`, `css/style.css`)

**Files:**
- Modify: `qa-app/index.html:17-43` (the `#loginOverlay` block)
- Modify: `qa-app/css/style.css:105-124` (the `AUTH / LOGIN` section)

**Interfaces:**
- Consumes: `Auth.bindLoginScreen()` from Task 1, which expects exactly these element IDs to exist: `loginForm`, `loginEmail`, `loginPassword`, `loginPwToggle`, `loginError`. `Auth.renderBadge()` expects `authBadge` (already exists in the sidebar, untouched by this task).
- Produces: nothing new consumed by later tasks — this is a leaf UI change.

- [ ] **Step 1: Replace the login overlay markup**

In `qa-app/index.html`, replace lines 17-43 (the entire `<div class="login-overlay" id="loginOverlay">...</div>` block) with:

```html
<div class="login-overlay" id="loginOverlay">
  <div class="login-split">
    <div class="login-branding">
      <div class="sidebar-brand" style="border:none; padding:0 0 40px;">
        <div class="mark">QA</div>
        <div>
          <div class="name">BugRail</div>
          <div class="sub">Test &amp; Bug Suite</div>
        </div>
      </div>
      <h1 class="login-headline">Quality Today,<br><span>Better Tomorrow.</span></h1>
      <p class="text-dim" style="font-size:14px;">Centralize your testing process, track bugs, and ship with confidence.</p>
      <div class="login-features">
        <div class="login-feature">
          <span class="glyph">☑</span>
          <div><b>Organized Testing</b><p>Manage test cases, suites, and executions in one place.</p></div>
        </div>
        <div class="login-feature">
          <span class="glyph">🐞</span>
          <div><b>Smart Bug Tracking</b><p>Report, assign, and resolve bugs faster than ever.</p></div>
        </div>
        <div class="login-feature">
          <span class="glyph">📊</span>
          <div><b>Insightful Reports</b><p>Get real-time insights and make data-driven decisions.</p></div>
        </div>
      </div>
      <p class="text-faint login-footer">© 2026 BugRail. All rights reserved.</p>
    </div>

    <div class="login-card">
      <div class="sidebar-brand" style="border:none; justify-content:center; padding:0 0 18px;">
        <div class="mark" style="width:52px; height:52px; border-radius:16px; font-size:18px;">QA</div>
      </div>
      <h2 style="text-align:center; margin:0 0 4px;">Welcome back!</h2>
      <p class="text-dim" style="text-align:center; font-size:13.5px; margin:0 0 22px;">Sign in to continue to BugRail</p>
      <form id="loginForm">
        <div class="field">
          <label>Email address</label>
          <input type="email" id="loginEmail" autocomplete="username" placeholder="Enter your email" required>
        </div>
        <div class="field">
          <label>Password</label>
          <div class="login-pw-wrap">
            <input type="password" id="loginPassword" autocomplete="current-password" placeholder="Enter your password" required>
            <button type="button" class="login-pw-toggle" id="loginPwToggle">👁</button>
          </div>
        </div>
        <p class="text-faint" id="loginError" style="font-size:12.5px; min-height:16px; margin:2px 0 10px;"></p>
        <button type="submit" class="btn primary" style="width:100%;">Sign in</button>
      </form>
    </div>
  </div>
</div>
```

- [ ] **Step 2: Replace the login CSS section**

In `qa-app/css/style.css`, replace lines 105-124 (the `/* ============ AUTH / LOGIN ============ */` section) with:

```css
/* ============ AUTH / LOGIN ============ */
body.pre-auth .app-shell,
body.pre-auth .fab{display:none;}
.login-overlay{display:none;}
body.pre-auth .login-overlay{display:block; min-height:100vh; background:var(--bg);}

.login-split{display:flex; min-height:100vh;}
.login-branding{
  flex:1; color:#fff; padding:56px 64px;
  display:flex; flex-direction:column; justify-content:center;
  background:linear-gradient(160deg,#0b0f2b,#1a1140 60%,#1c1030);
}
.login-branding .name, .login-branding .sub{color:#fff;}
.login-headline{font-size:34px; font-weight:800; line-height:1.2; margin:0 0 14px;}
.login-headline span{color:var(--primary);}
.login-features{display:flex; flex-direction:column; gap:16px; margin-top:28px;}
.login-feature{display:flex; gap:12px; align-items:flex-start;}
.login-feature .glyph{
  width:36px; height:36px; border-radius:10px; background:rgba(255,255,255,.08);
  display:flex; align-items:center; justify-content:center; flex:none; font-size:16px;
}
.login-feature b{font-size:14px;}
.login-feature p{margin:2px 0 0; font-size:12.5px; color:rgba(255,255,255,.65);}
.login-footer{margin-top:40px; color:rgba(255,255,255,.45) !important;}

.login-card{
  width:420px; flex:none; margin:auto; background:var(--surface); border:1px solid var(--border);
  border-radius:var(--radius-l); box-shadow:var(--shadow-l); padding:36px 34px;
}
.login-pw-wrap{position:relative;}
.login-pw-wrap input{width:100%; padding-right:36px;}
.login-pw-toggle{
  position:absolute; right:8px; top:50%; transform:translateY(-50%);
  background:none; border:none; cursor:pointer; font-size:14px; color:var(--text-faint); padding:4px;
}

.auth-badge{
  display:flex; align-items:center; justify-content:space-between; gap:8px;
  font-size:12.5px; font-weight:600; color:var(--text-dim); margin-bottom:8px;
}
.auth-role{white-space:nowrap;}

@media (max-width: 860px){
  .login-branding{display:none;}
  .login-card{width:92%; max-width:400px; margin:auto;}
}
```

- [ ] **Step 3: Manually verify the login page and run Task 1's self-test**

Run: open `qa-app/index.html` directly in a browser (double-click or `file://` path — no server needed).
Expected:
- Wide window: left branding panel (dark, headline, 3 feature rows) + right white/surface card with Email/Password fields and "Sign in" button. No Google/Microsoft buttons, no "Remember me", no "Forgot password?", no "Sign up" link anywhere on the page.
- Narrow window (< 860px): branding panel disappears, only the card is shown, centered.
- Type an eye icon click on the password field toggles between dots and plain text.
- Submit with `admin@bugrail.local` / `admin123` → logs in, sidebar app shell appears, `authBadge` shows "🔑 Admin".
- Reload, submit with a wrong password → "Email atau password salah." appears under the password field, stays on the login screen.
- Open devtools console, run `Auth.selfTest()` → expect `Auth self-test: 8/8 passed`.

- [ ] **Step 4: Commit**

```bash
git add qa-app/index.html qa-app/css/style.css
git commit -m "feat: redesign login page as split-screen branding + email/password card"
```

---

### Task 3: Admin user management (`js/settings.js`, `index.html`)

**Files:**
- Modify: `qa-app/index.html:325-332` (replace the `#settAdminCard` "Ganti Password Admin" card)
- Modify: `qa-app/js/settings.js` (remove `changeAdminPassword`, add user-management functions, update `render()` and `bindStaticEvents()`)

**Interfaces:**
- Consumes: `Auth.isAdmin()`, `Auth.currentEmail()`, `Auth.isValidEmail(email)` from Task 1; `App.state.settings.users`, `App.saveSettings()` from `js/app.js` (unchanged); `Toast.show(message, type)` and `confirmDialog(title, message, confirmLabel)` from `js/utils.js` (unchanged, already used elsewhere in this file).
- Produces: nothing new consumed by other modules — this is the last task.

- [ ] **Step 1: Replace the Settings admin card markup**

In `qa-app/index.html`, replace lines 325-332:

```html
        <div class="card" style="margin-top:16px;" id="settAdminCard">
          <div class="card-head"><h3>Ganti Password Admin</h3><span class="hint">Hanya untuk Admin</span></div>
          <div class="grid grid-2col">
            <div class="field"><label>Password Lama</label><input type="password" id="settAdminOldPw"></div>
            <div class="field"><label>Password Baru</label><input type="password" id="settAdminNewPw"></div>
          </div>
          <button class="btn sm" id="settAdminPwBtn">Simpan Password</button>
        </div>
```

with:

```html
        <div class="card" style="margin-top:16px;" id="settAdminCard">
          <div class="card-head"><h3>Kelola User</h3><span class="hint">Hanya untuk Admin</span></div>
          <div class="table-wrap">
            <table class="data-table" id="settUsersTable">
              <thead><tr><th>Email</th><th>Role</th><th>Aksi</th></tr></thead>
              <tbody id="settUsersTableBody"></tbody>
            </table>
          </div>
          <div class="form-row" style="margin-top:14px;">
            <div class="field"><label>Email</label><input type="email" id="settUserEmail" placeholder="nama@contoh.com"></div>
            <div class="field"><label>Password</label><input type="password" id="settUserPassword" placeholder="Min 4 karakter"></div>
            <div class="field"><label>Role</label>
              <select id="settUserRole"><option value="user">User</option><option value="admin">Admin</option></select>
            </div>
          </div>
          <button class="btn sm primary" id="settUserAddBtn">+ Tambah User</button>
        </div>
```

(Kept `id="settAdminCard"` so the existing `Auth.isAdmin()` visibility toggle in `render()` needs no ID change.)

- [ ] **Step 2: Update `js/settings.js`**

Remove the `changeAdminPassword()` method (lines 19-27 of the current file) and the line `document.getElementById('settAdminPwBtn').addEventListener('click', () => this.changeAdminPassword());` in `bindStaticEvents()`.

Add an `editingEmail` field and the user-management methods to the `SettingsModule` object, and call `this.renderUsers()` from `render()`. The resulting file:

```js
/* ==========================================================
   settings.js — data management & app preferences
   ========================================================== */

const SettingsModule = {
  editingEmail: null,

  render(){
    const bytes = new Blob([
      localStorage.getItem(STORAGE_KEYS.TESTCASES) || '',
      localStorage.getItem(STORAGE_KEYS.BUGS) || ''
    ]).size;
    const kb = (bytes / 1024).toFixed(1);
    document.getElementById('settStorageUsage').textContent = `${kb} KB terpakai (Local Storage browser ini, biasanya kuota ~5-10 MB)`;
    document.getElementById('settTcCount').textContent = App.state.testcases.length;
    document.getElementById('settBugCount').textContent = App.state.bugs.length;
    this.renderCustomFields();
    document.getElementById('settAdminCard').style.display = Auth.isAdmin() ? 'block' : 'none';
    if (Auth.isAdmin()) this.renderUsers();
  },

  /* ---- User management (admin only) ---- */
  countAdmins(users){ return users.filter(u => u.role === 'admin').length; },

  renderUsers(){
    const users = App.state.settings.users || [];
    const body = document.getElementById('settUsersTableBody');
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

  startEditUser(email){
    const user = Auth.findByEmail(App.state.settings.users || [], email);
    if (!user) return;
    this.editingEmail = user.email;
    const emailInput = document.getElementById('settUserEmail');
    emailInput.value = user.email;
    emailInput.disabled = true;
    const pwInput = document.getElementById('settUserPassword');
    pwInput.value = '';
    pwInput.placeholder = 'Kosongkan jika tidak diubah';
    document.getElementById('settUserRole').value = user.role;
    document.getElementById('settUserAddBtn').textContent = 'Simpan Perubahan';
  },

  resetUserForm(){
    this.editingEmail = null;
    const emailInput = document.getElementById('settUserEmail');
    emailInput.value = '';
    emailInput.disabled = false;
    const pwInput = document.getElementById('settUserPassword');
    pwInput.value = '';
    pwInput.placeholder = 'Min 4 karakter';
    document.getElementById('settUserRole').value = 'user';
    document.getElementById('settUserAddBtn').textContent = '+ Tambah User';
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

  renderCustomFields(){
    const defs = App.state.settings.customFieldDefs || [];
    document.getElementById('settCustomFieldList').innerHTML = defs.length ? defs.map(d => `
      <div class="flex-between" style="padding:4px 0;">
        <span>${escapeHtml(d.label)}</span>
        <button class="btn sm ghost" data-rm-field="${escapeHtml(d.label)}">🗑</button>
      </div>
    `).join('') : `<p class="text-faint" style="font-size:12.5px;">Belum ada custom field.</p>`;
    document.querySelectorAll('#settCustomFieldList [data-rm-field]').forEach(btn => {
      btn.onclick = () => this.removeCustomField(btn.dataset.rmField);
    });
  },
  addCustomField(){
    const input = document.getElementById('settCustomFieldInput');
    const label = input.value.trim();
    if (!label) return;
    const defs = App.state.settings.customFieldDefs || (App.state.settings.customFieldDefs = []);
    if (defs.some(d => d.label === label)){
      Toast.show('Field dengan nama itu sudah ada.', 'error'); return;
    }
    defs.push({ label });
    App.saveSettings();
    input.value = '';
    this.renderCustomFields();
    Toast.show(`Field "${label}" ditambahkan.`, 'success');
  },
  removeCustomField(label){
    App.state.settings.customFieldDefs = (App.state.settings.customFieldDefs || []).filter(d => d.label !== label);
    App.saveSettings();
    this.renderCustomFields();
  },

  async clearAll(){
    const ok = await confirmDialog('Hapus Semua Data?', 'Seluruh Test Case dan Bug Report akan dihapus permanen dari Local Storage.', 'Hapus Semua');
    if (!ok) return;
    App.state.testcases = [];
    App.state.bugs = [];
    Storage.set(STORAGE_KEYS.COUNTERS, {});
    App.saveTestcases(); App.saveBugs();
    this.render();
    Toast.show('Semua data telah dihapus.', 'info');
  },

  bindStaticEvents(){
    document.getElementById('settClearBtn').addEventListener('click', () => this.clearAll());
    document.getElementById('settThemeSelect').addEventListener('change', e => {
      App.state.settings.theme = e.target.value;
      App.saveSettings(); App.applyTheme();
    });
    document.getElementById('settCustomFieldAddBtn').addEventListener('click', () => this.addCustomField());
    document.getElementById('settUserAddBtn').addEventListener('click', () => this.saveUser());
  }
};

document.addEventListener('DOMContentLoaded', () => {
  SettingsModule.bindStaticEvents();
  const origGoTo = App.goTo.bind(App);
  App.goTo = (page) => { origGoTo(page); if (page === 'settings') SettingsModule.render(); };
});
```

- [ ] **Step 3: Manually verify user management end-to-end**

Run: open `qa-app/index.html`, log in as `admin@bugrail.local` / `admin123`, go to Settings.
Expected:
- "Kelola User" card shows a table with one row: `admin@bugrail.local` / `admin`.
- Add a new user: email `tester@bugrail.local`, password `test1234`, role `User` → click "+ Tambah User" → row appears, form clears, success toast shown.
- Try adding the same email again → error toast "Email sudah terdaftar.", no duplicate row.
- Try adding with a 3-character password → error toast "Password minimal 4 karakter.".
- Click "Edit" on the `tester@bugrail.local` row → email field becomes disabled/pre-filled, button label changes to "Simpan Perubahan". Change role to `Admin`, leave password blank, save → row's role updates to `admin`, password unchanged (verify by logging out and logging back in with the old `test1234` password and new `admin` role — badge shows "🔑 Admin").
- Log out, log back in as `admin@bugrail.local`. Go to Settings → Kelola User. Try deleting `admin@bugrail.local` (the currently-logged-in account) → error toast "Tidak bisa menghapus akun yang sedang login.", row remains.
- Try deleting `tester@bugrail.local` (now an admin, but not the last one — two admins exist) → confirm dialog appears, confirm → row removed, info toast shown.
- With only one admin left, try editing that admin's role down to `user`, or deleting it → both blocked with "Minimal harus ada 1 admin." toast.

- [ ] **Step 4: Commit**

```bash
git add qa-app/index.html qa-app/js/settings.js
git commit -m "feat: add admin user management for login accounts"
```

---

## Post-plan note on git

This project directory is not currently a git repository (`git status` fails at the repo root). The commit steps above assume git has been initialized before Task 1 begins — if not, run `git init` in `BugRail-QA-App/` first and confirm with the user before committing, per the project's action-safety rules.
