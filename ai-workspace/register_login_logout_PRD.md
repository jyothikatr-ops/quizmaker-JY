Date created: 2026-08-25
Date last modified: 2026-08-26

# Register, Login, and Logout - Technical PRD

## Overview/Problem

Quiz Maker is a greenfield app for teachers who will later collaborate on a shared bank of multiple-choice questions. Before any of that collaboration can exist, each teacher needs an account they can create and use. This phase built that identity baseline: persist teachers in Cloudflare D1, accept hashed credentials over HTTP POST, send a successful register to login, send a successful login to a stub MCQ page, and send logout back to login.

**As of 2026-08-26, Phases 1–5 are complete.** Register, login, and logout are implemented, unit-tested, linted, built, user-reviewed on `npm run dev`, and verified on the local Workers runtime (`npm run preview`). Remote D1 migrations and deploy were not run.

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
- After a successful register, navigate to `/login`; after a successful login, navigate to a stub MCQ page
- After logout from `/mcqs`, navigate to `/login`
- The MCQ page in this phase is a placeholder only (title plus logout)
- Test-driven implementation with **Vitest**: each phase started with failing unit tests, then implementation until those tests passed

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
- Public HTTP endpoints for user update/delete — the service exposes those methods, but this phase only needed register (create) and login (lookup)

---

## Technical Requirements

### Database Schema

D1 is bound on the Worker. The table was created with a Wrangler migration and applied **locally only**.

- Database name: `quizmaker-jy-db`
- Binding name: `DB`
- Database id: `98c90215-9cae-491a-816a-ad53ccc9c430`
- Worker name: `quizmaker-jy` (lowercase; Cloudflare rejects uppercase)
- Migration: `migrations/0001_create_users.sql`
- Binding: `wrangler.jsonc:21-27`

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
- `cloudflare-env.d.ts` types `env.DB` as `D1Database` (generated via `npm run cf-typegen`; do not hand-edit)

### API Endpoints

All three are POST route handlers. Request bodies are JSON. Validate with Zod (`registerBodySchema` / `loginBodySchema` in `src/lib/auth/schemas.ts`) before calling the user service. Never return `password_hash` in a response. JSON errors use `{ "error": "message" }` via `jsonError` in `src/lib/auth/http.ts`.

#### POST /api/auth/register

Implemented in `src/app/api/auth/register/route.ts`. Creates a user via `createUser`. The client then navigates to `/login`.

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
- Error (400): invalid JSON (`"Invalid JSON"`) or Zod validation (first issue message; e.g. missing fields, invalid email, `passwordHash` not a 64-char lowercase hex string)
- Error (409): `"Username or email already exists"` (`UserAlreadyExistsError`)
- Error (500): `"Server error"`

#### POST /api/auth/login

Implemented in `src/app/api/auth/login/route.ts`. Looks up the user with `findAuthByUsername` and compares the submitted hash to the stored hash with `timingSafeEqualHex`. On success the client navigates to `/mcqs`.

**Request Body:**

```json
{
  "username": "ada@school.edu",
  "passwordHash": "64-character lowercase hex SHA-256 digest"
}
```

`username` is the login identifier. It must match `users.username` (which may itself be an email address).

**Response:**

- Success (200): `{ "id": "...", "firstName": "...", "lastName": "...", "username": "...", "email": "..." }` — public fields only; no `passwordHash`
- Error (400): invalid JSON or Zod validation
- Error (401): unknown username or hash mismatch — always `"Invalid username or password"`
- Error (500): `"Server error"`

Comparison is a constant-time XOR loop over equal-length hex strings (`src/lib/auth/timing-safe-equal.ts`). It is **not** string `===` and **not** `crypto.subtle.timingSafeEqual`. For an unknown user, login still runs the compare against a dummy 64-zero hash so the unknown-user and wrong-hash paths take a similar amount of work (`src/app/api/auth/login/route.ts:7-28`).

