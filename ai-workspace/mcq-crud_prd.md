Date created: 2026-09-02
Date last modified: 2026-09-02

# Multiple-Choice Question CRUD - Technical PRD

## Overview/Problem

Quiz Maker lets a teacher register, log in, and manage a D1-backed bank of multiple-choice questions. `/mcqs` is a list (name, question, actions) with create, edit, preview/attempt, delete, and logout. The old stub is gone. This PRD is the source of truth for that capability. Phases 1–5 are implemented, verified, committed, and pushed. The Worker is deployed and remote `0002` is applied.

**Do not implement any phase until Jyothika reviews this PRD and says to proceed.** After that, implement one phase at a time, stop for review, and only commit or deploy that phase when she asks.

---

## Hypothesis

We believe that giving teachers a service-backed create/update/delete flow for multiple-choice questions, with choices and attempt history in D1, will turn the `/mcqs` stub into a usable question bank the later sharing work can assume already exists.

---

## Review and release process

This PRD is the source of truth for this capability. Work is gated on review.

1. **PRD review first.** No production code, tests, or schema SQL until Jyothika says to proceed.
2. **One phase at a time.** When she says proceed, start the next PLANNED phase only. Do not implement a later phase early.
3. **Phase review.** When that phase is green (its tests, plus the full suite so far), stop. Do not start the next phase.
4. **Commit after review.** Commit that phase only when she reviews it and asks to commit.
5. **Deploy after review.** Deploy that phase only when she reviews it and asks to deploy. Remote D1 migrations are a separate explicit ask, even if deploy is requested — applying `--remote` still needs a clear yes.

Standing repo rules still apply: do not deploy or apply remote migrations on your own; ask before adding an npm dependency; keep secrets out of the repo.

---

## Scope

### In Scope

- Three D1 tables in one local migration: `mcqs`, `mcq_choices`, `mcq_attempts`
- `mcqs` columns: `id`, `name`, `question`, `created_by` (FK to `users.id`), `created_at`, `updated_at`
- After login, persist the public user in `sessionStorage` so create can send `createdBy`; clear it on logout. No cookie or server session.
- An MCQ service that owns all D1 access for those tables (create, list, get, update, delete, record attempt, list attempts)
- HTTP endpoints for MCQ CRUD and for recording/listing attempts on a question
- `/mcqs` is a list page: shadcn `Table` of all questions (name, question, actions) plus a Create question link (styled with `buttonVariants`) and logout
- A shared create/edit page with Save and Cancel; the form starts with two choices and allows up to six
- Row actions behind a vertical-ellipsis dropdown: Edit, Preview, Delete
- A preview page that presents the question as a student would see it and can submit an attempt
- Delete confirmation before the question is removed
- Test-driven implementation with **Vitest**: each phase starts with failing unit tests, then implementation until those tests pass
- Continue using existing shadcn/ui primitives (`table`, `button`, `card`, `field`, `input`, `label`, `dialog`). Add `dropdown-menu`, `textarea`, and `radio-group` via the shadcn CLI if they are not already in `src/components/ui/`

### Out of Scope

- Sharing a question bank across teachers, comments, or folders
- Quizzes assembled from multiple questions, scoring a multi-question quiz, or timers
- Multi-select questions (more than one correct choice)
- Images, rich text, LaTeX, or AI-generated questions
- Session-backed auth, cookies, tokens, or gating `/mcqs` HTTP routes behind a server login check
- Attributing an **attempt** to a `users` row (`mcq_attempts` still has no `user_id`)
- `updated_by` — only `created_by` is stored; edits do not record who changed the row
- Attempt-history UI (the attempt endpoints exist; no history table on the list or preview page)
- Pagination, search, sort, tags, or draft/published status
- Role-based access or “only the author can edit”

### Cut

- Server Actions for MCQ mutations — match the auth phase: App Router route handlers under `src/app/api/` and client `fetch`
- An optional `description` column — that field is `question` (required). `name` is the short title in the list; `question` is the prompt shown on preview
- Cookies, `Set-Cookie`, JWT, or a server session store — `created_by` is filled from the login response the client keeps in `sessionStorage`, not from a cookie the server sets
- `created_by` on `mcq_attempts` — only the `mcqs` row records the author
- Unique question names — two questions may share a name
- Soft delete — delete is a hard delete of the `mcqs` row; choices cascade; attempts cascade with the question
- Keeping stale choice rows on edit — update replaces the choice set (delete + insert). Attempt rows keep their `is_correct` snapshot; `choice_id` is set null if that choice row is removed
- `@cloudflare/vitest-pool-workers` — unit tests keep mocking D1 / the service, same as auth
- A new npm library for tables, menus, or forms — use shadcn. If `npx shadcn@latest add` would install a new npm package, stop and ask first

---

## Decisions to confirm on PRD review

These are the product calls baked into this document. Push back on any of them before Phase 1 starts.

| Topic | Decision in this PRD |
|--------|----------------------|
| Question fields | `mcqs` has `id`, `name` (required title), `question` (required prompt), `created_by` (user id), `created_at`, `updated_at`. No `description` column. |
| Correct answers | Exactly one choice is correct. Not multi-select. |
| Choice count | Form starts with 2. Teacher may add up to 6. Save rejects fewer than 2 or more than 6. |
| Table names | `mcqs`, `mcq_choices`, `mcq_attempts` |
| Author on create | `created_by` is required and references `users(id)`. Set on insert only; PUT does not change it. |
| How `created_by` is known | Login still has no cookie. After a 200 login, the client stores the public user in `sessionStorage`. Create reads that `id` and sends `createdBy`. Logout clears it. This is not a server session. |
| Attempts and identity | Anonymous. No `user_id` on `mcq_attempts`. Record `mcq_id`, `choice_id`, `is_correct`, `created_at`. |
| Preview | Dedicated page `/mcqs/[id]/preview`. Submitting a choice POSTs an attempt and shows correct/incorrect. |
| Delete | Dropdown → confirm dialog → `DELETE /api/mcqs/:id` → stay on the list. |
| Edit choices | Replace-all. Old choice rows are deleted; new ones are inserted. |
| Auth on MCQ routes | None. Same as the current stub: `/mcqs` and the APIs are reachable by URL. |
| Migration file | Fill the existing empty `migrations/0002_create_mcq_tables.sql`. Do not create `0003`. |

