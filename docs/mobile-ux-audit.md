# Cadence Mobile UX: Phase 1 audit

Status: **audit only. No app code changed.** Waiting for approval before Phase 2.
Base: `main` @ `19d4b86`. Prompt: *Cadence Mobile UX Prompt* (Nov 6, 2026); section numbers below (§n) refer to it.

## How this was measured

- Production build (`vite build`) served locally, Supabase mocked with seeded data (4 users, about 12 tasks, EO metrics, Instantly / HubSpot / cold-calling rows).
- Playwright Chromium with phone emulation (`isMobile`, `hasTouch`) at **320, 360 and 390 px** wide, portrait 740 px tall; landscape spot checks at 740×360 and 844×390.
- Every screen in the menu was opened as **admin (16 screens), manager (11), member (5) and viewer (8)**: 120 screen loads in total. 14 modals and sheets were opened and checked.
- Automated checks for each screen: sideways page scroll, inner sideways scrollers, targets under 44 px and under 24 px, inputs under 16 px, text under 12 px, `title`-only (hover-only) info, tables, and whether the bottom bar covers the last content. A text-contrast scan ran on every admin screen at 390 px, light and dark.
- Real iPhone/Android checks (keyboard, toolbars, notch, finger accuracy) **were not possible in this environment.** They are part of the final checklist (§20).

---

## 1. Stack summary (§3.1)

| Item | What Cadence uses |
|---|---|
| Framework | React 18.3 SPA, Vite 5 (plugin-react) |
| Styling | One global `src/index.css` with CSS variables (NavAI tokens, light `:root` + `[data-theme="dark"]`), plus about 186 inline `style={{…}}` props. Tailwind 3 is installed and its directives are loaded, but the components use almost no utility classes. |
| Component library | None. Hand-written `Modal`, `Dialog` (alert/confirm/prompt), `ModalHost`, `MobileFilters` sheet, `TaskRow`, `PageHead`. |
| Router | **None.** `App.jsx` holds `view` state, `ROUTES` maps view to page, `allowedView(role, view, access)` gates by role and tab access. Refresh always returns to the role's home screen. `navigate()` always scrolls to the top. |
| State | One React context (`AppDataProvider`). `loadAll()` reloads every table (paginated). **Every save writes, then reloads everything** (`refresh()`; about 50 call sites). Realtime is used only for the signed-in user's notifications. |
| Fonts / tokens | Plus Jakarta Sans + IBM Plex Mono. Colours, borders, surfaces and focus ring come from tokens. Spacing is mostly literal px values; there are no spacing tokens. |
| Breakpoints today | Phone `max-width: 767.98px` (JS mirror: `useIsMobile`), tablet `768–1023.98px` (panels scroll sideways), plus legacy `900px` (narrower sidebar) and `640px` (`.ix-hide`). |
| PWA | Manifest, icons, build-time service worker (`src/sw-template.js` + Vite plugin): network-first pages, offline page, cache-first only for own assets and fonts, never Supabase. `OfflineScreen` overlay. SPA rewrites in `vercel.json` / `netlify.toml`. |

**Breakpoint choice.** Keep the existing **767.98 px** phone breakpoint rather than the suggested 600 px. It is close to the suggestion, it is already used in CSS and JS, and the desktop sidebar does not fit below 768 px. Tablet stays 768–1023 px and desktop starts at 1024 px, as suggested. Interaction moves to input-type queries (§4): `(hover: hover) and (pointer: fine)` for hover styles and `(pointer: coarse)` for bigger targets. No user-agent sniffing exists today, and none will be added.

---

## 2. Existing mobile and PWA work: keep, change, remove

This prompt replaces the earlier phone work (`a2926bd`). Verdict on each piece:

