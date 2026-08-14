# BugRail Next Phase 1 (Test Case + Bug Report) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up a real Express+Prisma+PostgreSQL backend and a Next.js+Tailwind frontend implementing Auth, Test Case, and Bug Report (including the Module-grouped test case summary table), replacing the localStorage-only versions of those two modules from `qa-app/`.

**Architecture:** Two independent local processes — `BugRail-Next/backend` (Express REST API on port 4000, Prisma ORM, PostgreSQL) and `BugRail-Next/frontend` (Next.js App Router on port 3000, Tailwind CSS). Auth is a JWT in an httpOnly cookie set by the backend; the frontend forwards it on every API call and reads it server-side via `middleware.js` to gate protected routes.

**Tech Stack:** Node.js (plain JavaScript, no TypeScript), Express 4, Prisma 5, PostgreSQL, bcrypt, jsonwebtoken, cookie-parser, cors, Jest + Supertest (backend tests), Next.js 14 (App Router), Tailwind CSS, Vitest (frontend logic tests).

Spec: `docs/superpowers/specs/2026-08-11-bugrail-next-migration-design.md`

## Global Constraints

- Backend runs on port 4000, frontend on port 3000. CORS origin locked to `http://localhost:3000` with `credentials: true`.
- Plain JavaScript everywhere — no TypeScript, no component libraries beyond Tailwind (per spec section 4).
- JWT cookie name `brn_token`, httpOnly, `sameSite: 'lax'`, `maxAge: 7 * 24 * 60 * 60 * 1000` (7 days). Secret from `process.env.JWT_SECRET`.
- Passwords hashed with bcrypt, 10 salt rounds.
- All error responses: `{ error: "message" }` with an appropriate HTTP status (400/401/403/404/500).
- Test Case ID format: `{moduleAbbrev}-{counter padStart 4 '0'}` (e.g. `LOG-0001`). Bug ID format: `BUG-{counter padStart 4 '0'}`. Counters are per-prefix, stored in `IdCounter`, incremented inside a Prisma transaction.
- `moduleAbbrev(module)`: split module name on whitespace; if ≥3 words, take first letter of first 3 words uppercased; else take initials of all words + extra uppercased letters from word remainders, concatenated and padded to exactly 3 chars with `X`. If module is empty, return `TC`. (Ported verbatim from `qa-app/js/utils.js:114-121`.)
- Fresh Postgres DB — no migration of existing localStorage data (per spec).
- No data migration, no Dashboard/Summary-charts/Settings/Master-Status-CRUD/User-Management/Import-Export in this phase (per spec "Out of Scope").

---

## Backend

### Task 1: Backend project scaffold + Prisma schema + seed

**Files:**
- Create: `BugRail-Next/backend/package.json`
- Create: `BugRail-Next/backend/.env.example`
- Create: `BugRail-Next/backend/.gitignore`
- Create: `BugRail-Next/backend/prisma/schema.prisma`
- Create: `BugRail-Next/backend/prisma/seed.js`
- Create: `BugRail-Next/backend/jest.config.js`

**Interfaces:**
- Produces: Prisma Client generated at `@prisma/client`, importable by all later backend tasks as `const { PrismaClient } = require('@prisma/client')`.
- Produces: seeded `BugStatus` rows (codes `OPEN`, `IN_PROGRESS`, `RETEST`, `RESOLVED`, `CLOSED`, `REJECTED`) and one seeded admin `User` (`admin@bugrail.local` / `admin123`, role `ADMIN`).

- [ ] **Step 1: Init package.json and install dependencies**

Run inside `BugRail-Next/backend/`:
```bash
mkdir -p BugRail-Next/backend
cd BugRail-Next/backend
npm init -y
npm install express @prisma/client bcrypt jsonwebtoken cookie-parser cors dotenv
npm install -D prisma jest supertest nodemon
```

Edit `package.json` `scripts` to:
```json
{
  "scripts": {
    "dev": "nodemon src/server.js",
    "start": "node src/server.js",
    "test": "jest --runInBand",
    "prisma:migrate": "prisma migrate dev",
    "prisma:seed": "node prisma/seed.js"
  }
}
```

- [ ] **Step 2: Write `.env.example` and `.gitignore`**

`.env.example`:
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/bugrail?schema=public"
DATABASE_URL_TEST="postgresql://postgres:postgres@localhost:5432/bugrail_test?schema=public"
JWT_SECRET="change-me-in-real-env"
PORT=4000
```

`.gitignore`:
```
node_modules/
.env
```

Copy `.env.example` to `.env` and fill in real local Postgres credentials (manual step — requires a running local Postgres instance with a `bugrail` database created).

- [ ] **Step 3: Write `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

model User {
  id        String   @id @default(cuid())
  email     String   @unique
  password  String
  role      Role     @default(USER)
  createdAt DateTime @default(now())
  bugs      Bug[]    @relation("BugTester")
}

enum Role {
  ADMIN
  USER
}

model FileGroup {
  id        String     @id @default(cuid())
  name      String
  createdAt DateTime   @default(now())
  testCases TestCase[]
  bugs      Bug[]
}

model TestCase {
  id             String     @id
  fileId         String
  file           FileGroup  @relation(fields: [fileId], references: [id], onDelete: Cascade)
  module         String
  roleUser       String?
  scenario       String
  testCase       String
  preconditions  String?
  steps          String?
  testData       String?
  typeTest       TypeTest   @default(POSITIVE)
  expectedResult String?
  actualResult   String?
  status         TcStatus   @default(OPEN)
  executionDate  DateTime?
  createdAt      DateTime   @default(now())
  bugs           Bug[]
}

enum TypeTest {
  POSITIVE
  NEGATIVE
}

enum TcStatus {
  OPEN
  PASSED
  FAILED
  BLOCKED
  RETEST
}

model BugStatus {
  code  String @id
  name  String @unique
  color String
  order Int
  bugs  Bug[]
}

model Bug {
  id             String     @id
  fileId         String
  file           FileGroup  @relation(fields: [fileId], references: [id], onDelete: Cascade)
  testCaseId     String?
  testCase       TestCase?  @relation(fields: [testCaseId], references: [id])
  module         String?
  scenario       String?
  expectedResult String?
  steps          String?
  title          String
  description    String?
  actualResult   String
  severity       Severity   @default(MEDIUM)
  priority       Priority   @default(MEDIUM)
  statusCode     String
  status         BugStatus  @relation(fields: [statusCode], references: [code])
  testerId       String
  tester         User       @relation("BugTester", fields: [testerId], references: [id])
  environment    String?
  browser        String?
  os             String?
  device         String?
  buildVersion   String?
  attachments    String?
  reportDate     DateTime   @default(now())
}

enum Severity {
  CRITICAL
  HIGH
  MEDIUM
  LOW
}

enum Priority {
  HIGHEST
  HIGH
  MEDIUM
  LOW
}

model IdCounter {
  key   String @id
  value Int    @default(0)
}
```

- [ ] **Step 4: Run the initial migration**

```bash
cd BugRail-Next/backend
npx prisma migrate dev --name init
```
Expected: creates `bugrail` schema tables, generates Prisma Client, no errors.

- [ ] **Step 5: Write `prisma/seed.js`**

```js
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const STATUSES = [
  { code: 'OPEN', name: 'Open', color: '#2563EB', order: 1 },
  { code: 'IN_PROGRESS', name: 'In Progress', color: '#F59E0B', order: 2 },
  { code: 'RETEST', name: 'Retest', color: '#06B6D4', order: 3 },
  { code: 'RESOLVED', name: 'Resolved', color: '#22C55E', order: 4 },
  { code: 'CLOSED', name: 'Closed', color: '#6B7280', order: 5 },
  { code: 'REJECTED', name: 'Rejected', color: '#EF4444', order: 6 }
];

async function main(){
  for (const s of STATUSES){
    await prisma.bugStatus.upsert({ where: { code: s.code }, update: s, create: s });
  }
  const passwordHash = await bcrypt.hash('admin123', 10);
  await prisma.user.upsert({
    where: { email: 'admin@bugrail.local' },
    update: {},
    create: { email: 'admin@bugrail.local', password: passwordHash, role: 'ADMIN' }
  });
  console.log('Seed complete.');
}

