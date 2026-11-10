#!/usr/bin/env node
// Generates site/data/sample.json — fictional flights between real airports,
// so the site renders before you've configured your Volanta username.
import { writeFile } from "node:fs/promises";

const A = {
  KJFK: ["John F. Kennedy International Airport", "JFK", 40.6413, -73.7781],
  KBOS: ["Boston Logan International Airport", "BOS", 42.3656, -71.0096],
  KORD: ["Chicago O'Hare International Airport", "ORD", 41.9742, -87.9073],
  KLAX: ["Los Angeles International Airport", "LAX", 33.9416, -118.4085],
  KSFO: ["San Francisco International Airport", "SFO", 37.6213, -122.379],
  KSEA: ["Seattle-Tacoma International Airport", "SEA", 47.4502, -122.3088],
  KDEN: ["Denver International Airport", "DEN", 39.8561, -104.6737],
  KATL: ["Hartsfield-Jackson Atlanta International Airport", "ATL", 33.6407, -84.4277],
  KMIA: ["Miami International Airport", "MIA", 25.7959, -80.287],
  PHNL: ["Daniel K. Inouye International Airport", "HNL", 21.3187, -157.9225],
  CYYZ: ["Toronto Pearson International Airport", "YYZ", 43.6777, -79.6248],
  EGLL: ["London Heathrow Airport", "LHR", 51.47, -0.4543],
  EHAM: ["Amsterdam Airport Schiphol", "AMS", 52.3105, 4.7683],
  EDDF: ["Frankfurt am Main Airport", "FRA", 50.0379, 8.5622],
  LFPG: ["Paris Charles de Gaulle Airport", "CDG", 49.0097, 2.5479],
  LSZH: ["Zurich Airport", "ZRH", 47.4582, 8.5555],
  LFLJ: ["Courchevel Altiport", "CVF", 45.3967, 6.6347],
  LXGB: ["Gibraltar International Airport", "GIB", 36.1512, -5.3497],
  BIKF: ["Keflavik International Airport", "KEF", 63.985, -22.6056],
  OMDB: ["Dubai International Airport", "DXB", 25.2532, 55.3657],
  VQPR: ["Paro International Airport", "PBH", 27.4032, 89.4246],
  VHHH: ["Hong Kong International Airport", "HKG", 22.308, 113.9185],
  RJTT: ["Tokyo Haneda Airport", "HND", 35.5494, 139.7798],
  WSSS: ["Singapore Changi Airport", "SIN", 1.3644, 103.9915],
  YSSY: ["Sydney Kingsford Smith Airport", "SYD", -33.9399, 151.1753],
  NZQN: ["Queenstown Airport", "ZQN", -45.0211, 168.7392],
  TNCM: ["Princess Juliana International Airport", "SXM", 18.041, -63.1089],
  SBGR: ["São Paulo/Guarulhos International Airport", "GRU", -23.4356, -46.4731],
};
const ROUTES = [
  ["KJFK", "KBOS", "A320"], ["KBOS", "KORD", "B738"], ["KORD", "KDEN", "B738"], ["KDEN", "KSFO", "A20N"],
  ["KSFO", "KSEA", "A20N"], ["KSEA", "KLAX", "B738"], ["KLAX", "PHNL", "B789"], ["KATL", "KMIA", "A321"],
  ["KMIA", "TNCM", "B738"], ["CYYZ", "KJFK", "CRJ9"], ["KJFK", "EGLL", "B77W"], ["EGLL", "EHAM", "A320"],
  ["EHAM", "EDDF", "E190"], ["EDDF", "LSZH", "A320"], ["LSZH", "LFLJ", "PC12"], ["LFPG", "LXGB", "A319"],
  ["BIKF", "KBOS", "B752"], ["EGLL", "OMDB", "A388"], ["OMDB", "VQPR", "A319"], ["VHHH", "RJTT", "A359"],
  ["WSSS", "YSSY", "A359"], ["YSSY", "NZQN", "A20N"], ["KJFK", "SBGR", "B77W"], ["RJTT", "KSFO", "B789"],
  ["KBOS", "KJFK", "C172"], ["KATL", "KORD", "A321"],
];