| Existing piece | Verdict | Why (§) |
|---|---|---|
| PWA manifest, icons, `apple-*` meta, theme-color sync | **Keep** | As you asked. |
| Service worker (precache, network-first pages, offline page, no API caching) and `OfflineScreen` | **Keep** | As you asked. Deep-link URLs (below) work with it unchanged, because navigations go to network first and fall back to `offline.html`. |
| `viewport-fit=cover` and safe-area padding on top bar, bottom bar, menu, sheets and modals | **Keep**; add `interactive-widget=resizes-content` to the viewport meta | §5 |
| Inputs forced to 16 px on phones, small-text bump to 14 px | **Keep**; switch inputs to `font-size: max(16px, 1em)` | §5. Measured: 0 inputs under 16 px, 0 text under 12 px. |
| `body { overscroll-behavior-y: none }` (phone CSS) | **Remove** | **It blocks pull-to-refresh in Chrome on Android**, which conflicts with your note 5. Put `overscroll-behavior: contain` on sheets, modals, the menu and inner scrollers instead. |
| `min-height: 100vh` on `.app`, `.side`, `.login-wrap` | **Change** to a `100vh` fallback followed by `100svh` | §5 |
| Fixed top bar with ☰ hamburger and slide-in sidebar | **Change**: the top bar keeps the title and at most 2 actions; the hamburger is removed; the side menu becomes a **More** tab | §8 says don't hide main navigation behind a hamburger alone. Admins currently have 16 destinations behind it. |
| Bottom tab bar (`.mtabs`, 4 tabs per role, badges) | **Change**: 4 tabs + More, line icons, `aria-current` kept, tap active tab scrolls to top | §8, §16. Current icons are text glyphs and emoji (▦ ☰ ✔ ☀ 🔔 ⛔). The emoji draw differently on iOS and Android and don't match the line icons used elsewhere (Filters, eye, refresh). |
| `MobileFilters` bottom sheet (5 screens) | **Keep and upgrade** | Add a top ✕ button, closes on Back, focus moves in and returns, `aria-modal`, `overscroll-behavior: contain`, background scroll lock, active filters shown as removable chips (§10, §17). |
| Full-screen `.modal` on phones, sticky footer actions | **Keep for long forms** (task, standup, import, EO rows, user/project editors) and give them their own URL or history entry. **Change** the short ones (`Dialog` confirm/alert/prompt, Tab access) to centred dialogs or bottom sheets | §10. Today "Delete task?" fills the whole screen for a two-line question. |
| All Tasks cards on phones (`.mcards`) | **Keep and rework** to the §17 task row: whole card opens the task, 44 px select box, `⋯` menu holding Open and Delete. Delete moves out of the row. | §6 keep opposing actions apart; §17 |
| Generic phone table rule (`table` becomes a sideways-scrolling block with a sticky first column) | **Replace** with row lists per screen (mapping table below). Keep sideways scrolling **only for the EO grid** and give that container `overscroll-behavior-x: contain`. | §7 tables become rows; your note 3 |
| `min-height: 44px` on every button, 13 px block padding on links | **Keep**; also fix the remaining small targets listed in §4 | §6 |
| `.panel .modal-actions` full-width buttons in task rows | **Change** | Today every My Day / My Tasks row ends in a full-width **Submit** button, so each row is about 2.5 screens tall per 3 tasks. Per §17 the row becomes: control · title · one meta line · `⋯`. |
| Tablet rule (panels scroll sideways at 768–1023 px) | **Keep** | It doesn't affect desktop. |

---

## 3. Inventory (§3.2)

**Screens (16 routed):** My Day, My Tasks, Notifications, My Week, Blockers, Command Dashboard, All Tasks, Acceptance, Done, People / Workload, Projects (grid → project drill-in), Efforts vs Outcome, Campaigns, HubSpot Team Activity, Cold Calling Activity, Admin Settings. Login. Goals and Reviews exist but are not routed; they stay untouched.

**Modals:** Task (create/edit/submit/review/proof link/checklist/history), Run standup, Raise blocker, Import tasks (CSV), EO import, EO manage rows, User, Project, Objective, KR, KR check-in, KR score. Also `Dialog` alert/confirm/prompt and the Tab access panel (eye icon).

**Menus and popovers:** EO "⚙ Columns" dropdown (closes on mouse-leave), side menu, Filters sheets.