#### POST /api/auth/logout

Implemented in `src/app/api/auth/logout/route.ts`. There is no session or cookie to invalidate. This endpoint exists so the client has a matching logout call; it does not change database state and does not call the user service.

**Request Body:** none

**Response:**

- Success (200): `{ "ok": true }`

After a 200, the client navigates to `/login`.

### User Interface Requirements

Auth screens use the **shadcn login and signup blocks** (Tailwind via existing `button`, `card`, `field`, `input`). No extra CSS or component library. Forms are client components: hash the password in the browser with `hashPassword`, then `fetch` the POST endpoints. Layout is a centered `min-h-svh` page with a `max-w-sm` card (MCQ stub uses `max-w-md` on the card).

Stock Google / forgot-password pieces were dropped; they are out of scope.

#### Home (`/`) — `src/app/page.tsx`

Redirects to `/login` via Next.js `redirect(homeDestination)`. `homeDestination` is exported as `"/login"` so the redirect target can be unit-tested without rendering a Server Component (`src/app/page.test.ts`).

#### Register (`/register`) — `src/app/register/page.tsx` + `src/components/signup-form.tsx`

Page shell from the shadcn signup block. Route is `/register`, not `/signup`.

Fields:

- First name, last name (split; stock had one full-name field)
- Username (may equal email)
- Email, password, confirm password
- “Sign in” links to `/login`

Client validation before hashing (`src/components/signup-form.tsx:45-60`):

- All fields required → `"Fill in all fields."`
- Email format → `"Enter a valid email address."`
- Password min 8 → `"Password must be at least 8 characters long."`
- Confirm matches → `"Passwords do not match."`

Submit: SHA-256 in the browser, POST `/api/auth/register` with `passwordHash`, never plaintext. Success → `/login`. Failure → API/`FieldError` on the form (409 shows `"Username or email already exists"`).

#### Login (`/login`) — `src/app/login/page.tsx` + `src/components/login-form.tsx`

Identifier label is **Username** (not Email). Placeholder may still look like an email. No forgot-password, no Google. “Sign up” links to `/register`.

Empty username/password → `"Enter your username and password."` Submit: SHA-256, POST `/api/auth/login` with `{ username, passwordHash }`. Success → `/mcqs`. 401 → generic `"Invalid username or password"` `FieldError`.

#### MCQ stub (`/mcqs`) — `src/app/mcqs/page.tsx` + `src/components/mcq-stub.tsx`

- Heading: “Multiple-choice questions”
- Copy that this is a placeholder for the shared test bank; authoring comes later
- No question UI
- Logout: POST `/api/auth/logout`, then `/login`
- Not access-gated (no session)

### Navigation (as built)

| Event | Destination |
|--------|-------------|
| Visit `/` | `/login` |
| Successful register | `/login` |
| Successful login | `/mcqs` |
| Logout | `/login` |

---

## Testing Approach

This feature was built **test-first with Vitest**. Tests are a phase gate, not a cleanup step. Keep this loop for later work.

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

### Harness (installed in Phase 1; peer added in Phase 4)

```bash
npm install -D vitest @vitejs/plugin-react @testing-library/react @testing-library/user-event @testing-library/dom jsdom vite-tsconfig-paths
```

`vitest.config.ts` uses `@vitejs/plugin-react`, `vite-tsconfig-paths` (required for `@/`), `environment: "jsdom"`, and `globals: true`. Scripts: `"test": "vitest run"`, `"test:watch": "vitest"`.

`@testing-library/dom` is a peer of `@testing-library/react`. UI tests failed with `Cannot find module '@testing-library/dom'` until it was installed as a devDependency.

### Phase loop (every phase)

```
Write tests → npm test (RED) → implement → npm test (GREEN) → only then move on
```

### Suite inventory (as of Phase 4 close)

`npm test` → **12 files, 47 tests, all passing.**

