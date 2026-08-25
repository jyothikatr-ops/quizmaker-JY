Date created: 2026-08-25
Date last modified: 2026-08-25

# Register, Login, and Logout - Technical PRD

## Overview/Problem

Quiz Maker is a greenfield app for teachers who will later collaborate on a shared bank of multiple-choice questions. Before any of that collaboration can exist, each teacher needs an account they can create and use. Today the starter has no users, no database, and no way to register, log in, or log out. This phase solves that identity baseline only: persist teachers as users, accept hashed credentials over HTTP POST, and send a successful register or login to a stub MCQ page that the next phase will fill in.

---

## Hypothesis

We believe that adding hashed-password registration, login, and logout for multiple teachers will give Quiz Maker a durable user table and HTTP auth endpoints, so later MCQ work can assume accounts already exist.

---

## Scope

### In Scope

- Cloudflare D1 database bound as `DB`, plus a migration that creates the `users` table
- A `users` row for each teacher: primary key, first name, last name, username, email, password hash
- Username and email as separate fields; they may be the same value for a given user
- Password hashing on the client before every register and login POST; store only the hash in D1
- A user service with create, update, delete, and lookup methods that own all D1 access
- HTTP POST endpoints for register, login, and logout; register and login call the user service
- Register page, login page, and a logout action
- After a successful register or login, navigate to a stub MCQ page
- The MCQ page in this phase is a placeholder only (title plus logout)
- Test-driven implementation with **Vitest**: each phase starts with failing unit tests, then implementation until those tests pass

### Out of Scope

- Multiple-choice question create, edit, list, or share
- Social login (Google, Microsoft, GitHub, and similar)
- Tokens (JWT, API keys, refresh tokens)
- Session management of any kind (cookies, server sessions, `Set-Cookie`, session stores)
- Password reset, email verification, or profile-edit UI
- Role-based access control or admin users
- Remember-me, account lockout, or rate limiting beyond basic validation errors

### Cut

- Server Actions for register/login — the product requirement is HTTP POST endpoints, so this phase uses App Router route handlers under `src/app/api/`
- bcrypt / Argon2 / salted password KDFs — basic SHA-256 via Web Crypto on the client, with the hash stored as-is; a real KDF can replace this later
- Server-side hashing of plaintext passwords — the client hashes before the POST, so the server never receives plaintext
- Protecting `/mcqs` with a session check — there is no session, so the stub is reachable by URL; a later phase can gate it
- Public HTTP endpoints for user update/delete — the service exposes those methods, but this phase only needs register (create) and login (lookup)

---

## Technical Requirements

### Database Schema

Add D1 to the Worker, then create the table with a Wrangler migration. Do not apply migrations remotely unless the user explicitly asks.

Database name (proposed): `quizmaker-jy-db`
Binding name: `DB`

```sql
CREATE TABLE users (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  first_name TEXT NOT NULL,
  last_name TEXT NOT NULL,
  username TEXT NOT NULL UNIQUE,
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_users_username ON users (username);
CREATE INDEX idx_users_email ON users (email);
```

Column notes:

- `id` is an opaque text primary key, matching the starter D1 pattern
- `username` and `email` are each unique; they may hold the same string for one user
- `password_hash` stores the client-produced SHA-256 hex digest, never plaintext
- Unique indexes make duplicate username/email registration fail at the database, not only in application code

### API Endpoints

All three are POST route handlers. Request bodies are JSON. Validate with Zod before calling the user service. Never return `password_hash` in a response.

#### POST /api/auth/register

Creates a user, then the client navigates to `/mcqs`.

**Request Body:**

```json
{
  "firstName": "Ada",
  "lastName": "Lovelace",
  "username": "ada@school.edu",
  "email": "ada@school.edu",
  "passwordHash": "64-character lowercase hex SHA-256 digest"
}
```