**Tooltips (hover-only):** chart tooltips on Campaigns, HubSpot and Cold Calling (`onMouseMove`); `title=` on task chips ("Key Result", "Depends on", "Assigned by", "Needs acceptance"); **Cold Calling refresh tip** ("To send the newest sheet data, use Cadence → Send to Cadence now…"); **Settings → Instantly tags: the campaign-name list per tag is only in a `title`**; EO weekly-badge explanation; EO "Pick the month to add…".

**Tables:** 23 (counted in the mapping table). **Boards / calendars / drag / right-click / double-click:** none. **Keyboard shortcuts:** only Enter-to-add (standup, checklist, My Week, EO rows) and Esc-to-close. Each already has a visible button. **Search:** none on desktop (only "Search people" in Tab access), so no search will be added (§17).

**Forms:** Login, Task, Standup, Blocker, My Week priorities, Request changes (inline), EO cells (`type=number`) and add-period, Settings editors, Tab access.

---

## 4. What breaks at 320 / 360 / 390 px (§3.3)

Results were identical at all three widths unless a row says otherwise.

| Check | Result |
|---|---|
| Sideways **page** scroll | **0 px on all 120 screen loads.** |
| Sideways scroll **inside** containers | 20 tables scroll sideways in their own box: Dashboard 1, Campaigns 3, HubSpot 3, Cold Calling 4, Settings 8, EO grid 1. They are not broken, but §7 wants rows. |
| Targets under 44 px | All Tasks selection checkboxes **20×20** (also under the 24 px floor). Acceptance task titles (tap to open) **~110×21**. Settings user "Active" checkbox 20×20. Task modal checklist checkboxes 20×20. EO Columns checkboxes 20×20. Tab access user checkboxes 20×20. Refresh and eye icons **42×44** (Campaigns, HubSpot, Cold Calling); these sit at the top, so §6 asks for 48. Filters segmented "All" **38×44**. Campaigns "How this was put together" `<summary>` **288×21**. |
| Inputs under 16 px | 0. |
| Text under 12 px | 0. |
| Hover-only info | Listed in §3 Tooltips. The ones whose content can't be reached on a phone are the **Settings tag → campaign list**, the **Cold Calling refresh tip** and the **EO weekly-badge** explanation. Chart tooltips appear on tap through emulated mouse events but have no explicit tap behaviour. |
| Fixed bars covering content | The bottom bar never covers the last item: content ends 27 px or more above it on every screen. |
| **Broken: EO ⚙ Columns menu** | It opens off the **left edge** of the screen. Its content is clipped and there is no Close button (screenshot `modal-EO_columns_menu`). |
| **EO grid on phones** | Opens scrolled to the latest period (same as desktop). The section labels ("EFFORT — activity…", "OUTCOME…") are a 22-column-wide cell that starts off-screen, so **section headers are invisible**. The × remove-metric button sits next to the metric name in the frozen 130 px column and wraps it. |
| **Back button** | **Leaves the app on every screen and every open modal or sheet** (tested: Back with a task open leaves Cadence for the previous page). There is no history entry anywhere. |
| Refresh | Always returns to the role's home screen and loses the open task, filters and project drill-in. |
| Sheets and modals | 0 of 14 have `aria-modal`. Focus never moves into them. None use `overscroll-behavior: contain`. The page behind **still scrolls** under Standup, All Tasks Filters, Tab access, EO Columns, Delete confirm and Edit user. |
| Long lists | All Tasks renders every task as a card. Live data has more than 1,000 tasks (it hit the 1,000-row cap that `a3a1d10` fixed), so this needs pagination (§12, about 200 items). |
| Landscape 740×360 | Phone layout. The top bar (56 px) and bottom bar (61 px) take **34%** of the height; §12 says keep chrome thin. |
| Landscape 844×390 (large iPhones) | Width is 768 px or more, so the **desktop sidebar layout** appears on a touch phone with desktop-sized targets. The `(pointer: coarse)` target rules fix this without changing mouse desktops. |
| Loading | A full-screen "Loading your workspace…" text, with no skeleton. After a save, the screen doesn't change until the full reload ends (§14). |
| Reduced motion | No `prefers-reduced-motion` handling. The menu slide (0.22 s) and toggle transitions always run. |
| Hover styles | 18 `:hover` rules, none inside `(hover: hover) and (pointer: fine)`, so hover states stick after a tap on phones. |

