# AniDub Radar

A small static English-dub episode calendar powered by [Anime Dub Calendar](https://github.com/fizzyfrys/anime-dub-calendar). No backend, login, API keys, framework, or build step.

Live site: https://corsade.github.io/anidub-radar/

## Run locally

From this directory, run `python -m http.server 8000`, then open http://localhost:8000. Use an HTTP server rather than a file URL because the app uses JavaScript modules.

## Appearance

Use the **Dark mode** button in the header to switch themes. The site follows your system theme until you make a choice, then remembers that choice on this device (`anidub:theme:v1`). If browser storage is blocked, the toggle still works for the current page.

## Use the calendar

- Navigate weeks with Previous, Next, or Today. Search titles within the displayed week and active filter.
- Switch between poster cards and a compact agenda. Compact mode hides posters but loads community ratings for visible anime.
- Dates explicitly marked projected by the feed get a separate **Projected** badge. An unmarked date is not a guarantee of release.
- Import an uncompressed MyAnimeList XML export to unlock Watching, Plan to Watch, and Not in my list. Matching uses numeric MAL IDs, never titles. Unknown totals appear as `?`.
- Not in my list means a known MAL ID absent from the entire import; completed, dropped, and on-hold anime remain in your list.
- The match summary counts distinct anime across **all dates in the loaded feed**, not just the displayed week.
- **Next for me** finds the first event dated today or later for Watching or Plan to Watch, switches to its week and status filter, clears search, and highlights it. It does not infer release times or whether an episode has already aired today. If none exists, it explains the feed's limited coverage.

## Privacy and local storage

XML is parsed locally and never uploaded, logged, or stored. By default the imported list lives only in this tab. **Remember on this device** is opt-in and stores only numeric IDs, statuses, and watched/total episode counts in this browser's localStorage (`anidub:list:v1`). It does not store XML, account details, or titles. Unchecking Remember deletes the saved copy while retaining the current tab's list. **Clear list & delete saved data** removes both. Storage failures are reported; the tab can still be used without persistence. Other open tabs keep their in-memory list until cleared or closed.

Do not commit personal XML exports. The repository ignores XML and compressed XML files. Poster lookups use IDs from the public calendar, never XML-only entries or watch progress.

## Posters and community ratings

The AniList-inspired layout uses images from MyAnimeList via the [Jikan API](https://docs.api.jikan.moe/) (`GET /v4/anime/{malId}`). It does not imply affiliation with AniList or MAL.

Posters load near the viewport with deduplicated requests spaced at least 1.1 seconds apart. HTTP 429 pauses the queue for a minute. Pending requests for detached cards are discarded. Each metadata lookup also reads MAL’s community `score` and `scored_by` values. Cards and compact rows show a labeled score out of 10; a tooltip gives the vote count (when available) and the time Jikan was checked. Ratings are snapshots, not real-time updates: they are cached for one day and Jikan may also cache upstream data. Missing scores show “not rated yet”; network failures show “score unavailable”. This does not read or change your personal XML scores.

Successful poster URLs are cached for seven days in localStorage (`anidub:posters:v1`), capped at 500 entries; blocked storage falls back to memory. These are public artwork URLs, separate from saved personal data. Failed images get placeholders; **Retry artwork & ratings** clears failed lookups and tries again while retaining the request rate limit. Images still require access to the external CDN.

## Feed behavior

The browser fetches the public ICS feed directly. Calendar days are preserved without release-time or timezone assumptions. Source dates older than 14 days, or feeds containing only past dates, trigger stale warnings. A missing source update date is explicitly reported. Failed refreshes retain the last successful feed in the current tab and label it potentially stale. An initial failure shows no events. The feed itself is not persistently cached. Empty weeks, empty search/filter results, malformed XML, and network failures have distinct messages.

## Tests

With the local server running, open http://localhost:8000/tests/ for the dependency-free browser parser test. It covers folded ICS lines, all-day dates, MAL IDs, fictional XML matching/progress, malformed XML, projected markers, and finding the next personal event beyond the current week.

Optional UI integration suite (Python, Microsoft Edge, and Playwright):

```sh
python -m pip install playwright
python tests/browser_checks.py
```

This suite intercepts feed, metadata, and image requests with fictional data. It checks opt-in persistence and deletion, minimal saved fields, match counts, search, compact mode, next-week navigation, projected badges, poster cache reuse/expiry/retry, corrupt or blocked storage, and responsive widths. It does not use a real personal export.

## GitHub Pages

Before publishing JavaScript or CSS changes, run `python tools/version_assets.py`. It fingerprints the local assets and updates HTML/module URLs together so cached files from a previous release cannot disable new controls. Then push to `main`; this repository publishes from `main` → `/ (root)` under Settings → Pages → Deploy from a branch. `.nojekyll` disables Jekyll processing. All local asset paths are relative, so the repository subpath works. No custom deployment workflow is needed.

## Verification

The initial deployed site was verified in Microsoft Edge with the live feed and real posters. The expanded parser and UI integration suites passed locally on September 29, 2026, including viewport widths 320, 390, 768, and 1440 px. Firefox, Safari, and physical devices have not been verified.

Community ratings checks: with the local server running, use `python tests/ratings_checks.py` (Playwright and Edge). Covers numeric scores/vote counts, unrated anime, API errors, scores without images, compact view, duplicate-ID deduplication, persistent caching, and score expiry.

Theme checks: `python tests/theme_checks.py` verifies system preference, theme switching by keyboard, saved choices, blocked storage, compact surfaces, and mobile widths.