`username` and `email` may be identical. `passwordHash` is SHA-256 of the plaintext password, computed in the browser before the POST. The plaintext password must not appear in the request.

**Response:**

- Success (201): `{ "id": "...", "firstName": "...", "lastName": "...", "username": "...", "email": "..." }`
- Error (400): validation failure (missing fields, invalid email, `passwordHash` not a 64-char hex string)
- Error (409): username or email already exists
- Error (500): unexpected server error

#### POST /api/auth/login

Looks up the user and compares the submitted hash to `password_hash`. On success the client navigates to `/mcqs`.

**Request Body:**

```json
{
  "username": "ada@school.edu",
  "passwordHash": "64-character lowercase hex SHA-256 digest"
}
```

`username` is the login identifier. It must match `users.username` (which may itself be an email address).

**Response:**

- Success (200): `{ "id": "...", "firstName": "...", "lastName": "...", "username": "...", "email": "..." }`
- Error (400): validation failure
- Error (401): unknown username or hash mismatch — use one generic message such as `"Invalid username or password"` so callers cannot tell which failed
- Error (500): unexpected server error

Password comparison must be constant-time (for example `crypto.subtle.timingSafeEqual` on equal-length `Uint8Array`s). Do not use `===` on the hash strings.

#### POST /api/auth/logout

There is no session or cookie to invalidate. This endpoint exists so the client has a matching logout call; it does not change database state.

**Request Body:** none (empty JSON object is acceptable)

**Response:**

- Success (200): `{ "ok": true }`
- Error (500): unexpected server error

After a 200, the client navigates to `/login`.

### User Interface Requirements

Use existing shadcn/ui pieces (`button`, `card`, `field`, `input`, `label`). Forms are client components because they must hash the password in the browser, then `fetch` the POST endpoints.

#### Home (/)

Replace the Next.js starter page. Redirect to `/login` so the first thing a teacher sees is sign-in.

#### Register (/register)

- Fields: first name, last name, username, email, password, confirm password
- Username and email may be the same; do not reject that case
- Client validation before hashing:
  - All fields required
  - Email must look like an email
  - Password minimum length 8
  - Password and confirm password must match
- On submit: SHA-256 the password in the browser, POST `/api/auth/register` with `passwordHash`, never send plaintext
- Success: navigate to `/mcqs`
- Failure: show the API error on the form (duplicate username/email, validation)
- Link to `/login` for teachers who already have an account

#### Login (/login)

- Fields: username, password
- On submit: SHA-256 the password in the browser, POST `/api/auth/login` with `passwordHash`
- Success: navigate to `/mcqs`
- Failure: show a generic invalid-credentials message
- Link to `/register`

#### MCQ stub (/mcqs)

- Heading and short copy that this is the future multiple-choice workspace
- No question UI
- Logout control: POST `/api/auth/logout`, then navigate to `/login`
- This page is not access-gated in this phase (no session)

---

## Testing Approach

This feature is built **test-first with Vitest**. Tests are a phase gate, not a cleanup step. Acceptance criteria still apply; green tests plus those criteria are what mark a phase complete.

### Rules

1. At the start of a phase, write that phase's tests and run `npm test`. They must be **red** for a real reason (module not found, assertion failed, wrong status code) — not because the test file itself is invalid.
2. Implement only enough production code to make those tests **green**. Do not implement the next phase's behavior early.
3. A phase is COMPLETED only when:
   - every test listed for that phase is green
   - the full suite so far is green (`npm test`)
   - the relevant acceptance criteria for that phase can be checked off
