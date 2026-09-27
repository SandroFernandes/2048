# Tessera — an ad-free sliding number puzzle

A calm, original take on the slide-and-merge number puzzle, built as an
installable Progressive Web App. No ads, analytics, tracking, cookies,
accounts or network requests: everything runs and is saved on your device,
and the game works fully offline after the first load.

- Plain HTML, CSS and vanilla JavaScript (ES modules), zero runtime dependencies
- Grid sizes 3×3, 4×4 (default), 5×5, 6×6 and targets 1024, 2048, 4096
- Undo (up to 20 moves), Endless Mode after winning, best score per size/target
- Swipe, mouse drag, arrow keys and WASD; light/dark themes; optional sound and vibration
- Saved automatically in `localStorage` (board, score, undo history, settings, best scores)

## Project layout

```
public/                 Everything that gets deployed (static files)
  index.html            App shell
  offline.html          Friendly fallback for uncached pages while offline
  manifest.webmanifest  PWA manifest
  sw.js                 Service worker (versioned precache)
  css/styles.css        Styles, themes, animations
  js/game.js            Pure game rules (no DOM, no storage)
  js/storage.js         Validated localStorage persistence
  js/render.js          Board rendering and animation
  js/input.js           Keyboard and swipe input
  js/feedback.js        Optional Web Audio sounds and vibration
  js/pwa.js             Service worker registration and update prompt
  js/app.js             Controller that wires everything together
  icons/                Original app icons (SVG + generated PNGs)
tests/                  Automated tests (node:test, no dependencies)
scripts/generate-icons.mjs  Regenerates the PNG icons from code
docker-compose.yml      Local server, tests and icon generation
Dockerfile, nginx.conf  Production image
```

## Run it locally

Everything runs in Docker; nothing needs to be installed on the host.

```bash
docker compose up -d web
```

Open <http://localhost:8080>. Stop it with `docker compose down`.

Because the app is plain static files, any static server works too, as long as
it serves `public/` as the site root.

## Run the tests

```bash
docker compose run --rm test
```

This runs `yarn test` (Node's built-in test runner) inside a `node:22-alpine`
container. The suites cover:

- movement in all four directions, merge ordering and the tricky cases
  (`[2,2,2,2] → [4,4,0,0]`, `[4,4,8,8] → [8,16,0,0]`, no double merges)
- scoring, invalid moves (no new tile, no score change)
- random tiles only in empty cells, 2/4 probability
- victory for each target, Endless Mode, target changes
- game-over detection, all grid sizes
- saving/restoring state, corrupted data, storage failures
- PWA assets: manifest fields, icon sizes, every shipped file precached,
  no remote URLs or trackers

To regenerate the PNG icons after changing the design:

```bash
docker compose run --rm icons
```

## Install it as an app

Open the site once over HTTPS (or `localhost`) so it can be cached, then:

- **iPhone / iPad (Safari):** tap Share → **Add to Home Screen**.
- **Android (Chrome):** tap ⋮ → **Install app** (or accept the install banner).
- **Desktop (Chrome, Edge):** click the install icon in the address bar.

The installed app launches standalone (no browser UI) and works offline.

## Deploy to static hosting

The deployable site is simply the `public/` folder; there is no build step.

- **Any static host** (Netlify, Cloudflare Pages, GitHub Pages, Vercel, S3,
  your own nginx…): publish the contents of `public/`. All paths are relative,
  so hosting in a sub-folder such as `https://you.github.io/tessera/` works.
- **Docker:** `docker build -t tessera . && docker run -d -p 8080:80 tessera`
  serves the app with the included `nginx.conf`.

Recommended server settings (already in `nginx.conf`): serve `sw.js` and
`manifest.webmanifest` with `Cache-Control: no-cache` so updates are picked up,
and serve the manifest as `application/manifest+json`.

### Releasing an update

Bump `VERSION` in `public/sw.js` whenever any file changes (and add new files to
its `PRECACHE` list; a test fails if you forget). Returning players see a
"new version is ready" prompt and the old cache is removed on activation. Saved
games live in `localStorage`, which the service worker never touches, so updates
never erase progress.

## HTTPS is required for service workers

Browsers only register service workers in a **secure context**: pages served
over **HTTPS**, or from **`localhost`** during development. On plain `http://`
(for example `http://192.168.1.20:8080` from a phone on your LAN) the game still
plays and saves, but it will not work offline or be installable. Use a host
with HTTPS for real devices.

## Privacy

No ads, analytics, tracking, cookies, accounts or external requests. A strict
Content-Security-Policy only allows resources from the app's own origin.
"Reset all data" in Settings erases everything stored on the device.

## License

MIT — see [LICENSE](LICENSE).
