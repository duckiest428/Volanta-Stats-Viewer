/* Turns a raw bundle of Volanta API responses into the compact, sanitised
 * snapshot the dashboard renders. Everything coming from outside is treated
 * as untrusted: strict types, length limits, https-only volanta.app images. */
(function (root) {
  "use strict";

  const str = (v, max = 120) => (typeof v === "string" ? v.trim().slice(0, max) : null) || null;
  const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const iso = (v) => {
    if (typeof v !== "string") return null;
    const s = /[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : v + "Z"; // Volanta times are UTC without suffix
    const t = Date.parse(s);
    return Number.isFinite(t) ? new Date(t).toISOString() : null;
  };
  const volantaImage = (v) => {
    const s = str(v, 500);
    if (!s) return null;
    try {
      const u = new URL(s);
      return u.protocol === "https:" && u.hostname === "cdn.volanta.app" ? u.href : null;
    } catch (_) {
      return null;
    }
  };
  const arr = (v, max) => (Array.isArray(v) ? v.slice(0, max) : []);

  function fromRaw(raw) {
    if (!raw || raw.kind !== "volanta-raw") throw new Error("Not a Volanta data file.");
    const airports = Object.create(null);
    const addAirport = (a) => {
      if (!a || typeof a !== "object") return null;
      const icao = str(a.icaoCode, 12);
      if (!icao || !/^[A-Za-z0-9-]+$/.test(icao)) return null;
      const lat = num(a.latitude), lon = num(a.longitude);
      const prev = airports[icao] || {};
      airports[icao] = {
        name: str(a.name, 120) ?? prev.name ?? null,
        iata: str(a.iataCode, 4) ?? prev.iata ?? null,
        lat: lat != null && Math.abs(lat) <= 90 ? lat : prev.lat ?? null,
        lon: lon != null && Math.abs(lon) <= 360 ? lon : prev.lon ?? null,
      };
      return icao;
    };

    for (const r of arr(raw.routes, 50000)) { addAirport(r?.origin); addAirport(r?.destination); }
    for (const r of arr(raw.summary?.cityPairs, 50000)) { addAirport(r?.origin); addAirport(r?.destination); }

    const seen = new Set();
    const flights = [];
    for (const f of arr(raw.items, 20000)) {
      if (!f || typeof f !== "object") continue;
      const id = str(f.id, 64), off = iso(f.offBlocksTime);
      if (!id || !off || seen.has(id)) continue;
      seen.add(id);
      const div = f.diversionAirport ? addAirport(f.diversionAirport) : str(f.diversionAirportIcao, 12);
      flights.push({
        id,
        callsign: str(f.callsign, 16),
        flightNumber: str(f.flightNumber, 16),
        off,
        on: iso(f.onBlocksTime),
        airSec: num(f.realFlightTime),
        landingRate: num(f.landingRate),
        from: addAirport(f.origin),
        to: addAirport(f.destination),
        diverted: div,
        type: str(f.aircraft?.aircraftTypeIcao, 8),
        reg: str(f.aircraft?.registration, 16),
        sim: str(f.simAbbreviation, 16),
        tags: arr(f.tags, 20).map((t) => str(typeof t === "string" ? t : t?.name, 32)).filter(Boolean),
      });
    }
    flights.sort((a, b) => a.off.localeCompare(b.off));

    const p = raw.profile || {};
    const s = raw.summary?.stats || {};
    return {
      schema: 1,
      generatedAt: iso(raw.fetchedAt) || new Date().toISOString(),
      profile: {
        userName: str(p.userName, 64) || str(raw.userName, 64) || "Pilot",
        image: volantaImage(p.profileImage),
        friends: num(p.friendsCount),
        currentStreak: num(p.currentStreak),
        achievements: arr(p.achievements, 500).map((a) => ({
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
      airports: { ...airports },
      flights,
    };
  }

  /** Accepts either a raw bundle or an already-built snapshot. */
  function toSnapshot(json) {
    if (json && json.kind === "volanta-raw") return fromRaw(json);
    if (json && json.schema === 1 && Array.isArray(json.flights)) return json;
    throw new Error("Unrecognised data file.");
  }

  root.VolantaNormalize = { fromRaw, toSnapshot };
})(typeof window !== "undefined" ? window : globalThis);