---

## Technical Requirements

### Database Schema

D1 is already bound. This phase only adds tables.

- Database name: `quizmaker-jy-db`
- Binding name: `DB`
- Database id: `98c90215-9cae-491a-816a-ad53ccc9c430`
- Worker name: `quizmaker-jy`
- Migration: `migrations/0002_create_mcq_tables.sql` (file already exists; header comment only)
- Binding: `wrangler.jsonc:21-27` (unchanged)

Apply locally only:

```bash
npx wrangler d1 migrations apply quizmaker-jy-db --local
```

```sql
CREATE TABLE mcqs (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  name TEXT NOT NULL,
  question TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (created_by) REFERENCES users(id)
);

CREATE TABLE mcq_choices (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL,
  choice_text TEXT NOT NULL,
  is_correct INTEGER NOT NULL DEFAULT 0,
  position INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mcq_id) REFERENCES mcqs(id) ON DELETE CASCADE
);

CREATE TABLE mcq_attempts (
  id TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  mcq_id TEXT NOT NULL,
  choice_id TEXT,
  is_correct INTEGER NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (mcq_id) REFERENCES mcqs(id) ON DELETE CASCADE,
  FOREIGN KEY (choice_id) REFERENCES mcq_choices(id) ON DELETE SET NULL
);

CREATE INDEX idx_mcqs_created_by ON mcqs (created_by);
CREATE INDEX idx_mcq_choices_mcq_id ON mcq_choices (mcq_id);
CREATE INDEX idx_mcq_attempts_mcq_id ON mcq_attempts (mcq_id);
CREATE INDEX idx_mcq_attempts_choice_id ON mcq_attempts (choice_id);
```

Column notes:

- `id` is an opaque text primary key, same pattern as `users`
- `mcqs.name` is a short title for the list and as the preview heading
- `mcqs.question` is the required prompt text shown on the form and on preview
- `mcqs.created_by` is the `users.id` of the teacher who created the row. It is written on insert and never updated
- `mcqs.created_at` and `mcqs.updated_at` are timestamps. `updated_at` is set by the service on update (`CURRENT_TIMESTAMP`); SQLite will not bump it by itself
- Deleting a user who still has questions is restricted by the `created_by` foreign key (default RESTRICT). Do not cascade-delete a teacher’s questions when a user row is removed
- `mcq_choices.is_correct` and `mcq_attempts.is_correct` are SQLite booleans: `1` or `0`
- `mcq_choices.position` is `1`–`6` and is the display order
- `mcq_attempts.is_correct` is a snapshot taken at submit time, copied from the selected choice. Later edits to the question do not rewrite old attempts
- `mcq_attempts.choice_id` is nullable so a later edit can delete that choice row without wiping the attempt
- Deleting an `mcqs` row cascades to its choices and attempts
- Application code still enforces “2–6 choices, exactly one correct.” The database does not

### API Endpoints

JSON in and out. Validate with Zod in `src/lib/mcq/schemas.ts` before calling the MCQ service. Reuse `jsonError` / `validationError` from `src/lib/auth/http.ts`. Error bodies stay `{ "error": "message" }`.

Route handlers talk only to the MCQ service. They never import `getCloudflareContext` or touch `env.DB`.

Next.js 16 params on dynamic routes are async (`{ params }: { params: Promise<{ id: string }> }`). Await `params` before use.

#### GET /api/mcqs

Lists every question, newest first (`created_at DESC`). Does not include choices.

**Request Body:** none

**Response:**

- Success (200): `{ "mcqs": [ { "id", "name", "question", "createdBy", "createdAt", "updatedAt" } ] }`
- Error (500): `"Server error"`

#### POST /api/mcqs

Creates a question and its choices in one request.

**Request Body:**

```json
{
  "name": "Addition warmup",
  "question": "What is 2 + 2?",
  "createdBy": "user-id-from-login",
  "choices": [
    { "text": "3", "isCorrect": false },
    { "text": "4", "isCorrect": true }
  ]
}
```

`name` and `question` are required non-empty strings after trim. `createdBy` is required and must be an existing `users.id`. `choices` must have 2–6 items. Exactly one `isCorrect` must be `true`. Each `text` is a non-empty string after trim.

**Response:**

- Success (201): the created question with choices (same shape as GET by id)
- Error (400): invalid JSON or Zod / service validation (first issue message; e.g. `"Name is required"`, `"Question is required"`, `"Creator is required"`, `"Creator not found"`, `"A question must have between 2 and 6 choices"`, `"Exactly one choice must be marked correct"`)
- Error (500): `"Server error"`

#### GET /api/mcqs/:id

Returns one question and its choices, ordered by `position` ascending.

**Response:**

- Success (200):

```json
{
  "id": "...",
  "name": "Addition warmup",
  "question": "What is 2 + 2?",
  "createdBy": "user-id-from-login",
  "createdAt": "2026-09-02 18:00:00",
  "updatedAt": "2026-09-02 18:00:00",
  "choices": [
    { "id": "...", "text": "3", "isCorrect": false, "position": 1 },
    { "id": "...", "text": "4", "isCorrect": true, "position": 2 }
  ]
}
```

- Error (404): `"Question not found"`
- Error (500): `"Server error"`

Preview uses this payload. The UI must not reveal `isCorrect` until after the teacher submits an attempt. The API still returns `isCorrect` because the edit form needs it. Hiding the answer is a UI concern, not an API concern, in this phase (there is no session to distinguish author from student).

#### PUT /api/mcqs/:id

Replaces name, question, and the full choice set. Does **not** accept or change `createdBy`.

**Request Body:** same shape as POST `/api/mcqs` except `createdBy` is omitted (ignored if sent)

**Response:**