---

## 5. Mapping table (§3.4)

Phone pattern = what Phase 2+ would build. Desktop (≥1024 px) is unchanged in every row.

### Shell and shared

| Desktop element | Problem on phone | Proposed phone pattern | Rule |
|---|---|---|---|
| Left sidebar (5–16 items, role-based) | Hidden behind ☰ | Bottom bar: 4 tabs + **More** (see §6 below). More is a full-screen list with 48 px rows and badges, grouped like the sidebar. | §8, §19 |
| Sidebar footer: name/role, **Light/Dark/System**, **Log out** | Only inside the hamburger | **More → Account** section: name, role, Theme segmented control (48 px), Log out (kept apart at the bottom) | §8, §17 Settings; note 4 |
| Page title + subtitle + action buttons (`PageHead`) | Actions wrap into 2–3 rows; long subtitles push content down | Top bar: title + at most 2 icon actions (primary first), the rest in `⋯`. Subtitle is shown as an expandable "About this page" line. | §8 short top bar, §7 one main job |
| "+ Task" (My Day, My Tasks, Projects) | Top-left button | **Floating Add button** (56 px, bottom right above the bar and safe area). Lists get bottom padding. Opens the existing Task form (full-screen, `?task=new`) with the same smart defaults (planned today on My Day; project preset in a project). | §9, §13 |
| `TaskRow` (My Day, My Tasks, Done, Projects) | Every chip on its own line; full-width Submit in each row; `title`-only chip labels | §17 row: left control (44 px: tick / Submit / Review / ✓ Submitted, as today) · title (2 lines) · **one** meta line (project dot, due, status tag, Overdue/moved/carried flags; KR, Depends on, Assigned by in the detail view) · whole row opens the task. Labels become visible text, not `title`. | §6, §17, §15 |
| Task modal | Full screen with no URL; Back leaves the app; "Cancel task" (destructive) next to Close/Save | Full-screen page at `?task=<id>`, Back closes it. Header: ← Back + title. "Cancel task" moves to the `⋯` menu, away from Save. Sticky Save footer above the keyboard (VisualViewport on iOS). | §10, §13, §6 opposing actions |
| `Dialog` confirm/alert/prompt | Fills the whole screen for one sentence | Centred dialog (or bottom sheet for prompt), with a history entry so Back cancels. Confirm stays only for irreversible actions. | §10 |
| Filters (My Tasks, All Tasks, Campaigns, HubSpot, Cold Calling) | Sheet exists but no ✕, no Back, no focus handling | Same sheet plus ✕, Back closes, focus in and out, `aria-modal`, scroll lock, contain. **Active filters as removable chips** in a sideways-scrolling row under the top bar. | §10, §17, §12 |
| Chart tooltips (3 screens) | Hover only | Tap a bar to pin its tooltip; tap outside to close. The same figures also stay in the tables below. | §15, §10 tooltips |
| `title=` hints (Cold Calling refresh, EO badge, Settings tag list, task chips) | Unreachable | Visible text or an ⓘ button opening a small popover | §10 tooltips |
| Offline screen, PWA | — | Keep as is | note 1 |

### Data-heavy screens (your note 3)