| File | What it covers |
|------|----------------|
| `src/lib/db/users-schema.test.ts` | `DB` binding, `CREATE TABLE users`, columns, uniqueness, indexes |
| `src/lib/services/user-service.test.ts` | fake D1: create/update/delete/lookup, unique-constraint mapping, `all().results` |
| `src/lib/auth/schemas.test.ts` | register/login Zod accept/reject; no plaintext `password` substitute |
| `src/lib/auth/timing-safe-equal.test.ts` | equal, unequal, and different-length hex |
| `src/lib/auth/hash-password.test.ts` | 64-char hex, stable digest, not plaintext |
| `src/app/api/auth/register/route.test.ts` | 201 / 400 / 409 / 500; no hash in 201 body |
| `src/app/api/auth/login/route.test.ts` | 200 / 400 / 401 generic for unknown user and wrong hash |
| `src/app/api/auth/logout/route.test.ts` | 200 `{ ok: true }`, no user-service call |
| `src/app/page.test.ts` | `homeDestination === "/login"` |
| `src/components/signup-form.test.tsx` | fields, client validation, hashed POST, 201 → `/login`, 409 stays |
| `src/components/login-form.test.tsx` | fields, hashed POST, 200 → `/mcqs`, 401 stays |
| `src/components/mcq-stub.test.tsx` | stub copy, no authoring, logout POST then `/login` |

---

## Implementation Phases

### Phase 1: D1 and users migration - COMPLETED

**Objective**: Vitest runs, the Worker has a D1 binding, and a local `users` table exists. Schema tests prove the contract by reading migration SQL and `wrangler.jsonc` from disk (no live D1).

**Shipped:**

1. Vitest harness: packages, `vitest.config.ts`, `test` / `test:watch` scripts
2. Schema/binding tests in `src/lib/db/users-schema.test.ts`
3. D1 database `quizmaker-jy-db` (`database_id` `98c90215-9cae-491a-816a-ad53ccc9c430`)
4. `d1_databases` binding `DB` in `wrangler.jsonc:21-27`
5. `npm run cf-typegen` so `env.DB` is typed
6. `migrations/0001_create_users.sql` (`users` plus `idx_users_username` / `idx_users_email`)
7. Local apply only: `npx wrangler d1 migrations apply quizmaker-jy-db --local`

**Deliverables:**

- Vitest config, scripts, and passing Phase 1 tests
- D1 database and `DB` binding
- Migration file under `migrations/`
- Generated `cloudflare-env.d.ts`

### Phase 2: User service - COMPLETED

**Objective**: All user persistence goes through one service; route handlers never talk to D1 directly. Tests use a fake `env.DB` that records `prepare` / `bind` / `run` / `all`.

**Shipped in `src/lib/services/user-service.ts`:**

- Types: `PublicUser`, `UserAuthRecord` (adds `passwordHash`), `CreateUserInput`, `UpdateUserInput`
- `UserAlreadyExistsError` (`"Username or email already exists"`)
- `getDb()` via `getCloudflareContext({ async: true })` — `src/lib/services/user-service.ts:46-49`
- Reads through `queryAll` → `all().results`, never `first()` — `src/lib/services/user-service.ts:74-78`
- `createUser`: `INSERT … VALUES (?1–?5) RETURNING` public columns — `src/lib/services/user-service.ts:89-106`
- `findByUsername`: public columns only — `src/lib/services/user-service.ts:108-115`
- `findAuthByUsername`: only method that selects `password_hash` — `src/lib/services/user-service.ts:117-130`
- `updateUser` / `deleteUser` (service API for later; no public HTTP routes)
- Unique-constraint failures mapped by matching `/UNIQUE constraint failed/i` on the error and `cause`

**Deliverables:** `src/lib/services/user-service.ts` and `src/lib/services/user-service.test.ts`

### Phase 3: Auth API routes - COMPLETED

**Objective**: Register, login, and logout work over HTTP POST. Route tests call handlers with `Request` objects and a mocked user service.