- Success (200): the updated question with choices
- Error (400): invalid JSON or validation
- Error (404): `"Question not found"`
- Error (500): `"Server error"`

#### DELETE /api/mcqs/:id

Deletes the question. Choices cascade. Attempts for that question cascade.

**Request Body:** none

**Response:**

- Success (200): `{ "ok": true }`
- Error (404): `"Question not found"`
- Error (500): `"Server error"`

#### POST /api/mcqs/:id/attempts

Records one attempt. The service loads the choice, confirms it belongs to this question, copies `is_correct` from that choice, and inserts the attempt.

**Request Body:**

```json
{
  "choiceId": "..."
}
```

**Response:**

- Success (201): `{ "id", "mcqId", "choiceId", "isCorrect", "createdAt" }`
- Error (400): invalid JSON or missing `choiceId`
- Error (404): `"Question not found"` or `"Choice not found"` (choice missing, or it does not belong to this question — same `"Choice not found"` either way)
- Error (500): `"Server error"`

#### GET /api/mcqs/:id/attempts

Lists attempts for that question, newest first. No UI consumes this in this phase; the route exists so preview and later work have a read path.

**Response:**

- Success (200): `{ "attempts": [ { "id", "mcqId", "choiceId", "isCorrect", "createdAt" } ] }`
- `choiceId` may be `null` if that choice was later removed
- Error (404): `"Question not found"`
- Error (500): `"Server error"`

### User Interface Requirements

Login still lands on `/mcqs`. Logout still returns to `/login`. The login and logout clients get one extra job so `created_by` can be filled: on login 200, write the returned public user to `sessionStorage` (key `quizmaker.currentUser`); on logout (and after a successful logout navigation), remove that key. No cookie is set. This is not a server session and does not gate the MCQ APIs.

Add shadcn components with the namespaced CLI, and only if the file is not already in `src/components/ui/`:

```bash
npx shadcn@latest add @shadcn/dropdown-menu
npx shadcn@latest add @shadcn/textarea
npx shadcn@latest add @shadcn/radio-group
```

If a command produces no files, stop and pick an equivalent already in the Base UI registry. Do not hand-edit generated files under `src/components/ui/`. If adding a component would also add a new npm dependency, ask first.

Do not introduce `react-hook-form`. Client components validate, then `fetch`. Surface errors with `FieldError` or a page-level message, same as the auth forms.

#### List (`/mcqs`) — shipped (replaced the stub)

Widen the page (about `max-w-4xl` / `max-w-5xl`), left-aligned. Keep logout.

- Heading: “Multiple-choice questions”
- Primary button: **Create question** → `/mcqs/new`
- Logout: existing `POST /api/auth/logout` then `/login`
- shadcn `Table` columns: **Name**, **Question**, **Actions**
- Question cell: the stored prompt. Long text is clamped to two lines in the table (`line-clamp-2`); the full text is on edit/preview
- Empty state when `mcqs` is `[]`: short copy plus the same Create question link. Do not render an empty table body with no explanation
- Actions column: icon button with Lucide `EllipsisVertical` (accessible name “Open actions”). Dropdown items:
  - **Edit** → `/mcqs/[id]/edit`
  - **Preview** → `/mcqs/[id]/preview`
  - **Delete** → opens the confirm dialog (does not delete immediately)
- Delete dialog (existing shadcn `dialog`): title “Delete question?”, body uses the question name, buttons **Cancel** and **Delete**. Confirm calls `DELETE /api/mcqs/:id`. On 200, close the dialog and refresh the list. On failure, keep the dialog open and show the error
- Load the list with `GET /api/mcqs` on the client. Show a simple loading state; on fetch failure, show an error and do not pretend the bank is empty

Replace `src/components/mcq-stub.tsx`. The stub test file is rewritten for the list (logout still covered).

#### Create (`/mcqs/new`) and Edit (`/mcqs/[id]/edit`)

One form component, two routes. Create starts with two blank choices and no correct choice selected. Edit loads `GET /api/mcqs/:id` and fills the fields.

Fields:

- **Name** — required title, trimmed, max 200 characters
- **Question** — required prompt textarea, trimmed, max 2000 characters
- **Choices** — 2–6 rows. Each row: text input (required, trimmed, max 500) and a radio that marks that row as the correct answer
- **Add choice** — visible while there are fewer than 6 rows
- **Remove** on a choice row — disabled when only 2 rows remain
- **Save** — create `POST /api/mcqs` (include `createdBy` from `sessionStorage`), edit `PUT /api/mcqs/:id` (do not send `createdBy`). Success → `/mcqs`
- **Cancel** — `/mcqs` with no request

If create is opened and `quizmaker.currentUser` is missing, do not POST a fake id. Show `"Log in to create a question."` and a link to `/login`.

Client validation before fetch:

- Empty name → `"Name is required."`
- Empty question → `"Question is required."`
- Fewer than 2 non-empty choices, or a blank choice left in the list → `"Each choice needs text."` / `"Add at least two choices."` as appropriate
- No correct choice selected → `"Mark one choice as correct."`
- More than one correct is impossible if the control is a radio group; still reject it if the payload is tampered

API errors render on the form. A missing id on edit (`404`) shows “Question not found” and a link back to `/mcqs`.

#### Preview (`/mcqs/[id]/preview`)

Student-facing read of one question.

- Show name as the heading and question as the prompt body
- Choices as a radio group. Do not show which one is correct before submit
- **Submit answer** — disabled until a choice is selected. `POST /api/mcqs/:id/attempts` with that `choiceId`
- After 201: show **Correct** or **Incorrect** from `isCorrect`. Keep the submitted choice selected; do not allow a second submit on that visit (teacher can reload to try again)
- **Back to questions** → `/mcqs`
- 404 → “Question not found” and a link back

### Navigation

| Event | Destination |
|--------|-------------|
| Successful login | `/mcqs` (unchanged) |
| Create question | `/mcqs/new` |
| Save (create or edit) | `/mcqs` |
| Cancel | `/mcqs` |
| Edit action | `/mcqs/[id]/edit` |
| Preview action | `/mcqs/[id]/preview` |
| Back from preview | `/mcqs` |
| Logout | `/login` (unchanged) |