4. Colocate tests with the subject: `src/lib/services/user-service.ts` is tested by `src/lib/services/user-service.test.ts`. Client components use `*.test.tsx`.
5. Assert observable behavior and side effects (returned JSON, status codes, SQL bindings, what `fetch` sent). Do not assert on private internals. Cover failure paths, not only the happy path.
6. Never write a test that cannot fail. No `expect(true).toBe(true)`.
7. Unit tests must not reach a real D1 database, a real network, or a real model provider. Mock `getCloudflareContext()` and supply a fake `env.DB`. Mock `fetch` and Next.js navigation in UI tests.
8. Reset mocks in `beforeEach` with `vi.clearAllMocks()`.
9. Do not add `@cloudflare/vitest-pool-workers` in this PRD. If Workers-pool tests are needed later, ask first — that changes how the whole suite runs.
10. `getCloudflareContext()` does not work under jsdom. Keep D1 behind `src/lib/services/` so route tests mock the user service, and user-service tests mock D1.

### Harness (install at the start of Phase 1)

Vitest is not in the starter. This revision **approves** the project's testing-skill packages so the suite can run. Do not add any other dependency without asking (`zod` still needs agreement before Phase 2/3 schema work).

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event jsdom vite-tsconfig-paths
```

Add `vitest.config.ts` at the repo root with `@vitejs/plugin-react`, `vite-tsconfig-paths` (required for the `@/` alias), `environment: "jsdom"`, and `globals: true`. Add scripts `"test": "vitest run"` and `"test:watch": "vitest"`. Mock `server-only` as `{}` wherever a server module imports it.

### Phase loop (every phase)

```
Write tests → npm test (RED) → implement → npm test (GREEN) → only then move on
```

---

## Implementation Phases

### Phase 1: D1 and users migration - COMPLETED

**Objective**: Vitest runs, the Worker has a D1 binding, and a local `users` table exists. Schema tests prove the contract before (and after) the migration is written.

**TDD — tests to write first (expect RED)**

File: `src/lib/db/users-schema.test.ts` (or next to the migration if that is easier to import). These tests read the migration SQL and `wrangler.jsonc` from disk. They do **not** talk to a live D1 database.

- `wrangler.jsonc` declares a `d1_databases` binding named `DB`
- A file under `migrations/` contains `CREATE TABLE users`
- `users` defines `id`, `first_name`, `last_name`, `username`, `email`, `password_hash`, `created_at`
- The password column is named `password_hash`, not `password`
- `username` and `email` are each `UNIQUE`
- Indexes exist for `username` and `email`

Run `npm test` and confirm red (missing binding, missing migration, or missing columns).

**Tasks**:
1. Install the approved Vitest harness (packages, `vitest.config.ts`, `test` / `test:watch` scripts). This is scaffolding so tests can run; it is not the feature.
2. Write the schema/binding tests above. Run `npm test` — **RED**.
3. Create the D1 database with Wrangler (`npx wrangler d1 create quizmaker-jy-db`)
4. Add the `d1_databases` binding `DB` to `wrangler.jsonc`
5. Run `npm run cf-typegen` so `env.DB` is typed (do not hand-edit `cloudflare-env.d.ts`)
6. Create a migration for the `users` table and indexes
7. Apply the migration locally only: `npx wrangler d1 migrations apply <db> --local`
8. Run `npm test` — **GREEN** for this phase's tests

**Phase complete when**:
- Schema and binding tests are green
- Local migration has been applied (`--local` only)

**Deliverables**:
- Vitest config, scripts, and a passing `npm test` for this phase
- D1 database and `DB` binding
- Migration file under `migrations/`
- Updated `cloudflare-env.d.ts` from `cf-typegen`

### Phase 2: User service - PLANNED

**Objective**: All user persistence goes through one service; route handlers never talk to D1 directly. Service tests with a fake D1 prove create, update, delete, and lookup.

**TDD — tests to write first (expect RED)**

File: `src/lib/services/user-service.test.ts`. Mock `@opennextjs/cloudflare` and pass a fake `env.DB` that records `prepare` / `bind` / `run` / `all` calls. Do not open real D1.

- `create` binds first name, last name, username, email, and password hash with numbered placeholders (`?1` … `?5`), not string-concatenated SQL
- `create` returns a public user (`id`, names, username, email) and does **not** include `passwordHash` / `password_hash`
- `create` succeeds when username and email are the same string
- `create` maps a D1 unique-constraint failure to a typed "already exists" error
- `findByUsername` returns the public user when a row exists
- `findByUsername` returns `null` when no row exists
- a login-oriented lookup (name it in the service, e.g. `findAuthByUsername`) returns the stored hash so login can compare, and is the only method that exposes `password_hash`
- `update` persists changed name/email/username fields and does not write a new row
- `delete` removes the row; a later lookup returns `null`
- reads use `all().results` (the mock should be called that way), not `first()`

Run `npm test` — **RED** (module missing or methods unimplemented).

**Tasks**:
1. Propose adding `zod` (required by project validation rules; not installed yet) and wait for agreement before installing. Zod is used in Phase 3; do not install it in this phase unless agreed.
2. Write `user-service.test.ts` as above. Run `npm test` — **RED**.
3. Add `src/lib/services/user-service.ts` with create, update, delete, lookup-by-username, and auth lookup
4. Use prepared statements with numbered placeholders (`?1`, `?2`)
5. Read rows from `all().results`; do not rely on `first()`
6. Never select or return `password_hash` except on the auth lookup used by login
7. Map D1 unique-constraint failures to a typed "already exists" error the register route can turn into 409
8. Run `npm test` — **GREEN** for this phase's tests (Phase 1 tests must stay green)

**Phase complete when**:
- `user-service.test.ts` is green
- Phase 1 tests still green

**Deliverables**:
- User service module and colocated tests
- Shared user types (public user vs row that includes `password_hash`)

### Phase 3: Auth API routes - PLANNED

**Objective**: Register, login, and logout work over HTTP POST. Route tests call the handlers with `Request` objects and a mocked user service.

**TDD — tests to write first (expect RED)**

Files: `src/lib/auth/schemas.test.ts`, `src/app/api/auth/register/route.test.ts`, `src/app/api/auth/login/route.test.ts`, `src/app/api/auth/logout/route.test.ts`. Mock `@/lib/services/user-service` — do not mock D1 in this phase.

Schemas (install `zod` only after agreement):

- register schema accepts username equal to email and a 64-char hex `passwordHash`
- register schema rejects missing fields, invalid email, and a non-hex or wrong-length `passwordHash`
- login schema requires `username` and a 64-char hex `passwordHash`
- neither schema accepts a `password` plaintext field as a substitute for `passwordHash`

Register route:

- valid body → 201 and public user JSON, no `passwordHash` in the body
- invalid body → 400 `{ "error": "..." }`
- user-service "already exists" → 409
- unexpected throw → 500

Login route:

- matching hash → 200 and public user JSON, no `passwordHash`
- unknown user → 401 `{ "error": "Invalid username or password" }`
- wrong hash → 401 with the **same** message (do not leak which failed)
- invalid body → 400
- hash comparison is not a plain string `===` (exercise the constant-time path; if the helper is extracted, unit-test that helper with equal and unequal hex strings)

Logout route:

- POST → 200 `{ "ok": true }` (no user-service call required)

Run `npm test` — **RED**.

**Tasks**:
1. If `zod` was agreed, install it; then write schema and route tests. Run `npm test` — **RED**.
2. Add Zod schemas for register and login bodies
3. Implement `POST` in `src/app/api/auth/register/route.ts`
4. Implement `POST` in `src/app/api/auth/login/route.ts` (generic 401, constant-time compare)
5. Implement `POST` in `src/app/api/auth/logout/route.ts` (200 `{ ok: true }`)
6. Keep plaintext passwords out of logs
7. Run `npm test` — **GREEN** (Phases 1–3)

**Phase complete when**:
- Schema and route tests are green
- Earlier phase tests still green

**Deliverables**:
- Three route handlers and colocated tests
- Zod schemas and schema tests
- Consistent JSON error shape: `{ "error": "message" }`

### Phase 4: Auth UI and MCQ stub - PLANNED

**Objective**: A teacher can register or log in in the browser and land on the MCQ stub; logout returns them to login. UI tests prove hashing, POST shape, navigation, and errors without a live server.

**TDD — tests to write first (expect RED)**

Files: `src/lib/auth/hash-password.test.ts`, plus colocated `*.test.tsx` for register, login, and MCQ client UI. Mock `fetch` and the Next.js router/navigation. Query by role and accessible name. Use `userEvent`, not `fireEvent`.

Hash helper:

- `hashPassword("secret")` returns a 64-character lowercase hex string
- the same plaintext always produces the same digest
- different plaintext produces a different digest
- the helper does not return the plaintext

Register UI:

- required fields are present (first name, last name, username, email, password, confirm password)
- client validation: empty fields, invalid email, password shorter than 8, and confirm mismatch show errors and **do not** call `fetch`
- username equal to email is allowed and does call `fetch`
- on valid submit, `fetch` is called with `POST /api/auth/register` and a JSON body that includes `passwordHash` and does **not** include plaintext `password`
- 201 response navigates to `/mcqs`
- 409 (or other error JSON) is shown on the form; no navigation
- a link to login is available

Login UI:

- username and password fields are present
- on valid submit, `fetch` POSTs `/api/auth/login` with `passwordHash` and no plaintext `password`
- 200 navigates to `/mcqs`
- 401 shows a generic invalid-credentials message; no navigation
- a link to register is available

MCQ stub:

- heading/copy for the future MCQ workspace is visible
- no question-authoring controls (no "add question" / choice editors)
- logout `fetch`es `POST /api/auth/logout`, then navigates to `/login`

Home redirect (if testable without rendering a Server Component): assert the `/` module redirects to `/login`. If it cannot be rendered under Testing Library, test a small exported redirect target/helper instead of forcing a Server Component render.

Run `npm test` — **RED**.

**Tasks**:
1. Write hash-helper and UI tests. Run `npm test` — **RED**.
2. Add a browser SHA-256 helper (Web Crypto) used by both forms
3. Build `/register` and `/login` with shadcn `field` / `input` / `button` / `card`
4. Redirect `/` to `/login`
5. Build `/mcqs` stub with logout
6. Hash on submit, POST JSON, navigate on success, show errors on failure
7. Run `npm test` — **GREEN** (Phases 1–4)

**Phase complete when**:
- Hash and UI tests are green
- Earlier phase tests still green

**Deliverables**:
- Register, login, and MCQ stub pages and colocated tests
- Client hash helper and tests
- Starter homepage removed in favor of the login redirect

### Phase 5: Verify - PLANNED

**Objective**: The full Vitest suite stays green, lint and production build pass, and auth can be exercised locally. This phase does not add new product behavior.

**TDD — tests to write first (expect RED if coverage is still missing)**

Do not add hollow "suite exists" tests. Only add a test if an acceptance criterion is still untested, for example:

- register and login response helpers never include `passwordHash` (if that leaked through a shared mapper)
- logout JSON is exactly `{ ok: true }`

If Phases 1–4 already cover the criteria, write no new tests. Run the existing suite; any red test means this phase is not done.

**Tasks**:
1. Run `npm test`. If red, fix production code or a broken test — do not delete assertions to get green.
2. Add only the missing-criterion tests above (if any). Those new tests start **RED**, then implement or wire the mapper until **GREEN**.
3. Run `npm run lint` and `npm run build` and record the actual result
4. Exercise register, duplicate-register, login success, login failure, and logout in the browser
5. Confirm a D1 row stores `password_hash` and not the plaintext password
6. Runtime-sensitive D1 access should be checked with `npm run preview` when possible (`npm run dev` is Node and will not catch Workers issues)

**Phase complete when**:
- `npm test` is green for the full suite
- lint and build succeeded (record the real output)
- browser and D1 checks above have been done

**Deliverables**:
- Full suite green
- Lint and build results in this PRD's Current Status
- Manual checks listed above

---

## Technical Implementation Details

### Key Files

Planned; fill in line references as code is written.

- `wrangler.jsonc:21-27` - D1 `DB` binding for `quizmaker-jy-db`
- `vitest.config.ts` - Vitest harness (`jsdom`, `@/` via `vite-tsconfig-paths`)
- `migrations/0001_create_users.sql` - `users` table and username/email indexes
- `src/lib/db/users-schema.test.ts` - Phase 1 contract tests for migration SQL and `DB` binding
- `src/lib/services/user-service.ts` - create, update, delete, lookup; only module that queries `users` (Phase 2)
- `src/lib/services/user-service.test.ts` - mocked-D1 tests for the user service
- `src/lib/auth/hash-password.ts` - client SHA-256 helper (Web Crypto)
- `src/lib/auth/hash-password.test.ts` - digest length, stability, and no plaintext
- `src/lib/auth/schemas.ts` - Zod schemas for register/login bodies
- `src/lib/auth/schemas.test.ts` - schema accept/reject cases
- `src/app/api/auth/register/route.ts` - POST register
- `src/app/api/auth/register/route.test.ts` - 201 / 400 / 409 / 500
- `src/app/api/auth/login/route.ts` - POST login
- `src/app/api/auth/login/route.test.ts` - 200 / 400 / 401 (generic message)
- `src/app/api/auth/logout/route.ts` - POST logout
- `src/app/api/auth/logout/route.test.ts` - 200 `{ ok: true }`
- `src/app/page.tsx` - redirect to `/login`
- `src/app/register/page.tsx` - registration form
- `src/app/login/page.tsx` - login form
- `src/app/mcqs/page.tsx` - MCQ stub and logout
- colocated `*.test.tsx` next to register, login, and MCQ client components

### Implementation Patterns

D1 access from the user service, not from route handlers or client components:

```typescript
import { getCloudflareContext } from "@opennextjs/cloudflare";