main().catch(e => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
```

- [ ] **Step 6: Run the seed**

```bash
npm run prisma:seed
```
Expected: "Seed complete." printed, no errors.

- [ ] **Step 7: Write `jest.config.js`**

```js
module.exports = {
  testEnvironment: 'node',
  testTimeout: 15000
};
```

- [ ] **Step 8: Commit**

```bash
git add BugRail-Next/backend
git commit -m "chore: scaffold backend, prisma schema, seed"
```
(If the repo root isn't a git repository yet, run `git init` first and confirm with the user before committing.)

---

### Task 2: Prisma client singleton, JWT lib, ID generator lib (with unit tests)

**Files:**
- Create: `BugRail-Next/backend/src/db.js`
- Create: `BugRail-Next/backend/src/lib/jwt.js`
- Create: `BugRail-Next/backend/src/lib/idgen.js`
- Test: `BugRail-Next/backend/tests/idgen.test.js`
- Test: `BugRail-Next/backend/tests/jwt.test.js`

**Interfaces:**
- Consumes: `@prisma/client` (Task 1).
- Produces: `db.js` exports a singleton `prisma` instance — `const prisma = require('../db')`.
- Produces: `jwt.js` exports `signToken(payload)` → string, `verifyToken(token)` → payload object or throws.
- Produces: `idgen.js` exports `moduleAbbrev(module)` → 3-char string, `nextId(prefix)` → Promise<string> (e.g. `nextId('LOG')` → `'LOG-0001'`, `nextId('BUG')` → `'BUG-0001'`).

- [ ] **Step 1: Write `src/db.js`**

```js
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

module.exports = prisma;
```

- [ ] **Step 2: Write failing test for `moduleAbbrev`**

`tests/idgen.test.js`:
```js
const { moduleAbbrev } = require('../src/lib/idgen');

describe('moduleAbbrev', () => {
  test('single word takes first 3 letters via initials+extra', () => {
    expect(moduleAbbrev('Login')).toBe('LOG');
  });
  test('three or more words takes initials', () => {
    expect(moduleAbbrev('User Account Settings')).toBe('UAS');
  });
  test('two words pads with extra letters from remainders', () => {
    expect(moduleAbbrev('User Management')).toBe('UMS');
  });
  test('empty module falls back to TC', () => {
    expect(moduleAbbrev('')).toBe('TC');
    expect(moduleAbbrev(undefined)).toBe('TC');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test -- idgen.test.js`
Expected: FAIL — `Cannot find module '../src/lib/idgen'`

- [ ] **Step 4: Write `src/lib/idgen.js`**

```js
const prisma = require('../db');

function moduleAbbrev(module){
  const words = String(module || '').trim().split(/\s+/).filter(Boolean);
  if (!words.length) return 'TC';
  const initials = words.map(w => w[0].toUpperCase());
  if (initials.length >= 3) return initials.slice(0, 3).join('');
  const extra = words.flatMap(w => w.slice(1).toUpperCase().split(''));
  return initials.concat(extra).slice(0, 3).join('').padEnd(3, 'X');
}

async function nextId(prefix){
  const counter = await prisma.$transaction(async (tx) => {
    const existing = await tx.idCounter.upsert({
      where: { key: prefix },
      update: { value: { increment: 1 } },
      create: { key: prefix, value: 1 }
    });
    return existing.value;
  });
  return `${prefix}-${String(counter).padStart(4, '0')}`;
}

module.exports = { moduleAbbrev, nextId };
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- idgen.test.js`
Expected: PASS (4 tests). Note: `nextId` isn't unit-tested here (it needs a live DB) — it's covered by the integration tests in Tasks 5 and 6.

- [ ] **Step 6: Write failing test for JWT lib**

`tests/jwt.test.js`:
```js
process.env.JWT_SECRET = 'test-secret';
const { signToken, verifyToken } = require('../src/lib/jwt');

describe('jwt lib', () => {
  test('signs and verifies a payload round-trip', () => {
    const token = signToken({ id: 'u1', role: 'ADMIN' });
    const payload = verifyToken(token);
    expect(payload.id).toBe('u1');
    expect(payload.role).toBe('ADMIN');
  });
  test('throws on invalid token', () => {
    expect(() => verifyToken('not-a-real-token')).toThrow();
  });
});
```

- [ ] **Step 7: Run test to verify it fails**

Run: `npm test -- jwt.test.js`
Expected: FAIL — `Cannot find module '../src/lib/jwt'`

- [ ] **Step 8: Write `src/lib/jwt.js`**

```js
const jwt = require('jsonwebtoken');

function signToken(payload){
  return jwt.sign(payload, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function verifyToken(token){
  return jwt.verify(token, process.env.JWT_SECRET);
}

module.exports = { signToken, verifyToken };
```

- [ ] **Step 9: Run test to verify it passes**

Run: `npm test -- jwt.test.js`
Expected: PASS (2 tests)

- [ ] **Step 10: Commit**

```bash
git add BugRail-Next/backend/src/db.js BugRail-Next/backend/src/lib BugRail-Next/backend/tests
git commit -m "feat: prisma client, jwt lib, id generator"
```

---

### Task 3: Express app shell, auth middleware, auth routes

**Files:**
- Create: `BugRail-Next/backend/src/app.js`
- Create: `BugRail-Next/backend/src/server.js`
- Create: `BugRail-Next/backend/src/middleware/auth.js`
- Create: `BugRail-Next/backend/src/routes/auth.js`
- Test: `BugRail-Next/backend/tests/auth.test.js`

**Interfaces:**
- Consumes: `prisma` (Task 2 `src/db.js`), `signToken`/`verifyToken` (Task 2 `src/lib/jwt.js`).
- Produces: `middleware/auth.js` exports `requireAuth(req, res, next)` (sets `req.user = { id, role }` from cookie, else 401) and `requireAdmin(req, res, next)` (401/403).
- Produces: `app.js` exports the configured Express `app` (no `.listen`), mounted with `app.use('/api/auth', authRouter)` — later tasks mount their routers the same way on the same `app` instance.
- Produces: cookie name `brn_token` (Global Constraints).

- [ ] **Step 1: Write `src/app.js`**

```js
const express = require('express');
const cors = require('cors');
const cookieParser = require('cookie-parser');

const authRouter = require('./routes/auth');

const app = express();

app.use(cors({ origin: 'http://localhost:3000', credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.use('/api/auth', authRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

module.exports = app;
```

- [ ] **Step 2: Write `src/server.js`**

```js
require('dotenv').config();
const app = require('./app');

const port = process.env.PORT || 4000;
app.listen(port, () => console.log(`Backend listening on http://localhost:${port}`));
```

- [ ] **Step 3: Write `src/middleware/auth.js`**

```js
const { verifyToken } = require('../lib/jwt');

function requireAuth(req, res, next){
  const token = req.cookies.brn_token;
  if (!token) return res.status(401).json({ error: 'Not authenticated' });
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired session' });
  }
}

function requireAdmin(req, res, next){
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  if (req.user.role !== 'ADMIN') return res.status(403).json({ error: 'Admin only' });
  next();
}

module.exports = { requireAuth, requireAdmin };
```

- [ ] **Step 4: Write failing integration test for auth routes**

`tests/auth.test.js`:
```js
process.env.JWT_SECRET = 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const request = require('supertest');
const bcrypt = require('bcrypt');
const prisma = require('../src/db');
const app = require('../src/app');

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: 'authtest@bugrail.local' } });
  const password = await bcrypt.hash('secret123', 10);
  await prisma.user.create({ data: { email: 'authtest@bugrail.local', password, role: 'USER' } });
});

afterAll(async () => {
  await prisma.user.deleteMany({ where: { email: 'authtest@bugrail.local' } });
  await prisma.$disconnect();
});

describe('POST /api/auth/login', () => {
  test('rejects wrong password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'authtest@bugrail.local', password: 'wrong' });
    expect(res.status).toBe(401);
    expect(res.body.error).toBeDefined();
  });

  test('logs in and sets brn_token cookie', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ email: 'authtest@bugrail.local', password: 'secret123' });
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('authtest@bugrail.local');
    expect(res.headers['set-cookie'][0]).toMatch(/brn_token=/);
  });
});

describe('GET /api/auth/me', () => {
  test('returns null when no cookie', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body).toBeNull();
  });

  test('returns user when logged in', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'authtest@bugrail.local', password: 'secret123' });
    const res = await agent.get('/api/auth/me');
    expect(res.status).toBe(200);
    expect(res.body.email).toBe('authtest@bugrail.local');
  });
});

describe('POST /api/auth/logout', () => {
  test('clears the cookie', async () => {
    const agent = request.agent(app);
    await agent.post('/api/auth/login').send({ email: 'authtest@bugrail.local', password: 'secret123' });
    const res = await agent.post('/api/auth/logout');
    expect(res.status).toBe(200);
    const me = await agent.get('/api/auth/me');
    expect(me.body).toBeNull();
  });
});
```

- [ ] **Step 5: Run test to verify it fails**

Run: `npm test -- auth.test.js`
Expected: FAIL — `Cannot find module '../src/routes/auth'`
(Requires `DATABASE_URL_TEST` to point at a real, migrated test database — run `DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy` once beforehand.)

- [ ] **Step 6: Write `src/routes/auth.js`**

```js
const express = require('express');
const bcrypt = require('bcrypt');
const prisma = require('../db');
const { signToken } = require('../lib/jwt');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const COOKIE_OPTS = { httpOnly: true, sameSite: 'lax', maxAge: 7 * 24 * 60 * 60 * 1000 };

router.post('/login', async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });

  const user = await prisma.user.findUnique({ where: { email: email.trim().toLowerCase() } });
  if (!user) return res.status(401).json({ error: 'Email atau password salah.' });

  const ok = await bcrypt.compare(password, user.password);
  if (!ok) return res.status(401).json({ error: 'Email atau password salah.' });

  const token = signToken({ id: user.id, role: user.role });
  res.cookie('brn_token', token, COOKIE_OPTS);
  res.json({ id: user.id, email: user.email, role: user.role });
});

router.post('/logout', (req, res) => {
  res.clearCookie('brn_token');
  res.json({ ok: true });
});

router.get('/me', async (req, res) => {
  const token = req.cookies.brn_token;
  if (!token) return res.json(null);
  try {
    const { verifyToken } = require('../lib/jwt');
    const payload = verifyToken(token);
    const user = await prisma.user.findUnique({ where: { id: payload.id } });
    if (!user) return res.json(null);
    res.json({ id: user.id, email: user.email, role: user.role });
  } catch {
    res.json(null);
  }
});

module.exports = router;
```

- [ ] **Step 7: Run test to verify it passes**

Run: `npm test -- auth.test.js`
Expected: PASS (5 tests)

- [ ] **Step 8: Commit**

```bash
git add BugRail-Next/backend/src BugRail-Next/backend/tests
git commit -m "feat: express app shell + auth routes"
```

---

### Task 4: Files (FileGroup) CRUD routes

**Files:**
- Create: `BugRail-Next/backend/src/routes/files.js`
- Modify: `BugRail-Next/backend/src/app.js` — mount `app.use('/api/files', requireAuth, filesRouter)`
- Test: `BugRail-Next/backend/tests/files.test.js`

**Interfaces:**
- Consumes: `requireAuth`, `requireAdmin` (Task 3 `src/middleware/auth.js`), `prisma` (Task 2).
- Produces: `FileGroup` rows consumable by TestCase/Bug routes via `fileId`.

- [ ] **Step 1: Write failing integration test**

`tests/files.test.js`:
```js
process.env.JWT_SECRET = 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const request = require('supertest');
const bcrypt = require('bcrypt');
const prisma = require('../src/db');
const app = require('../src/app');

let agent;

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: 'filestest@bugrail.local' } });
  const password = await bcrypt.hash('secret123', 10);
  await prisma.user.create({ data: { email: 'filestest@bugrail.local', password, role: 'ADMIN' } });
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'filestest@bugrail.local', password: 'secret123' });
});

afterAll(async () => {
  await prisma.fileGroup.deleteMany({ where: { name: { startsWith: 'Sprint Test' } } });
  await prisma.user.deleteMany({ where: { email: 'filestest@bugrail.local' } });
  await prisma.$disconnect();
});

test('rejects unauthenticated requests', async () => {
  const res = await request(app).get('/api/files');
  expect(res.status).toBe(401);
});

