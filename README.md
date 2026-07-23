# Cadence — OKR & Daily Task Tracker

A team app to run day-to-day work and connect it to quarterly goals, so nothing
slips and everyone can see how daily effort ladders up to the goals that matter.

Built as a real multi-user app: **React (Vite) + Tailwind** on the front end,
**Supabase (Postgres + Auth + Row Level Security)** for data, auth, and
permissions. The reference `okr_task_tracker.html` informed the UI, the
carry-forward logic, the acceptance flow, and the Project × KR grid — this
repo re-implements all of that against a proper backend.

## The mental model

Every task carries three things:

- a **due date** (when it's due),
- a **project** — the ongoing workstream (SEO, Email, ABM, … user-defined and unlimited),
- a **Key Result** it serves — the measurable quarterly goal it moves.

Picture a grid: **projects are rows, Key Results are columns, tasks sit in the
cells.** Read a row to judge a workstream, read a column to judge a goal. A daily
standup keeps it honest — anything unfinished rolls forward automatically and
loudly, with a counter, so nothing disappears silently.

## Features

- **My Day** — today's tasks with carried-forward/overdue work pinned in red; one-tap standup.
- **Daily standup** — tick what's done; unticked work auto-carries to today (`carry_forward_count++`).
- **My Tasks / My Week / Goals / Blockers** — member views, grouped/filtered by project and KR.
- **Command Dashboard** — due/overdue/blocked/pushed-3+ counts, KR confidence heatmap, needs-attention feed, live standup roll-up.
- **All Tasks** — org-wide, filterable (assignee, status, project, KR) with Overdue/Blocked/Pushed-3+ quick filters and bulk reassign/reschedule.
- **People / Workload**, **OKR Tree** (drill from a red KR to the stuck tasks), **Projects dashboard**, **Project × KR Grid**.
- **Standup Board** (facilitation, blockers-first with helper assignment) and **Reviews** (weekly / monthly / quarterly grading).
- **Admin Settings** — people & roles, projects (add/rename/lead/archive), Objectives & Key Results.
- **Rules that make it more than a to-do list**: visible carry-forward, first-class blockers with owner & age, binary "done" with a one-click acceptance step for high-stakes work, Definition-of-Done checklists, on-time judged against the **original** committed date, KRs measured & scored (never checked off), and an audit log for every status/reassignment/due-date change.

## Roles

`admin` (everything), `manager` (full team visibility, assign/reschedule/accept, run reviews), `member` (own tasks, submit standups, see team goals & blockers), `viewer` (read-only dashboards). Enforced at the data layer via RLS, not just the UI.

---

## Setup

### 1. Create the database (Supabase)

In your Supabase project's **SQL editor**, run the migration files in order, then the seed:

Run **every file in `supabase/migrations/` in numeric order** (0001 → 0006), then optionally the seed:

1. `0001_init.sql` — tables, RLS policies, helper functions, the new-user → profile trigger, and `carry_forward_sweep()`.
2. `0002_admin_delete_user.sql` — admin-only "delete user" function + RLS.
3. `0003_deps_delete_viewer.sql` — task dependencies, admin-only task delete, strictly read-only Viewer.
4. `0004_depends_on_user.sql` — "Depends on" points to a person.
5. `0005_assign_and_multi_deps.sql` — open assignment + many dependency people per task.
6. `0006_review_workflow.sql` — submit/approve workflow, project members & task collaborators, the "SEO/Website" project.
7. `0007_manager_scope_notifications.sql` — scope managers to their own projects (RLS), required change-request comments + history, and in-app notifications.
8. `0008_fix_recurring_overdue.sql` — one-time correction of recurring tasks wrongly shown overdue.
9. `0009_keep_submitted.sql` — stop the carry-forward sweep reverting submitted-for-review tasks; add `submitted_at`; restore already-reverted rows.
10. `supabase/seed.sql` — *(optional demo)* six sign-in-able accounts and a full sample dataset.

(`supabase/cleanup_users.sql` is a separate optional one-off for pruning demo accounts.)

> The seed creates real Supabase Auth users, so you can log straight in.
> All demo accounts share the password **`cadence123`**:
> `admin@team.com` (admin), `manager@team.com` (manager),
> `neha@team.com` · `amit@team.com` · `vithika@team.com` (members),
> `viewer@team.com` (viewer).

If you **don't** run the seed, the very first account created via the login
screen's "Create an account" automatically becomes the **admin**.

### 2. Configure the front end

The repo ships with a `.env` pointing at the provided project. The
`VITE_SUPABASE_ANON_KEY` is the browser-safe **publishable** key — it's meant to
be public; RLS is what protects the data. To point at your own project, copy
`.env.example` to `.env` and set:

```
VITE_SUPABASE_URL=https://<your-ref>.supabase.co
VITE_SUPABASE_ANON_KEY=<your publishable/anon key>
```

### 3. Run locally

```bash
npm install
npm run dev        # http://localhost:5173
```

`npm run build` produces a static `dist/`; `npm run preview` serves it.

---

## Deploy

This is a static SPA — deploy the built `dist/` to any static host. Config for
both is included, plus SPA fallback rewrites so deep links / refreshes work.

**Vercel** (`vercel.json` included)

```bash
npm i -g vercel
vercel            # first run links the project
vercel --prod
```
Set the env vars `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` in the Vercel
project settings (Build command `npm run build`, output `dist`).

**Netlify** (`netlify.toml` included)

```bash
npm i -g netlify-cli
netlify deploy --build --prod
```
Add the same two env vars under Site settings → Environment variables.

Either way: after the first deploy, in Supabase go to **Authentication → URL
Configuration** and add your deployed origin to the allowed redirect/site URLs.

---

## Architecture

```
src/
  lib/            supabase client, date/format helpers, domain constants & KR maths, db access layer
  context/        AppData (auth session + loaded team data + all mutations), Nav (in-app router)
  components/     Layout, Modal, Dialog (alert/confirm/prompt), TaskRow, BlockerCard, PageHead,
                  ModalHost + modals/ (Task, Standup, Checkin, Blocker, User, Project, Objective, KR, Score)
  hooks/          useTaskHandlers (open + toggle-with-DoD-gate)
  pages/          Login, MyDay, MyTasks, Goals, MyWeek, Blockers, Dashboard, AllTasks, People,
                  OKRTree, Projects, Grid, StandupBoard, Reviews, Settings
supabase/
  migrations/0001_init.sql    schema + RLS + functions + triggers
  seed.sql                    demo accounts + sample data
```

- **Auth**: Supabase email/password. A trigger mirrors each `auth.users` row into `public.profiles`; the first user becomes `admin`.
- **Data flow**: on login the app loads the team's working set, runs the once-per-day `carry_forward_sweep()` RPC, then reads/writes through PostgREST. Every mutation writes an `audit_log` entry.
- **Carry-forward** is a `SECURITY DEFINER` Postgres function so any member's first login of the day can roll the whole team's unfinished work forward without tripping RLS. It's idempotent (guarded by `app_meta.last_sweep`).
- **Permissions** live in RLS policies (`supabase/migrations/0001_init.sql`): members edit only their own tasks, viewers are read-only, managers/admins see and edit everything, and a KR's owner can accept tasks and run check-ins on it.

## Notes & limits

- Adding a teammate = they sign up on the login screen (creating auth users on someone's behalf needs the service key and is done from the Supabase dashboard). Admins then set roles under Settings.
- `original_due_date` is set once and never overwritten — that's the on-time baseline.
- Acceptance is auto-required for client-facing tasks or tasks under a *committed* KR; it stays configurable per task.
