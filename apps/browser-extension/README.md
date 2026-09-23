# AlgoMemtor browser connector

A Manifest V3 extension for Chrome-family browsers (Chrome, Edge, Brave) and
Firefox-family browsers (Firefox, Zen). It syncs your own LeetCode and CSES
history to AlgoMemtor from the browser you are signed in to, and verifies the
Codeforces and CodeChef accounts you are signed in to and asks AlgoMemtor to
sync them. Your passwords,
cookies, and code never leave the browser; it uploads only problems, verdicts,
times, languages, runtimes, and memory.

## For learners

1. Open **Settings → Linked platforms → Browser connector** on AlgoMemtor and
   install the extension for your browser (store link, or the downloaded
   build; the page shows the steps).
2. The extension opens **Settings → Linked platforms** on AlgoMemtor. While you
   are signed in there, it connects on its own: no token to copy.
3. Use **Sync platforms** on the AlgoMemtor Dashboard or Settings page (or
   Sync now in the popup) to sync right away; manual syncs are limited to one
   per 15 minutes. Stay signed in to leetcode.com and cses.fi. The first sync starts right
   away, the extension syncs every hour (configurable in its popup), runs a
   sync whenever it is turned on, and shows a notification when a sync
   finishes.
4. Each platform syncs on its own: Codeforces and CodeChef (quick sign-in
   checks) go first, then LeetCode and CSES. A platform that fails or takes
   longer than 4 minutes is reported for that platform alone, and the others
   still sync.

## Build

```bash
npm run build:extension
```

This writes:

- `dist/chrome/` and `dist/firefox/` — load unpacked (Chrome:
  `chrome://extensions` → Developer mode → Load unpacked; Firefox/Zen:
  `about:debugging#/runtime/this-firefox` → Load Temporary Add-on → pick
  `dist/firefox/manifest.json`).
- `release/algomemtor-connector-<browser>-<version>.zip` — store uploads.
- `apps/web/public/extension/algomemtor-connector-<browser>.zip` — the
  downloads the website offers.

Builds point at local development by default. For a deployment, set the
deployed addresses when building (the root `npm run build` builds the
extension before the website, so the site ships matching downloads):

```bash
ALGOMEMTOR_WEB_URL=https://app.example.com \
ALGOMEMTOR_API_URL=https://api.example.com \
npm run build
```

`ALGOMEMTOR_MANUAL_SYNC_COOLDOWN_MINUTES` (default 15) sets the gap between
manual syncs; `0` disables it for local testing only.

`ALGOMEMTOR_MANUAL_SYNC_COOLDOWN_MINUTES` (default 15) sets the gap between
manual syncs; `0` disables it for local testing only.

`ALGOMEMTOR_WEB_URL` is where pairing happens (the content script runs only
there); `ALGOMEMTOR_API_URL` is where uploads go. Both become host permissions,
so a build only talks to the addresses it was built for.

## Publishing

1. Bump `version` in `package.json` and build with the production addresses.
2. **Chrome Web Store:** upload `release/algomemtor-connector-chrome-<version>.zip`
   in the developer dashboard. Explain the host permissions (LeetCode and CSES
   are read with the learner's session; AlgoMemtor receives the uploads) and
   the single purpose. After approval, set `VITE_CHROME_EXTENSION_URL` for the
   website and redeploy; the settings page then links to the store.
3. **Firefox Add-ons (Firefox, Zen):** submit
   `release/algomemtor-connector-firefox-<version>.zip` on
   addons.mozilla.org (listed), or sign it for self-distribution with
   `npx web-ext sign --channel unlisted --source-dir dist/firefox` and your AMO
   API keys. Firefox and Zen install only signed add-ons permanently. Set
   `VITE_FIREFOX_EXTENSION_URL` to the listing or signed `.xpi` URL.
4. Check the Firefox build with `npx web-ext lint --source-dir dist/firefox`.

## Development

```bash
npm --prefix apps/browser-extension run typecheck
npm --prefix apps/browser-extension test
```

- `leetcode.ts`, `cses.ts` — parsers and provider requests.
- `sync.ts` — resumable, rate-limit-aware sync (injected fetch and storage, so
  it is tested without a browser).
- `provider-page.ts` — runs provider requests inside a provider tab, where the
  browser attaches the learner's session cookie. LeetCode always reads this
  way; CSES falls back to it when a direct request looks signed out.
- `pair.ts` — content script on the AlgoMemtor site that receives the token
  from the signed-in page.
- `background.ts` — schedule, pairing, start-up sync, and notifications.

See section 9.5 of `docs/PROJECT_DOCUMENTATION.md` for the design.
