# Cadence Mobile UX: implementation report

Follows `docs/mobile-ux-audit.md` (Phase 1) and the decisions you approved. Every phase was committed and pushed to `main` on its own.

| Phase | Commit | What |
|---|---|---|
| 1 Audit | `f08cd92` | Audit only |
| 2 Platform setup | `6aaab4e` | Viewport, pull-to-refresh unblocked, `svh`, hover only on mouse, touch targets on touch tablets, reduced motion |
| 3 Navigation | `7891e73` | URLs for every screen, Back everywhere, bottom bar + More, bell |
| 4 Lists and task rows | `00d6860` | Task rows, floating Add, All Tasks select mode + paging, tables → rows |
| 5 Detail and forms | `5499294` | Full-screen forms with Back, Save above the keyboard, keyboards/labels |
| 6 Sheets and menus | `1313d56` | ⋯ menus, filter sheet + chips, small dialogs, EO Columns sheet, tooltips, EO legend |
| 7 Gestures | `fe6c168` | Pull-to-refresh in the installed app, snackbar |
| 8 Polish | *(this commit)* | Instant saves with rollback + Retry, Undo / confirm, skeleton, pressed states, final checks |

Screenshots at 390 px are in `docs/mobile-ux/`.

---

## What changed, per screen (phones, under 768 px)

**Every screen**
- The bottom bar has 4 tabs + **More**, with line icons, a text label under each icon and a solid icon on the active tab.
  - Member: My Day · My Tasks · Notifications · Blockers
  - Manager and admin: Dashboard · All Tasks · Acceptance · My Day
  - Viewer: Dashboard · All Tasks · Acceptance · People
- Tapping the active tab scrolls back to the top.
- The top bar holds the title and up to two icons plus ⋯.
  - Admins and managers get a **bell with the unread count**.
  - Screens opened from More get a **Back** button.
  - The hamburger and slide-in menu are gone.
- Every screen has a URL; an open task is `?task=<id>`. Refresh and shared links come back to the same place. Browser or phone **Back closes any open form, sheet or dialog**, and otherwise steps back through screens. Filters, the chosen tab and the EO channel are remembered while you move around, and the scroll position comes back on Back.
- Saves show at once. If one fails, the change is put back and a snackbar says "Couldn't save – your change was undone" with **Retry**.
- While the app loads, a skeleton in the shape of the screen shows instead of a line of text.

**More**
- Every screen not in the bottom bar, grouped like the sidebar, with badges.
- Account: name and role, Light/Dark/System, Refresh data, and **Log out** (kept apart at the bottom).

**My Day / My Tasks / Done / a project**
- Each task row shows:
  - the Submit / Review / tick control (44 px) on the left;
  - the title, up to 2 lines;
  - one meta line: status, due, overdue/moved/carried flags and project.
- Key Result, Depends on and Assigned by are now shown in the task view only.
- Tapping anywhere on the row opens the task. Section headers stay pinned while you scroll.
- A floating **Add** button (56 px) sits above the tab bar; lists get extra bottom padding so it never covers the last task.
- My Tasks: "Import from spreadsheet" moved to ⋯.

**All Tasks**
- One row per task; tapping it opens the task.
- **Select** (or long-press a row) shows 44 px checkboxes and replaces the tab bar with: count · Reassign · Date · Delete (admins, kept apart) · ✕. Reassign and Date open bottom sheets; Back leaves select mode.
- 100 rows at a time, with "Show more".
- Download CSV (admins) moved to ⋯. Single-task Delete is now Select → Delete, still with "Are you sure?".

**Command Dashboard, Campaigns, HubSpot Team Activity, Cold Calling, Admin Settings**
- Tables become rows: the name, 2–3 key figures, and one figure on the right. Tap the name to see the rest.
- Editable settings tables stack each field with its label.
- On Campaigns, HubSpot and Cold Calling, Refresh is in the top bar and **"Who can see this tab"** (admins) is in ⋯.
- Charts: tap a bar to see its numbers.
- Cold Calling's refresh tip is shown as text.
- Instantly tag → full campaign list sits behind "Show all N".

**Efforts vs Outcome**
- Keeps its two-way grid, scrolling sideways inside its own box with the metric column frozen.
- Section names stay visible while you scroll sideways.
- A one-line colour key for Attain % is added; every coloured cell already shows its %.
- Columns, Import data and Manage rows moved to ⋯. Columns is now a bottom sheet; it used to open off the left edge of the screen.
- The per-metric × moved to Manage rows.

