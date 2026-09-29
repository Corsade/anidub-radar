# Public MAL list sync setup

The website stays on GitHub Pages. This optional Cloudflare Worker forwards read-only public-list requests to MAL's official API. XML import remains entirely local and works without the Worker.

## 1. Register a MAL API application

Sign in at https://myanimelist.net/apiconfig and create an application for AniDub Radar. Use https://corsade.github.io/anidub-radar/ as the website. This integration uses the application's **Client ID** (`X-MAL-CLIENT-ID`), not a client secret or user access token. No OAuth redirect is used by this public-list flow. Follow MAL's registration form for any additional required fields.

## 2. Deploy the Worker

Using the Cloudflare dashboard:

1. Sign in at https://dash.cloudflare.com/ and open **Workers & Pages**.
2. Create a Worker named `anidub-radar-sync` (the basic Hello World template is sufficient).
3. Replace its code with the contents of `worker/index.js` and deploy.
4. In the Worker's **Settings → Variables and Secrets**, add `MAL_CLIENT_ID` with your application's Client ID as a **Secret**. Save/deploy the change. Do not put credentials in this repository or chat.
5. Add the text variable `ALLOWED_ORIGINS` with value `https://corsade.github.io`. For local testing only, add `http://localhost:8000` separated by a comma.
6. Disable Worker invocation logs/observability if enabled. The application does not log usernames or list contents; Cloudflare and MAL still process the requests as service providers.

Alternatively, with Node.js and Wrangler installed, from `worker/`:

```sh
npx wrangler login
npx wrangler secret put MAL_CLIENT_ID
npx wrangler deploy
```

The included `wrangler.json` supplies the allowed production origin and disables observability. You may also add a Cloudflare rate-limiting binding named `SYNC_RATE_LIMIT`; the handler uses it when available. CORS is a browser restriction, not authentication or a substitute for rate limiting. This is intentionally a public, read-only endpoint.

## 3. Connect the site

Set `SYNC_ENDPOINT` in `config.js` to the deployed URL, including `/list`, for example:

```js
export const SYNC_ENDPOINT = 'https://anidub-radar-sync.YOUR-SUBDOMAIN.workers.dev/list';
```

The URL is public; it contains no credentials. Run `python tools/version_assets.py`, then commit/push the site changes. While the endpoint is blank, the app disables Sync now and explains that setup is pending.

## Behavior

- The browser POSTs only the requested username and page offset. The Worker calls one fixed MAL endpoint with `fields=list_status,num_episodes`, `nsfw=true`, and no status filter so completed/dropped/on-hold anime remain in the list.
- Each page contains at most 1,000 entries. The browser fetches up to 50 pages, validates the response, and replaces the current list only after every page succeeds. It never follows a client-supplied URL.
- Only numeric IDs, normalized statuses, watched counts, and totals are returned. Private or inaccessible lists cannot be imported through this route; use XML instead. A 403 may also indicate MAL refusing access, so it is not treated as definitive proof of a private list.
- Successful empty lists replace old lists. Failed, partial, or cancelled syncs keep the prior list and last successful timestamp.
- **Remember on this device** saves the minimal list plus its username and last successful sync time. A remembered synced list refreshes when opening the site if at least five minutes old. Nothing runs while the site is closed. **Sync now** requests an immediate refresh.
- Unchecking Remember removes persisted data and disables automatic refresh on future visits. Importing XML disconnects the synced source; Clear list deletes both list and source. Existing saved XML lists are migrated without enabling sync.
- Responses use `Cache-Control: no-store`; the Worker has no database, shared list cache, or application logging. No write-to-MAL endpoint exists.

## Verification

Run `python tests/sync_checks.py` with the local HTTP server, Playwright, and Edge. It tests the actual handler with a mocked upstream and the browser integration with fictional lists. `python tests/browser_checks.py` checks the original XML/calendar behavior too.

These checks do not prove a real Client ID has access, or validate a deployed Cloudflare runtime. Complete a real public-list sync after deployment, check a known watching entry, reload with Remember enabled, and confirm Clear removes the source. No real account credentials are included in this project.

References: [MAL API](https://myanimelist.net/apiconfig/references/api/v2), [Cloudflare dashboard setup](https://developers.cloudflare.com/workers/get-started/dashboard/), [Cloudflare secrets](https://developers.cloudflare.com/workers/configuration/secrets/).