let seed = 42;
const rnd = () => ((seed = (seed * 1664525 + 1013904223) % 4294967296) / 4294967296);
const pick = (a) => a[Math.floor(rnd() * a.length)];
const R = 3440.065;
const gc = (a, b) => {
  const [la1, lo1, la2, lo2] = [a[2], a[3], b[2], b[3]].map((x) => (x * Math.PI) / 180);
  return 2 * R * Math.asin(Math.sqrt(Math.sin((la2 - la1) / 2) ** 2 + Math.cos(la1) * Math.cos(la2) * Math.sin((lo2 - lo1) / 2) ** 2));
};
const speed = { C172: 110, PC12: 270, CRJ9: 440, E190: 440, A319: 450, A320: 450, A20N: 450, A321: 450, B738: 450, B752: 460, A359: 488, B789: 488, B77W: 490, A388: 490 };

const flights = [];
let t = Date.parse("2024-09-03T14:00:00Z");
const end = Date.parse("2026-11-08T20:00:00Z");
let i = 0;
while (t < end) {
  let [from, to, type] = pick(ROUTES);
  if (rnd() < 0.5) [from, to] = [to, from];
  const dist = gc(A[from], A[to]);
  const air = Math.round(((dist / speed[type]) * 3600 + 900) * (0.9 + rnd() * 0.2));
  const off = new Date(t);
  const on = new Date(t + (air + 900 + rnd() * 900) * 1000);
  const lr = -Math.round(40 + Math.abs(rnd() + rnd() + rnd() - 1.5) * 380 + (rnd() < 0.04 ? 400 : 0));
  flights.push({
    id: `sample-${++i}`,
    callsign: type === "C172" || type === "PC12" ? "N" + Math.floor(100 + rnd() * 900) + "SP" : "SPL" + Math.floor(100 + rnd() * 900),
    flightNumber: null,
    off: off.toISOString(), on: on.toISOString(), airSec: air, landingRate: lr,
    from, to, diverted: null, type, reg: null, sim: rnd() < 0.8 ? "msfs24" : "xp12", tags: [],
  });
  // next flight: 0.3–6 days later, biased toward evenings
  t = on.getTime() + (0.3 + rnd() * rnd() * 6) * 86400000;
  const d = new Date(t); d.setUTCHours(pick([0, 1, 2, 13, 15, 17, 18, 19, 20, 21, 22, 23]), Math.floor(rnd() * 60)); t = d.getTime();
}

const airports = Object.fromEntries(Object.entries(A).map(([k, [name, iata, lat, lon]]) => [k, { name, iata, lat, lon }]));
const sum = (k) => flights.reduce((s, f) => s + f[k], 0);
const snapshot = {
  schema: 1, sample: true, generatedAt: new Date().toISOString(),
  profile: {
    userName: "SamplePilot", image: null, friends: 7, currentStreak: 2,
    achievements: [
      { name: "Land at Paro", description: "You completed one of the hardest approaches in the world.", achieved: true },
      { name: "Land at Courchevel", description: "You landed at Courchevel Airport.", achieved: true },
      { name: "It's been a blast!", description: "You flew feet over the beach at Princess Juliana.", achieved: false },
      { name: "Land at Gibraltar", description: "You landed at Gibraltar Airport.", achieved: true },
      { name: "Climbing Everest", description: "You landed at Lukla Airport.", achieved: false },
    ],
  },
  totals: {
    flights: flights.length, airSeconds: sum("airSec"),
    distanceNm: flights.reduce((s, f) => s + gc(A[f.from], A[f.to]), 0),
    fuel: flights.reduce((s, f) => s + gc(A[f.from], A[f.to]) * 11, 0),
    avgLandingRate: sum("landingRate") / flights.length, favouritePair: null,
  },
  airports, flights,
};
await writeFile("site/data/sample.json", JSON.stringify(snapshot));
console.log(`sample.json: ${flights.length} flights`);
