# ✈️ Volanta Stats Viewer

A static website that turns your [Volanta](https://volanta.app) flight history into a data portfolio:

- **Flight timeline map.** Every flight in chronological order on a world map, with play/pause, a scrubber, year filters, a moving plane, and a logbook that follows along.
- **Headline totals.** Flights, hours, distance (with "× around the Earth"), airports, aircraft types, average touchdown, fuel.
- **Records & fun facts.** Butteriest and firmest landings, longest and shortest flights, longest daily streak, busiest day and month, night-owl score, home base, northernmost and southernmost airports, progress to the Moon, favourite simulator, first flight.
- **Activity charts.** Flights per month, a weekday × hour punchcard, and a 12-month calendar heatmap.
- **Landing analysis.** Touchdown-rate histogram, median, butter rate, improvement over time, smoothest and toughest aircraft.
- **Fleet & airports.** Top aircraft types, airports and routes, plus a year-by-year table and your Volanta achievements.

You don't need a data export and you don't need to log in. The site uses Volanta's **public profile API**, the same data anyone can see on your public profile at fly.volanta.app.

## How it works

```
GitHub Action (every 6 h, on push, or on demand)
  └─ scripts/fetch-volanta.mjs  ── public API ──▶ api.volanta.app
        └─ writes site/data/volanta.json (sanitised, minimal fields)
  └─ deploys site/ to GitHub Pages
Browser
  └─ loads index.html + data/volanta.json from your own Pages domain
```

The browser never calls Volanta directly, so visitors' IPs aren't sent to Volanta and the page keeps working if the API is down. You keep seeing the last good snapshot.

## Setup (about 2 minutes)

1. Push this repo to GitHub.
2. Go to **Settings → Pages → Build and deployment → Source** and choose **GitHub Actions**.
3. Go to **Settings → Secrets and variables → Actions → Variables** and add a repository variable:
   - Name: `VOLANTA_USERNAME`
   - Value: your Volanta username, exactly as it appears on your profile
4. Go to **Actions → "Build & deploy flight portfolio" → Run workflow**.

The site will appear at `https://<you>.github.io/<repo>/` and refresh itself every 6 hours. To change how often it refreshes, edit the `cron` line in `.github/workflows/deploy.yml`.

> Your Volanta profile has to be public. If a flight is private on Volanta, it won't appear here.

Until `VOLANTA_USERNAME` is set, the site deploys with fictional **sample data** and shows a banner saying so.

## Run locally

```bash
node scripts/fetch-volanta.mjs YourVolantaUsername   # writes site/data/volanta.json (git-ignored)
python3 -m http.server 8765 --directory site          # open http://localhost:8765
```

You need Node 18 or newer. There are no npm dependencies. `node scripts/make-sample.mjs` regenerates the sample data.

## Security & privacy

- **No secrets.** Only public endpoints are used, so there's no password, token or API key to leak. The username is a plain repository *variable*, not a secret, because it's already public.
- **Least-privilege CI.** The workflow can only read the repo and publish to Pages (`contents: read`, `pages: write`, `id-token: write`). Checkout doesn't keep credentials.
- **Minimal data.** The fetch script keeps only the fields the site displays, with strict type checks and length limits. Profile image URLs are only accepted from `*.volanta.app`.
- **No third-party scripts.** Leaflet is vendored in `site/vendor/`. A strict Content-Security-Policy allows scripts only from your own origin and images only from the basemap and Volanta's CDN. The page sends no referrer and has no forms.
- **XSS-safe rendering.** Every string from the data is inserted with `textContent`, never `innerHTML`.
- **Polite client.** Requests are paced about 1.2 s apart, with back-off on HTTP 429 and 5xx responses. Paging stops at 20,000 flights.

## Notes & caveats

- Volanta doesn't document its API. The endpoints used (`/api/v1/Profiles/{user}`, `/Summary`, `/Flights/Routes`, `/Flights/Search`) are the ones the official web app uses for public profiles. If Volanta changes them, the Action fails, your previous deployment stays online, and only `scripts/fetch-volanta.mjs` needs updating.
- Per-flight distance is the great-circle distance between the departure and arrival airports. The headline total uses Volanta's own figure when it's available.
- Fuel is shown assuming Volanta reports it in kilograms.
- Weekday/hour charts use the viewer's local time zone.
- The basemap is Esri World Gray Canvas (no key required). This project isn't affiliated with Volanta or Orbx.