---

## Testing Approach

Same test-first loop as register / login / logout. Tests are a phase gate, not a cleanup step.

### Rules

1. At the start of a phase, write that phase's tests and run `npm test`. They must be **red** for a real reason (module not found, assertion failed, wrong status code) — not because the test file itself is invalid.
2. Implement only enough production code to make those tests **green**. Do not implement the next phase's behavior early.
3. A phase is COMPLETED only when:
   - every test listed for that phase is green
   - the full suite so far is green (`npm test`)
   - the relevant acceptance criteria for that phase can be checked off
4. Colocate tests with the subject: `src/lib/services/mcq-service.ts` is tested by `src/lib/services/mcq-service.test.ts`. Client components use `*.test.tsx`.
5. Assert observable behavior and side effects (returned JSON, status codes, SQL bindings, what `fetch` sent). Do not assert on private internals. Cover failure paths, not only the happy path.
6. Never write a test that cannot fail. No `expect(true).toBe(true)`.
7. Unit tests must not reach a real D1 database or a real network. Mock `getCloudflareContext()` and supply a fake `env.DB` in service tests. Mock the MCQ service in route tests. Mock `fetch` and Next.js navigation in UI tests.
8. Reset mocks in `beforeEach` with `vi.clearAllMocks()`.
9. Do not add `@cloudflare/vitest-pool-workers` in this PRD.
10. `getCloudflareContext()` does not work under jsdom. Keep D1 behind `src/lib/services/mcq-service.ts`.
11. Existing auth tests stay green. Do not rewrite them unless a shared helper change forces it. The old `mcq-stub` “no authoring controls” assertion will be replaced in Phase 4 because the stub goes away.

### Phase loop (every phase)

```
Wait for “proceed on Phase N”
→ write tests
→ npm test (RED)
→ implement
→ npm test (GREEN)
→ stop for review
→ commit only when asked
→ deploy only when asked
```

### Planned suite inventory

Auth suite today: 12 files, 47 tests. Phase 4 retires `src/components/mcq-stub.test.tsx` in favor of list tests.

| File | Phase | What it covers |
|------|-------|----------------|
| `src/lib/db/mcq-schema.test.ts` | 1 | `0002` creates `mcqs`, `mcq_choices`, `mcq_attempts` with required columns (`name`, `question`, `created_by`, timestamps), FKs (including `created_by` → `users`), and indexes; `DB` binding still present |
| `src/lib/services/mcq-service.test.ts` | 2 | fake D1: create/list/get/update/delete, `created_by` set on insert and unchanged on update, missing/unknown creator, choice replace, validation errors, attempt snapshot, choice-not-on-question |
| `src/lib/mcq/schemas.test.ts` | 3 | Zod accept/reject for create/update and attempt bodies |
| `src/app/api/mcqs/route.test.ts` | 3 | GET 200 list; POST 201 / 400 (including missing `createdBy`) / 500 |
| `src/app/api/mcqs/[id]/route.test.ts` | 3 | GET 200 / 404; PUT 200 / 400 / 404; DELETE 200 / 404 |
| `src/app/api/mcqs/[id]/attempts/route.test.ts` | 3 | POST 201 / 400 / 404; GET 200 / 404 |
| `src/components/mcq-form.test.tsx` | 4 | name + question fields, default two choices, add up to six, cannot remove below two, validation, POST includes `createdBy`, PUT omits it, Cancel, 404 on edit, create without stored user |
| `src/components/login-form.test.tsx` | 4 (extend) | existing cases plus: 200 login writes `quizmaker.currentUser` to `sessionStorage` |
| `src/components/mcq-list.test.tsx` | 4 | table rows (name + question), empty state, Create navigates, actions menu, delete confirm + DELETE, logout clears `sessionStorage` |
| `src/components/mcq-preview.test.tsx` | 4 | choices without revealing correct, submit attempt, Correct/Incorrect, no second submit |

---

## Implementation Phases

### Phase 1: D1 MCQ schema - COMPLETED

**Objective**: Local D1 has `mcqs`, `mcq_choices`, and `mcq_attempts`. Schema tests prove the contract by reading the migration SQL from disk (no live D1).

**Shipped:**

1. `src/lib/db/mcq-schema.test.ts` — 7 contract tests. First run was red because `0002` was missing (6 failures); green after the SQL was written
2. `npx wrangler d1 migrations create quizmaker-jy-db create_mcq_tables` created `migrations/0002_create_mcq_tables.sql`
3. Filled `0002` with `mcqs` (`id`, `name`, `question`, `created_by`, timestamps), `mcq_choices`, `mcq_attempts`, and the four indexes
4. `npx wrangler d1 migrations apply quizmaker-jy-db --local` reported “No migrations to apply” because an older empty/different `0002` was already recorded locally. Local tables still had `description` and no `created_by`. Those three tables were empty, so they were dropped locally and `0002` was executed with `--file` (not `--remote`). No `0003` was added
5. `wrangler.jsonc` and `cloudflare-env.d.ts` were not changed

**Deliverables:**

- Filled `migrations/0002_create_mcq_tables.sql`
- Passing Phase 1 schema tests (`npm test` — 13 files, 54 tests)
- Local D1 showing the three tables with the PRD columns

**Stop for review.** Then commit / deploy only if asked. A Phase 1 deploy needs a remote migration apply — call that out before running it. If remote already applied the old `0002` (`description`, no `created_by`), do not blindly apply this file; stop and say so.

### Phase 2: MCQ service - COMPLETED

**Objective**: All persistence for questions, choices, and attempts goes through one service. Tests use a fake `env.DB` that records `prepare` / `bind` / `run` / `all` / `batch`.

**Shipped:**

