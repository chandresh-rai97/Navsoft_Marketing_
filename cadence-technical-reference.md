# Cadence — Technical Reference

> A maintainer's reference for the Cadence OKR & Daily Task Tracker, written
> against the actual code in this repository (not the product spec). File paths
> and migration numbers are cited so you can verify every claim.
>
> Last updated from the code at branch `claude/okr-daily-task-tracker-micaj9`.
> Where the shipped `README.md` disagrees with the code, this document follows
> the code and the disagreements are listed under
> [Known gaps & doc lag](#known-gaps-unfinished--doc-lag).

---

## 1. What it is

Cadence is a single-team, multi-user web app for running daily work and
connecting it to quarterly OKRs. It is a React single-page app talking directly
to Supabase (Postgres + Auth + PostgREST) from the browser. There is **no custom
backend server** — all authorization is enforced by Postgres Row Level Security
(RLS), helper functions, and triggers. The browser holds only the public
Supabase anon/publishable key.

Two large feature areas sit on top of the task core:
- the **review (submit/approve) workflow** with DB-enforced approval routing, and
- **Efforts vs Outcome**, a per-channel marketing metrics tracker with monthly
  and weekly entry and carry-forward maths.

---

## 2. Tech stack

| Layer | Choice | Notes |
|---|---|---|
| UI framework | React 18.3 | `src/`, function components + hooks only |
| Build tool | Vite 5.4 | `vite.config.js`; dev port 5173, preview 4173 |
| Styling | Tailwind 3.4 + a hand-ported CSS design system | utility classes plus global classes in `src/index.css`; tokens mirrored in `tailwind.config.js` |
| Data / auth | Supabase JS 2.45 (`@supabase/supabase-js`) | `src/lib/supabase.js` |
| Database | Supabase Postgres | schema + RLS in `supabase/migrations/` |
| Hosting | Static SPA | `vercel.json` and `netlify.toml`, both with SPA fallback rewrites |

There is **no test suite** in the repo, no TypeScript, and no state library
(global state is a single React context). Routing is an in-memory view switch,
not a URL router (see [§6](#6-routing--navigation)).

Dependencies (`package.json`): runtime = `react`, `react-dom`,
`@supabase/supabase-js`; dev = `vite`, `@vitejs/plugin-react`, `tailwindcss`,
`postcss`, `autoprefixer`. Scripts: `dev`, `build`, `preview`.

---

## 3. Project / folder structure

```
/
├── index.html                 SPA entry
├── package.json               deps + scripts
├── vite.config.js             Vite + React plugin
├── tailwind.config.js         color/font tokens
├── postcss.config.js
├── vercel.json / netlify.toml deploy config + SPA rewrites
├── .env / .env.example        VITE_SUPABASE_* (public keys)
├── README.md                  product/setup README (see doc-lag notes)
├── src/
│   ├── main.jsx               React root; wraps <App/> in <AppDataProvider>
│   ├── App.jsx                role→view gating, ROUTES map, top-level render
│   ├── index.css              design system (incl. .eo-* tracker styles)
│   ├── lib/
│   │   ├── supabase.js        Supabase client (reads env vars)
│   │   ├── db.js              data-access layer: loadAll + CRUD + RPC wrappers
│   │   ├── format.js          date/number helpers; nextOccurrence recurrence
│   │   ├── logic.js           domain constants (ROLES, STATUSES…), KR maths, overdue/on-time
│   │   ├── eo.js              Efforts vs Outcome compute engine (pure)
│   │   └── csv.js             dependency-free CSV parse/build/download
│   ├── context/
│   │   ├── AppData.jsx        THE core: auth session, loaded DB, every mutation
│   │   └── Nav.jsx            in-app router context
│   ├── hooks/
│   │   └── useTaskHandlers.js open task modal + toggle-with-DoD-gate
│   ├── components/
│   │   ├── Layout.jsx         sidebar nav + badge pills (role-based)
│   │   ├── Modal.jsx, Dialog.jsx (alert/confirm/prompt), PageHead.jsx
│   │   ├── TaskRow.jsx, BlockerCard.jsx, ReviewActions.jsx, EoCell.jsx
│   │   ├── ModalHost.jsx      modal registry/opener context
│   │   └── modals/            Task, Standup, Checkin, Blocker, User, Project,
│   │                          Objective, KR, Score, EoRows, ImportEo, ImportTasks
│   └── pages/                 one component per view (see §6)
└── supabase/
    ├── migrations/0001…0014   schema + RLS + functions + triggers (run in order)
    ├── seed.sql               optional: 6 demo auth users + sample data
    ├── eo_seed.sql            optional: Efforts vs Outcome template rows + sample
    └── cleanup_users.sql      optional one-off: prune accounts
```

Data flow: `main.jsx` → `AppDataProvider` (loads the whole team's working set on
login) → `App.jsx` picks a page by role → pages read from the `db` object and
call mutation functions from the context. Every mutation writes, then calls
`refresh()` to reload `db`.

---

## 4. Database schema

All tables live in schema `public`. Primary keys are `uuid` (via
`gen_random_uuid()`) unless noted. `profiles.id` is the exception — it equals the
`auth.users.id`. Column lists below are the **current** shape, folding in columns
added by later migrations (the migration that introduced a non-0001 column is
noted in parentheses).

### 4.1 `profiles` — one row per auth user
| Column | Type | Purpose |
|---|---|---|
| `id` | uuid PK → `auth.users(id)` cascade | same id as the auth user |
| `name` | text | display name (defaults from email local-part) |
| `email` | text | unique on `lower(email)` |
| `role` | text | `admin` / `manager` / `member` / `viewer` (check-constrained) |
| `team_id` | uuid | future multi-team; **unused today** |
| `timezone` | text | default `Asia/Kolkata`; informational |
| `notification_prefs` | jsonb | reserved; not read by the app |
| `active` | boolean | soft-enable; `activeUsers()` filters on it |
| `created_at` | timestamptz | |

A DB trigger (`handle_new_user`) creates this row on auth signup; the **first
ever** user becomes `admin`, everyone else `member`.

### 4.2 `projects` — the workstream/"channel" axis
| Column | Type | Purpose |
|---|---|---|
| `id` | uuid PK | |
| `name` | text | also how Efforts vs Outcome matches a "channel" |
| `description` | text | |
| `lead_user_id` | uuid → profiles, set null | the project **manager**; drives manager scoping and review routing |
| `status` | text | `active` / `archived` |
| `color` | text | hex, for UI |
| `created_at` | timestamptz | |

### 4.3 `objectives` — qualitative quarterly goals
`id`, `title`, `description`, `owner_user_id` (→ profiles), `team_id` (unused),
`quarter` (free text), `created_at`. Parent of `key_results`.

### 4.4 `key_results` — measured, scored goals
| Column | Type | Purpose |
|---|---|---|
| `id` | uuid PK | |
| `objective_id` | uuid → objectives, **cascade** | parent objective |
| `title` | text | |
| `owner_user_id` | uuid → profiles | the owner may check-in and (legacy) accept tasks on it |
| `metric_unit` | text | e.g. "signups", "%" |
| `start_value` / `target_value` / `current_value` | numeric | progress = clamp((current−start)/(target−start),0,1) |
| `confidence` | text | `on_track` / `at_risk` / `off_track` |
| `kr_type` | text | `committed` / `stretch` |
| `final_score` | numeric nullable | set at grading |
| `retro_notes` | text | |
| `last_checkin_at` | timestamptz | |
| `checkin_history` | jsonb array | appended each check-in `{week,value,confidence,note}` |
| `created_at` | timestamptz | |

### 4.5 `tasks` — the center of the app
Base columns (0001):
`id`, `title`, `description`, `assignee_user_id`→profiles,
`project_id`→projects, `key_result_id`→key_results (**optional** — may be null),
`status`, `due_date`, `original_due_date`, `planned_for_date`,
`due_date_change_count`, `due_date_history` (jsonb), `carry_forward_count`,
`carry_forward_history` (jsonb), `definition_of_done` (jsonb array of
`{text,done}`), `acceptance_required` (bool), `accepted_by_user_id`,
`reopened_count`, `recurrence` (`none`/`daily`/`weekly`/`custom`),
`recurrence_config` (jsonb), `completed_at`, `completed_by_user_id`,
`cancelled_reason`, `client_facing` (bool), `created_at`.

`status` check constraint (final, after 0006) allows:
`not_started`, `in_progress`, `blocked`, `done_pending_acceptance`, `done`,
`carried_forward`, `cancelled`, `changes_requested`.

Columns added by later migrations:
| Column | Migration | Purpose |
|---|---|---|
| `proof_link` | 0006 | evidence link on submit |
| `resubmit_by` | 0006 | deadline set when changes requested |
| `review_note` | 0006 | latest reviewer note |
| `uses_review` | 0006 | `true` = new submit/approve flow; set `false` on all pre-existing rows ("legacy") |
| `review_history` | 0007 | jsonb array; every change-request round `{at,by,resubmit_by,note}` (append-only) |
| `submitted_at` | 0009 | when it entered review; drives the reviewer "waiting" clock |
| `assigned_by_user_id` | 0010 | who assigned it (for "Assigned by [name]") |

Key date semantics:
- `due_date` — the current due date; may move.
- `original_due_date` — **set once, never overwritten**; the on-time baseline.
- `planned_for_date` — which day it shows up on; the carry-forward sweep bumps
  this to today.

Indexes: assignee, project, key_result, status.

**Task dependencies** (people a task depends on) were originally a column
(`depends_on_task_id` in 0003, then `depends_on_user_id` in 0004), both **dropped**
and replaced by the junction table `task_dependencies` (0005). There is no
`depends_on_*` column on `tasks` anymore.

### 4.6 `task_dependencies` (0005) — task → many people
Composite PK `(task_id, user_id)`, both cascade. "This task depends on these
people." Managed by `syncTaskDeps` (delete-all-then-insert).

### 4.7 `project_members` (0006) — project → many users
Composite PK `(project_id, user_id)`. A project's lead (or an admin) can add/
remove members. Read by `projectMemberIds`.

### 4.8 `task_collaborators` (0006) — temporary helpers on one task
PK `(task_id, user_id)` plus `added_by`. A project manager can add another
manager onto a single task. A trigger (`revoke_collaborators_on_done`) deletes
all of a task's collaborators once it becomes `done`.

### 4.9 `blockers` — first-class impediments
`id`, `task_id`→tasks (set null), `raised_by_user_id`, `description`,
`owner_user_id` (the assigned helper), `status` (`open`/`resolved`),
`created_at`, `resolved_at`. Raising a blocker on an open task also sets that
task's status to `blocked` (client-side in `createBlocker`).

### 4.10 `standup_entries` — the daily check
`id`, `user_id`→profiles (cascade), `date`, `yesterday_completed_task_ids`
(jsonb), `today_task_ids` (jsonb), `blockers_text`, `submitted_at`. Unique on
`(user_id, date)` (one standup per person per day, upserted).

### 4.11 `weekly_priorities` — optional weekly commitments
`id`, `title`, `owner_user_id`, `key_result_id`, `week` (text), `created_at`.
Used by the My Week page.

### 4.12 `notifications` (0007) — in-app notifications
`id`, `user_id`→profiles (cascade), `type`, `task_id`→tasks (cascade),
`message`, `read` (bool), `created_at`. Indexed on `(user_id, read)`. Added to
the `supabase_realtime` publication so the browser refreshes on insert.
Currently only written by `requestChanges` (type `changes_requested`).

### 4.13 `audit_log` — append-only history
`id`, `entity_type`, `entity_id`, `action`, `changed_by_user_id`, `old_value`
(jsonb), `new_value` (jsonb), `ts`. Written best-effort by `writeAudit` on
nearly every mutation. Readable only by managers/admins.

### 4.14 `app_meta` — singleton bookkeeping
Single row (`id=1`) holding `last_sweep` (date). Guards the once-per-day
carry-forward sweep. Clients can read it; only the `SECURITY DEFINER` sweep
writes it.

### 4.15 Efforts vs Outcome tables (0011, +granularity in 0013)
- **`eo_metrics`** — the config rows (left columns): `id`, `project_id`→projects
  (cascade), `section` (`effort`/`outcome`), `name`, `unit`, `direction`
  (`higher`/`lower`), `carry` (bool = "Carry? Yes/No"), `position`, `created_at`.
- **`eo_months`** — a period *column* for a channel: `id`, `project_id`, `month`
  (the period key — `'YYYY-MM'` for a month or `'YYYY-MM-W#'` for a week),
  `granularity` (`month`/`week`, default `month`), `created_at`. Unique
  `(project_id, month)`.
- **`eo_entries`** — the user-entered cells: `id`, `project_id`, `metric_id`→
  eo_metrics (cascade), `month` (period key), `base_target` (numeric),
  `achieved` (numeric), `carried_in` (numeric — only meaningful for the first
  month), `granularity`, `created_at`. Unique `(metric_id, month)`.

A channel **is** a project; Efforts vs Outcome is limited to four projects by
name — `Email Marketing`, `SEO`, `Performance Marketing`, `Social Media`
(case/space-insensitive) — enforced by `eo_is_allowed_channel` + the
`eo_enforce_channel` insert trigger (0012).

### 4.16 Relationship map (text)
```
auth.users 1─1 profiles
profiles 1─* projects(lead_user_id)         profiles 1─* objectives(owner)
objectives 1─* key_results (cascade)        key_results 1─* tasks (optional)
projects 1─* tasks                          profiles 1─* tasks(assignee / assigned_by / completed_by / accepted_by)
tasks *─* profiles  via task_dependencies   tasks *─* profiles via task_collaborators
projects *─* profiles via project_members
tasks 1─* blockers                          profiles 1─* blockers(raised_by / owner)
profiles 1─* standup_entries                profiles 1─* weekly_priorities
profiles 1─* notifications ─?─ tasks
projects 1─* eo_metrics 1─* eo_entries      projects 1─* eo_months
(everything) ─* audit_log                   app_meta = singleton
```

---

## 5. DB functions & triggers

All helper functions are `SECURITY DEFINER` with `search_path` pinned, so they
can read across RLS without recursion.

| Function | Migration | What it does |
|---|---|---|
| `my_role()` | 0001 | returns the caller's role |
| `is_manager()` | 0001 | true for admin or manager |
| `is_viewer()` | 0001 | true for viewer |
| `manages_project(pid)` | 0007 | true if caller is that project's `lead_user_id` |
| `is_task_collaborator(tid)` | 0007 | true if caller is a collaborator on the task |
| `eo_is_allowed_channel(pid)` | 0012 | true if the project is one of the four channels |
| `handle_new_user()` | 0001 | signup trigger → profiles row; first user = admin |
| `guard_profile_change()` | 0001 | non-managers can't change their own `role`/`active` |
| `admin_delete_user(target)` | 0002 | admin-only; deletes the `auth.users` row (cascades) |
| `carry_forward_sweep(p_today)` | 0001, revised 0009 | rolls unfinished work forward once/day (see §7.2) |

| Trigger (on `tasks` unless noted) | Migration | Effect |
|---|---|---|
| `on_auth_user_created` (on `auth.users`) | 0001 | runs `handle_new_user()` |
| `guard_profile_change` (on `profiles`) | 0001 | blocks role/active self-escalation |
| `enforce_task_review` | 0006 | a non-manager cannot set a `uses_review` task to `done` (members must submit for review) |
| `revoke_collaborators_on_done` | 0006 | deletes task_collaborators when a task hits `done` |
| `enforce_review_routing` | 0010 | enforces who may approve/bounce a submitted task (see §7.3) |
| `eo_enforce_channel` (on eo_* tables) | 0012 | blocks tracker rows on non-channel projects |

---

## 6. Routing & navigation

There is no URL router. `App.jsx` holds `view` state and maps it to a page
component via `ROUTES`. `NavContext` exposes `navigate(view, arg)`. On refresh
you return to the default view for your role (SPA host rewrites keep deep links
from 404-ing, but the app has no deep-link state).

Pages (`src/pages/`): `Login`, `MyDay`, `MyTasks`, `Goals`, `MyWeek`,
`Blockers`, `Notifications`, `Dashboard`, `AllTasks`, `Acceptance`, `Done`,
`People`, `Grid` (labeled "Projects" in nav), `Reviews`, `EffortsOutcome`,
`Settings`.

`App.jsx` gates views by role with `allowedView(role, view)`:
- **member** → `myday, mytasks, notifications, goals, myweek, blockers`
- **manager** → member views **plus** `dashboard, alltasks, acceptance, done,
  grid, reviews, efforts` (no People/Workload, no Settings)
- **viewer** → `dashboard, alltasks, acceptance, done, people, grid, reviews,
  efforts, goals, blockers` (read-only)
- **admin** → everything (`settings` included)

`Layout.jsx` builds the sidebar from the same role rules and shows badge pills:
unread notifications, open blockers, acceptance queue (`canReview` count),
dashboard "needs attention" count, and My Day count.

---

## 7. Key logic as built

### 7.1 Auth & bootstrapping (`AppData.jsx`)
- Supabase email/password. `signUp` passes `name` in user metadata; the
  `handle_new_user` trigger creates the profile and makes the **first** user an
  admin.
- On a session appearing, the provider: (1) runs `carry_forward_sweep(today)`
  via RPC, (2) calls `loadAll()` which `select *` from every table in parallel
  into the `db` object. No pagination — the whole team's working set loads each
  time (fine for an MVP, a scaling limit otherwise).
- A realtime channel subscribes to `notifications` filtered to the current user
  and calls `refresh()` on any change (best-effort).
- `me` = the profile row whose id matches the session user.

### 7.2 Carry-forward sweep
`carry_forward_sweep(p_today)` (`SECURITY DEFINER`, called on every login):
1. If `app_meta.last_sweep = p_today`, return (idempotent — runs at most once
   per calendar day, no matter who logs in).
2. For every task with `planned_for_date < p_today` whose status is **not** in
   `('done','cancelled','done_pending_acceptance','changes_requested')`: set
   `planned_for_date = p_today`, `status = 'carried_forward'`, increment
   `carry_forward_count`, and append today's date to `carry_forward_history`.
3. Record `last_sweep = p_today`.

The two review statuses were **added to the exclusion list in 0009** to fix a bug
where a submitted task was swept back out of review once a day. `original_due_date`
and `due_date` are untouched by the sweep — only `planned_for_date`/status move.

### 7.3 Submit / approve / verify (the review workflow)
Two related mechanisms coexist:

**A. `acceptance_required` gate (older, `applyStatus`).** When a task is moved to
`done`:
- If it has an unfinished Definition-of-Done item → blocked with a message.
- If `acceptance_required` is true → status becomes `done_pending_acceptance`
  and `submitted_at` is stamped (it is *not* marked done yet).
- Otherwise → `markDone` (status `done`, stamp `completed_*`, and spawn the next
  recurrence if any).

**B. `uses_review` submit/approve flow (newer, the real path for members).**
- New tasks default `uses_review = true`; all pre-0006 tasks were set `false`
  ("legacy", members may still complete those directly).
- `enforce_task_review` (DB trigger) forbids a non-manager from setting a
  `uses_review` task to `done` — so members **submit** instead of completing.
- `submitForReview(id, proofLink)` → status `done_pending_acceptance`,
  `proof_link`, clears `resubmit_by`, stamps `submitted_at`.
- `acceptReview(id)` → status `done`, stamps `completed_*`/`accepted_by`, spawns
  recurrence. Guarded client-side by `canReview`.
- `requestChanges(id, resubmitBy, note)` → **note is required**; status
  `changes_requested`, sets `resubmit_by`/`review_note`, **appends** to
  `review_history` (never overwrites), increments `reopened_count`, and inserts
  a `notification` to the assignee.

**Approval routing (who is the reviewer).** Computed in `canReview`/`reviewerId`
(client) and enforced identically by `enforce_review_routing` (DB trigger, 0010),
keyed on the **assignee** (the person who did the work):
- assignee is a **member** → the reviewer is that task's **project lead**
  (`projects.lead_user_id`); if the project has no lead, an **admin** may approve
  as a fallback.
- assignee is a **manager or admin** → the reviewer is an **admin** (nobody
  approves their own work).

The DB trigger raises an exception if the wrong person tries to move a
`done_pending_acceptance` task to `done` or `changes_requested`, so routing holds
even against a hand-crafted API call. The Acceptance page and the acceptance nav
pill both filter by `canReview`.

> Note: `acceptTask` in `AppData.jsx` (the legacy KR-owner acceptance path) is
> exported but **not referenced by any page** — the UI uses `acceptReview`. See
> doc-lag notes.

### 7.4 Due dates & recurrence
- On-time (`logic.js#onTime`) is judged against `original_due_date`, never the
  moved `due_date`.
- Overdue (`logic.js#isOverdue`) = status in `OPEN_STATUSES`
  (`not_started, in_progress, blocked, changes_requested, carried_forward`) **and**
  `due_date < today`. `done_pending_acceptance` is deliberately excluded — once
  submitted, the ball is with the reviewer, so it never reads as overdue.
- Editing `due_date` appends to `due_date_history` with a reason and increments
  `due_date_change_count`. After `MOVE_REASON_AFTER` (3) moves the UI requires a
  reason.
- **Recurrence** (`markDone`/`acceptReview` + `format.js#nextOccurrence`): when a
  recurring task is completed, a fresh `not_started` copy is created. The next
  date advances by the step (daily = 1 day, weekly = 7) from **the later of the
  current due date and today**, so a task finished late resumes on schedule
  instead of being born already overdue. `recurrence = 'custom'` is accepted by
  the schema but has no step and is treated as non-advancing by the code.
  Migration 0008 was a one-time correction of occurrences already mislabeled
  overdue by the old (pre-fix) logic.

### 7.5 Efforts vs Outcome calculations (`lib/eo.js`)
A channel's grid has six computed/entered sub-columns per period: **Base Target**
(entered), **Carried In**, **Total Target**, **Achieved** (entered), **Attain %**,
**To Carry**. `computeChannelV2(metrics, months, weeks, entries)` returns
`{ monthCells, weekCells }`.

Per-cell formulas:
- **Total Target** = `(Base Target ?? 0) + Carried In`.
- **Carried In**: the channel's *first* month uses the entered `carried_in`
  (default 0, and it is the only editable Carried In); every later month's
  Carried In = the previous month's **To Carry**. (Weeks chain the same way: the
  first week of a month is seeded by the month's Carried In, each later week from
  the previous week's To Carry.)
- **Attain %** (`ratio`): if `Achieved` is null → null. For `direction = higher`:
  `Achieved / Total` (null if Total = 0). For `direction = lower`:
  `Total / Achieved` (null if Achieved = 0).
- **To Carry**: if `carry = Yes` and `Achieved` is not null →
  `max(Total − Achieved, 0)`; otherwise 0.
- **Traffic light** (`attainColor`): Attain ≥ 100% green, 80–99% yellow,
  < 80% red.

Month vs week — the **current** rule (after the recent change; the 0013 comment is
now stale, see doc-lag):
- Each month computes a **weekly rollup** from any week rows it has: `carry = Yes`
  metrics **SUM** the weeks' base/achieved; `carry = No` metrics **AVERAGE** the
  entered weeks; the month's To Carry = the last week's To Carry.
- A **typed monthly value overrides** that rollup per field. If `base_target` or
  `achieved` is entered on the month row, the month uses the typed value(s) and
  computes To Carry with the month formula. If nothing is typed and weeks exist,
  the month reflects the weekly rollup exactly (unchanged legacy behavior). So the
  user may enter data month-wise **or** week-wise — their choice. Month Base
  Target / Achieved cells are always editable in the UI (`EffortsOutcome.jsx`).

Dashboard rollup (`channelMonthSummary`, admin/viewer only): per channel per
month, **Effort %** = average Attain of effort metrics, **Outcome %** = average
Attain of outcome metrics, **Carried Fwd** = sum of effort metrics' To Carry,
**# Lagging** = count of metrics with `0 < Attain < 1`.

Period parsing for CSV import (`parseEoPeriod`) is deterministic and never uses
`new Date()` (which mis-parsed `"Aug 2026"` as year 2001 — the bug 0014 repaired).
It requires an explicit 4-digit year and accepts `"Aug 2026"`, `"2026-08"`, and
weekly `"Aug 2026 Week 1"`.

---

## 8. Row Level Security — what each role can do

RLS is enabled on **every** table. Policies use the `SECURITY DEFINER` helpers
above. The browser only ever holds the anon key, so these policies are the real
security boundary.

### 8.1 By table (current policies after all migrations)
- **profiles** — everyone authenticated can **read** all. Insert: self or
  manager. Update: self or manager, but **not** a viewer (0003), and the
  `guard_profile_change` trigger stops non-managers changing `role`/`active`.
  Delete: **admin only** (0002).
- **projects / objectives** — read all; write requires `is_manager()`.
- **key_results** — read all; insert/delete manager-only; update by manager **or**
  the KR owner, never a viewer (0003).
- **tasks** —
  - *select* (0007): admin/viewer/member see all; a **manager** sees only tasks
    they are assignee of, in a project they manage, or are a collaborator on.
  - *insert* (0007): not a viewer, and (admin/member anywhere, or a manager into a
    project they manage, or a task for themselves).
  - *update* (0007): not a viewer, and (admin / assignee / project manager /
    collaborator / the task's KR owner).
  - *delete*: **admin only** (0003/0004). Bulk delete = several single deletes,
    each RLS-checked.
- **task_dependencies / task_collaborators / project_members** — read all;
  writes gated (deps/collab: any non-viewer for deps; collaborators and members
  by admin or the project lead).
- **blockers** — read all; insert/update by raiser/owner/manager (non-viewer);
  delete manager-only.
- **standup_entries** — read all (facilitation board); a user writes only their
  own row (managers may edit any); **no viewer writes** (0003).
- **weekly_priorities** — read all; owner or manager writes (non-viewer).
- **notifications** (0007) — you see/update/delete only **your own**; any
  non-viewer may insert one (e.g. a reviewer notifying a member).
- **audit_log** — **managers/admins read**; any non-viewer may append.
- **app_meta** — read-only to clients; writes happen inside the sweep function.
- **eo_metrics / eo_months / eo_entries** (0011) — **select**: admin & viewer see
  all channels, a manager sees only the project(s) they lead. **write**: not a
  viewer, and (admin or the project's manager).

### 8.2 Role summary
- **admin** — full read/write everywhere; the only role that can delete users or
  tasks, and the top of the review chain (approves managers' submissions).
- **manager** — full write on projects/objectives/KRs/tasks, but **task
  visibility is scoped** to projects they lead, their own tasks, and
  collaborations. Reviews submissions from members on the projects they lead.
  Nav excludes People/Workload and Settings.
- **member** — reads team data; writes their own tasks, standups, blockers,
  weekly priorities; **submits** review-flow tasks (cannot self-mark done).
- **viewer** — can **read** every table but **write to none** (verified across
  profiles, standups, KRs, tasks, blockers, weekly_priorities, audit, EO).
  Read-only oversight UI.

---

## 9. Migrations — what each one changed

Run in numeric order in the Supabase SQL editor. All are written to be safe to
re-run.

| # | File | Change |
|---|---|---|
| 0001 | `init.sql` | All base tables, RLS, helper functions, `handle_new_user`/`guard_profile_change` triggers, and `carry_forward_sweep()`. |
| 0002 | `admin_delete_user.sql` | `admin_delete_user()` (admin-only, deletes auth user → cascades); profiles delete policy = admin-only. |
| 0003 | `deps_delete_viewer.sql` | Added `depends_on_task_id` (task→task); made task delete admin-only; closed viewer write gaps on profiles/standups/KRs. |
| 0004 | `depends_on_user.sql` | Replaced task-dependency with `depends_on_user_id` (task→person); dropped `depends_on_task_id`; reasserted admin-only task delete. |
| 0005 | `assign_and_multi_deps.sql` | Open assignment (any non-viewer may assign to anyone); added `task_dependencies` junction (many people); migrated + dropped `depends_on_user_id`. |
| 0006 | `review_workflow.sql` | Added `proof_link/resubmit_by/review_note/uses_review`; marked all existing tasks legacy (`uses_review=false`); added `changes_requested` status; `project_members` + `task_collaborators` tables + RLS; `enforce_task_review` and `revoke_collaborators_on_done` triggers; created a "SEO/Website" project. |
| 0007 | `manager_scope_notifications.sql` | `manages_project`/`is_task_collaborator` helpers; **manager-scoped** task select/insert/update RLS; `review_history` column; `notifications` table + RLS + realtime. |
| 0008 | `fix_recurring_overdue.sql` | One-time data fix: rolled still-open past-due daily/weekly tasks forward to their next on-cadence date (pairs with the `nextOccurrence` code fix). |
| 0009 | `keep_submitted.sql` | Rewrote the sweep to also exclude `done_pending_acceptance`/`changes_requested`; added `submitted_at`; restored tasks already wrongly swept out of review. |
| 0010 | `review_routing_assigned_by.sql` | Added `assigned_by_user_id`; `enforce_review_routing` trigger (member→project lead, manager/admin→admin), DB-enforced. |
| 0011 | `efforts_outcome.sql` | `eo_metrics`/`eo_months`/`eo_entries` tables + RLS scoped like managers. |
| 0012 | `eo_four_channels.sql` | `eo_is_allowed_channel()`; deleted tracker rows on non-channel projects; `eo_enforce_channel` insert trigger limiting to the four channels. |
| 0013 | `eo_weekly.sql` | Added `granularity` (`month`/`week`) to `eo_months`/`eo_entries` so a period key can be `'YYYY-MM'` or `'YYYY-MM-W#'`. |
| 0014 | `fix_eo_import_year.sql` | One-time data fix: remapped EO periods mis-imported under year 2001 back to 2026 (the `new Date("Aug 2026")` bug, since fixed in code). |

---

## 10. Environment variables

Only two, both **public** (browser-safe) and both read in `src/lib/supabase.js`:

| Variable | Purpose |
|---|---|
| `VITE_SUPABASE_URL` | the Supabase project URL (`https://<ref>.supabase.co`) |
| `VITE_SUPABASE_ANON_KEY` | the publishable/anon key; RLS — not secrecy — protects the data |

Where they are set:
- **Local dev / build** — `.env` at the repo root (committed, holds the public
  keys for the provided project). `.env.example` documents the format. Vite only
  exposes vars prefixed `VITE_`.
- **Vercel** — Project Settings → Environment Variables (build command
  `npm run build`, output `dist`); `vercel.json` sets framework/rewrites.
- **Netlify** — Site settings → Environment variables; `netlify.toml` sets the
  build + SPA redirect.
- After the first deploy, add the deployed origin to Supabase **Authentication →
  URL Configuration**.

There is **no service-role key** anywhere in the app (by design — there's no
server). Admin-privileged actions run through `SECURITY DEFINER` functions that
re-check the caller's role.

---

## 11. CSV import formats

- **Tasks** (`importTasks`, My Tasks → Import): columns (case/space-insensitive)
  `Task ID` (blank = create, present = update), `Title`, `Description`,
  `Project` (must match a project name), `Key Result` (optional — blank = none),
  `Assignee Email`, `Due Date` (`YYYY-MM-DD`), `Status`
  (Not started/In progress/Blocked/Done), `Recurrence` (None/Daily/Weekly).
  Returns `{created, updated, skipped[]}` with per-row reasons.
- **Efforts vs Outcome** (`importEoData`): columns `Channel` (must be one of the
  four), `Section` (Effort/Outcome), `Metric`, `Unit`, `Direction`, `Carry?`,
  `Period` (`"Aug 2026"` / `"2026-08"` / `"Aug 2026 Week 1"`), `Base Target`,
  `Achieved`. Matches or creates metrics; writes only Base Target/Achieved.

CSV parsing (`lib/csv.js`) is a hand-rolled parser handling quotes, embedded
commas/newlines, escaped quotes, BOM, and CRLF.

---

## 12. Known gaps, unfinished & doc lag

Factual observations from the current code — not aspirational:

1. **`README.md` is behind the code.** Its migration list stops at 0013 and does
   not mention `0014_fix_eo_import_year.sql`; its "Architecture" section lists
   pages that don't exist (`OKRTree`, `Projects`, `StandupBoard`) — the OKR Tree
   tab was removed, the Projects dashboard is `Grid.jsx` (nav label "Projects"),
   and standup/blocker facilitation lives in `Blockers.jsx`. Trust the code.
2. **Two overlapping completion mechanisms.** The older `acceptance_required` +
   `applyStatus` path and the newer `uses_review` submit/approve path both exist.
   New tasks use `uses_review = true`; the DB trigger forces members to submit
   rather than self-complete. `acceptTask` (legacy KR-owner acceptance) is still
   exported from `AppData.jsx` but is **not called by any page** — effectively
   dead code kept for the legacy path.
3. **EO month/week doc comment is stale.** `0013_eo_weekly.sql` still says "weeks
   are the source of truth and the month rolls up from its weeks." The current
   code treats the weekly rollup as a **fallback**: a typed monthly value
   overrides it (see §7.5). Behavior, not schema, changed — no migration needed.
4. **`recurrence = 'custom'`** is allowed by the schema but has no step logic;
   only `daily`/`weekly` actually advance.
5. **No pagination / full-table loads.** `loadAll()` selects every row of every
   table on each login/refresh. Fine for a single small team; it will not scale
   to large datasets.
6. **Unused/reserved columns:** `profiles.team_id`, `objectives.team_id`
   (multi-team is stubbed but single-team only), `profiles.notification_prefs`
   (not read), `profiles.timezone` (informational).
7. **Realtime is minimal and best-effort.** Only the `notifications` table is
   subscribed; the publication `add table` is wrapped to swallow errors.
8. **Notifications are narrow.** Only `requestChanges` writes one today
   (type `changes_requested`); the table/infrastructure supports more.
9. **No automated tests** and **no CI** in the repo. Verification is manual
   (`npm run build` + manual QA); the EO compute engine is pure and unit-testable
   but has no committed tests.
10. **Adding teammates** requires them to self-sign-up on the login screen (no
    service key to mint users in-app); admins then set roles in Settings. The
    `supabase/seed.sql` and `cleanup_users.sql` scripts mint/prune auth users
    directly and are meant to be run manually in the SQL editor.