test('creates, lists, renames, and deletes a file', async () => {
  const create = await agent.post('/api/files').send({ name: 'Sprint Test 1' });
  expect(create.status).toBe(201);
  const id = create.body.id;

  const list = await agent.get('/api/files');
  expect(list.status).toBe(200);
  expect(list.body.some(f => f.id === id)).toBe(true);

  const rename = await agent.patch(`/api/files/${id}`).send({ name: 'Sprint Test 1 Renamed' });
  expect(rename.status).toBe(200);
  expect(rename.body.name).toBe('Sprint Test 1 Renamed');

  const del = await agent.delete(`/api/files/${id}`);
  expect(del.status).toBe(200);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- files.test.js`
Expected: FAIL — 404s (route not mounted)

- [ ] **Step 3: Write `src/routes/files.js`**

```js
const express = require('express');
const prisma = require('../db');
const { requireAdmin } = require('../middleware/auth');

const router = express.Router();

router.get('/', async (req, res) => {
  const files = await prisma.fileGroup.findMany({ orderBy: { createdAt: 'asc' } });
  res.json(files);
});

router.post('/', async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name is required' });
  const file = await prisma.fileGroup.create({ data: { name } });
  res.status(201).json(file);
});

router.patch('/:id', async (req, res) => {
  const name = (req.body.name || '').trim();
  if (!name) return res.status(400).json({ error: 'Name is required' });
  try {
    const file = await prisma.fileGroup.update({ where: { id: req.params.id }, data: { name } });
    res.json(file);
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

router.delete('/:id', requireAdmin, async (req, res) => {
  try {
    await prisma.fileGroup.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'File not found' });
  }
});

module.exports = router;
```

- [ ] **Step 4: Mount the router in `src/app.js`**

Add near the top with the other requires:
```js
const filesRouter = require('./routes/files');
```
Add after `app.use('/api/auth', authRouter);`:
```js
const { requireAuth } = require('./middleware/auth');
app.use('/api/files', requireAuth, filesRouter);
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- files.test.js`
Expected: PASS (2 tests)

- [ ] **Step 6: Commit**

```bash
git add BugRail-Next/backend/src BugRail-Next/backend/tests
git commit -m "feat: file group CRUD routes"
```

---

### Task 5: Test Case CRUD routes + by-module grouped endpoint

**Files:**
- Create: `BugRail-Next/backend/src/routes/testcases.js`
- Modify: `BugRail-Next/backend/src/app.js` — mount `app.use('/api/testcases', requireAuth, testCasesRouter)`
- Test: `BugRail-Next/backend/tests/testcases.test.js`

**Interfaces:**
- Consumes: `requireAuth` (Task 3), `moduleAbbrev`/`nextId` (Task 2 `src/lib/idgen.js`), `prisma` (Task 2).
- Produces: `TestCase` rows consumable by Bug routes (`testCaseId`) and by the frontend `/testcase/summary` page.

- [ ] **Step 1: Write failing integration test**

`tests/testcases.test.js`:
```js
process.env.JWT_SECRET = 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const request = require('supertest');
const bcrypt = require('bcrypt');
const prisma = require('../src/db');
const app = require('../src/app');

let agent, fileId;

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: 'tctest@bugrail.local' } });
  const password = await bcrypt.hash('secret123', 10);
  await prisma.user.create({ data: { email: 'tctest@bugrail.local', password, role: 'ADMIN' } });
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'tctest@bugrail.local', password: 'secret123' });
  const file = await agent.post('/api/files').send({ name: 'TC Test File' });
  fileId = file.body.id;
});

afterAll(async () => {
  await prisma.testCase.deleteMany({ where: { fileId } });
  await prisma.fileGroup.delete({ where: { id: fileId } });
  await prisma.user.deleteMany({ where: { email: 'tctest@bugrail.local' } });
  await prisma.$disconnect();
});

test('creates a test case with an auto-generated module-prefixed id', async () => {
  const res = await agent.post('/api/testcases').send({
    fileId, module: 'Login', scenario: 'User can log in', testCase: 'Valid credentials'
  });
  expect(res.status).toBe(201);
  expect(res.body.id).toMatch(/^LOG-\d{4}$/);
  expect(res.body.status).toBe('OPEN');
});

test('lists test cases filtered by fileId and module', async () => {
  await agent.post('/api/testcases').send({ fileId, module: 'Checkout', scenario: 'Pay', testCase: 'Valid card' });
  const res = await agent.get(`/api/testcases?fileId=${fileId}&module=Login`);
  expect(res.status).toBe(200);
  expect(res.body.every(t => t.module === 'Login')).toBe(true);
});

test('updates and deletes a test case', async () => {
  const created = await agent.post('/api/testcases').send({ fileId, module: 'Search', scenario: 'S', testCase: 'T' });
  const id = created.body.id;

  const updated = await agent.patch(`/api/testcases/${id}`).send({ status: 'PASSED' });
  expect(updated.status).toBe(200);
  expect(updated.body.status).toBe('PASSED');

  const del = await agent.delete(`/api/testcases/${id}`);
  expect(del.status).toBe(200);
});

test('duplicates a test case as Open with a fresh id', async () => {
  const created = await agent.post('/api/testcases').send({ fileId, module: 'Login', scenario: 'S2', testCase: 'T2', status: 'FAILED' });
  const dup = await agent.post(`/api/testcases/${created.body.id}/duplicate`);
  expect(dup.status).toBe(201);
  expect(dup.body.id).not.toBe(created.body.id);
  expect(dup.body.status).toBe('OPEN');
});