**Shipped:**

1. `zod` `^4.4.3` (agreed before this phase). Register uses `z.email()`, not `z.string().email()`
2. `src/lib/auth/schemas.ts` — `registerBodySchema`, `loginBodySchema`; `passwordHash` is `/^[0-9a-f]{64}$/`
3. `src/lib/auth/http.ts` — `jsonError`, `validationError` (first Zod issue → 400)
4. `src/lib/auth/timing-safe-equal.ts` — XOR compare of equal-length strings
5. `POST` in `src/app/api/auth/register/route.ts` (201 / 400 / 409 / 500)
6. `POST` in `src/app/api/auth/login/route.ts` (generic 401, dummy-hash + `timingSafeEqualHex`)
7. `POST` in `src/app/api/auth/logout/route.ts` (200 `{ ok: true }`)

**Deliverables:** three route handlers and colocated tests; Zod schemas and schema tests; `{ "error": "message" }` error shape

### Phase 4: Auth UI and MCQ stub - COMPLETED

**Objective**: A teacher can register or log in in the browser. Successful register lands on `/login`. Successful login lands on `/mcqs`. Logout returns to `/login`. UI tests prove hashing, POST shape, navigation, and errors without a live server.

**Shipped:**

1. `src/lib/auth/hash-password.ts` — Web Crypto SHA-256 → lowercase hex (used by both forms)
2. `/login` and `/register` from shadcn login/signup blocks (`LoginForm` / `SignupForm`), using existing `card` / `field` / `input` / `button`. No Google, no forgot-password
3. `/` redirects to `/login`
4. `/mcqs` stub with logout
5. Hash on submit, POST JSON, navigate on success, show errors on failure
6. `@testing-library/dom` added so Testing Library UI tests can resolve their peer dependency

**User review (2026-08-26):** register, login, and logout work in the local browser; register and logout redirect to `/login` as expected; login reaches the MCQ stub.

**Deliverables:** register, login, and MCQ stub pages plus colocated tests; client hash helper and tests; starter homepage replaced by the login redirect

### Phase 5: Verify - COMPLETED

**Objective**: Confirm the full suite, lint, production build, and Workers-runtime D1 access. This phase does not add new product behavior. No new tests were added; Phases 1–4 already cover the acceptance criteria.

**Recorded 2026-08-26:**

- `npm test` — 12 files, 47 passed
- `npm run lint` — succeeded (exit 0)
- `npm run build` (via OpenNext preview) — compiled successfully. Routes: `/`, `/login`, `/register`, `/mcqs`, `POST /api/auth/register|login|logout`
- Browser (`npm run dev`, `http://localhost:3000`): user confirmed register, login, and logout redirects
- Local D1 (`npx wrangler d1 execute quizmaker-jy-db --local`): existing rows `testuser` and `jyo` store 64-character lowercase hex `password_hash`; schema has `password_hash`, not `password`; hashes do not equal username or email
- `npm run preview` — Wrangler ready on `http://127.0.0.1:8787` with `env.DB` bound **local**. OpenNext printed a Windows compatibility warning; preview still ran.
- Workers-runtime HTTP checks against `8787`:
  - `GET /` → 307 `Location: /login`
  - `GET /login`, `/register`, `/mcqs` → 200
  - `POST /api/auth/register` → 201 public user fields, no password field
  - duplicate register → 409 `"Username or email already exists"`
  - `POST /api/auth/login` matching hash → 200 public user fields
  - wrong hash and unknown user → 401 `"Invalid username or password"` (same message)
  - `POST /api/auth/logout` → 200 `{ "ok": true }`
- After that preview register, local D1 had a new row whose `password_hash` is 64-char lowercase hex and is **not** the plaintext password used in the request

Remote migrations and `npm run deploy` were not run.

---

## Technical Implementation Details

### Key Files