1. `src/lib/services/mcq-service.test.ts` — 18 tests. First run was red (`Failed to resolve import "./mcq-service"`)
2. `src/lib/services/mcq-service.ts` — list/get/create/update/delete plus attempt create/list
3. Create and update use `db.batch`. Create writes `created_by`. Update sets `name`, `question`, and `updated_at = CURRENT_TIMESTAMP` only
4. `InvalidMcqError` for empty name/question/creator, 2–6 choices, exactly one correct, and FK `"Creator not found"`. The service does not query `users`
5. Attempts copy `is_correct` from the selected choice. Replacing choices leaves the attempt row with a null `choice_id`

**Deliverables:** `src/lib/services/mcq-service.ts` and `src/lib/services/mcq-service.test.ts`

**Stop for review.** Then commit / deploy only if asked.

### Phase 3: MCQ API routes - COMPLETED

**Objective**: List, create, read, update, delete, and attempts work over HTTP. Route tests call handlers with `Request` objects and a mocked MCQ service.

**Shipped:**

1. Schema and route tests first — red because `./schemas` and `./route` did not exist
2. `src/lib/mcq/schemas.ts` — `createMcqBodySchema` (name, question, createdBy, choices), `updateMcqBodySchema` (no createdBy; extra `createdBy` is stripped), `attemptBodySchema`
3. `src/app/api/mcqs/route.ts` — GET list, POST create
4. `src/app/api/mcqs/[id]/route.ts` — GET / PUT / DELETE; params are awaited
5. `src/app/api/mcqs/[id]/attempts/route.ts` — GET / POST attempts
6. Error mapping: `InvalidMcqError` → 400, `McqNotFoundError` / `ChoiceNotFoundError` → 404, else → 500. Routes call the MCQ service only

**Deliverables:** three route modules and colocated tests; Zod schemas and schema tests

**Stop for review.** Then commit / deploy only if asked.

### Phase 4: MCQ UI - COMPLETED

**Objective**: A teacher can manage questions in the browser. List, create, edit, preview, delete, and logout all work. UI tests prove navigation, validation, `fetch` shapes, and errors without a live server.

**Shipped:**

1. Added shadcn `dropdown-menu`, `textarea`, and `radio-group` (source files only; no new npm package)
2. UI tests first for list, form, preview, plus the login `sessionStorage` case. Replaced `mcq-stub` tests
3. `src/lib/auth/current-user.ts` — `quizmaker.currentUser` get/set/clear. Login writes it; list logout clears it
4. `McqList` on `/mcqs` — table (Name, Question, Actions), Create question, vertical-ellipsis menu (Edit / Preview / Delete), confirm dialog, logout
5. Shared `McqForm` on `/mcqs/new` and `/mcqs/[id]/edit` — two to six choices, client validation, create POST includes `createdBy`, edit PUT omits it, no fake creator
6. `McqPreview` on `/mcqs/[id]/preview` — radios without `isCorrect`, POST attempt, Correct/Incorrect, no second submit
7. Deleted `src/components/mcq-stub.tsx` and its test
8. After review, Create / Back links were restyled with `buttonVariants` (not `Button render={<Link />}`) so Base UI stops warning in the Next.js console

**Deliverables:** list / form / preview components and pages; colocated tests; stub removed

**Reviewed on `npm run dev`.** Committed with Phase 5 in `fbf8263` and `4ce7683` (see Current Status). Deployed 2026-09-02.

### Phase 5: Verify - COMPLETED

**Objective**: Confirm the full suite, lint, production build, and Workers-runtime D1 access. This phase does not add new product behavior.

**Verified:**

1. `npm test` — 20 files, 108 passed
2. `npm run lint` — exit 0
3. `npm run build` — exit 0 (Next.js 16.2.12 Turbopack; MCQ pages and `/api/mcqs*` routes present)
4. Local D1: `mcqs`, `mcq_choices`, `mcq_attempts` exist. After a Workers-preview create named `Phase5 verify`, the row had `name`, a non-empty `question`, `created_by`, and timestamps; 2 `mcq_choices`; two `mcq_attempts` with `is_correct` 1 then 0. That verify question was then deleted
5. `npm run preview` ready on `http://127.0.0.1:8787` with `env.DB` local. HTTP: pages 200; POST create 201; GET 200; PUT 200; attempts 201/201; missing `createdBy` 400; unknown id 404; logout POST 200
6. Browser click-through was done in Phase 4 review (`npm run dev`). This phase checked page shells and APIs on preview; no browser MCP here. The Base UI `Button`+`Link` console warning was fixed by styling `Link` with `buttonVariants`
7. `AGENTS.md` project blurb now describes MCQ CRUD, not register/login/logout only
8. Jyothika asked to commit and push: `fbf8263` (Phases 1–4) and `4ce7683` (link fix + Phase 5 record) are on `origin/feat/register-login-logout`
9. Jyothika asked to deploy and apply remote D1: `0002` applied `--remote` (no older `0002` on remote). `npm run deploy` exit 0. Worker `quizmaker-jy` version `d39d5f82-a0d5-4068-8a5a-637fe6eb25de` at https://quizmaker-jy.jyothika-tr.workers.dev. Production smoke: `/login` 200, `/mcqs` 200, `/api/mcqs` 200 `{"mcqs":[]}`

**Deliverables:** recorded results in this PRD’s Current Status; `AGENTS.md` updated; commits pushed; Worker deployed; remote `0002` applied

**Capability complete.** Further product work needs a new PRD.

---

## Technical Implementation Details

### Key Files