test('by-module groups rows by module', async () => {
  const res = await agent.get(`/api/testcases/by-module?fileId=${fileId}`);
  expect(res.status).toBe(200);
  expect(Array.isArray(res.body)).toBe(true);
  expect(res.body[0]).toHaveProperty('module');
  expect(res.body[0]).toHaveProperty('rows');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- testcases.test.js`
Expected: FAIL — 404s (route not mounted)

- [ ] **Step 3: Write `src/routes/testcases.js`**

```js
const express = require('express');
const prisma = require('../db');
const { moduleAbbrev, nextId } = require('../lib/idgen');

const router = express.Router();

router.get('/', async (req, res) => {
  const { fileId, module, typeTest, status, search } = req.query;
  const where = {};
  if (fileId) where.fileId = fileId;
  if (module) where.module = module;
  if (typeTest) where.typeTest = typeTest;
  if (status) where.status = status;
  if (search){
    where.OR = [
      { scenario: { contains: search, mode: 'insensitive' } },
      { testCase: { contains: search, mode: 'insensitive' } },
      { module: { contains: search, mode: 'insensitive' } }
    ];
  }
  const rows = await prisma.testCase.findMany({ where, orderBy: { id: 'asc' } });
  res.json(rows);
});

router.get('/by-module', async (req, res) => {
  const { fileId, module, typeTest, status, search } = req.query;
  const where = {};
  if (fileId) where.fileId = fileId;
  if (module) where.module = module;
  if (typeTest) where.typeTest = typeTest;
  if (status) where.status = status;
  if (search){
    where.OR = [
      { scenario: { contains: search, mode: 'insensitive' } },
      { testCase: { contains: search, mode: 'insensitive' } },
      { module: { contains: search, mode: 'insensitive' } }
    ];
  }
  const rows = await prisma.testCase.findMany({ where, orderBy: [{ module: 'asc' }, { id: 'asc' }] });
  const groups = [];
  for (const row of rows){
    let group = groups.find(g => g.module === row.module);
    if (!group){ group = { module: row.module, rows: [] }; groups.push(group); }
    group.rows.push(row);
  }
  res.json(groups);
});

router.get('/:id', async (req, res) => {
  const row = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!row) return res.status(404).json({ error: 'Test case not found' });
  res.json(row);
});

router.post('/', async (req, res) => {
  const { fileId, module, roleUser, scenario, testCase, preconditions, steps, testData, typeTest, expectedResult } = req.body;
  if (!fileId || !module || !scenario || !testCase){
    return res.status(400).json({ error: 'fileId, module, scenario, and testCase are required' });
  }
  const id = await nextId(moduleAbbrev(module));
  const row = await prisma.testCase.create({
    data: {
      id, fileId, module, roleUser, scenario, testCase, preconditions, steps, testData,
      typeTest: typeTest || 'POSITIVE', expectedResult
    }
  });
  res.status(201).json(row);
});

router.patch('/:id', async (req, res) => {
  const { module, roleUser, scenario, testCase, preconditions, steps, testData, typeTest, expectedResult, actualResult, status, executionDate } = req.body;
  try {
    const row = await prisma.testCase.update({
      where: { id: req.params.id },
      data: { module, roleUser, scenario, testCase, preconditions, steps, testData, typeTest, expectedResult, actualResult, status, executionDate: executionDate ? new Date(executionDate) : undefined }
    });
    res.json(row);
  } catch {
    res.status(404).json({ error: 'Test case not found' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.testCase.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'Test case not found' });
  }
});

router.post('/:id/duplicate', async (req, res) => {
  const original = await prisma.testCase.findUnique({ where: { id: req.params.id } });
  if (!original) return res.status(404).json({ error: 'Test case not found' });
  const id = await nextId(moduleAbbrev(original.module));
  const row = await prisma.testCase.create({
    data: {
      id, fileId: original.fileId, module: original.module, roleUser: original.roleUser,
      scenario: original.scenario, testCase: original.testCase, preconditions: original.preconditions,
      steps: original.steps, testData: original.testData, typeTest: original.typeTest,
      expectedResult: original.expectedResult, status: 'OPEN'
    }
  });
  res.status(201).json(row);
});

module.exports = router;
```

- [ ] **Step 4: Mount the router in `src/app.js`**

Add with the other requires:
```js
const testCasesRouter = require('./routes/testcases');
```
Add after the files mount:
```js
app.use('/api/testcases', requireAuth, testCasesRouter);
```
Note the route order matters: `router.get('/by-module', ...)` must be declared before `router.get('/:id', ...)` inside `testcases.js` (it already is, in Step 3) so Express doesn't treat `by-module` as an `:id` value.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test -- testcases.test.js`
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add BugRail-Next/backend/src BugRail-Next/backend/tests
git commit -m "feat: test case CRUD + by-module grouped endpoint"
```

---

### Task 6: Bug Status GET route + Bug CRUD routes (tester forced server-side)

**Files:**
- Create: `BugRail-Next/backend/src/routes/bugStatuses.js`
- Create: `BugRail-Next/backend/src/routes/bugs.js`
- Modify: `BugRail-Next/backend/src/app.js` — mount both routers
- Test: `BugRail-Next/backend/tests/bugs.test.js`

**Interfaces:**
- Consumes: `requireAuth` (Task 3, sets `req.user.id`), `nextId` (Task 2), `prisma` (Task 2), existing `TestCase`/`FileGroup` rows (Tasks 4-5).
- Produces: `Bug` rows with `tester` always resolved from the session, never the request body.

- [ ] **Step 1: Write failing integration test**

`tests/bugs.test.js`:
```js
process.env.JWT_SECRET = 'test-secret';
process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;

const request = require('supertest');
const bcrypt = require('bcrypt');
const prisma = require('../src/db');
const app = require('../src/app');

let agent, userId, fileId;

beforeAll(async () => {
  await prisma.user.deleteMany({ where: { email: 'bugtest@bugrail.local' } });
  const password = await bcrypt.hash('secret123', 10);
  const user = await prisma.user.create({ data: { email: 'bugtest@bugrail.local', password, role: 'USER' } });
  userId = user.id;
  agent = request.agent(app);
  await agent.post('/api/auth/login').send({ email: 'bugtest@bugrail.local', password: 'secret123' });
  const file = await agent.post('/api/files').send({ name: 'Bug Test File' });
  fileId = file.body.id;
});

afterAll(async () => {
  await prisma.bug.deleteMany({ where: { fileId } });
  await prisma.fileGroup.delete({ where: { id: fileId } });
  await prisma.user.deleteMany({ where: { email: 'bugtest@bugrail.local' } });
  await prisma.$disconnect();
});

test('GET /api/bug-statuses returns 6 seeded statuses ordered', async () => {
  const res = await agent.get('/api/bug-statuses');
  expect(res.status).toBe(200);
  expect(res.body.length).toBe(6);
  expect(res.body[0].order).toBeLessThan(res.body[1].order);
});

test('creates a bug with tester forced to the logged-in user, ignoring body testerId', async () => {
  const res = await agent.post('/api/bugs').send({
    fileId, title: 'Login button broken', actualResult: 'Nothing happens on click',
    statusCode: 'OPEN', testerId: 'someone-else-id'
  });
  expect(res.status).toBe(201);
  expect(res.body.testerId).toBe(userId);
});

test('lists bugs filtered by fileId and status', async () => {
  const res = await agent.get(`/api/bugs?fileId=${fileId}&status=OPEN`);
  expect(res.status).toBe(200);
  expect(res.body.every(b => b.statusCode === 'OPEN')).toBe(true);
});

test('updates and deletes a bug', async () => {
  const created = await agent.post('/api/bugs').send({ fileId, title: 'X', actualResult: 'Y', statusCode: 'OPEN' });
  const id = created.body.id;

  const updated = await agent.patch(`/api/bugs/${id}`).send({ statusCode: 'CLOSED' });
  expect(updated.status).toBe(200);
  expect(updated.body.statusCode).toBe('CLOSED');

  const del = await agent.delete(`/api/bugs/${id}`);
  expect(del.status).toBe(200);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- bugs.test.js`
Expected: FAIL — 404s (routes not mounted)

- [ ] **Step 3: Write `src/routes/bugStatuses.js`**

```js
const express = require('express');
const prisma = require('../db');

const router = express.Router();

router.get('/', async (req, res) => {
  const statuses = await prisma.bugStatus.findMany({ orderBy: { order: 'asc' } });
  res.json(statuses);
});

module.exports = router;
```

- [ ] **Step 4: Write `src/routes/bugs.js`**

```js
const express = require('express');
const prisma = require('../db');
const { nextId } = require('../lib/idgen');

const router = express.Router();

router.get('/', async (req, res) => {
  const { fileId, module, severity, priority, status, testerId, search } = req.query;
  const where = {};
  if (fileId) where.fileId = fileId;
  if (module) where.module = module;
  if (severity) where.severity = severity;
  if (priority) where.priority = priority;
  if (status) where.statusCode = status;
  if (testerId) where.testerId = testerId;
  if (search){
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { description: { contains: search, mode: 'insensitive' } }
    ];
  }
  const rows = await prisma.bug.findMany({ where, orderBy: { reportDate: 'desc' }, include: { tester: { select: { id: true, email: true } }, status: true } });
  res.json(rows);
});

router.get('/:id', async (req, res) => {
  const row = await prisma.bug.findUnique({ where: { id: req.params.id }, include: { tester: { select: { id: true, email: true } }, status: true } });
  if (!row) return res.status(404).json({ error: 'Bug not found' });
  res.json(row);
});

router.post('/', async (req, res) => {
  const { fileId, testCaseId, module, scenario, expectedResult, steps, title, description, actualResult, severity, priority, statusCode, environment, browser, os, device, buildVersion, attachments } = req.body;
  if (!fileId || !title || !actualResult){
    return res.status(400).json({ error: 'fileId, title, and actualResult are required' });
  }
  const id = await nextId('BUG');
  const row = await prisma.bug.create({
    data: {
      id, fileId, testCaseId: testCaseId || null, module, scenario, expectedResult, steps,
      title, description, actualResult, severity: severity || 'MEDIUM', priority: priority || 'MEDIUM',
      statusCode: statusCode || 'OPEN', testerId: req.user.id,
      environment, browser, os, device, buildVersion, attachments
    }
  });
  res.status(201).json(row);
});

router.patch('/:id', async (req, res) => {
  const { module, scenario, expectedResult, steps, title, description, actualResult, severity, priority, statusCode, environment, browser, os, device, buildVersion, attachments } = req.body;
  try {
    const row = await prisma.bug.update({
      where: { id: req.params.id },
      data: { module, scenario, expectedResult, steps, title, description, actualResult, severity, priority, statusCode, environment, browser, os, device, buildVersion, attachments }
    });
    res.json(row);
  } catch {
    res.status(404).json({ error: 'Bug not found' });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await prisma.bug.delete({ where: { id: req.params.id } });
    res.json({ ok: true });
  } catch {
    res.status(404).json({ error: 'Bug not found' });
  }
});

module.exports = router;
```

- [ ] **Step 5: Mount both routers in `src/app.js`**

Add with the other requires:
```js
const bugsRouter = require('./routes/bugs');
const bugStatusesRouter = require('./routes/bugStatuses');
```
Add after the testcases mount:
```js
app.use('/api/bugs', requireAuth, bugsRouter);
app.use('/api/bug-statuses', requireAuth, bugStatusesRouter);
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npm test -- bugs.test.js`
Expected: PASS (4 tests)

- [ ] **Step 7: Run the full backend suite**

Run: `npm test`
Expected: All backend tests pass (auth, files, testcases, bugs, idgen, jwt).

- [ ] **Step 8: Commit**

```bash
git add BugRail-Next/backend/src BugRail-Next/backend/tests
git commit -m "feat: bug status + bug CRUD routes with server-forced tester"
```

---

## Frontend

### Task 7: Frontend scaffold (Next.js + Tailwind) + API/session libs

**Files:**
- Create: `BugRail-Next/frontend/package.json`
- Create: `BugRail-Next/frontend/next.config.js`
- Create: `BugRail-Next/frontend/tailwind.config.js`
- Create: `BugRail-Next/frontend/postcss.config.js`
- Create: `BugRail-Next/frontend/app/globals.css`
- Create: `BugRail-Next/frontend/app/layout.js`
- Create: `BugRail-Next/frontend/.env.local`
- Create: `BugRail-Next/frontend/lib/api.js`
- Test: `BugRail-Next/frontend/lib/api.test.js`
- Create: `BugRail-Next/frontend/vitest.config.js`

**Interfaces:**
- Produces: `lib/api.js` exports `apiFetch(path, options)` → Promise resolving to parsed JSON, throwing `Error(message)` on non-2xx (reads `{ error }` from body). Base URL from `process.env.NEXT_PUBLIC_API_URL`. Always sends `credentials: 'include'`.
- Later tasks (8-11) build on `apiFetch` for every backend call.

- [ ] **Step 1: Scaffold Next.js app**

```bash
cd BugRail-Next
npx create-next-app@latest frontend --js --tailwind --eslint --app --no-src-dir --import-alias "@/*"
```
Answer prompts: no TypeScript, Tailwind yes, App Router yes, `src/` directory no.

- [ ] **Step 2: Install test tooling**

```bash
cd frontend
npm install -D vitest @vitejs/plugin-react jsdom
```

- [ ] **Step 3: Write `vitest.config.js`**

```js
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  test: { environment: 'jsdom', globals: true }
});
```

Add to `package.json` `scripts`: `"test": "vitest run"`.

- [ ] **Step 4: Write `.env.local`**

```
NEXT_PUBLIC_API_URL=http://localhost:4000/api
```

- [ ] **Step 5: Write failing test for `apiFetch`**

`lib/api.test.js`:
```js
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { apiFetch } from './api';

beforeEach(() => {
  global.fetch = vi.fn();
});

describe('apiFetch', () => {
  test('resolves with parsed JSON on success', async () => {
    global.fetch.mockResolvedValue({ ok: true, json: async () => ({ hello: 'world' }) });
    const result = await apiFetch('/ping');
    expect(result).toEqual({ hello: 'world' });
    expect(global.fetch).toHaveBeenCalledWith(
      expect.stringContaining('/ping'),
      expect.objectContaining({ credentials: 'include' })
    );
  });

  test('throws the backend error message on failure', async () => {
    global.fetch.mockResolvedValue({ ok: false, json: async () => ({ error: 'Not authenticated' }) });
    await expect(apiFetch('/private')).rejects.toThrow('Not authenticated');
  });
});
```

- [ ] **Step 6: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './api'` (or similar)

- [ ] **Step 7: Write `lib/api.js`**

```js
const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export async function apiFetch(path, options = {}){
  const res = await fetch(`${BASE_URL}${path}`, {
    credentials: 'include',
    headers: options.body ? { 'Content-Type': 'application/json' } : undefined,
    ...options
  });
  const data = await res.json().catch(() => null);
  if (!res.ok){
    throw new Error((data && data.error) || 'Request failed');
  }
  return data;
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npm test`
Expected: PASS (2 tests)

- [ ] **Step 9: Write minimal `app/layout.js` and `app/globals.css`**

`app/globals.css` (Tailwind directives, already generated by `create-next-app` — verify it contains):
```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

`app/layout.js`:
```jsx
import './globals.css';

export const metadata = { title: 'BugRail', description: 'QA test case & bug tracking' };

export default function RootLayout({ children }){
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900">{children}</body>
    </html>
  );
}
```

- [ ] **Step 10: Verify the dev server boots**

Run: `npm run dev`
Expected: Next.js starts on `http://localhost:3000` with no build errors (default `app/page.js` renders). Stop the server after confirming.

- [ ] **Step 11: Commit**

```bash
git add BugRail-Next/frontend
git commit -m "chore: scaffold frontend (next.js + tailwind), api fetch lib"
```

---

### Task 8: Session lib, auth middleware, login page

**Files:**
- Create: `BugRail-Next/frontend/lib/session.js`
- Create: `BugRail-Next/frontend/middleware.js`
- Create: `BugRail-Next/frontend/app/login/page.js`
- Create: `BugRail-Next/frontend/app/page.js` (Modify: replace scaffold default with a redirect)