- `wrangler.jsonc:7` - Worker name `quizmaker-jy`
- `wrangler.jsonc:21-27` - D1 `DB` binding for `quizmaker-jy-db`
- `cloudflare-env.d.ts:5` - generated `DB: D1Database`
- `vitest.config.ts` - Vitest harness (`jsdom`, `@/` via `vite-tsconfig-paths`, `globals: true`)
- `package.json:10-11` - `test` / `test:watch` scripts
- `package.json:28` - `zod` runtime dependency
- `package.json:32-34,41,45-46` - Vitest / Testing Library / jsdom / vite-tsconfig-paths
- `migrations/0001_create_users.sql` - `users` table and username/email indexes
- `src/lib/db/users-schema.test.ts` - Phase 1 contract tests for migration SQL and `DB` binding
- `src/lib/services/user-service.ts` - create, update, delete, lookup; only module that queries `users`
- `src/lib/services/user-service.ts:3-21` - `PublicUser`, `CreateUserInput`; `UserAuthRecord` adds `passwordHash`
- `src/lib/services/user-service.ts:39-44` - `UserAlreadyExistsError`
- `src/lib/services/user-service.ts:46-49` - `getCloudflareContext({ async: true })`
- `src/lib/services/user-service.ts:74-78` - `queryAll` uses `all().results`, not `first()`
- `src/lib/services/user-service.ts:89-106` - `createUser` with `?1`–`?5` and `RETURNING` public columns
- `src/lib/services/user-service.ts:117-130` - `findAuthByUsername` is the only lookup that selects `password_hash`
- `src/lib/services/user-service.test.ts` - mocked-D1 tests for the user service
- `src/lib/auth/hash-password.ts:1-8` - client SHA-256 helper (Web Crypto)
- `src/lib/auth/hash-password.test.ts` - digest length, stability, and no plaintext
- `src/lib/auth/schemas.ts:3-18` - Zod schemas for register/login bodies
- `src/lib/auth/schemas.test.ts` - schema accept/reject cases
- `src/lib/auth/timing-safe-equal.ts:1-11` - constant-time hex XOR compare used by login
- `src/lib/auth/timing-safe-equal.test.ts` - equal / unequal / different-length
- `src/lib/auth/http.ts:4-10` - `{ error }` JSON helper and Zod 400 mapper
- `src/app/api/auth/register/route.ts` - POST register
- `src/app/api/auth/register/route.test.ts` - 201 / 400 / 409 / 500
- `src/app/api/auth/login/route.ts:6-28` - POST login, dummy hash, `timingSafeEqualHex`
- `src/app/api/auth/login/route.test.ts` - 200 / 400 / 401 (generic message)
- `src/app/api/auth/logout/route.ts:1-3` - POST logout `{ ok: true }`
- `src/app/api/auth/logout/route.test.ts` - 200, no user-service call
- `src/app/page.tsx:3-6` - `homeDestination` + `redirect` to `/login`
- `src/app/page.test.ts` - asserts redirect target
- `src/app/login/page.tsx` - centered `max-w-sm` shell
- `src/components/login-form.tsx:48-61` - hash, POST `/api/auth/login`, navigate to `/mcqs`
- `src/components/login-form.test.tsx` - hashed POST, 200 → `/mcqs`, 401 stays
- `src/app/register/page.tsx` - centered `max-w-sm` shell at `/register`
- `src/components/signup-form.tsx:45-83` - client validation, hash, POST register, navigate to `/login`
- `src/components/signup-form.test.tsx` - validation, hashed POST, 201 → `/login`, 409 stays
- `src/app/mcqs/page.tsx` - MCQ stub page
- `src/components/mcq-stub.tsx:13-18` - POST logout then `/login`
- `src/components/mcq-stub.test.tsx` - stub copy and logout navigation

shadcn/ui primitives used by the forms (generated; avoid hand-editing): `src/components/ui/button.tsx`, `card.tsx`, `field.tsx`, `input.tsx`, `label.tsx`.

