#!/usr/bin/env node
/**
 * Pulls a pilot's public Volanta profile + full flight history and writes a
 * compact, sanitised JSON snapshot that the static site renders.
 *
 *   node scripts/fetch-volanta.mjs <VolantaUsername> [outFile]
 *   VOLANTA_USERNAME=me node scripts/fetch-volanta.mjs
 *
 * Uses only Volanta's public, unauthenticated profile endpoints (the same ones
 * fly.volanta.app uses for public profiles). No password or token is needed or
 * stored. Requests are paced so we stay a polite client.
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const API = "https://api.volanta.app/api/v1";
const PAGE_SIZE = 100;
const DELAY_MS = 1200;
const MAX_PAGES = 200; // hard stop: 20k flights

const username = (process.argv[2] || process.env.VOLANTA_USERNAME || "").trim();
const outFile = resolve(process.argv[3] || "site/data/volanta.json");

if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(username)) {
  console.error("Usage: node scripts/fetch-volanta.mjs <VolantaUsername> [outFile]");
  console.error("Or set the VOLANTA_USERNAME environment variable / repo variable.");
  process.exit(1);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const u = encodeURIComponent(username);

async function get(path, { optional = false } = {}) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await fetch(API + path, {
      headers: { Accept: "application/json", "User-Agent": "volanta-stats-viewer (static portfolio)" },
    });
    if (res.ok) return res.json();
    if (res.status === 404 && optional) return null;
    if (res.status === 404) throw new Error(`Volanta user "${username}" not found (404 on ${path})`);
    if (res.status === 429 || res.status >= 500) {
      const wait = Number(res.headers.get("retry-after")) * 1000 || 5000 * attempt;
      console.warn(`  ${res.status} on ${path}, retrying in ${wait / 1000}s…`);
      await sleep(wait);
      continue;
    }
    if (optional) return null;
    throw new Error(`HTTP ${res.status} on ${path}`);
  }
  if (optional) return null;
  throw new Error(`Gave up on ${path}`);
}

// ---------- sanitisers: only keep what the site needs, with strict types ----------
const str = (v, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : null) || null;
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
const iso = (v) => {
  if (typeof v !== "string") return null;
  const s = /[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : v + "Z"; // Volanta times are UTC without suffix
  const t = Date.parse(s);
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};
const httpsUrl = (v) => {
  const s = str(v, 500);
  try {
    const url = new URL(s);
    return url.protocol === "https:" && url.hostname.endsWith("volanta.app") ? url.href : null;
  } catch {
    return null;
  }
};

const airports = {};
function addAirport(a) {
  const icao = str(a?.icaoCode, 12);
  if (!icao) return null;
  const lat = num(a.latitude), lon = num(a.longitude);
  const prev = airports[icao] || {};
  airports[icao] = {
    name: str(a.name, 120) ?? prev.name ?? null,
    iata: str(a.iataCode, 4) ?? prev.iata ?? null,
    lat: lat ?? prev.lat ?? null,
    lon: lon ?? prev.lon ?? null,
  };
  return icao;
}

function cleanFlight(f) {
  const div = f.diversionAirport ? addAirport(f.diversionAirport) : str(f.diversionAirportIcao, 12);
  return {
    id: str(f.id, 64),
    callsign: str(f.callsign, 16),
    flightNumber: str(f.flightNumber, 16),
    off: iso(f.offBlocksTime),
    on: iso(f.onBlocksTime),
    airSec: num(f.realFlightTime),
    landingRate: num(f.landingRate),
    from: addAirport(f.origin),
    to: addAirport(f.destination),
    diverted: div,
    type: str(f.aircraft?.aircraftTypeIcao, 8),
    reg: str(f.aircraft?.registration, 16),
    sim: str(f.simAbbreviation, 16),
    tags: Array.isArray(f.tags) ? f.tags.map((t) => str(typeof t === "string" ? t : t?.name, 32)).filter(Boolean) : [],
  };
}

async function main() {
  console.log(`Fetching public Volanta data for ${username}…`);

  const profile = await get(`/Profiles/${u}`);
  await sleep(DELAY_MS);
  const summary = await get(`/Profiles/${u}/Summary`, { optional: true });
  await sleep(DELAY_MS);
  const routes = await get(`/Profiles/${u}/Flights/Routes`, { optional: true });

  for (const r of routes || []) { addAirport(r.origin); addAirport(r.destination); }
  for (const r of summary?.cityPairs || []) { addAirport(r.origin); addAirport(r.destination); }

  const flights = [];
  let page = 1, totalPages = 1;
  do {
    await sleep(DELAY_MS);
    const res = await get(`/Profiles/${u}/Flights/Search?Page=${page}&PageSize=${PAGE_SIZE}`);
    const items = Array.isArray(res?.items) ? res.items : [];
    flights.push(...items.map(cleanFlight));
    totalPages = Math.min(num(res?.totalPages) ?? 1, MAX_PAGES);
    console.log(`  page ${page}/${totalPages} — ${flights.length} flights`);
    if (!items.length) break;
    page++;
  } while (page <= totalPages);

  // de-dupe and sort oldest → newest
  const seen = new Set();
  const unique = flights
    .filter((f) => f.id && f.off && !seen.has(f.id) && seen.add(f.id))
    .sort((a, b) => a.off.localeCompare(b.off));

  const s = summary?.stats || {};
  const snapshot = {
    schema: 1,
    generatedAt: new Date().toISOString(),
    profile: {
      userName: str(profile?.userName, 64) || username,
      image: httpsUrl(profile?.profileImage),
      friends: num(profile?.friendsCount),
      currentStreak: num(profile?.currentStreak),
      achievements: (profile?.achievements || []).map((a) => ({
        name: str(a?.achievement?.name, 80),
        description: str(a?.achievement?.description, 200),
        achieved: a?.achieved === true,
      })).filter((a) => a.name),
    },
    totals: {
      flights: num(s.flightCount),
      airSeconds: num(s.totalFlightTimeSeconds),
      distanceNm: num(s.totalDistanceNm),
      fuel: num(s.totalFuelBurned),
      avgLandingRate: num(s.averageLandingRate),
      favouritePair: str(s.favouriteCityPair, 40),
    },
    airports,
    flights: unique,
  };

  await mkdir(dirname(outFile), { recursive: true });
  await writeFile(outFile, JSON.stringify(snapshot));
  console.log(`Wrote ${unique.length} flights and ${Object.keys(airports).length} airports to ${outFile}`);
}

main().catch((e) => {
  console.error("Fetch failed:", e.message);
  process.exit(1);
});