async function getDb() {
  const { env } = await getCloudflareContext();
  return env.DB;
}
```

Client hashing before POST (same function for register and login):

```typescript
async function hashPassword(plaintext: string): Promise<string> {
  const bytes = new TextEncoder().encode(plaintext);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
```

Prepared statements with numbered placeholders:

```typescript
await db
  .prepare(
    "INSERT INTO users (first_name, last_name, username, email, password_hash) VALUES (?1, ?2, ?3, ?4, ?5)"
  )
  .bind(firstName, lastName, username, email, passwordHash)
  .run();
```

### Important Notes

- Ask before adding `zod`. It is the project-standard validator and is required for these routes, but it is not in `package.json` yet. Vitest and its testing-skill companions are approved by the Testing Approach section.
- Do not add a hashing library; Web Crypto works in the browser and on Workers.
- `getCloudflareContext()` and `env.DB` are server-only. Never import the user service into a `'use client'` file.
- Local D1 only: `npx wrangler d1 migrations apply <db> --local`. Do not use `--remote`.
- Do not deploy. Do not run `npm run deploy`.
- This phase is not a complete auth system. The hash in transit is the secret; SHA-256 has no salt and is fast. HTTPS still matters. Logout does not revoke anything on the server. Treat those as accepted limitations, not bugs to "fix" in this phase.
- Login compares the posted hash to the stored hash. Do not hash a second time on the server unless a later PRD changes the scheme.
- Mock `getCloudflareContext` in user-service tests. Mock the user service (not D1) in route tests. Mock `fetch` and navigation in UI tests.
- If `@/` imports fail in Vitest, `vite-tsconfig-paths` is missing or not in `vitest.config.ts`.

---

## Acceptance Criteria

- [ ] A teacher can register with first name, last name, username, email, and password, and a `users` row is created in D1
- [ ] Username and email may be the same value; registration still succeeds
- [ ] The plaintext password is never written to D1; `password_hash` is a 64-character hex SHA-256 digest
- [ ] The register and login POST bodies contain `passwordHash`, not plaintext password
- [ ] Duplicate username or email returns 409 and does not create a second row
- [ ] Valid login returns 200 and the public user fields, not `passwordHash`
- [ ] Invalid login returns 401 with a generic message for both unknown username and wrong password
- [ ] Successful register and successful login both land on `/mcqs`
- [ ] Logout from `/mcqs` calls `POST /api/auth/logout` and returns the teacher to `/login`
- [ ] `/mcqs` is a stub only: no question authoring UI
- [ ] No cookies, tokens, or session store are introduced
- [ ] No social login is introduced
- [ ] `npm test` is green for the Vitest suite covering schema, user service, auth routes, hash helper, and auth UI
- [ ] `npm run lint` and `npm run build` succeed after implementation

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Register happy path | 201 and a D1 row | POST `/api/auth/register` then query local D1 |
| Login happy path | 200 for a known user and matching hash | POST `/api/auth/login` |
| Credential leak surface | Zero plaintext passwords in D1 or JSON bodies | Inspect stored row and request payloads |
| Duplicate identity | 409, still one row | Register twice with the same username or email |
| Post-auth navigation | `/mcqs` after register or login | Browser flow plus UI tests that assert navigation |
| Logout navigation | `/login` after logout | Browser flow plus UI tests that assert navigation |
| Vitest suite | All unit tests green | `npm test` |

---

## Dependencies

### External Dependencies

- Cloudflare D1 - `users` table
- Wrangler - database create, migrations, types
- Web Crypto (`crypto.subtle`) - SHA-256 in the browser; also available on Workers if needed later

### Internal Dependencies

- `@opennextjs/cloudflare` `getCloudflareContext()` - `env.DB`
- shadcn/ui `button`, `card`, `field`, `input`, `label` - auth forms
- `zod` - **proposed, not installed**; validate register/login bodies. Ask before installing.
- Vitest harness - **approved** for this PRD: `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/user-event`, `jsdom`, `vite-tsconfig-paths`
- User service - only persistence layer for `users`

### Environment

- No new secrets for this phase. D1 is a binding in `wrangler.jsonc`, not a value in `.dev.vars`.
- If a variable is added later, put the real value in `.dev.vars` and an empty placeholder in `.dev.vars.example`.

---

## Risks and Mitigation

### Technical Risks

- **Risk**: `npm run dev` (Node) does not behave like Workers for D1.
- **Mitigation**: Treat `npm run preview` as the runtime check for anything that touches `env.DB`.

- **Risk**: Client SHA-256 without salt is a weak password store if D1 leaks; the posted hash is replayable.
- **Mitigation**: Accept for this basic-auth phase. Do not expand into bcrypt, salts, or HTTPS-only policy in this PRD. Document the limitation; a later auth PRD can replace the scheme.

- **Risk**: Unique-constraint errors from D1 are easy to mishandle as 500s.
- **Mitigation**: Detect constraint failures in the user service and map them to 409 in the register route.

- **Risk**: D1 `first()` is inconsistent local vs remote.
- **Mitigation**: Use `all()` and take `results[0]`.

- **Risk**: Unit tests accidentally talk to real D1 or the network and become flaky.
- **Mitigation**: Mock at the module boundary. User-service tests fake `env.DB`; route tests mock the user service; UI tests mock `fetch`.

- **Risk**: Tests are written after the code and never go red, or they assert nothing useful.
- **Mitigation**: Each phase lists the tests to write first. Run `npm test` and record red before implementing. Reject hollow assertions.

### User Experience Risks

- **Risk**: Teachers may think `/mcqs` is a protected workspace.
- **Mitigation**: Stub copy should not claim the user is "signed in" as a durable session. Logout is navigation, not session teardown.

- **Risk**: Hashing in the browser fails in a non-secure context.
- **Mitigation**: Develop on `localhost` or HTTPS. Surface a clear error if `crypto.subtle` is missing.

- **Risk**: Login identifier confusion (username vs email).
- **Mitigation**: Login uses `username` only. Copy on the login page should say "Username". If a teacher set username equal to email, they type that same value.

---

## Troubleshooting Guide

Add entries here when bugs are found and fixed. Seeded issues to watch:

### Wrangler rejects the Worker name

**Problem**: `Expected "name" to be of type string, alphanumeric and lowercase with dashes only`.
**Cause**: Cloudflare Worker names cannot include uppercase letters.
**Solution**: Keep `wrangler.jsonc` `"name"` as `quizmaker-jy` (already fixed). Do not revert to `quizmaker-JY`.

### D1 unique constraint on register

**Problem**: Second register with the same username or email returns 500.
**Cause**: Uncaught SQLITE constraint error.
**Solution**: Catch in the user service; register route returns 409 with `{ "error": "Username or email already exists" }`.

### Login works in Node but fails under preview

**Problem**: `env.DB` is missing or queries fail only in `npm run preview`.
**Cause**: Binding or local migration not applied; `npm run dev` does not use the Workers runtime.
**Solution**: Confirm `d1_databases` in `wrangler.jsonc`, re-run `npm run cf-typegen`, apply migrations with `--local`, then use `npm run preview`.

### `@/` alias fails in Vitest

**Problem**: Tests cannot import `@/lib/...`.
**Cause**: `vite-tsconfig-paths` is missing from `vitest.config.ts`.
**Solution**: Add the plugin as in the Testing Approach harness. Do not rewrite imports to relative paths to paper over it.

### User-service tests fail with `getCloudflareContext is not a function`

**Problem**: jsdom has no Workers context.
**Cause**: `@opennextjs/cloudflare` was not mocked.
**Solution**: `vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: vi.fn(async () => ({ env: { DB: mockDb } })) }))`.

---

## Notes for AI Agents

When working with this PRD:

1. Start from Overview and Hypothesis so the work stays on teacher accounts, not quizzes
2. Use Scope (In / Out / Cut) as the boundary — do not build MCQs, tokens, cookies, sessions, or social login
3. Follow Testing Approach: write that phase's Vitest tests first, confirm they are red, then implement until green. Do not start the next phase while the current phase's tests are red
4. Update phase status markers as work progresses (PLANNED → IN PROGRESS → COMPLETED)
5. Add real file paths and `filepath:line-number` citations under Technical Implementation Details as code lands
6. Mark acceptance criteria when the behavior is actually verified, not when the file exists
7. Add troubleshooting entries when bugs are found and fixed
8. Ask before adding any npm dependency other than the approved Vitest harness. Still ask before adding `zod`
9. Never apply D1 migrations with `--remote` and never run `npm run deploy` unless the user explicitly asks
10. Keep this file current; remove details that no longer match the code

---

## Current Status

**Last Updated**: 2026-08-25
**Current Phase**: Phase 1 - D1 and users migration
**Status**: COMPLETED — waiting for review before Phase 2
**Phase 1 results**:
- TDD: 6 schema/binding tests were red (no `DB` binding, no `migrations/`), then green after D1 + migration
- `npm test`: 1 file, 6 passed
- `npm run lint`: passed (eslint ., no issues)
- `npm run build`: passed (Next.js 16.2.12, compiled successfully)
- Local D1: `0001_create_users.sql` applied with `--local` only (not `--remote`)
- Database: `quizmaker-jy-db`, binding `DB`, id `98c90215-9cae-491a-816a-ad53ccc9c430`
**Next Steps**: After review, start Phase 2 (user service, test-first). Propose `zod` before installing it (needed in Phase 3).
