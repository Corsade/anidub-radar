# AniDub Radar

A small, dependency-free static viewer for English-dub episode dates from [Anime Dub Calendar](https://github.com/fizzyfrys/anime-dub-calendar). The browser fetches the public ICS feed directly. No backend, API keys, or build step. Poster images are fetched through Jikan using numeric MAL IDs from the public calendar.

## Run locally

From this directory, run `python -m http.server 8000`, then open http://localhost:8000. Use an HTTP server, not a file URL, because JavaScript modules require it.

## Test

With the server running, open http://localhost:8000/tests/. The page prints PASS or FAIL. This small browser test uses the same parser as the app, native DOMParser, and an inline fictional XML fixture. It checks folded lines, all-day dates, episode summaries, numeric MAL IDs, title-independent XML matching, progress, and malformed XML.

## My anime

Export your anime list as XML from MyAnimeList, unzip it if necessary, and select it using the file input. The file is read only in browser memory; it is never uploaded, logged, or persisted. Reloading or Clear list removes it. Do not add personal XML exports to this repository. Watching and Plan to Watch match MAL statuses. Not in my list includes only events with a known MAL ID absent from the entire imported list; completed, dropped, and on-hold entries are still in your list. Unknown episode totals appear as `?`.

## GitHub Pages

Push these files to your repository. In Settings → Pages, choose Deploy from a branch, select your branch and `/ (root)`, and save. Open the URL GitHub provides after deployment. All local asset paths are relative, so repository subpaths work. No workflow or build is required.

## Feed behavior

Dates stay on the feed's calendar day; no release times or timezone conversions are inferred. Future dates may be projections. Source dates older than 14 days, or a feed whose last event is in the past, trigger a stale warning. A missing source update date is explicitly reported. Failed refreshes retain only the last successful feed in this tab and label it as potentially stale. An initial failure shows no events. Empty weeks and invalid XML have separate messages. Upstream must allow browser CORS requests (GitHub Pages currently does). There is no persistent cache or offline feed.

## Verification performed

On September 29, 2026, served locally with Python and checked in headless Microsoft Edge at a 390 px mobile width. The browser parser test passed. The real feed loaded 33 events for the current week without JavaScript errors or horizontal overflow. Additional browser checks passed for XML import/progress, Watching and Plan to Watch filters, malformed XML, clearing the list, week navigation, stale warnings, failed refresh retaining prior events, and initial network failure showing no events. The mobile screenshot was visually reviewed. GitHub Pages deployment, Safari/Firefox, and physical mobile devices were not verified.

## Design and posters

The interface takes inspiration from AniList: dark navigation, a pale blue-gray canvas, blue accents, and responsive poster cards grouped by day. It does not use AniList branding or imply affiliation.

Posters come from the [Jikan API](https://docs.api.jikan.moe/) (`GET /v4/anime/{malId}`) and MyAnimeList’s image CDN. Only public calendar IDs are requested; XML data and progress are never sent. Poster loading is lazy, deduplicated, cached in memory, and queued at least 1.1 seconds apart. HTTP 429 pauses the queue for a minute. Navigating away discards queued requests for detached cards. No key or server is needed. Missing images and API failures show a placeholder without affecting dates, links, or filters. A failed lookup can retry after a minute when the card is rendered again. Posters require an internet connection and third-party service availability.

After the poster redesign, Edge checks passed at 320, 390, 768, and 1440 px without horizontal overflow. Real Jikan/CDN images loaded for five anime while scrolling. The parser regression test still passed. Mocked browser checks passed for duplicate-ID request deduplication, unavailable API, broken images, rejected non-MAL image URLs, Watching/Plan to Watch/Not in my list filters, episode progress, week navigation, and reuse of cached lookups. Desktop and mobile screenshots were reviewed. GitHub Pages and other browsers remain unverified.
