"""
LEAP 2026 exhibitor team-member scraper.

Runs LOCALLY on your machine, under your own LEAP account. Credentials are
read from environment variables at runtime; nothing is committed.

Usage:
    export LEAP_USERNAME='you@example.com'
    export LEAP_PASSWORD='...'
    python scrape_leap_exhibitors.py

Optional env vars:
    LEAP_HEADFUL=1          Show the browser window (default: headless).
    LEAP_MAX_EXHIBITORS=N   Cap for a smoke test (default: no cap).
    LEAP_OUTPUT=path.xlsx   Output file path.
    LEAP_STATE=state.json   Persist login session between runs.
    LEAP_START_URL=...      Override exhibitor directory URL.

The selectors below are best-effort guesses for the One Giant Leap platform.
When you first run headfully, watch what the page actually looks like — you
will almost certainly need to tweak the CSS selectors marked with `# SELECTOR`
to match the live DOM. Every such spot is centralized in SELECTORS at the top.
"""

from __future__ import annotations

import os
import sys
import time
from dataclasses import dataclass, asdict
from pathlib import Path
from urllib.parse import urljoin

from playwright.sync_api import (
    sync_playwright,
    Page,
    BrowserContext,
    TimeoutError as PWTimeout,
)
import pandas as pd


LOGIN_URL = "https://connect.onegiantleap.com/login"
START_URL = os.environ.get(
    "LEAP_START_URL",
    "https://connect.onegiantleap.com/event/leap2026/exhibitors/RXZlbnRWaWV3XzEyMTczMTE=",
)

# All site-specific selectors live here so you can tweak them in one place
# after inspecting the live DOM. Each is tried in order; the first that matches
# wins. Use browser devtools (Inspect Element) to confirm the actual classes
# and update these lists.
SELECTORS = {
    # Login form
    "login_email":    ['input[type="email"]', 'input[name="email"]', 'input[name="username"]'],
    "login_password": ['input[type="password"]', 'input[name="password"]'],
    "login_submit":   ['button[type="submit"]', 'button:has-text("Log in")', 'button:has-text("Sign in")'],

    # Exhibitor directory: each card / link to a profile
    "exhibitor_card": [
        'a[href*="/exhibitors/"][href*="/RXhoaWJpdG9y"]',   # base64 "Exhibitor" prefix
        'a[href*="/exhibitor/"]',
        '[data-testid="exhibitor-card"] a',
        'article a[href*="/exhibitor"]',
    ],
    # Load-more / pagination controls on the directory
    "load_more":  ['button:has-text("Load more")', 'button:has-text("Show more")'],
    "next_page":  ['button:has-text("Next")', 'a[rel="next"]', 'button[aria-label="Next page"]'],
    # Optional total-count element on the directory ("123 Exhibitors")
    "total_count": ['text=/\\d+\\s+Exhibitors?/i'],

    # Exhibitor profile
    "exhibitor_name":     ['h1', '[data-testid="exhibitor-name"]'],
    "exhibitor_location": [
        '[data-testid="location"]',
        'text=/\\b(Saudi Arabia|UAE|United Arab Emirates|Riyadh|Dubai|Jeddah|Kuwait|Qatar|Bahrain|Oman)\\b/i',
    ],
    # The Team tab / section
    "team_tab": [
        'button:has-text("Team")',
        'a:has-text("Team")',
        '[role="tab"]:has-text("Team")',
    ],
    "team_section": ['section:has(h2:has-text("Team"))', '[data-testid="team-section"]'],
    "team_member_card": [
        '[data-testid="team-member"]',
        'section:has(h2:has-text("Team")) li',
        'section:has(h2:has-text("Team")) [class*="member"]',
    ],
    "team_member_name":  ['h3', '[data-testid="member-name"]', '.name'],
    "team_member_title": ['[data-testid="member-title"]', '.title', 'p'],
    "team_load_more": ['section:has(h2:has-text("Team")) button:has-text("Show more")'],
}


@dataclass(frozen=True)
class Row:
    exhibitor_name: str
    location: str
    team_member: str
    designation: str


def env_flag(name: str) -> bool:
    return os.environ.get(name, "").strip().lower() in {"1", "true", "yes", "on"}