- `migrations/0002_create_mcq_tables.sql:3-37` — `mcqs`, `mcq_choices`, `mcq_attempts` and indexes
- `src/lib/db/mcq-schema.test.ts` — Phase 1 contract tests (reads `0002` from disk)
- `src/lib/services/mcq-service.ts` — only module that queries the three MCQ tables
- `src/lib/services/mcq-service.ts:84-103` — `McqNotFoundError`, `ChoiceNotFoundError`, `InvalidMcqError`
- `src/lib/services/mcq-service.ts:258-283` — `createMcq` batch insert + FK mapping
- `src/lib/services/mcq-service.ts:285-303` — `updateMcq` replace-all choices, no `created_by`
- `src/lib/services/mcq-service.ts:311-333` — `createAttempt` copies choice correctness
- `src/lib/services/mcq-service.test.ts` — mocked-D1 service tests (18)
- `src/lib/mcq/schemas.ts` — Zod bodies for create/update and attempts
- `src/lib/mcq/schemas.test.ts` — create requires `createdBy`; update strips it
- `src/lib/auth/http.ts` — reused `{ error }` helper (do not duplicate)
- `src/app/api/mcqs/route.ts` — GET list, POST create
- `src/app/api/mcqs/route.test.ts` — GET 200 / 500; POST 201 / 400 / 500
- `src/app/api/mcqs/[id]/route.ts` — GET / PUT / DELETE one
- `src/app/api/mcqs/[id]/route.test.ts` — GET 200 / 404; PUT omits `createdBy`; DELETE 200 / 404
- `src/app/api/mcqs/[id]/attempts/route.ts` — GET / POST attempts
- `src/app/api/mcqs/[id]/attempts/route.test.ts` — POST 201 / 400 / 404; GET 200 / 404
- `src/app/mcqs/page.tsx` — list page (`McqList`)
- `src/app/mcqs/new/page.tsx` — create (`McqForm mode="create"`)
- `src/app/mcqs/[id]/edit/page.tsx` — edit (`McqForm mode="edit"`; awaits `params`)
- `src/app/mcqs/[id]/preview/page.tsx` — preview / attempt (awaits `params`)
- `src/components/mcq-list.tsx` — table, create link, actions menu, delete dialog, logout
- `src/components/mcq-list.tsx:41-52` — `GET /api/mcqs` helper used by first load and after delete
- `src/components/mcq-list.tsx:92-103` — logout POST + `clearCurrentUser` + `/login`
- `src/components/mcq-list.tsx:128-132` — Create question is a `Link` styled with `buttonVariants()`
- `src/components/mcq-list.tsx:215-241` — “Delete question?” dialog; name in `<strong>`
- `src/components/mcq-form.tsx` — shared create/edit form
- `src/components/mcq-form.tsx:118-148` — client validation messages from the PRD
- `src/components/mcq-form.tsx:157-177` — create POST with `createdBy`; edit PUT without it
- `src/components/mcq-form.tsx:198-200` — 404 “Back to questions” `Link` + `buttonVariants`
- `src/components/mcq-preview.tsx` — student-facing attempt UI
- `src/components/mcq-preview.tsx:54-64` — strips `isCorrect` before render
- `src/components/mcq-preview.tsx:78-101` — POST attempt; Correct/Incorrect; no second submit
- `src/components/mcq-preview.tsx:110-112` / `:154-156` — Back `Link` + `buttonVariants`
- `src/lib/auth/current-user.ts` — get/set/clear `quizmaker.currentUser` in `sessionStorage` (client-only; no D1)
- `src/components/login-form.tsx:62-70` — 200 login writes the public user to `sessionStorage`
- `src/components/ui/dropdown-menu.tsx`, `textarea.tsx`, `radio-group.tsx` — added via shadcn CLI

shadcn/ui present: `button`, `card`, `dialog`, `field`, `input`, `label`, `separator`, `table`, `badge`, `dropdown-menu`, `textarea`, `radio-group`.

### Implementation Patterns

D1 access stays inside the service, same helper as the user service:

```typescript
async function getDb() {
  const { env } = await getCloudflareContext({ async: true });
  return env.DB;
}
```

Numbered placeholders and `all().results`:

```typescript
const result = await db
  .prepare("SELECT id, name, question, created_by, created_at, updated_at FROM mcqs ORDER BY created_at DESC")
  .all<McqRow>();
return result.results;
```

Create question + choices together:

```typescript
await db.batch([
  db.prepare(
    "INSERT INTO mcqs (id, name, question, created_by) VALUES (?1, ?2, ?3, ?4)",
  ).bind(mcqId, name, question, createdBy),
  ...choices.map((choice, index) =>
    db.prepare(
      "INSERT INTO mcq_choices (mcq_id, choice_text, is_correct, position) VALUES (?1, ?2, ?3, ?4)",
    ).bind(mcqId, choice.text, choice.isCorrect ? 1 : 0, index + 1),
  ),
]);
```

Attempt copies the correctness snapshot from the choice; it does not trust a client-supplied `isCorrect`.

### Important Notes

- Ask before adding any npm dependency. shadcn add is source-file copy; still stop if it wants to install a package.
- `getCloudflareContext()` and `env.DB` are server-only. Never import the MCQ service into a `'use client'` file.
- Local D1 only until Jyothika explicitly asks for `--remote`.
- Do not run `npm run deploy` unless she asks after reviewing the phase.
- `/mcqs` APIs are still not access-gated. `sessionStorage` only helps the create form send `createdBy`. Treat spoofable `createdBy` as an accepted limitation until a later auth PRD adds a real session.
- Preview hides `isCorrect` in the UI only. The GET-by-id payload includes it for the edit form.
- Do not change the `users` table or the register/login/logout HTTP contracts. Login/logout UI may only gain `sessionStorage` write/clear for `quizmaker.currentUser`.
- Fill `0002`; do not create a third migration for this PRD.
- `npm run dev` is Node. Anything that needs Workers + D1 should be checked with `npm run preview`.
- Update this file as phases complete: status markers, key-file line citations, acceptance checkboxes, troubleshooting.

---

## Acceptance Criteria