### Implementation Patterns

D1 access from the user service, not from route handlers or client components:

```typescript
async function getDb() {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}
```

Client hashing before POST (same function for register and login):

```typescript
export async function hashPassword(plaintext: string): Promise<string> {
  const bytes = new TextEncoder().encode(plaintext);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}
```

Prepared statements with numbered placeholders and `RETURNING` (create):

```typescript
"INSERT INTO users (first_name, last_name, username, email, password_hash) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING id, first_name, last_name, username, email"
```

Login hash compare (unknown user still compares against a dummy hash):

```typescript
const storedHash = auth?.passwordHash ?? DUMMY_HASH;
const hashesMatch = timingSafeEqualHex(storedHash, parsed.data.passwordHash);
if (!auth || !hashesMatch) {
  return jsonError("Invalid username or password", 401);
}
```

### Important Notes

- `zod` is installed and used to validate register/login request bodies. Vitest, Testing Library (including `@testing-library/dom`), and `vite-tsconfig-paths` are approved by the Testing Approach section.
- Do not add a hashing library; Web Crypto works in the browser and on Workers.
- `getCloudflareContext()` and `env.DB` are server-only. Never import the user service into a `'use client'` file.
- Local D1 only: `npx wrangler d1 migrations apply quizmaker-jy-db --local`. Do not use `--remote`.
- Do not deploy. Do not run `npm run deploy`.
- This phase is not a complete auth system. The hash in transit is the secret; SHA-256 has no salt and is fast. HTTPS still matters. Logout does not revoke anything on the server. Treat those as accepted limitations, not bugs to "fix" in this phase.
- Login compares the posted hash to the stored hash. Do not hash a second time on the server unless a later PRD changes the scheme.
- Mock `getCloudflareContext` in user-service tests. Mock the user service (not D1) in route tests. Mock `fetch` and navigation in UI tests.
- If `@/` imports fail in Vitest, `vite-tsconfig-paths` is missing or not in `vitest.config.ts`.
- `npm run dev` is Node. Anything that needs Workers + D1 should be checked with `npm run preview`.
- Register success goes to `/login`, not `/mcqs`. Login success goes to `/mcqs`.

---

## Acceptance Criteria

- [x] A teacher can register with first name, last name, username, email, and password, and a `users` row is created in D1
- [x] Username and email may be the same value; registration still succeeds
- [x] The plaintext password is never written to D1; `password_hash` is a 64-character hex SHA-256 digest
- [x] The register and login POST bodies contain `passwordHash`, not plaintext password
- [x] Duplicate username or email returns 409 and does not create a second row
- [x] Valid login returns 200 and the public user fields, not `passwordHash`
- [x] Invalid login returns 401 with a generic message for both unknown username and wrong password
- [x] Successful register lands on `/login`; successful login lands on `/mcqs`
- [x] Logout from `/mcqs` calls `POST /api/auth/logout` and returns the teacher to `/login`
- [x] `/mcqs` is a stub only: no question authoring UI
- [x] No cookies, tokens, or session store are introduced
- [x] No social login is introduced
- [x] `npm test` is green for the Vitest suite covering schema, user service, auth routes, hash helper, and auth UI (12 files, 47 tests)
- [x] `npm run lint` and `npm run build` succeed after implementation

---

## Success Metrics

| Metric | Target | How Measured | Status |
|--------|--------|--------------|--------|
| Register happy path | 201 and a D1 row | POST `/api/auth/register` then query local D1; browser register | Met in tests + browser review |
| Login happy path | 200 for a known user and matching hash | POST `/api/auth/login`; browser login | Met in tests + browser review |
| Credential leak surface | Zero plaintext passwords in D1 or JSON bodies | Inspect stored row and request payloads | Met in unit tests (hash helper, forms, routes, schema) |
| Duplicate identity | 409, still one row | Register twice with the same username or email | Met in route + service tests |
| Post-auth navigation | `/login` after register; `/mcqs` after login | Browser flow plus UI tests | Met |
| Logout navigation | `/login` after logout | Browser flow plus UI tests | Met |
| Vitest suite | All unit tests green | `npm test` | 47/47 passing |