def first_visible(page: Page, selectors: list[str], timeout_ms: int = 1500):
    """Return the first Locator whose first element is visible, else None."""
    for sel in selectors:
        loc = page.locator(sel).first
        try:
            loc.wait_for(state="visible", timeout=timeout_ms)
            return loc
        except PWTimeout:
            continue
    return None


def login(page: Page, username: str, password: str) -> None:
    print(f"[login] navigating to {LOGIN_URL}")
    page.goto(LOGIN_URL, wait_until="domcontentloaded")

    email = first_visible(page, SELECTORS["login_email"], timeout_ms=8000)
    if email is None:
        raise RuntimeError("Could not find the login email field — update SELECTORS['login_email'].")
    email.fill(username)

    pw = first_visible(page, SELECTORS["login_password"])
    if pw is None:
        raise RuntimeError("Could not find the password field — update SELECTORS['login_password'].")
    pw.fill(password)

    submit = first_visible(page, SELECTORS["login_submit"])
    if submit is None:
        raise RuntimeError("Could not find the submit button — update SELECTORS['login_submit'].")
    submit.click()

    # Wait for post-login navigation. Adjust to a URL fragment that only
    # appears once you're actually authenticated.
    page.wait_for_load_state("networkidle")
    print("[login] done")


def collect_exhibitor_links(page: Page, max_count: int | None) -> list[str]:
    """Walk the directory, exhausting Load More / pagination, and collect URLs."""
    print(f"[dir] opening {START_URL}")
    page.goto(START_URL, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle")

    total_el = first_visible(page, SELECTORS["total_count"], timeout_ms=2000)
    if total_el is not None:
        try:
            print(f"[dir] header says: {total_el.inner_text().strip()}")
        except Exception:
            pass

    seen: set[str] = set()

    def harvest():
        for sel in SELECTORS["exhibitor_card"]:
            for a in page.locator(sel).all():
                href = a.get_attribute("href")
                if not href:
                    continue
                url = urljoin(page.url, href)
                seen.add(url.split("?")[0])

    # Loop: harvest, then either click Load More or scroll, until stable.
    stable_rounds = 0
    while stable_rounds < 3:
        before = len(seen)
        harvest()

        if max_count and len(seen) >= max_count:
            break

        clicked = False
        for sel in SELECTORS["load_more"]:
            btn = page.locator(sel).first
            if btn.count() and btn.is_visible():
                try:
                    btn.click()
                    page.wait_for_load_state("networkidle", timeout=10_000)
                    clicked = True
                    break
                except Exception:
                    pass

        if not clicked:
            # Try infinite scroll
            page.mouse.wheel(0, 4000)
            time.sleep(1.0)

        harvest()
        if len(seen) == before:
            stable_rounds += 1
        else:
            stable_rounds = 0

    # If the site is paginated instead of infinite-scroll, walk Next.
    while True:
        nxt = None
        for sel in SELECTORS["next_page"]:
            n = page.locator(sel).first
            if n.count() and n.is_visible() and n.is_enabled():
                nxt = n
                break
        if nxt is None:
            break
        try:
            nxt.click()
            page.wait_for_load_state("networkidle", timeout=10_000)
            harvest()
            if max_count and len(seen) >= max_count:
                break
        except Exception:
            break

    links = sorted(seen)
    if max_count:
        links = links[:max_count]
    print(f"[dir] collected {len(links)} exhibitor URLs")
    return links


def extract_profile(page: Page, url: str) -> list[Row]:
    page.goto(url, wait_until="domcontentloaded")
    page.wait_for_load_state("networkidle", timeout=15_000)

    name_el = first_visible(page, SELECTORS["exhibitor_name"], timeout_ms=5000)
    name = name_el.inner_text().strip() if name_el else "(unknown)"

    loc_el = first_visible(page, SELECTORS["exhibitor_location"], timeout_ms=1500)
    location = loc_el.inner_text().strip() if loc_el else ""

    # Open Team tab if it's tabbed rather than inline.
    tab = first_visible(page, SELECTORS["team_tab"], timeout_ms=2000)
    if tab is not None:
        try:
            tab.click()
            page.wait_for_load_state("networkidle", timeout=5000)
        except Exception:
            pass

    # Expand any Show-more inside the Team section.
    for _ in range(20):
        more = None
        for sel in SELECTORS["team_load_more"]:
            m = page.locator(sel).first
            if m.count() and m.is_visible():
                more = m
                break
        if not more:
            break
        try:
            more.click()
            page.wait_for_load_state("networkidle", timeout=5000)
        except Exception:
            break

    # Collect member cards.
    cards = []
    for sel in SELECTORS["team_member_card"]:
        found = page.locator(sel).all()
        if found:
            cards = found
            break

    rows: list[Row] = []
    for card in cards:
        try:
            member_name = ""
            for sel in SELECTORS["team_member_name"]:
                el = card.locator(sel).first
                if el.count():
                    member_name = el.inner_text().strip()
                    if member_name:
                        break
            title = ""
            for sel in SELECTORS["team_member_title"]:
                el = card.locator(sel).first
                if el.count():
                    t = el.inner_text().strip()
                    if t and t != member_name:
                        title = t
                        break
            if member_name:
                rows.append(Row(name, location, member_name, title))
        except Exception as e:
            print(f"  [warn] card parse error on {url}: {e}")

    print(f"  [profile] {name}: {len(rows)} team members")
    return rows


def main() -> int:
    username = os.environ.get("LEAP_USERNAME")
    password = os.environ.get("LEAP_PASSWORD")
    if not username or not password:
        print("ERROR: set LEAP_USERNAME and LEAP_PASSWORD in your environment.", file=sys.stderr)
        return 2

    output = Path(os.environ.get("LEAP_OUTPUT", "LEAP2026_Exhibitor_Team_Members.xlsx"))
    state_path = os.environ.get("LEAP_STATE", "leap_state.json")
    max_count = int(os.environ["LEAP_MAX_EXHIBITORS"]) if os.environ.get("LEAP_MAX_EXHIBITORS") else None
    headful = env_flag("LEAP_HEADFUL")

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=not headful)
        ctx_kwargs = {}
        if Path(state_path).exists():
            ctx_kwargs["storage_state"] = state_path
        context: BrowserContext = browser.new_context(**ctx_kwargs)
        page = context.new_page()

        # If storage_state didn't include a valid session, log in fresh.
        needs_login = True
        if "storage_state" in ctx_kwargs:
            page.goto(START_URL, wait_until="domcontentloaded")
            if "login" not in page.url.lower():
                needs_login = False
        if needs_login:
            login(page, username, password)
            context.storage_state(path=state_path)

        links = collect_exhibitor_links(page, max_count)

        all_rows: list[Row] = []
        failed: list[tuple[str, str]] = []
        for i, url in enumerate(links, 1):
            print(f"[{i}/{len(links)}] {url}")
            try:
                all_rows.extend(extract_profile(page, url))
            except Exception as e:
                print(f"  [error] {e}")
                failed.append((url, str(e)))

        context.close()
        browser.close()

    # Deduplicate on (exhibitor, member, designation) — same person listed at
    # the same company with the same title is treated as one record.
    seen = set()
    unique: list[Row] = []
    for r in all_rows:
        key = (r.exhibitor_name.lower(), r.team_member.lower(), r.designation.lower())
        if key in seen:
            continue
        seen.add(key)
        unique.append(r)

    df = pd.DataFrame(
        [asdict(r) for r in unique],
        columns=["exhibitor_name", "location", "team_member", "designation"],
    ).rename(columns={
        "exhibitor_name": "Exhibitor Name",
        "location": "Location",
        "team_member": "Team Member",
        "designation": "Designation",
    })
    df.to_excel(output, index=False)

    print()
    print("=" * 60)
    print(f"Exhibitor profiles processed: {len(links)}")
    print(f"Profile failures:             {len(failed)}")
    print(f"Team-member rows (raw):       {len(all_rows)}")
    print(f"Team-member rows (dedup):     {len(unique)}")
    print(f"Wrote: {output.resolve()}")
    if failed:
        print("\nFailed URLs:")
        for u, e in failed:
            print(f"  {u}  -- {e}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