- [x] Local D1 has `mcqs`, `mcq_choices`, and `mcq_attempts` from `migrations/0002_create_mcq_tables.sql`
- [x] `mcqs` has `id`, `name`, `question`, `created_by`, `created_at`, and `updated_at` — no `description` column; `question` and `created_by` are NOT NULL
- [x] A teacher can create a question with a name, a question prompt, `created_by` set to their user id, and 2–6 choices, and rows are written through the MCQ service
- [x] A newly opened create form shows exactly two choice fields; the teacher can add up to six and cannot save with fewer than two
- [x] Exactly one choice must be marked correct; otherwise Save is rejected (client and API)
- [x] `/mcqs` lists every question in a shadcn table with name, question, and an actions menu
- [x] Create question navigates to `/mcqs/new`; Save returns to `/mcqs`; Cancel returns to `/mcqs` without writing
- [x] Edit loads the existing question, Save `PUT`s the replacement without changing `created_by`, and the list shows the new name/question
- [x] Preview does not reveal the correct choice until an attempt is submitted; the attempt row’s `is_correct` matches the selected choice
- [x] Delete asks for confirmation, then removes the question and its choices (and that question’s attempts)
- [x] Vertical-ellipsis actions offer Edit, Preview, and Delete
- [x] Logout from the list page still `POST`s `/api/auth/logout` and returns to `/login`
- [x] Route handlers do not query D1 directly
- [x] No cookie, token, or server session is introduced; `created_by` comes from `sessionStorage` after login; attempts still have no `user_id`
- [x] `npm test` is green for the auth suite plus the new MCQ tests
- [x] `npm run lint` and `npm run build` succeed after implementation

---

## Success Metrics

| Metric | Target | How Measured |
|--------|--------|--------------|
| Create happy path | 201 and a `mcqs` row with `name`, `question`, `created_by` plus `mcq_choices` | POST `/api/mcqs` then query local D1; browser create after login |
| Update happy path | 200 and replaced choices | PUT then GET by id; choice count and texts match the new set |
| Delete happy path | 200 `{ ok: true }` and no leftover choices | DELETE then GET 404; no `mcq_choices` rows for that id |
| Attempt snapshot | `is_correct` matches the selected choice | POST attempt after picking a known correct and a known incorrect choice |
| Choice bounds | 400 when 1 or 7 choices, or 0/2+ correct | API + form tests |
| List empty state | Create CTA shown; no blank unlabeled table | UI test + browser |
| Navigation | Create/Edit/Preview/Cancel/Logout land as specified | UI tests + browser review |
| Vitest suite | All unit tests green | `npm test` |

---

## Dependencies

### External Dependencies

- Cloudflare D1 — new tables on `quizmaker-jy-db`
- Wrangler — local migration apply
- Lucide — `EllipsisVertical` (already the shadcn icon library)

### Internal Dependencies

- `@opennextjs/cloudflare` `getCloudflareContext({ async: true })` — `env.DB`
- Existing user service and auth routes — unchanged; login still enters at `/mcqs`
- `src/lib/auth/http.ts` — JSON error helpers
- `zod` `^4.4.3` — already installed; reuse for MCQ bodies
- Vitest harness — already installed
- shadcn/ui `table`, `button`, `card`, `dialog`, `field`, `input`, `label` — already installed
- shadcn/ui `dropdown-menu`, `textarea`, `radio-group` — added in Phase 4

### Environment

- No new secrets. D1 remains a binding in `wrangler.jsonc`.
- No new `.dev.vars` keys.

---

## Risks and Mitigation

### Technical Risks

- **Risk**: `npm run dev` (Node) does not bind D1 the way Workers does.
- **Mitigation**: Treat `npm run preview` as the runtime check for anything that touches `env.DB`.

- **Risk**: Creating the question and its choices as separate statements leaves an orphan `mcqs` row if a later insert fails.
- **Mitigation**: Use `db.batch` for create and for the update replace-all.

- **Risk**: D1 `first()` is inconsistent local vs remote.
- **Mitigation**: Use `all()` and take `results[0]`.

- **Risk**: Replacing choices on edit would delete attempt history if `choice_id` used `ON DELETE CASCADE`.
- **Mitigation**: `mcq_attempts.choice_id` is `ON DELETE SET NULL`; `is_correct` is stored on the attempt.

- **Risk**: Unit tests accidentally talk to real D1 or the network.
- **Mitigation**: Mock at the module boundary. Service tests fake `env.DB`; route tests mock the MCQ service; UI tests mock `fetch`.

- **Risk**: Tests are written after the code and never go red.
- **Mitigation**: Each phase lists tests first. Reject hollow assertions.

- **Risk**: Adding shadcn `dropdown-menu` pulls an unexpected package or the name does not exist for Base UI.
- **Mitigation**: Use `npx shadcn@latest add @shadcn/...`. If it no-ops or wants a new dependency, stop and ask.

### User Experience Risks

- **Risk**: `created_by` is client-supplied, so anyone who can POST `/api/mcqs` can send another teacher’s id.
- **Mitigation**: Accept for this phase. There is still no server session. Document it; a later auth PRD can take the user id from a cookie instead.

- **Risk**: Teachers may think `/mcqs` is a private workspace.
- **Mitigation**: Same as auth: no server session, reachable by URL. `sessionStorage` is only so create can stamp `created_by`. Do not add copy that says the user is “signed in” as a durable session.

- **Risk**: A teacher opens Create in a new tab after the `sessionStorage` value is gone.
- **Mitigation**: The form refuses to POST without a stored user and sends them to `/login`.

- **Risk**: Preview GET includes `isCorrect`, so a determined user can read the answer from the network tab.
- **Mitigation**: Accept for this phase. There is no session to authorize a “student” payload. Document it; a later auth PRD can split author vs attempt payloads.

- **Risk**: Accidental delete from a one-click row action.
- **Mitigation**: Actions live behind a menu, and delete requires a confirm dialog.

- **Risk**: Wide table on a small screen.
- **Mitigation**: Use the shadcn table wrapper (`overflow-x-auto`). Check a mobile width in Phase 4 / 5.

---

## Troubleshooting Guide

Populate this section when bugs are found and fixed. Starters from the auth phase that still apply:

### Login works in Node but MCQ writes fail under preview

**Problem**: `env.DB` is missing or the new tables are missing only in `npm run preview`.
**Cause**: `0002` not applied locally, or `npm run dev` was used and never hit Workers D1.
**Solution**: Confirm `migrations/0002_create_mcq_tables.sql` has the CREATE TABLE statements, run `npx wrangler d1 migrations apply quizmaker-jy-db --local`, then use `npm run preview`.

