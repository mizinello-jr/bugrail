# Login & Auth Redesign — Design Spec

Date: 2026-08-07

## Background

Current auth (`js/auth.js`, `index.html` `#loginOverlay`) is a lightweight role gate:
- "Lanjut sebagai User" button — no password, instant access.
- "Masuk sebagai Admin" — single global admin password (`App.state.settings.adminPassword`, default `admin123`).
- Role stored in `sessionStorage`, resets on tab close. No real security — client-only app, no backend, purpose is to gate destructive actions (delete file/folder), not to secure data.

Requested change: replace with a per-account email+password login, matching a provided reference screenshot's visual layout, but **without** Google/Microsoft social sign-in and **without** self-serve sign-up. Accounts are provisioned only by an admin.

## Scope

In scope: login screen redesign, per-account credential model, admin user-management UI in Settings.
Out of scope: real security (hashing, backend, session expiry policy), email-based password reset (no mail server available), multi-device sync.

## Data Model

New field in settings: `App.state.settings.users`, an array of:

```js
{ email: string, password: string, role: 'admin' | 'user' }
```

- Persisted via existing `App.saveSettings()` (localStorage), same mechanism as current `adminPassword`.
- `email` stored/compared lowercase-trimmed; must be unique.
- `password` plaintext — consistent with current app posture (no real security, access gate only). Documented, not silently assumed.
- On first load, if `users` is empty/missing, seed one default admin: `{ email: 'admin@bugrail.local', password: 'admin123', role: 'admin' }`. Prevents total lockout on fresh install.
- `App.state.settings.adminPassword` (old single-password field) is removed/no longer read by auth. Left harmless if present in old saved data (unused key).

## Auth Flow (`js/auth.js`)

Replace role-pick logic with credential check:

- `Auth.findUser(email)` — case-insensitive/trimmed lookup in `App.state.settings.users`.
- `Auth.login(email, password)`:
  - Missing user or password mismatch → return error `'Email atau password salah.'`
  - Match → `sessionStorage` stores role **and** email (new `EMAIL_KEY`, needed so "logged in as" badge/user-management can identify current user for self-delete guard).
  - Calls existing `enter(role)` flow (removes `pre-auth`, `App.init()`, renders badge).
- Remove: `loginAsUser()`, `loginAsAdmin(password)`, `adminPassword()`, `changeAdminPassword()`, `bindLoginScreen()`'s two-step pick/admin-mode toggle.
- `bindLoginScreen()` rewritten: single form (email + password inputs), submit → `Auth.login(...)`, error text shown in existing `#loginError` element.
- `renderBadge()` unchanged in behavior (shows role + logout); optionally show email in title/tooltip.
- `logout()` unchanged — also clears the new email key.

## Login Page (`index.html`)

Replace `.login-overlay` markup entirely with a two-panel full-page layout (new CSS, see below), no longer a centered card-only overlay:

**Left panel** (branding, hidden on narrow/mobile via CSS breakpoint):
- Logo mark + "BugRail" / "Test & Bug Suite" (existing brand strings, not the reference image's "TestFlow").
- Headline + short description.
- 3 feature bullets (Organized Testing / Smart Bug Tracking / Insightful Reports — reuse app's actual feature set).
- Footer copyright line.

**Right panel** (card):
- Logo mark, "Welcome back!", subtitle.
- Email input (`type=email`, `id=loginEmail`).
- Password input (`type=password`, `id=loginPassword`) with show/hide toggle button.
- Submit button "Sign in".
- Error text under form (existing `#loginError`).

**Explicitly excluded** from the reference image: "Remember me" checkbox, "Forgot password?" link, Google/Microsoft buttons, "Don't have an account? Sign up" link. None have a backing mechanism (no persistent-beyond-session storage decision requested, no mail server, no self-registration by design) — omitted rather than stubbed, to avoid dead UI.

CSS: new rules for `.login-split`, `.login-branding`, `.login-card` (can reuse/extend existing `.login-card` class name and variables from `css/style.css`); collapse to single-column (branding panel hidden) below ~860px viewport width.

## Settings: User Management

Replace the existing "Ganti Password Admin" card (`#settAdminCard`) with a new admin-only card "Kelola User":

- Table: Email | Role | Aksi (Edit / Hapus), rendered from `App.state.settings.users`.
- Add form: email input, password input, role `<select>` (admin/user) → validates unique email, min-4-char password, basic email format → pushes to `users`, `App.saveSettings()`, re-render.
- Edit (inline or small modal): change role, optionally set new password (blank = keep current). Cannot demote/delete if it would leave zero admins.
- Delete: blocked if target is the currently-logged-in account, or if it's the last remaining admin. Confirm before delete (existing app pattern for destructive actions — reuse whatever confirm pattern `settClearBtn` uses).
- Card only rendered/visible when `Auth.isAdmin()` — same visibility rule `#settAdminCard` already has.

## Validation Rules

- Email: basic regex format check, case-insensitive uniqueness.
- Password: min 4 characters (matches existing `changeAdminPassword` rule, kept consistent).
- At least one admin account must always exist — enforced at delete/edit time in the User Management UI.

## Error Handling

- Wrong email/password on login → inline message, no field-specific distinction (avoid leaking which part was wrong).
- Duplicate email on add → inline message in Settings form, no save.
- Last-admin deletion/demotion attempt → inline message, action blocked, no save.

## Testing

Manual verification (no test framework in this plain HTML/JS/CSS project):
- Fresh localStorage → seeded admin account can log in.
- Wrong credentials → error shown, no access.
- Admin adds a `user`-role account → logout → login as that account → correct role/permissions (no admin-only UI visible).
- Admin attempts to delete self / last admin → blocked with message.
- Narrow viewport → branding panel collapses, form still usable.