**Interfaces:**
- Consumes: `apiFetch` (Task 7).
- Produces: `lib/session.js` exports `getSession()` — server-only helper for use inside Server Components; calls the backend `/auth/me` forwarding the incoming request's cookie header.
- Produces: `middleware.js` redirects unauthenticated requests to `/login` for any path under `/testcase` or `/bugreport`.

- [ ] **Step 1: Write `lib/session.js`**

```js
import { cookies } from 'next/headers';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

export async function getSession(){
  const cookieStore = cookies();
  const token = cookieStore.get('brn_token');
  if (!token) return null;
  const res = await fetch(`${BASE_URL}/auth/me`, {
    headers: { cookie: `brn_token=${token.value}` },
    cache: 'no-store'
  });
  if (!res.ok) return null;
  return res.json();
}
```

- [ ] **Step 2: Write `middleware.js`**

```js
import { NextResponse } from 'next/server';

export function middleware(request){
  const token = request.cookies.get('brn_token');
  const isProtected = request.nextUrl.pathname.startsWith('/testcase') || request.nextUrl.pathname.startsWith('/bugreport');
  if (isProtected && !token){
    return NextResponse.redirect(new URL('/login', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/testcase/:path*', '/bugreport/:path*']
};
```

Note: this only checks cookie *presence*, not validity (Next.js Edge middleware can't call the backend cheaply on every request) — expired/invalid tokens are caught by `getSession()` returning `null` in each page (Task 9+), which redirects there instead.

- [ ] **Step 3: Write `app/login/page.js`**

```jsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function LoginPage(){
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  async function handleSubmit(e){
    e.preventDefault();
    setError('');
    try {
      await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
      router.push('/testcase');
    } catch (err){
      setError(err.message);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-white p-8 rounded-lg shadow space-y-4">
        <h1 className="text-xl font-bold">BugRail Login</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div>
          <label className="block text-sm font-medium mb-1">Email</label>
          <input
            type="email" required value={email} onChange={e => setEmail(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <div>
          <label className="block text-sm font-medium mb-1">Password</label>
          <input
            type="password" required value={password} onChange={e => setPassword(e.target.value)}
            className="w-full border rounded px-3 py-2 text-sm"
          />
        </div>
        <button type="submit" className="w-full bg-blue-600 text-white rounded py-2 text-sm font-semibold hover:bg-blue-700">
          Login
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Write `app/page.js` redirect**

```jsx
import { redirect } from 'next/navigation';

export default function HomePage(){
  redirect('/testcase');
}
```

- [ ] **Step 5: Manual verification**

Run backend (`npm run dev` in `BugRail-Next/backend`) and frontend (`npm run dev` in `BugRail-Next/frontend`). Visit `http://localhost:3000` → expect redirect to `/login` (via middleware, since `/` itself redirects to `/testcase` which is protected). Log in with `admin@bugrail.local` / `admin123` (seeded in Task 1) → expect redirect to `/testcase` (will 404 until Task 9, that's expected at this point).

- [ ] **Step 6: Commit**

```bash
git add BugRail-Next/frontend/lib/session.js BugRail-Next/frontend/middleware.js BugRail-Next/frontend/app
git commit -m "feat: session helper, auth middleware, login page"
```

---

### Task 9: Protected layout (sidebar/topbar), shared FileGrid component

**Files:**
- Create: `BugRail-Next/frontend/app/(app)/layout.js`
- Create: `BugRail-Next/frontend/components/Sidebar.js`
- Create: `BugRail-Next/frontend/components/Topbar.js`
- Create: `BugRail-Next/frontend/components/FileGrid.js`
- Test: `BugRail-Next/frontend/components/FileGrid.test.js`

**Interfaces:**
- Consumes: `getSession()` (Task 8), `apiFetch` (Task 7).
- Produces: `(app)/layout.js` wraps every page under `/testcase/*` and `/bugreport/*` with sidebar+topbar, redirecting to `/login` server-side if `getSession()` returns null.
- Produces: `FileGrid` component — props `{ files: [{id, name, count}], countLabel: string, onOpen(fileId) }`, used identically by Test Case and Bug Report landing pages (Tasks 10 and 12).

- [ ] **Step 1: Install React Testing Library**

```bash
cd BugRail-Next/frontend
npm install -D @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: Write failing test for `FileGrid`**

`components/FileGrid.test.js`:
```js
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import FileGrid from './FileGrid';

describe('FileGrid', () => {
  test('renders a card per file with its count label', () => {
    render(<FileGrid files={[{ id: 'f1', name: 'Sprint 1', count: 3 }]} countLabel="test case" onOpen={() => {}} />);
    expect(screen.getByText('Sprint 1')).toBeInTheDocument();
    expect(screen.getByText('3 test case')).toBeInTheDocument();
  });

  test('calls onOpen with the file id when clicked', () => {
    const onOpen = vi.fn();
    render(<FileGrid files={[{ id: 'f1', name: 'Sprint 1', count: 0 }]} countLabel="bug" onOpen={onOpen} />);
    fireEvent.click(screen.getByText('Sprint 1'));
    expect(onOpen).toHaveBeenCalledWith('f1');
  });

  test('shows an empty-state message when there are no files', () => {
    render(<FileGrid files={[]} countLabel="test case" onOpen={() => {}} />);
    expect(screen.getByText(/belum ada file/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './FileGrid'`

- [ ] **Step 4: Write `components/FileGrid.js`**

```jsx
'use client';

export default function FileGrid({ files, countLabel, onOpen }){
  if (!files.length){
    return <p className="text-sm text-slate-400 text-center py-8">📁 Belum ada file.</p>;
  }
  return (
    <div className="grid gap-4" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
      {files.map(f => (
        <div
          key={f.id}
          onClick={() => onOpen(f.id)}
          className="bg-white rounded-lg shadow p-4 cursor-pointer hover:shadow-md transition"
        >
          <h3 className="font-semibold text-sm">📁 {f.name}</h3>
          <p className="text-xs text-slate-400 mt-2">{f.count} {countLabel}</p>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm test`
Expected: PASS (3 tests)

- [ ] **Step 6: Write `components/Sidebar.js`**

```jsx
'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/testcase', label: 'Test Case' },
  { href: '/bugreport', label: 'Bug Report' }
];

export default function Sidebar(){
  const pathname = usePathname();
  return (
    <aside className="w-56 bg-slate-900 text-slate-200 min-h-screen p-4">
      <div className="font-bold text-lg mb-6">BugRail</div>
      <nav className="space-y-1">
        {ITEMS.map(item => (
          <Link
            key={item.href}
            href={item.href}
            className={`block px-3 py-2 rounded text-sm font-medium ${pathname.startsWith(item.href) ? 'bg-blue-600 text-white' : 'hover:bg-slate-800'}`}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </aside>
  );
}
```

- [ ] **Step 7: Write `components/Topbar.js`**

```jsx
'use client';

import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';

export default function Topbar({ user }){
  const router = useRouter();

  async function handleLogout(){
    await apiFetch('/auth/logout', { method: 'POST' });
    router.push('/login');
  }

  return (
    <header className="flex items-center justify-between bg-white border-b px-6 py-3">
      <div />
      <div className="flex items-center gap-3 text-sm">
        <span>{user.email} <span className="text-slate-400">({user.role})</span></span>
        <button onClick={handleLogout} className="text-red-600 font-medium hover:underline">Logout</button>
      </div>
    </header>
  );
}
```

- [ ] **Step 8: Write `app/(app)/layout.js`**

```jsx
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/session';
import Sidebar from '@/components/Sidebar';
import Topbar from '@/components/Topbar';

export default async function AppLayout({ children }){
  const user = await getSession();
  if (!user) redirect('/login');

  return (
    <div className="flex">
      <Sidebar />
      <div className="flex-1 min-h-screen">
        <Topbar user={user} />
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
```

- [ ] **Step 9: Commit**

```bash
git add BugRail-Next/frontend/components BugRail-Next/frontend/app
git commit -m "feat: protected app layout (sidebar/topbar) + shared FileGrid"
```

---

### Task 10: Test Case landing page (file grid) + create-file flow

**Files:**
- Create: `BugRail-Next/frontend/app/(app)/testcase/page.js`
- Create: `BugRail-Next/frontend/components/NewFileButton.js`
- Test: `BugRail-Next/frontend/components/NewFileButton.test.js`

**Interfaces:**
- Consumes: `apiFetch` (Task 7), `FileGrid` (Task 9).
- Produces: `NewFileButton` — props `{ onCreated(file) }`, reused identically on the Bug Report landing page (Task 12).

- [ ] **Step 1: Write failing test for `NewFileButton`**

`components/NewFileButton.test.js`:
```js
import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import NewFileButton from './NewFileButton';

vi.mock('@/lib/api', () => ({ apiFetch: vi.fn() }));
import { apiFetch } from '@/lib/api';

beforeEach(() => { vi.clearAllMocks(); });

describe('NewFileButton', () => {
  test('prompts for a name, posts it, and calls onCreated', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue('Sprint 5');
    apiFetch.mockResolvedValue({ id: 'f9', name: 'Sprint 5' });
    const onCreated = vi.fn();

    render(<NewFileButton onCreated={onCreated} />);
    fireEvent.click(screen.getByText(/file baru/i));

    await waitFor(() => expect(onCreated).toHaveBeenCalledWith({ id: 'f9', name: 'Sprint 5' }));
    expect(apiFetch).toHaveBeenCalledWith('/files', { method: 'POST', body: JSON.stringify({ name: 'Sprint 5' }) });
  });

  test('does nothing if the prompt is cancelled', async () => {
    vi.spyOn(window, 'prompt').mockReturnValue(null);
    const onCreated = vi.fn();

    render(<NewFileButton onCreated={onCreated} />);
    fireEvent.click(screen.getByText(/file baru/i));

    expect(apiFetch).not.toHaveBeenCalled();
    expect(onCreated).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './NewFileButton'`

- [ ] **Step 3: Write `components/NewFileButton.js`**

```jsx
'use client';

import { apiFetch } from '@/lib/api';

export default function NewFileButton({ onCreated }){
  async function handleClick(){
    const name = window.prompt('Nama file, misal: Sprint 12');
    if (!name || !name.trim()) return;
    const file = await apiFetch('/files', { method: 'POST', body: JSON.stringify({ name: name.trim() }) });
    onCreated(file);
  }

  return (
    <button onClick={handleClick} className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded hover:bg-blue-700">
      + File Baru
    </button>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (2 tests)

- [ ] **Step 5: Write `app/(app)/testcase/page.js`**

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import FileGrid from '@/components/FileGrid';
import NewFileButton from '@/components/NewFileButton';

export default function TestCaseLandingPage(){
  const router = useRouter();
  const [files, setFiles] = useState([]);
  const [counts, setCounts] = useState({});

  useEffect(() => {
    apiFetch('/files').then(async (list) => {
      setFiles(list);
      const entries = await Promise.all(list.map(async f => {
        const rows = await apiFetch(`/testcases?fileId=${f.id}`);
        return [f.id, rows.length];
      }));
      setCounts(Object.fromEntries(entries));
    });
  }, []);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-slate-500">Klik file untuk lihat isinya, atau buat file baru:</span>
        <NewFileButton onCreated={(file) => setFiles(prev => [...prev, file])} />
      </div>
      <FileGrid
        files={files.map(f => ({ id: f.id, name: f.name, count: counts[f.id] ?? 0 }))}
        countLabel="test case"
        onOpen={(fileId) => router.push(`/testcase/${fileId}`)}
      />
    </div>
  );
}
```

- [ ] **Step 6: Manual verification**

With both servers running and logged in, visit `/testcase` → expect the file grid to render (empty state initially), clicking "+ File Baru" prompts for a name and adds a card.

- [ ] **Step 7: Commit**

```bash
git add BugRail-Next/frontend/app/\(app\)/testcase BugRail-Next/frontend/components/NewFileButton.js BugRail-Next/frontend/components/NewFileButton.test.js
git commit -m "feat: test case landing page (file grid)"
```

---

### Task 11: Test Case detail table page (CRUD)

**Files:**
- Create: `BugRail-Next/frontend/app/(app)/testcase/[fileId]/page.js`
- Create: `BugRail-Next/frontend/components/TestCaseForm.js`
- Create: `BugRail-Next/frontend/components/TestCaseTable.js`
- Test: `BugRail-Next/frontend/components/TestCaseTable.test.js`

**Interfaces:**
- Consumes: `apiFetch` (Task 7).
- Produces: `TestCaseTable` — props `{ rows, onEdit(row), onDuplicate(row), onDelete(row) }`, pure presentational component.
- Produces: `TestCaseForm` — props `{ initial, onSubmit(data), onCancel }`, used both for create and edit.

- [ ] **Step 1: Write failing test for `TestCaseTable`**

`components/TestCaseTable.test.js`:
```js
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import TestCaseTable from './TestCaseTable';

const ROWS = [
  { id: 'LOG-0001', module: 'Login', roleUser: 'User', scenario: 'Can log in', testCase: 'Valid creds', typeTest: 'POSITIVE', status: 'PASSED', executionDate: '2026-08-01T00:00:00.000Z' }
];

describe('TestCaseTable', () => {
  test('renders one row per test case with its fields', () => {
    render(<TestCaseTable rows={ROWS} onEdit={() => {}} onDuplicate={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('LOG-0001')).toBeInTheDocument();
    expect(screen.getByText('Login')).toBeInTheDocument();
    expect(screen.getByText('Can log in')).toBeInTheDocument();
    expect(screen.getByText('PASSED')).toBeInTheDocument();
  });

  test('calls onEdit with the row when Edit is clicked', () => {
    const onEdit = vi.fn();
    render(<TestCaseTable rows={ROWS} onEdit={onEdit} onDuplicate={() => {}} onDelete={() => {}} />);
    fireEvent.click(screen.getByTitle('Edit'));
    expect(onEdit).toHaveBeenCalledWith(ROWS[0]);
  });

  test('shows an empty-state message with no rows', () => {
    render(<TestCaseTable rows={[]} onEdit={() => {}} onDuplicate={() => {}} onDelete={() => {}} />);
    expect(screen.getByText(/belum ada test case/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './TestCaseTable'`

- [ ] **Step 3: Write `components/TestCaseTable.js`**

```jsx
'use client';

function formatDate(iso){
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID');
}

export default function TestCaseTable({ rows, onEdit, onDuplicate, onDelete }){
  if (!rows.length){
    return <p className="text-sm text-slate-400 text-center py-8">Belum ada test case.</p>;
  }
  return (
    <table className="w-full text-sm bg-white rounded-lg overflow-hidden shadow">
      <thead className="bg-slate-100 text-left">
        <tr>
          <th className="px-3 py-2">ID</th>
          <th className="px-3 py-2">Module</th>
          <th className="px-3 py-2">Role User</th>
          <th className="px-3 py-2">Scenario</th>
          <th className="px-3 py-2">Test Case</th>
          <th className="px-3 py-2">Type Test</th>
          <th className="px-3 py-2">Status</th>
          <th className="px-3 py-2">Tgl Eksekusi</th>
          <th className="px-3 py-2">Aksi</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.id} className="border-t">
            <td className="px-3 py-2 font-mono">{row.id}</td>
            <td className="px-3 py-2">{row.module}</td>
            <td className="px-3 py-2">{row.roleUser || '-'}</td>
            <td className="px-3 py-2">{row.scenario}</td>
            <td className="px-3 py-2">{row.testCase}</td>
            <td className="px-3 py-2">{row.typeTest}</td>
            <td className="px-3 py-2">{row.status}</td>
            <td className="px-3 py-2">{formatDate(row.executionDate)}</td>
            <td className="px-3 py-2 space-x-2">
              <button title="Edit" onClick={() => onEdit(row)} className="text-blue-600 hover:underline">Edit</button>
              <button title="Duplicate" onClick={() => onDuplicate(row)} className="text-slate-600 hover:underline">Dup</button>
              <button title="Delete" onClick={() => onDelete(row)} className="text-red-600 hover:underline">Del</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (3 tests)

- [ ] **Step 5: Write `components/TestCaseForm.js`**

```jsx
'use client';

import { useState } from 'react';

const EMPTY = { module: '', roleUser: '', scenario: '', testCase: '', preconditions: '', steps: '', testData: '', typeTest: 'POSITIVE', expectedResult: '', actualResult: '', status: 'OPEN' };

export default function TestCaseForm({ initial, onSubmit, onCancel }){
  const [data, setData] = useState({ ...EMPTY, ...initial });

  function set(field){
    return (e) => setData(prev => ({ ...prev, [field]: e.target.value }));
  }

  function handleSubmit(e){
    e.preventDefault();
    onSubmit(data);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-3 max-w-lg">
      <h2 className="font-bold">{initial ? `Edit Test Case — ${initial.id}` : 'Tambah Test Case'}</h2>
      <input required placeholder="Module" value={data.module} onChange={set('module')} className="w-full border rounded px-3 py-2 text-sm" />
      <input placeholder="Role User" value={data.roleUser} onChange={set('roleUser')} className="w-full border rounded px-3 py-2 text-sm" />
      <input required placeholder="Scenario" value={data.scenario} onChange={set('scenario')} className="w-full border rounded px-3 py-2 text-sm" />
      <input required placeholder="Test Case" value={data.testCase} onChange={set('testCase')} className="w-full border rounded px-3 py-2 text-sm" />
      <textarea placeholder="Steps" value={data.steps} onChange={set('steps')} className="w-full border rounded px-3 py-2 text-sm" />
      <textarea placeholder="Expected Result" value={data.expectedResult} onChange={set('expectedResult')} className="w-full border rounded px-3 py-2 text-sm" />
      <textarea placeholder="Actual Result" value={data.actualResult} onChange={set('actualResult')} className="w-full border rounded px-3 py-2 text-sm" />
      <select value={data.typeTest} onChange={set('typeTest')} className="w-full border rounded px-3 py-2 text-sm">
        <option value="POSITIVE">Positive</option>
        <option value="NEGATIVE">Negative</option>
      </select>
      <select value={data.status} onChange={set('status')} className="w-full border rounded px-3 py-2 text-sm">
        {['OPEN', 'PASSED', 'FAILED', 'BLOCKED', 'RETEST'].map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm rounded border">Batal</button>
        <button type="submit" className="px-4 py-2 text-sm rounded bg-blue-600 text-white">Simpan</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Write `app/(app)/testcase/[fileId]/page.js`**

```jsx
'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import TestCaseTable from '@/components/TestCaseTable';
import TestCaseForm from '@/components/TestCaseForm';

export default function TestCaseFilePage({ params }){
  const { fileId } = params;
  const [rows, setRows] = useState([]);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  async function load(){
    const data = await apiFetch(`/testcases?fileId=${fileId}`);
    setRows(data);
  }

  useEffect(() => { load(); }, [fileId]);

  async function handleSubmit(data){
    if (editing){
      await apiFetch(`/testcases/${editing.id}`, { method: 'PATCH', body: JSON.stringify(data) });
    } else {
      await apiFetch('/testcases', { method: 'POST', body: JSON.stringify({ ...data, fileId }) });
    }
    setShowForm(false);
    setEditing(null);
    load();
  }

  async function handleDelete(row){
    if (!window.confirm(`Hapus ${row.id}?`)) return;
    await apiFetch(`/testcases/${row.id}`, { method: 'DELETE' });
    load();
  }

  async function handleDuplicate(row){
    await apiFetch(`/testcases/${row.id}/duplicate`, { method: 'POST' });
    load();
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="font-bold text-lg">Test Case</h1>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded">
          + Test Case
        </button>
      </div>
      {showForm && (
        <TestCaseForm
          initial={editing}
          onSubmit={handleSubmit}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}
      <TestCaseTable
        rows={rows}
        onEdit={(row) => { setEditing(row); setShowForm(true); }}
        onDuplicate={handleDuplicate}
        onDelete={handleDelete}
      />
    </div>
  );
}
```

- [ ] **Step 7: Manual verification**

Open a file from `/testcase`, add a test case via the form, confirm it appears in the table with a `LOG-0001`-style id, edit it, duplicate it, delete it.

- [ ] **Step 8: Commit**

```bash
git add BugRail-Next/frontend/app/\(app\)/testcase BugRail-Next/frontend/components/TestCaseForm.js BugRail-Next/frontend/components/TestCaseTable.js BugRail-Next/frontend/components/TestCaseTable.test.js
git commit -m "feat: test case detail page with add/edit/duplicate/delete"
```

---

### Task 12: Test Case summary-by-module page (the originally requested table)

**Files:**
- Create: `BugRail-Next/frontend/app/(app)/testcase/summary/page.js`
- Create: `BugRail-Next/frontend/components/ModuleSummaryTable.js`
- Test: `BugRail-Next/frontend/components/ModuleSummaryTable.test.js`

**Interfaces:**
- Consumes: `apiFetch` (Task 7), the `GET /api/testcases/by-module` shape from Task 5 (`[{ module, rows: [...] }]`).
- Produces: `ModuleSummaryTable` — props `{ groups: [{ module, rows }] }`, pure presentational, collapsible per module.

- [ ] **Step 1: Write failing test for `ModuleSummaryTable`**

`components/ModuleSummaryTable.test.js`:
```js
import { describe, test, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import ModuleSummaryTable from './ModuleSummaryTable';

const GROUPS = [
  { module: 'Login', rows: [
    { id: 'LOG-0001', module: 'Login', roleUser: 'User', scenario: 'Can log in', testCase: 'Valid creds', typeTest: 'POSITIVE', status: 'PASSED', executionDate: null }
  ] },
  { module: 'Checkout', rows: [
    { id: 'CHK-0001', module: 'Checkout', roleUser: 'User', scenario: 'Pay', testCase: 'Valid card', typeTest: 'POSITIVE', status: 'OPEN', executionDate: null }
  ] }
];

describe('ModuleSummaryTable', () => {
  test('renders a section heading per module with its row count', () => {
    render(<ModuleSummaryTable groups={GROUPS} />);
    expect(screen.getByText(/Login/)).toBeInTheDocument();
    expect(screen.getByText(/Checkout/)).toBeInTheDocument();
    expect(screen.getByText('LOG-0001')).toBeInTheDocument();
    expect(screen.getByText('CHK-0001')).toBeInTheDocument();
  });

  test('collapses and expands a module section on click', () => {
    render(<ModuleSummaryTable groups={GROUPS} />);
    const loginHeading = screen.getByText(/Login/);
    fireEvent.click(loginHeading);
    expect(screen.queryByText('LOG-0001')).not.toBeInTheDocument();
    fireEvent.click(loginHeading);
    expect(screen.getByText('LOG-0001')).toBeInTheDocument();
  });

  test('shows an empty-state message with no groups', () => {
    render(<ModuleSummaryTable groups={[]} />);
    expect(screen.getByText(/belum ada test case/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './ModuleSummaryTable'`

- [ ] **Step 3: Write `components/ModuleSummaryTable.js`**

```jsx
'use client';

import { useState } from 'react';

function formatDate(iso){
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID');
}

function ModuleSection({ module, rows }){
  const [open, setOpen] = useState(true);
  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex justify-between items-center px-4 py-3 bg-slate-100 text-left font-semibold text-sm"
      >
        <span>{open ? '▾' : '▸'} {module} <span className="text-slate-400 font-normal">({rows.length} test case)</span></span>
      </button>
      {open && (
        <table className="w-full text-sm">
          <thead className="text-left border-b">
            <tr>
              <th className="px-4 py-2">ID</th>
              <th className="px-4 py-2">Module</th>
              <th className="px-4 py-2">Role User</th>
              <th className="px-4 py-2">Scenario</th>
              <th className="px-4 py-2">Test Case</th>
              <th className="px-4 py-2">Type Test</th>
              <th className="px-4 py-2">Status</th>
              <th className="px-4 py-2">Tgl Eksekusi</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(row => (
              <tr key={row.id} className="border-t">
                <td className="px-4 py-2 font-mono">{row.id}</td>
                <td className="px-4 py-2">{row.module}</td>
                <td className="px-4 py-2">{row.roleUser || '-'}</td>
                <td className="px-4 py-2">{row.scenario}</td>
                <td className="px-4 py-2">{row.testCase}</td>
                <td className="px-4 py-2">{row.typeTest}</td>
                <td className="px-4 py-2">{row.status}</td>
                <td className="px-4 py-2">{formatDate(row.executionDate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function ModuleSummaryTable({ groups }){
  if (!groups.length){
    return <p className="text-sm text-slate-400 text-center py-8">Belum ada test case.</p>;
  }
  return (
    <div className="space-y-3">
      {groups.map(g => <ModuleSection key={g.module} module={g.module} rows={g.rows} />)}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (3 tests)

- [ ] **Step 5: Write `app/(app)/testcase/summary/page.js`**

```jsx
'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import ModuleSummaryTable from '@/components/ModuleSummaryTable';

export default function TestCaseSummaryPage(){
  const [groups, setGroups] = useState([]);

  useEffect(() => {
    apiFetch('/testcases/by-module').then(setGroups);
  }, []);

  return (
    <div className="space-y-4">
      <h1 className="font-bold text-lg">Test Case per Module</h1>
      <ModuleSummaryTable groups={groups} />
    </div>
  );
}
```

- [ ] **Step 6: Add a link to the summary page from the Test Case landing page**

Modify `app/(app)/testcase/page.js` — add inside the header `div`, before `NewFileButton`:
```jsx
import Link from 'next/link';
```
And inside the toolbar `div` (before the `<NewFileButton .../>` line):
```jsx
<Link href="/testcase/summary" className="text-sm text-blue-600 hover:underline">Lihat rekap per Module</Link>
```

- [ ] **Step 7: Manual verification**

Create test cases across at least two different modules (in one or more files), visit `/testcase/summary`, confirm rows are grouped under the correct module heading with all 8 requested columns (ID, Module, Role User, Scenario, Test Case, Type Test, Status, Tgl Eksekusi), and that clicking a module heading collapses/expands it.

- [ ] **Step 8: Commit**

```bash
git add BugRail-Next/frontend/app/\(app\)/testcase BugRail-Next/frontend/components/ModuleSummaryTable.js BugRail-Next/frontend/components/ModuleSummaryTable.test.js
git commit -m "feat: test case summary grouped by module"
```

---

### Task 13: Bug Report landing page (file grid, reusing FileGrid/NewFileButton)

**Files:**
- Create: `BugRail-Next/frontend/app/(app)/bugreport/page.js`

**Interfaces:**
- Consumes: `apiFetch` (Task 7), `FileGrid` (Task 9), `NewFileButton` (Task 10).

- [ ] **Step 1: Write `app/(app)/bugreport/page.js`**

```jsx
'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { apiFetch } from '@/lib/api';
import FileGrid from '@/components/FileGrid';
import NewFileButton from '@/components/NewFileButton';

export default function BugReportLandingPage(){
  const router = useRouter();
  const [files, setFiles] = useState([]);
  const [counts, setCounts] = useState({});

  useEffect(() => {
    apiFetch('/files').then(async (list) => {
      setFiles(list);
      const entries = await Promise.all(list.map(async f => {
        const rows = await apiFetch(`/bugs?fileId=${f.id}`);
        return [f.id, rows.length];
      }));
      setCounts(Object.fromEntries(entries));
    });
  }, []);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <span className="text-sm text-slate-500">Klik file untuk lihat bug report di dalamnya. File dikelola dari halaman Test Case.</span>
        <NewFileButton onCreated={(file) => setFiles(prev => [...prev, file])} />
      </div>
      <FileGrid
        files={files.map(f => ({ id: f.id, name: f.name, count: counts[f.id] ?? 0 }))}
        countLabel="bug"
        onOpen={(fileId) => router.push(`/bugreport/${fileId}`)}
      />
    </div>
  );
}
```

- [ ] **Step 2: Manual verification**

Visit `/bugreport`, confirm the same files created from `/testcase` appear here too (shared `FileGroup` table), with bug counts (0 initially).

- [ ] **Step 3: Commit**

```bash
git add BugRail-Next/frontend/app/\(app\)/bugreport
git commit -m "feat: bug report landing page (file grid)"
```

---

### Task 14: Bug Report detail table page (CRUD, tester read-only = current user)

**Files:**
- Create: `BugRail-Next/frontend/app/(app)/bugreport/[fileId]/page.js`
- Create: `BugRail-Next/frontend/components/BugForm.js`
- Create: `BugRail-Next/frontend/components/BugTable.js`
- Test: `BugRail-Next/frontend/components/BugTable.test.js`

**Interfaces:**
- Consumes: `apiFetch` (Task 7), `getSession()` pattern from Task 8 (current user's email, passed down as a prop from the server-rendered layout via `Topbar`'s `user` — this page reads it client-side via a fresh `apiFetch('/auth/me')` call, kept independent of the layout to avoid prop-drilling through `(app)/layout.js`).
- Produces: `BugTable` — props `{ rows, onEdit(row), onDelete(row) }`.
- Produces: `BugForm` — props `{ initial, testerEmail, statuses, onSubmit(data), onCancel }`; the Tester field always renders `testerEmail` in a disabled input, never sends `testerId` in the submitted payload (server forces it per Task 6).

- [ ] **Step 1: Write failing test for `BugTable`**

`components/BugTable.test.js`:
```js
import { describe, test, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import BugTable from './BugTable';

const ROWS = [
  { id: 'BUG-0001', title: 'Login broken', module: 'Login', severity: 'HIGH', status: { name: 'Open', color: '#2563EB' }, tester: { email: 'qa@bugrail.local' }, reportDate: '2026-08-01T00:00:00.000Z' }
];

describe('BugTable', () => {
  test('renders one row per bug with tester email and status name', () => {
    render(<BugTable rows={ROWS} onEdit={() => {}} onDelete={() => {}} />);
    expect(screen.getByText('BUG-0001')).toBeInTheDocument();
    expect(screen.getByText('Login broken')).toBeInTheDocument();
    expect(screen.getByText('qa@bugrail.local')).toBeInTheDocument();
    expect(screen.getByText('Open')).toBeInTheDocument();
  });

  test('calls onDelete with the row when Delete is clicked', () => {
    const onDelete = vi.fn();
    render(<BugTable rows={ROWS} onEdit={() => {}} onDelete={onDelete} />);
    fireEvent.click(screen.getByTitle('Delete'));
    expect(onDelete).toHaveBeenCalledWith(ROWS[0]);
  });

  test('shows an empty-state message with no rows', () => {
    render(<BugTable rows={[]} onEdit={() => {}} onDelete={() => {}} />);
    expect(screen.getByText(/belum ada bug/i)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test`
Expected: FAIL — `Cannot find module './BugTable'`

- [ ] **Step 3: Write `components/BugTable.js`**

```jsx
'use client';

function formatDate(iso){
  if (!iso) return '-';
  return new Date(iso).toLocaleDateString('id-ID');
}

export default function BugTable({ rows, onEdit, onDelete }){
  if (!rows.length){
    return <p className="text-sm text-slate-400 text-center py-8">Belum ada bug report.</p>;
  }
  return (
    <table className="w-full text-sm bg-white rounded-lg overflow-hidden shadow">
      <thead className="bg-slate-100 text-left">
        <tr>
          <th className="px-3 py-2">Bug ID</th>
          <th className="px-3 py-2">Judul</th>
          <th className="px-3 py-2">Module</th>
          <th className="px-3 py-2">Severity</th>
          <th className="px-3 py-2">Status</th>
          <th className="px-3 py-2">Tester</th>
          <th className="px-3 py-2">Tanggal</th>
          <th className="px-3 py-2">Aksi</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(row => (
          <tr key={row.id} className="border-t">
            <td className="px-3 py-2 font-mono">{row.id}</td>
            <td className="px-3 py-2">{row.title}</td>
            <td className="px-3 py-2">{row.module || '-'}</td>
            <td className="px-3 py-2">{row.severity}</td>
            <td className="px-3 py-2">
              <span style={{ color: row.status?.color }}>{row.status?.name}</span>
            </td>
            <td className="px-3 py-2">{row.tester?.email}</td>
            <td className="px-3 py-2">{formatDate(row.reportDate)}</td>
            <td className="px-3 py-2 space-x-2">
              <button title="Edit" onClick={() => onEdit(row)} className="text-blue-600 hover:underline">Edit</button>
              <button title="Delete" onClick={() => onDelete(row)} className="text-red-600 hover:underline">Del</button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test`
Expected: PASS (3 tests)

- [ ] **Step 5: Write `components/BugForm.js`**

```jsx
'use client';

import { useState } from 'react';

const EMPTY = { title: '', description: '', actualResult: '', severity: 'MEDIUM', priority: 'MEDIUM', statusCode: 'OPEN', module: '', environment: '', browser: '' };

export default function BugForm({ initial, testerEmail, statuses, onSubmit, onCancel }){
  const [data, setData] = useState({ ...EMPTY, ...initial, statusCode: initial?.statusCode || initial?.status?.code || 'OPEN' });

  function set(field){
    return (e) => setData(prev => ({ ...prev, [field]: e.target.value }));
  }

  function handleSubmit(e){
    e.preventDefault();
    onSubmit(data);
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-3 max-w-lg">
      <h2 className="font-bold">{initial ? `Edit Bug — ${initial.id}` : 'Buat Bug Report'}</h2>
      <div>
        <label className="block text-xs font-medium mb-1">Tester</label>
        <input value={testerEmail} disabled className="w-full border rounded px-3 py-2 text-sm bg-slate-100 text-slate-500" />
      </div>
      <input required placeholder="Bug Title" value={data.title} onChange={set('title')} className="w-full border rounded px-3 py-2 text-sm" />
      <input placeholder="Module" value={data.module} onChange={set('module')} className="w-full border rounded px-3 py-2 text-sm" />
      <textarea placeholder="Description" value={data.description} onChange={set('description')} className="w-full border rounded px-3 py-2 text-sm" />
      <textarea required placeholder="Actual Result" value={data.actualResult} onChange={set('actualResult')} className="w-full border rounded px-3 py-2 text-sm" />
      <select value={data.severity} onChange={set('severity')} className="w-full border rounded px-3 py-2 text-sm">
        {['CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map(s => <option key={s} value={s}>{s}</option>)}
      </select>
      <select value={data.priority} onChange={set('priority')} className="w-full border rounded px-3 py-2 text-sm">
        {['HIGHEST', 'HIGH', 'MEDIUM', 'LOW'].map(p => <option key={p} value={p}>{p}</option>)}
      </select>
      <select value={data.statusCode} onChange={set('statusCode')} className="w-full border rounded px-3 py-2 text-sm">
        {statuses.map(s => <option key={s.code} value={s.code}>{s.name}</option>)}
      </select>
      <input placeholder="Environment" value={data.environment} onChange={set('environment')} className="w-full border rounded px-3 py-2 text-sm" />
      <input placeholder="Browser" value={data.browser} onChange={set('browser')} className="w-full border rounded px-3 py-2 text-sm" />
      <div className="flex justify-end gap-2 pt-2">
        <button type="button" onClick={onCancel} className="px-4 py-2 text-sm rounded border">Batal</button>
        <button type="submit" className="px-4 py-2 text-sm rounded bg-blue-600 text-white">Simpan</button>
      </div>
    </form>
  );
}
```

- [ ] **Step 6: Write `app/(app)/bugreport/[fileId]/page.js`**

```jsx
'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/api';
import BugTable from '@/components/BugTable';
import BugForm from '@/components/BugForm';

export default function BugReportFilePage({ params }){
  const { fileId } = params;
  const [rows, setRows] = useState([]);
  const [statuses, setStatuses] = useState([]);
  const [me, setMe] = useState(null);
  const [editing, setEditing] = useState(null);
  const [showForm, setShowForm] = useState(false);

  async function load(){
    const [bugs, statusList, session] = await Promise.all([
      apiFetch(`/bugs?fileId=${fileId}`),
      apiFetch('/bug-statuses'),
      apiFetch('/auth/me')
    ]);
    setRows(bugs);
    setStatuses(statusList);
    setMe(session);
  }

  useEffect(() => { load(); }, [fileId]);

  async function handleSubmit(data){
    const { statusCode, title, description, actualResult, severity, priority, module, environment, browser } = data;
    const payload = { statusCode, title, description, actualResult, severity, priority, module, environment, browser, fileId };
    if (editing){
      await apiFetch(`/bugs/${editing.id}`, { method: 'PATCH', body: JSON.stringify(payload) });
    } else {
      await apiFetch('/bugs', { method: 'POST', body: JSON.stringify(payload) });
    }
    setShowForm(false);
    setEditing(null);
    load();
  }

  async function handleDelete(row){
    if (!window.confirm(`Hapus ${row.id}?`)) return;
    await apiFetch(`/bugs/${row.id}`, { method: 'DELETE' });
    load();
  }

  if (!me) return null;

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="font-bold text-lg">Bug Report</h1>
        <button onClick={() => { setEditing(null); setShowForm(true); }} className="bg-blue-600 text-white text-sm font-semibold px-4 py-2 rounded">
          + Bug Report
        </button>
      </div>
      {showForm && (
        <BugForm
          initial={editing}
          testerEmail={me.email}
          statuses={statuses}
          onSubmit={handleSubmit}
          onCancel={() => { setShowForm(false); setEditing(null); }}
        />
      )}
      <BugTable
        rows={rows}
        onEdit={(row) => { setEditing(row); setShowForm(true); }}
        onDelete={handleDelete}
      />
    </div>
  );
}
```

- [ ] **Step 7: Manual verification**

Open a file from `/bugreport`, create a bug — confirm the Tester field shows the logged-in user's email and is disabled, confirm the created row's Tester column matches after save. Edit and delete it.

- [ ] **Step 8: Commit**

```bash
git add BugRail-Next/frontend/app/\(app\)/bugreport BugRail-Next/frontend/components/BugForm.js BugRail-Next/frontend/components/BugTable.js BugRail-Next/frontend/components/BugTable.test.js
git commit -m "feat: bug report detail page with add/edit/delete, tester locked to session user"
```

---

### Task 15: End-to-end manual QA pass + run instructions

**Files:**
- Create: `BugRail-Next/README.md`

**Interfaces:**
- Consumes: nothing new — this task only documents and verifies Tasks 1-14 together.

- [ ] **Step 1: Write `BugRail-Next/README.md`**

```markdown
# BugRail Next (Phase 1)

Express + Prisma + PostgreSQL backend, Next.js + Tailwind frontend.
Covers Auth, Test Case, and Bug Report only — see
`docs/superpowers/specs/2026-08-11-bugrail-next-migration-design.md` for full scope.

## Prerequisites

- Node.js LTS
- A local PostgreSQL instance with two empty databases: `bugrail` and `bugrail_test`

## Backend

\`\`\`bash
cd backend
cp .env.example .env   # fill in real DATABASE_URL / DATABASE_URL_TEST / JWT_SECRET
npm install
npx prisma migrate dev
npm run prisma:seed
npm run dev             # http://localhost:4000
\`\`\`

Run tests (needs `DATABASE_URL_TEST` migrated once via
`DATABASE_URL=$DATABASE_URL_TEST npx prisma migrate deploy`):

\`\`\`bash
npm test
\`\`\`

## Frontend

\`\`\`bash
cd frontend
npm install
npm run dev              # http://localhost:3000
npm test                 # vitest
\`\`\`

## Default login

- Email: `admin@bugrail.local`
- Password: `admin123`
```

- [ ] **Step 2: Full manual walkthrough**

With both servers running:
1. Visit `http://localhost:3000` → redirected to `/login`.
2. Log in with the seeded admin credentials → redirected to `/testcase`.
3. Create a file "Sprint 1", open it, add 2 test cases in different modules (e.g. "Login" and "Checkout").
4. Visit `/testcase/summary` → confirm both modules appear as separate collapsible sections with the correct 8 columns.
5. Go back to the test case list, mark one test case `FAILED`.
6. Visit `/bugreport`, open the "Sprint 1" file (same file, shared across modules), create a bug — confirm the Tester field is locked to the logged-in admin's email.
7. Log out → redirected to `/login`; visiting `/testcase` directly redirects back to `/login`.

- [ ] **Step 3: Run both automated test suites one final time**

```bash
cd backend && npm test
cd ../frontend && npm test
```
Expected: all green.

- [ ] **Step 4: Commit**

```bash
git add BugRail-Next/README.md
git commit -m "docs: bugrail-next phase 1 run instructions"
```

---

## Self-Review Notes

- **Spec coverage:** Architecture (Task 7-9), DB schema (Task 1), all API endpoints from spec section 3 (Tasks 3-6), all frontend pages from spec section 4 — `/login` (Task 8), `/testcase` (Task 10), `/testcase/[fileId]` (Task 11), `/testcase/summary` (Task 12), `/bugreport` (Task 13), `/bugreport/[fileId]` (Task 14) — all present.
- **Tester-from-session requirement:** enforced server-side in Task 6 (`testerId: req.user.id`, ignoring body) and reflected in the frontend by disabling the field and never sending `testerId` in the payload (Task 14).
- **Type/name consistency checked:** `nextId`/`moduleAbbrev` (Task 2) used identically in `testcases.js` (Task 5) and `bugs.js` (Task 6); `apiFetch` signature (Task 7) used identically across Tasks 8, 10-14; `FileGrid`/`NewFileButton` props defined once (Tasks 9-10) and reused without modification in Task 13.
- **Out of scope confirmed:** no Dashboard, Summary charts/PDF, Settings, Master Status CRUD UI, User Management, or Import/Export tasks included, matching the spec.