| Desktop element | Problem on phone | Proposed phone pattern | Rule |
|---|---|---|---|
| **Command Dashboard**: 4 stat boxes | OK (2-up) | Keep 2-up | §7 |
| Dashboard: "Who's lagging behind" table (5 cols, 568 px) | Sideways scroll | One row per person: **name** · "Overdue 3 · Carried 3×+ 1" · On-time % on the right. Tap expands to show open blockers. Warning colour **plus text** (as today, never colour alone). | §7, §16 |
| Dashboard: project completion bars | OK | Keep | — |
| **Campaigns**: header (eye, refresh) + filters | Icons 42 px | Top bar actions: refresh + `⋯` (eye "Who can see this tab", admin only, inside `⋯`); 48 px | §8, §6; note 4 |
| Campaigns: KPI boxes | OK | Keep 2-up | — |
| Campaigns: "Emails sent per day" chart | Hover tooltip | Tap to pin tooltip | §15 |
| Campaigns: region table (8 cols, 761 px) | Sideways scroll | Row per region: **Region** · "1,240 sent · 4 campaigns" · Reply rate. Tap opens a detail sheet with all 8 figures. | §7, §19 |
| Campaigns: Top campaigns (6 cols) | Sideways | Row: **Campaign** (2 lines) · region chip · "Click rate 3.1% · 12 replies". Tap for detail. | §7 |
| Campaigns: Weakest campaigns (5 cols) | Sideways | Row: **Campaign** · Score · "Bounce 4.2%". Tap for detail. | §7 |
| Campaigns: "How this was put together" `<summary>` | 21 px tall | 48 px row | §6 |
| **HubSpot**: header (eye, refresh), filters, stage chips | Icons 42 px | As Campaigns. Stage chips become a sideways chip row with snap (§12 small set). | §8, §12 |
| HubSpot: deals not contacted (6 cols, 971 px) | Sideways | Row: **Deal** (2 lines) · "Proposal · Amit Kumar" · "14 days" on the right (warning text). Tap → detail with the "Open in HubSpot" link. | §7 |
| HubSpot: Team Activity Summary (9 cols, 1,002 px) | Sideways | Row per person: **Person** · "Calls 12 · Emails 30 · Meetings 4" · Overdue tasks on the right. Tap expands to the other 5 figures. | §7 |
| HubSpot: Pending tasks (5 cols) | Sideways | Row: **Person** · "Today 2 · Overdue 1 · Upcoming 5" · Total | §7 |
| HubSpot: follow-ups chart | Hover tooltip | Tap to pin | §15 |
| **Cold Calling**: header (eye, reload with hover-only tip), filters | Tip unreachable | Reload in top bar; tip as visible text under the "Last received" line (or ⓘ). Eye in `⋯`. | §10, note 4 |
| Cold Calling: KPI boxes | OK | Keep 2-up | — |
| Cold Calling: Caller summary (10 cols, 1,160 px) | Sideways | Row per caller: **Caller** · "48 called · 24 connected (50%)" · Meetings on the right. Tap expands to Positive / Follow-up / Negative / Not connected / Bad numbers. Team total row pinned last. | §7 |
| Cold Calling: Follow-ups due (7 cols) | Sideways | Row: **Contact · Company** · "Due 4 Nov · Caller 2" · outcome tag. Tap → detail with campaign + notes. | §7 |
| Cold Calling: Campaigns (9 cols) | Sideways | Row: **Campaign** · "Product · Region" · "Dialled 32 / 40". Tap → detail. | §7 |
| Cold Calling: Lead batches (8 cols) | Sideways | Row: **Date added** · "40 given · 32 dialled (80%)" · Positive. Tap → detail. | §7 |
| **People / Workload**: person cards | OK (cards already) | Keep 1-up cards | — |
| **Efforts vs Outcome**: channel selector, Month/Week, ⚙ Columns, add period, Import data, ✏️ Manage rows | Wraps into 4 rows; Columns menu off-screen | Channel select + Month/Week on one line. "Add month/week", "Import data", "Manage rows", "Columns" move into a `⋯` sheet. **Columns becomes a bottom sheet** (✕, Back, 48 px rows). | §8, §10 |
| **EO grid** (metrics × periods, 22+ cols) | Section headers invisible; × wraps the metric name | **Keep two-way scrolling inside its own container** (your note 3): frozen metric column (130 px, as today), sticky header row, `overscroll-behavior-x: contain`, section-header text made sticky-left so it is visible. Remove-metric × moves out of the frozen cell into Manage rows (still reachable, away from the name). Period × also moves to the `⋯` sheet. Cells stay 44 px with `inputmode="decimal"`. | note 3, §7, §6, §13 |
| **Admin Settings**: 8 tables (users, projects, managers, Instantly tags, HubSpot stages, HubSpot people, call outcomes, product keywords) | Sideways | Grouped list rows (48 px) per section: primary field + one secondary line + chevron → the existing editor (full-screen). Editable mini-tables (stages, people, outcomes, keywords) become stacked field groups with labelled inputs, "+ Add" and Remove kept apart. Tag → campaigns list shown as an expandable row, not a `title`. | §17 Settings, §7 |
| **All Tasks**: filters, Download CSV, bulk bar, cards | 20 px checkboxes; Delete in every card | §17 multi-select: a visible **Select** button (long-press as a shortcut) shows 44 px checkboxes, and a bottom action bar replaces the tabs: count · Reschedule · Reassign · Delete (admin) · ✕. Download CSV goes in the top bar `⋯`. Paginate past about 200 items. | §17, §12, note 4 |
| **Acceptance**: panels with Accept / Request changes | Title tap target 21 px | Whole title row is a 48 px tap target. Accept and Request changes stay visible, separated by 8 px or more, with Accept as the one primary button. Request changes opens its existing inline form. | §6, §18 Von Restorff; note 4 |
| **Projects**: grid → drill-in | Drill-in has no URL; Back leaves the app | `/projects` then `/projects/:id` with ← Back | §8 |
| **Notifications, Blockers, Done, My Week** | OK apart from 21 px labels (fine: they're labels) | Keep; Blockers "Raise blocker" stays as the page's primary action | — |
| **My Day**: "Run standup", "+ Task", pinned panel | Two buttons top-left | Run standup = top-bar primary action; + Task = floating button; pinned "Needs attention first" stays as a grouped section with a sticky header and count | §9, §17 |

---

## 6. Proposed bottom navigation (§3.5)

4 tabs + **More** for every role. All other destinations, plus Account (theme, Log out), go in More. The More tab shows a dot when anything inside it has a badge.

| Role | Tab 1 | Tab 2 | Tab 3 | Tab 4 | More contains |
|---|---|---|---|---|---|
| Member | My Day | My Tasks | Notifications | Blockers | My Week, granted tabs (Campaigns / HubSpot / Cold Calling), Account |
| Manager | Dashboard | All Tasks | Acceptance | My Day | My Tasks, Notifications, My Week, Blockers, Done, Projects, Efforts vs Outcome, granted tabs, Account |
| Admin | Dashboard | All Tasks | Acceptance | My Day | Your work (My Tasks, Notifications, My Week, Blockers) · Command (Done, People, Projects, EO, Campaigns, HubSpot, Cold Calling, Admin Settings) · Account |
| Viewer | Dashboard | All Tasks | Acceptance | People | Done, Projects, Efforts vs Outcome, Blockers, granted tabs, Account |

The first four tabs keep today's choices except for viewers, where **People** replaces **Done**: Done is a status of All Tasks, while People is a separate oversight view. Tell me if you'd rather keep Done.

---

## 7. Routing proposal: **needs your approval** (§8 "every screen has a URL", note 2)

**Change:** add a small built-in history router. No new library: `history.pushState` / `popstate`, inside the existing `NavContext`. Pages keep calling `navigate(view, arg)`.

- **Paths:** `/my-day`, `/my-tasks`, `/notifications`, `/my-week`, `/blockers`, `/dashboard`, `/tasks` (All Tasks), `/acceptance`, `/done`, `/people`, `/projects`, `/projects/:id`, `/efforts?project=:id`, `/campaigns`, `/hubspot`, `/cold-calling`, `/settings`, `/more` (phones). `/` goes to the role's home.
- **Open task:** `?task=<id>` on top of the current screen (`?task=new` for create). Refresh or a shared link reopens it over its list; Back closes it and returns to the list at the same scroll position.
- **Sheets and dialogs** (filters, ⋯ menus, Columns, Tab access, confirms): push a history entry without changing the URL. Back closes the sheet; ✕/Done calls `history.back()`.
- **Role gating unchanged:** `allowedView()` still decides. A URL for a screen you can't see is replaced (not pushed) with your home screen. A task link you can't see (RLS) shows "Task not found or you don't have access" and stays on the list.
- **Hosting:** SPA rewrites already exist on Vercel and Netlify, and the service worker handles any path, so refresh and deep links work with no server change. Supabase sign-in and recovery links use the hash and are unaffected; after login you land on the URL you asked for.
- **Remember state (§8):** per-screen filters and scroll position are kept in memory while the app is open and restored on Back and on tab switch. `navigate()` stops forcing scroll-to-top on Back.
- **Desktop impact (flagged):** the address bar will show these URLs on desktop too, and the browser Back button will step between Cadence screens instead of leaving the site. Nothing else on desktop changes. One router for all widths is what makes shared links work, so I recommend it everywhere.

---

## 8. Pull-to-refresh (note 5, §5)

- **Today it's blocked**: `body { overscroll-behavior-y: none }` disables Chrome Android pull-to-refresh. Phase 2 removes it.
- In the browser (Safari and Chrome), the browser's own pull-to-refresh will reload the page, which reloads all data.
- Sheets, modals, the menu and inner scrollers get `overscroll-behavior: contain`, so pulling inside them doesn't reload the page behind.
- **Installed app:** iOS gives no pull-to-refresh to home-screen web apps, and as far as I know Android Chrome doesn't in standalone mode either; I'll confirm on a device. Proposal (Phase 6, gestures): a light in-app pull-down **only in standalone mode** that calls the existing `refresh()` (data reload, no page reload). Its tap alternative is a **"Refresh data" row in More**, alongside the existing per-screen refresh icons. Nothing about saving or syncing changes.

---

## 9. Controls that must stay reachable (note 4)

| Control | Who | Today on phone | Proposed |
|---|---|---|---|
| Eye icon (tab access) | Admin | Header of Campaigns / HubSpot / Cold Calling, 42 px | Top-bar `⋯` → "Who can see this tab" (opens as a bottom sheet / full-screen with Back) |
| Refresh icons | Users with tab access | Header, 42 px | Top-bar icon, 48 px |
| Light / Dark / System | All | Inside hamburger | More → Account |
| Log out | All | Inside hamburger | More → Account (last row, separated) |
| Import from spreadsheet | Member/manager/admin (My Tasks) | Header button | Top-bar `⋯` on My Tasks |
| Run standup | Member/manager/admin (My Day) | Header button | Top-bar primary action on My Day |
| Submit / Accept / Request changes | Assignee / reviewer | Row button / Acceptance panel / task modal | Row control (44 px), Acceptance panel buttons, task page sticky footer |
| CSV export | All Tasks | Header button | Top-bar `⋯` → Download CSV |

Each will be checked by role in testing (§11 below).

---

## 10. Undo and optimistic updates: **flagged, not changed** (§14, note 6)

These need save-logic changes. **The data model doesn't change** for options A, C and D.

| Item | Finding | Options (pick one per row) |
|---|---|---|
| Optimistic updates (complete, edit, move) | Every save waits for the write **and then a full reload of every table** before the screen changes. With 1,000+ tasks this is well over 400 ms. | **A.** Update the in-memory data at once, write, roll back with a clear message if the write fails, then reload in the background. This changes `AppData.jsx` save functions for the frequent actions only (tick, accept, request changes, reschedule, reassign). **B.** Leave it as is and add only pressed states and a "Saving…" status (no logic change). |
| Undo for task **delete** (admin only, permanent) | Hard delete behind a confirmation. §10 allows a confirmation for irreversible actions. | **C (recommended).** Keep the confirmation; no Undo. **D.** Delay the actual delete by about 6 s with an Undo snackbar (client-side; risk: if the app is closed in those seconds, the delete is sent on `pagehide` or lost). **E.** Soft delete: needs a schema change. Not recommended. |
| Undo for **complete / accept** | Accepting (or legacy-ticking) a recurring task **spawns the next occurrence** (`19d4b86` added `hasOpenOccurrence` so only one open copy exists) and **sends a notification**. Undoing would have to delete the spawned copy and the notification. | **F (recommended).** Undo only for the legacy tick on non-recurring tasks, which has a clean reverse. Accept and Submit stay without Undo, with clear confirmation text. **G.** Full Undo, including removing the spawned occurrence: a logic change in the review flow. |
| Undo for **Submit for review** | Notifies the reviewer at once. Reversing it means a "withdraw submission" action, which doesn't exist. | Don't add (§17: no new features). |

---

## 11. Existing visual issues: reported, not fixed (§3.6)

| Issue | Where | Measured |
|---|---|---|
| Input, select and card borders are below 3:1 (WCAG 1.4.11 non-text contrast) | Light `--border #E4E4E4` on white | about **1.3:1** |
| Same, dark theme | `--border rgba(255,255,255,.14)` on `#202020` | about **1.5:1** |
| Bottom-tab icons are mixed glyphs and colour emoji (▦ ☰ ✔ ☀ 🔔 ⛔) | `.mtabs` | They render differently on iOS and Android and don't match the line icons elsewhere. **Proposal:** inline SVG line icons in the style of the existing Filters, eye and refresh icons. Uses only existing colour tokens. Visual change, needs your OK. |
| Text contrast | All 16 admin screens, light and dark, 390 px | **0 failures** below 4.5:1 |
| Tiny text | All screens | **0** under 12 px on phones |
| Status by colour alone | Lagging-table warning cells, EO cell colours (blue/orange/red) | Lagging cells show numbers, so they're OK. **EO attainment colours have no text or icon** apart from the Attain % column. Needs a decision on whether that column is enough. |

**Phone-only colours** (§2 asks me to list them; all come from existing tokens): bottom bar background `--surface-raised`, sheet scrim `--overlay`, sheet surface `--surface-raised`, divider `--hairline`, active tab `--accent-text`.

---

## 12. Test plan (note 7, §20)

- Every phase: Playwright at 320, 360, 375, 390, 412 and 430 px, portrait and landscape, light and dark, as **admin, manager, member and viewer**. For each role: every bottom tab and every More item opens; every control in §9 is reachable; Back closes each sheet and modal and then steps back through screens; refresh keeps the place (including `?task=`); a disallowed URL redirects to home.
- Desktop at 1280 px (and 1024 px): before and after screenshots of every screen per role, pixel-compared (caret hidden, animations off), as in earlier work.
- Automated: sideways scroll at 320 px, targets of 44 px or more (48 px on edges), inputs 16 px or more, contrast, `aria-modal`, focus return, `aria-current`, `aria-live` for the snackbar and status.
- 200% text: Chrome Android text scaling and browser zoom (all sizes are px, so iOS Dynamic Type does not scale them; zoom does).
- Real iPhone (Safari) and Android (Chrome): keyboard + sticky footer, notch and home indicator, pull-to-refresh in browser and installed app, INP. I can't do these here, so I'll give you a short checklist to run, or you can tell me who will.

---

## 13. Proposed phases after approval (§21)

1. **Platform setup:** viewport `interactive-widget`, `svh`, remove the overscroll block, contain on sheets, hover inside media queries, coarse-pointer targets, reduced motion.
2. **Navigation:** router + URLs, bottom bar 4 + More, top bar, Back everywhere, remember state.
3. **Lists and task rows:** §17 task row, floating Add, All Tasks select mode and pagination, data-heavy tables become rows (EO stays a grid).
4. **Detail and forms:** task page at `?task=`, sticky footers above the keyboard, input types and `enterkeyhint`, labels.
5. **Sheets and menus:** dialog/sheet rules, `⋯` menus, EO Columns sheet, tooltips → tap/ⓘ.
6. **Gestures:** standalone pull-to-refresh, long-press for Select. (No swipe actions unless you want them; they're optional in §11.)
7. **Polish:** pressed states, skeletons, the Undo/optimistic option you choose in §10, the final §20 checklist.

### Decisions I need from you

1. Approve the **URL router** (§7 above), including the desktop address-bar/Back change.
2. Bottom tabs per role (§6), including **People instead of Done** for viewers.
3. Optimistic updates: **A** or **B**. Delete: **C** or **D**. Complete/accept Undo: **F** or **G** (§10).
4. Replace the bottom-tab emoji with line icons (§11)?
5. EO attainment colours: is the Attain % column enough as the non-colour cue?