### `@/` alias fails in Vitest

**Problem**: Tests cannot import `@/lib/...`.
**Cause**: `vite-tsconfig-paths` missing from `vitest.config.ts`.
**Solution**: Do not rewrite imports to relative paths. The plugin is already configured from the auth phase.

### Local 0002 already applied with an older schema

**Problem**: `npx wrangler d1 migrations apply quizmaker-jy-db --local` prints `No migrations to apply`, but local `mcqs` still has `description` and no `created_by`.
**Cause**: An earlier `0002` (empty or a draft with `description` / `text`) was already recorded in local `d1_migrations`.
**Solution**: If the three MCQ tables are empty, drop them locally and run `npx wrangler d1 execute quizmaker-jy-db --local --file=migrations/0002_create_mcq_tables.sql`. Do not add `0003` for this PRD. Do not do this against remote.
**Code Reference**: `migrations/0002_create_mcq_tables.sql:3-37`

### MCQ service tests fail with `getCloudflareContext is not a function`

**Problem**: jsdom has no Workers context.
**Cause**: `@opennextjs/cloudflare` was not mocked.
**Solution**: Same mock pattern as `src/lib/services/user-service.test.ts`.

### Actions menu click does not stay open in jsdom

**Problem**: `user.click` on “Open actions” leaves `aria-expanded="false"` and Edit/Preview/Delete are missing.
**Cause**: Base UI dropdown toggle treats the same pointer event as open-then-close.
**Solution**: Focus the trigger and `user.keyboard("{Enter}")`.
**Code Reference**: `src/components/mcq-list.test.tsx:31-35`

### Radio query matches a hidden native input

**Problem**: `getByLabelText(/mark choice 2 as correct/i)` finds two nodes (visible `role="radio"` and a hidden `<input type="radio">`).
**Cause**: shadcn Base UI `RadioGroupItem` renders both.
**Solution**: Use `getByRole("radio", { name: /mark choice 2 as correct/i })`.

### Delete dialog cannot find the question name

**Problem**: `getByText("Addition warmup")` fails when the name is split across text nodes.
**Cause**: The confirm copy wraps the name in markup.
**Solution**: Keep the name in a single `<strong>` node.
**Code Reference**: `src/components/mcq-list.tsx:218-220`

### Base UI Button + Link console error

**Problem**: Next.js / browser console: “A component that acts as a button expected a native `<button>` because the `nativeButton` prop is true.”
**Cause**: `Button render={<Link />}` is not a native button.
**Solution**: Style the `Link` with `buttonVariants()` instead of wrapping it in `Button`.
**Code Reference**: `src/components/mcq-list.tsx:128-130`

### List lint: setState in effect

**Problem**: `react-hooks/set-state-in-effect` flags `void load()` when `load` calls `setState` before `await`.
**Cause**: The React hooks plugin treats that as a cascading render.
**Solution**: Fetch first, then apply state after the await. Keep `load()` for the delete refresh (event handler).
**Code Reference**: `src/components/mcq-list.tsx:78-90`

---

## Notes for AI Agents

When working with this PRD:

1. Start from Overview and Hypothesis so the work stays on teacher MCQ authoring, not quizzes, sharing, or more auth
2. Use Scope (In / Out / Cut) as the boundary — do not build cookies, multi-select, AI generation, or attempt-history UI. `sessionStorage` for `createdBy` is in scope; a server session is not
3. **Do not implement until the user says to proceed.** Then implement only the next PLANNED phase
4. Follow Testing Approach: tests first, red, then green
5. After a phase is green, stop for review. Commit only when asked. Deploy only when asked. Never `d1 migrations apply --remote` unless asked in those words
6. Update phase status markers as work progresses (PLANNED → IN PROGRESS → COMPLETED)
7. Keep file paths and `filepath:line-number` citations under Technical Implementation Details accurate when code changes
8. Mark acceptance criteria when the behavior is actually verified, not when the file exists
9. Add troubleshooting entries when bugs are found and fixed
10. Ask before adding any npm dependency
11. Fill `migrations/0002_create_mcq_tables.sql`; do not add `0003` for this feature
12. Do not re-implement register, login, or logout
13. Keep this file current; remove details that no longer match the code
14. Login → `/mcqs`. Logout → `/login`. Save/Cancel → `/mcqs`

---

## Current Status

**Last Updated**: 2026-09-02
**Current Phase**: Phase 5 - Verify
**Status**: COMPLETED — committed and pushed
**Branch**: `feat/register-login-logout` (in sync with `origin/feat/register-login-logout`)
**Commits**:
- `fbf8263` — Add MCQ question bank so teachers can create, edit, preview, and delete questions (Phases 1–4: schema, service, API, UI)
- `4ce7683` — Fix MCQ navigation links so Base UI stops warning, and record Phase 5 verification
**Verification**: `npm test` 20 files, 108 passed. `npm run lint` exit 0. `npm run build` exit 0. `npm run preview` on `http://127.0.0.1:8787` with local D1: create/update/attempt/delete HTTP paths green; D1 row had `name`/`question`/`created_by`/timestamps, 2 choices, attempt snapshots 1 then 0. `AGENTS.md` updated. UI click-through was Phase 4 on `npm run dev` (including the Base UI console warning, now fixed). Preview page shells 200.
**Deployed**: 2026-09-02 — `npm run deploy` exit 0. Worker `quizmaker-jy` version `d39d5f82-a0d5-4068-8a5a-637fe6eb25de` at https://quizmaker-jy.jyothika-tr.workers.dev. Production smoke: `/login` 200, `/mcqs` 200, `/api/mcqs` 200 `{"mcqs":[]}`.
**Remote D1**: `0002_create_mcq_tables.sql` applied (`--remote`). Remote had no older `0002` and no MCQ tables beforehand. Remote now has `mcqs`, `mcq_choices`, `mcq_attempts`.
**Next Steps**: This capability’s phases are complete. Further product work needs a new PRD.