**Acceptance**
- The whole title row opens the task.
- Accept on a **one-time** task shows "Task accepted" with **Undo**.
- Accept on a **repeating** task first asks "Are you sure?", because accepting creates the next occurrence.
- Request changes works as before.

**Task view and forms**
- Full screen with Back at the top left; the page behind doesn't scroll.
- Focus moves into the form and returns to the button that opened it.
- Save/Close stay above the keyboard on iOS too.
- "Cancel task" is in its own row, away from Save.
- Fields get the right keyboard: URL keyboard for the proof link, decimal keypad for number fields, plus enter-key hints and autocapitalisation.
- Visible labels for "Add a checklist item" and "Add a task for today".

**Filters (5 screens)**
- A bottom sheet with ✕, Back to close and Done.
- Filters that are on show as removable chips you can scroll sideways.

**Dialogs**
- "Are you sure?" and alerts are small centred dialogs, not full screen. Back cancels them.

**Installed app**
- Pull down from the top of a screen to reload the data.
- In a browser tab, the browser's own pull-to-refresh works again (Phase 2 removed the block).

**Tablets and large phones in landscape (768 px and up, touch)**
- The desktop layout stays, with 44 px targets.

## Desktop (1024 px and up)
**Desktop looks the same.** After every phase I compared 101 screenshots against the original build: every screen as admin, manager, member and viewer, light and dark, at 1280 and 1024 px, plus open modals. All 101 were identical apart from anti-aliasing noise.

Behaviour changes on desktop (all approved):
- The address bar shows each screen's URL, and the browser Back button moves between screens and closes open forms.
- The new save behaviour applies on all screen sizes:
  - instant saves;
  - "Couldn't save – Retry" on failure;
  - Undo for one-time tasks;
  - "Are you sure?" before accepting a repeating task.
- Focus moves into modals; this is invisible unless you use a keyboard.
- Opening a project from Projects now starts at the top of the page.

## Files touched
- **New:**
  - `src/lib/router.js`, `src/lib/keyboard.js`
  - `src/hooks/useBackClose.js`, `useViewState.js`, `useLongPress.js`, `usePullToRefresh.js`
  - `src/components/Icon.jsx`, `RowTable.jsx`, `Sheet.jsx`, `Fab.jsx`, `BulkBar.jsx`, `TopBar.jsx`, `Toast.jsx`, `LoadingSkeleton.jsx`
  - `src/pages/More.jsx`
- **Changed:**
  - `index.html`, `src/index.css`, `src/main.jsx`, `src/App.jsx`
  - `src/context/AppData.jsx`: optimistic wrapper and `undoComplete`. The data model, RLS and server logic are unchanged.
  - `src/hooks/useTaskHandlers.js`
  - `src/components/`: `Layout`, `Modal`, `ModalHost`, `Dialog`, `MobileFilters`, `TaskRow`, `ReviewActions`, `TabAccess`, `EoCell`, `InstantlyTags`, `HubSpotSettings`, `CallSettings`
  - modals: `TaskModal`, `StandupModal`, `EoRowsModal`, `ImportEoModal`, `ImportTasksModal`, `KRModal`, `CheckinModal`, `ScoreModal`
  - pages: `MyDay`, `MyTasks`, `AllTasks`, `Grid`, `Dashboard`, `Campaigns`, `HubSpotActivity`, `ColdCalling`, `EffortsOutcome`, `Settings`, `MyWeek`, `Login`

## Where I departed from the prompt, and why
1. **Breakpoint:** I kept 767.98 px for phones instead of 600 px. It was already used in CSS and JS, and the desktop sidebar doesn't fit below 768 px.
2. **Quick add (§13):** the floating Add button opens the existing task form (`?task=new`), not a one-line input above the keyboard. Desktop has no inline quick-add or text parsing, and §17 says not to invent features.
3. **Smart default project:** "+ Task" inside a project doesn't preset that project. It would change desktop behaviour, since it's the same form. It's easy to add if you want it everywhere.
4. **Swipe actions:** none. They're optional in §11, and every action already has a visible button.
5. **Per-row ⋯ menu on task rows:** not added, because rows have no secondary actions apart from open and complete. All Tasks' Delete moved to Select mode instead.
6. **Tab label size:** 10–12 px, scaling with screen width, so five labels fit in full at 320 px. Below 300 px (for example 200% zoom) they wrap instead of being cut off.
7. **EO "Freeze columns":** on phones only the metric column is frozen, as it was before. The other freeze options apply on tablet and desktop.