---

## Dependencies

### External Dependencies

- Cloudflare D1 - `users` table (`quizmaker-jy-db`)
- Wrangler - database create, migrations, types
- Web Crypto (`crypto.subtle`) - SHA-256 in the browser

### Internal Dependencies

- `@opennextjs/cloudflare` `getCloudflareContext({ async: true })` - `env.DB`
- shadcn/ui `button`, `card`, `field`, `input`, `label` - auth forms
- `zod` `^4.4.3` - validate register/login bodies (installed in Phase 3)
- Vitest harness - **approved**: `vitest`, `@vitejs/plugin-react`, `@testing-library/react`, `@testing-library/user-event`, `@testing-library/dom`, `jsdom`, `vite-tsconfig-paths`
- User service - only persistence layer for `users`

### Environment

- No new secrets for this phase. D1 is a binding in `wrangler.jsonc`, not a value in `.dev.vars`.
- If a variable is added later, put the real value in `.dev.vars` and an empty placeholder in `.dev.vars.example`.

---

## Risks and Mitigation

### Technical Risks

- **Risk**: `npm run dev` (Node) does not behave like Workers for D1.
- **Mitigation**: Treat `npm run preview` as the runtime check for anything that touches `env.DB`. Done in Phase 5: preview bound `env.DB` local and register/login succeeded against it.

- **Risk**: Client SHA-256 without salt is a weak password store if D1 leaks; the posted hash is replayable.
- **Mitigation**: Accept for this basic-auth phase. Do not expand into bcrypt, salts, or HTTPS-only policy in this PRD. Document the limitation; a later auth PRD can replace the scheme.

- **Risk**: Unique-constraint errors from D1 are easy to mishandle as 500s.
- **Mitigation**: Detect constraint failures in the user service (`isUniqueConstraintError`) and map them to 409 in the register route.

- **Risk**: D1 `first()` is inconsistent local vs remote.
- **Mitigation**: Use `all()` and take `results[0]` (`queryAll`).

- **Risk**: Unit tests accidentally talk to real D1 or the network and become flaky.
- **Mitigation**: Mock at the module boundary. User-service tests fake `env.DB`; route tests mock the user service; UI tests mock `fetch`.

- **Risk**: Tests are written after the code and never go red, or they assert nothing useful.
- **Mitigation**: Each completed phase listed tests first. Keep that loop for later work. Reject hollow assertions.

### User Experience Risks

- **Risk**: Teachers may think `/mcqs` is a protected workspace.
- **Mitigation**: Stub copy does not claim the user is "signed in" as a durable session. Logout is navigation, not session teardown. `/mcqs` is reachable by URL.

- **Risk**: Hashing in the browser fails in a non-secure context.
- **Mitigation**: Develop on `localhost` or HTTPS. Surface a clear error if `crypto.subtle` is missing.

- **Risk**: Login identifier confusion (username vs email).
- **Mitigation**: Login uses `username` only. Copy on the login page says "Username". If a teacher set username equal to email, they type that same value.

---

## Troubleshooting Guide

### Wrangler rejects the Worker name

**Problem**: `Expected "name" to be of type string, alphanumeric and lowercase with dashes only`.
**Cause**: Cloudflare Worker names cannot include uppercase letters.
**Solution**: Keep `wrangler.jsonc` `"name"` as `quizmaker-jy` (already fixed). Do not revert to `quizmaker-JY`.
**Code Reference**: `wrangler.jsonc:7`

### D1 unique constraint on register

**Problem**: Second register with the same username or email returns 500.
**Cause**: Uncaught SQLITE constraint error.
**Solution**: Catch in the user service; register route returns 409 with `{ "error": "Username or email already exists" }`.
**Code Reference**: `src/lib/services/user-service.ts:61-72`, `src/app/api/auth/register/route.ts:21-24`

