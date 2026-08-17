# LEAP 2026 exhibitor team-member scraper

Runs on your own machine, under your own LEAP account. Credentials come from
env vars at runtime — nothing is hard-coded or committed.

Before running, confirm this use is allowed under the One Giant Leap platform
terms and any consent obligations for the personal data you're collecting.

## Setup

```bash
cd scripts/leap_scraper

python3 -m venv .venv
source .venv/bin/activate

pip install -r requirements.txt
playwright install chromium
```

## Run

```bash
export LEAP_USERNAME='you@example.com'
export LEAP_PASSWORD='...'          # do NOT commit; export in your shell only

# First run: watch it in a real browser window to confirm selectors work
LEAP_HEADFUL=1 LEAP_MAX_EXHIBITORS=3 python scrape_leap_exhibitors.py

# Full run
python scrape_leap_exhibitors.py
```

Output: `LEAP2026_Exhibitor_Team_Members.xlsx` with columns
`Exhibitor Name | Location | Team Member | Designation`.

### Optional env vars

| Var                    | Meaning                                             |
| ---------------------- | --------------------------------------------------- |
| `LEAP_HEADFUL=1`       | Show the browser window (default: headless).        |
| `LEAP_MAX_EXHIBITORS`  | Stop after N exhibitors — useful for a smoke test.  |
| `LEAP_OUTPUT`          | Output xlsx path.                                   |
| `LEAP_STATE`           | Path for persisted login session (default `leap_state.json`). |
| `LEAP_START_URL`       | Override the exhibitor-directory URL.               |

`LEAP_STATE` lets you skip the login flow on subsequent runs. Keep that file
out of git — it contains your session cookies. The included `.gitignore`
covers it.

## Expect to tweak selectors

The One Giant Leap platform renders content in ways that change over time.
All site-specific CSS is centralized in the `SELECTORS` dict at the top of
`scrape_leap_exhibitors.py`. On the first headful run, open browser devtools
and, if any step misses:

1. Right-click the element (login field, exhibitor card, Team tab, member
   name/title) and copy a stable selector.
2. Add it to the relevant `SELECTORS[...]` list — the script tries each entry
   in order and uses the first that matches.

Common places you'll likely need to adjust:

- `exhibitor_card` — the anchor tag for each directory entry.
- `team_tab` / `team_section` / `team_member_card` — Team layout varies by
  exhibitor tier.
- `exhibitor_location` — the platform sometimes puts city and country in
  separate spans.

## What it does

1. Logs into `connect.onegiantleap.com` with your credentials.
2. Opens the LEAP 2026 exhibitors directory.
3. Exhausts Load More / infinite scroll / Next-page controls to collect
   every exhibitor profile URL.
4. Visits each profile, opens the Team tab, expands any Show-more, and
   captures each member's name and title along with the exhibitor's name
   and location.
5. Deduplicates on (exhibitor, member, designation) and writes the xlsx.
6. Prints a summary and lists any profiles that failed to load.

## Troubleshooting

- **Login field not found.** The site probably A/B-tests the auth screen —
  inspect and add the current selector to `SELECTORS['login_email' | 'login_password' | 'login_submit']`.
- **0 exhibitors collected.** The directory URL may have changed or the
  card selector is off. Print `page.url` after `goto` to confirm you're not
  being bounced back to `/login`.
- **Team tab click does nothing.** Some profiles render Team inline without
  a tab — the script already tries the inline section selector; if it's still
  empty, inspect the DOM and extend `SELECTORS['team_section' | 'team_member_card']`.
- **Rate limiting / bans.** If the site starts throwing errors mid-run, slow
  it down: add `time.sleep(1.5)` after each `extract_profile` call, or run in
  smaller batches with `LEAP_MAX_EXHIBITORS`.
