# ✈️ Volanta Stats Viewer

A static website that turns any pilot's [Volanta](https://volanta.app) flight history into a data portfolio. Visitors type their Volanta username and their flights load in. You don't need a data export, a login or a server.

- **Flight timeline map.** Every flight in chronological order on a world map, with play/pause, a scrubber, year filters, a moving plane, and a logbook that follows along.
- **Headline totals.** Flights, hours, distance (with "× around the Earth"), airports, aircraft types, average touchdown, fuel.
- **Records & fun facts.** Butteriest and firmest landings, longest and shortest flights, longest daily streak, busiest day and month, night-owl score, home base, northernmost and southernmost airports, progress to the Moon, favourite simulator, first flight.
- **Activity charts.** Flights per month, a weekday × hour punchcard, and a 12-month calendar heatmap.
- **Landing analysis.** Touchdown-rate histogram, median, butter rate, improvement over time, smoothest and toughest aircraft.
- **Fleet & airports.** Top aircraft types, airports and routes, plus a year-by-year table and Volanta achievements.

## How loading works

Volanta's API only answers requests coming from Volanta's own website (fly.volanta.app). It sends no CORS headers for other sites, and Cloudflare blocks non-browser clients. So a GitHub Pages site can't fetch the data directly. This project doesn't try to get around that. Instead, it asks the visitor's own Volanta tab to collect the data:

```
Portfolio page                         fly.volanta.app tab
──────────────                         ───────────────────
1. Enter username
2. "Open Volanta"  ──window.open──▶    3. Click the "✈ Send to Portfolio" bookmark
                                          (one-time drag to the bookmarks bar)
                   ◀──postMessage──    4. Reads the PUBLIC profile + flights from
   "vp-hello" → reply with username       api.volanta.app, as Volanta's own site does
5. Dashboard renders  ◀─postMessage─   5. Sends the result back to the portfolio tab only
   and is cached in this browser
```

- After the first time, it's: enter username → Open Volanta → click the bookmark.
- **Refresh flights** in the header repeats the hand-off to pick up new flights. The last loaded pilot is remembered in your browser (`localStorage`).
- If the bookmark is clicked on a Volanta tab that this site didn't open, it saves a `volanta-<username>.json` file instead. You can drop that file onto the start screen.
- **Try it with sample data** shows a fictional pilot (`site/data/sample.json`).
- You can share a link that pre-fills a username: `https://<you>.github.io/<repo>/?user=YourName`.

### Pin your own portfolio (optional)

If you want visitors to see *your* flights by default, run the bookmark once without the portfolio tab attached. Save the resulting `volanta-<you>.json` as `site/data/volanta.json`, then commit it. The site shows it to anyone who hasn't loaded a pilot of their own. To update it, re-run the bookmark and commit the new file.

## Publish on GitHub Pages

1. Push this repo to GitHub.
2. Go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Push to `main`, or run **Actions → "Build & deploy flight portfolio" → Run workflow**.

The site appears at `https://<you>.github.io/<repo>/`.

## Run locally

```bash
python3 -m http.server 8765 --directory site   # then open http://localhost:8765
```

There's no build step and there are no dependencies. `node scripts/make-sample.mjs` regenerates the sample data.

## Security & privacy

- **No secrets, no server.** Only public profile data is read, by the visitor's own browser. There's nothing to leak.
- **Locked-down hand-off.** The bookmark only runs on `fly.volanta.app` and only posts data to the portfolio origin baked into it. The portfolio only accepts messages whose origin is exactly `https://fly.volanta.app`.
- **Untrusted data is sanitised.** `site/js/normalize.js` keeps only the fields the site displays, with strict type checks and length limits. Avatars are only accepted from `https://cdn.volanta.app`. Every string is rendered with `textContent`, never `innerHTML`.
- **Strict Content-Security-Policy.** Scripts only load from this site, there are no third-party scripts (Leaflet is vendored in `site/vendor/`), `connect-src 'self'`, no forms are posted, and no referrer is sent.
- **Stays in your browser.** Loaded data is cached only in your browser's `localStorage`. Nothing is uploaded anywhere.
- **Polite client.** The bookmark fetches pages about 0.4 s apart and stops at 20,000 flights.
- **Least-privilege CI.** The workflow only publishes the `site/` folder (`contents: read`, `pages: write`, `id-token: write`).

## Notes & caveats

- Volanta doesn't document its API. The bookmark uses the same public endpoints as Volanta's profile pages (`/api/v1/Profiles/{user}`, `/Summary`, `/Flights/Routes`, `/Flights/Search`). If Volanta changes them, update `site/js/loader.js` and `site/js/normalize.js`.
- The pilot's Volanta profile has to be public.
- Browsers may block the "Open Volanta" tab as a pop-up the first time. If that happens, allow pop-ups, or use the file fallback.
- Per-flight distance is the great-circle distance between the airports. The headline total uses Volanta's own figure when it's available. Fuel is shown assuming kilograms. Weekday/hour charts use the viewer's time zone.
- The basemap is Esri World Gray Canvas (no key required). This project isn't affiliated with Volanta or Orbx.