### Login works in Node but fails under preview

**Problem**: `env.DB` is missing or queries fail only in `npm run preview`.
**Cause**: Binding or local migration not applied; `npm run dev` does not use the Workers runtime.
**Solution**: Confirm `d1_databases` in `wrangler.jsonc`, re-run `npm run cf-typegen`, apply migrations with `--local`, then use `npm run preview`.

### `@/` alias fails in Vitest

**Problem**: Tests cannot import `@/lib/...`.
**Cause**: `vite-tsconfig-paths` is missing from `vitest.config.ts`.
**Solution**: Add the plugin as in the Testing Approach harness. Do not rewrite imports to relative paths to paper over it.
**Code Reference**: `vitest.config.ts:3-6`

### User-service tests fail with `getCloudflareContext is not a function`

**Problem**: jsdom has no Workers context.
**Cause**: `@opennextjs/cloudflare` was not mocked.
**Solution**: `vi.mock("@opennextjs/cloudflare", () => ({ getCloudflareContext: vi.fn(async () => ({ env: { DB: mockDb } })) }))`.
**Code Reference**: `src/lib/services/user-service.test.ts`

### OpenNext warns that Windows is not fully compatible

**Problem**: `npm run preview` prints `OpenNext is not fully compatible with Windows` and recommends WSL.
**Cause**: The adapter's documented Windows limitation.
**Solution**: Preview still reached `Ready on http://127.0.0.1:8787` and auth POSTs succeeded in Phase 5. If preview fails unpredictably later, rerun under WSL.

### UI tests fail with `Cannot find module '@testing-library/dom'`

**Problem**: `@testing-library/react` cannot load its DOM peer under Vitest.
**Cause**: `@testing-library/dom` was not installed.
**Solution**: `npm install -D @testing-library/dom` (already in `package.json`).
**Code Reference**: `package.json:32`

---

## Notes for AI Agents

When working with this PRD:

1. Start from Overview and Hypothesis so the work stays on teacher accounts, not quizzes
2. Use Scope (In / Out / Cut) as the boundary — do not build MCQs, tokens, cookies, sessions, or social login
3. Phases 1–5 are COMPLETED. Do not re-implement auth. Follow Testing Approach for any new work: tests first, red, then green
4. Update phase status markers as work progresses (PLANNED → IN PROGRESS → COMPLETED)
5. Keep file paths and `filepath:line-number` citations under Technical Implementation Details accurate when code changes
6. Mark acceptance criteria when the behavior is actually verified, not when the file exists
7. Add troubleshooting entries when bugs are found and fixed
8. Ask before adding any npm dependency other than the approved Vitest harness and `zod` (already installed)
9. Never apply D1 migrations with `--remote` and never run `npm run deploy` unless the user explicitly asks
10. Keep this file current; remove details that no longer match the code
11. Register → `/login`. Login → `/mcqs`. Logout → `/login`. Do not send register success to `/mcqs`

---

## Current Status

**Last Updated**: 2026-08-26
**Current Phase**: Phase 5 - Verify
**Status**: COMPLETED
**UI source**: shadcn login + signup blocks (Tailwind via existing shadcn/ui). Adaptations: username login, split name + username on register, `/register` not `/signup`, no Google, no forgot-password. Register success → `/login`; login success → `/mcqs`; logout → `/login`.
**Verification**: `npm test` 47/47; `npm run lint` exit 0; OpenNext/`next build` succeeded; local D1 stores 64-char hex `password_hash` only; `npm run preview` on `http://127.0.0.1:8787` exercised register 201, duplicate 409, login 200/401, logout 200 against Workers + local D1.
**Next Steps**: Commit/push when asked. Do not deploy or apply remote D1 migrations unless asked. The next product PRD is MCQ authoring, not more auth.