## Section 20 checklist

| Item | Result | How tested |
|---|---|---|
| No sideways page scrolling at 320 px | **Pass** | 322 screen loads: all routes for all 4 roles at 320, 360, 375, 390, 412, 430 px portrait and 740×360 landscape |
| Every interactive element ≥ 44×44 px | **Pass** | Same 322 loads, measuring the real hit area (including whole-row taps and checkbox labels). Exception: links inside sentences (exempt under §6). |
| Nothing hover-only, drag-only or gesture-only | **Pass** | Chart bars respond to tap; `title` hints shown as text or one tap away; long-press has the Select button; pull-to-refresh has More → Refresh data. Only remaining `title`: Settings tag cells, whose content is also behind "Show all". |
| Every desktop action reachable on the phone | **Pass** | Role-by-role tests: eye (admin), refresh icons, theme, Log out, Import, Run standup, Submit / Accept / Request changes, CSV, bulk Reassign/Date/Delete, EO Columns / Import / Manage rows |
| No zoom on input focus in iOS Safari | **Pass (emulated)** | All inputs compute to ≥ 16 px; not tried on a real iPhone |
| Keyboard open: field and submit visible on iOS and Android | **Partial** | Save bar stays above a simulated 300 px keyboard; Android uses `interactive-widget=resizes-content`. **Needs a real iPhone and Android.** |
| Nothing under the notch, Dynamic Island or home indicator | **Partial** | Safe-area padding on the top bar, tab bar, sheets, forms, floating button and snackbar. **Needs a real device.** |
| Every sheet has Close, closes on Back, never stacks, page behind doesn't scroll | **Pass** | Automated: ✕/Done, Back, `aria-modal`, focus in and out, page locked |
| Browser Back works everywhere; refresh keeps your place | **Pass** | 47 navigation checks (tabs, More, project drill-in, `?task=`, deep links, role redirects, desktop) |
| 200% text: nothing cut off or overlapping | **Pass (emulated)** | 390 px phone at 200% zoom (195 CSS px): no sideways scroll; long titles truncate with … and open in full on tap. Fonts are px, so iOS Dynamic Type doesn't scale them. |
| Reduced motion respected | **Pass** | With reduced motion on, transitions compute to ~0 s; the refresh spinner keeps turning |
| Instant pressed states; INP ≤ 200 ms on a mid-range Android | **Pressed: pass. INP: needs a device.** | With the CPU slowed 4× and test data, the slowest tap was 136 ms. Real data (1,000+ tasks) on a real phone still needs measuring. |
| Lighthouse and axe: no new target-size or contrast violations | **axe: pass. Lighthouse: not run.** | axe-core 4.10 on 21 phone screens, light and dark: 0 target-size issues. Contrast hits are existing styles only (dimmed done/read/resolved rows, proof link colour on Acceptance). Lighthouse isn't installed here. |
| One-handed run: create, complete, reschedule, move, delete | **Pass (layout)** | Add button, tab bar, row controls, Select bar and sheets are all in the bottom half or row centres. **Confirm on a device.** |
| Desktop at 1024 px and up unchanged | **Pass** | 101 screenshots identical after every phase |

## Existing issues found, reported and not changed
- **Faint borders:** input and card borders are about 1.3:1 in light mode and 1.5:1 in dark, against the 3:1 rule (WCAG 1.4.11).
- **Dimmed rows:** done, read and resolved rows at 60–70% opacity bring their text to 4.0–4.4:1 (axe `color-contrast`).
- **Link colour:** the proof link on Acceptance is too close in colour to the text around it (axe `link-in-text-block`).
- **Labels:** some form labels aren't linked to their fields (task form, EO cells, some selects). Each field has a visible label above it, but screen readers don't announce it (axe `label`, `select-name`). This is the same on desktop today.

**Phone-only colours** all come from existing tokens: bottom bar `--surface-card`, sheets and snackbar `--surface-raised` / `--sidebar-bg`, scrim `--overlay`, chips `--accent-soft`, badges `--danger-solid` / `--accent`.

## Still to check on real phones
- Keyboard and Save bar on iPhone Safari and Android Chrome.
- Notch and home-indicator spacing.
- Pull-to-refresh in the installed app on both.
- Tap speed with your real data.
