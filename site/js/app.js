/* Volanta flight portfolio. Renders data/volanta.json (or data/sample.json). */
(function () {
  "use strict";

  const NM_EARTH = 21639; // equatorial circumference, nm
  const NM_MOON = 207559; // mean Earth–Moon distance, nm
  const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

  const $ = (id) => document.getElementById(id);
  const el = (tag, cls, text) => {
    const n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  };
  const fmt = (n, d = 0) => (n == null || !Number.isFinite(n) ? "—" : n.toLocaleString(undefined, { maximumFractionDigits: d, minimumFractionDigits: d }));
  const fmtDate = (d) => d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  const fmtDur = (sec) => {
    if (!Number.isFinite(sec) || sec <= 0) return "—";
    const h = Math.floor(sec / 3600), m = Math.round((sec % 3600) / 60);
    return h ? `${h}h ${String(m).padStart(2, "0")}m` : `${m}m`;
  };
  const dayKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  const monthKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  const countBy = (arr, keyFn) => {
    const m = new Map();
    for (const x of arr) { const k = keyFn(x); if (k != null) m.set(k, (m.get(k) || 0) + 1); }
    return m;
  };
  const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n);

  // ---------- geo ----------
  const rad = (x) => (x * Math.PI) / 180, deg = (x) => (x * 180) / Math.PI;
  function gcDist(a, b) {
    const dLat = rad(b.lat - a.lat), dLon = rad(b.lon - a.lon);
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
    return 2 * 3440.065 * Math.asin(Math.min(1, Math.sqrt(h)));
  }
  function gcPoints(a, b, n) {
    const φ1 = rad(a.lat), λ1 = rad(a.lon), φ2 = rad(b.lat), λ2 = rad(b.lon);
    const d = 2 * Math.asin(Math.sqrt(Math.sin((φ2 - φ1) / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin((λ2 - λ1) / 2) ** 2));
    if (d < 1e-6) return [[a.lat, a.lon], [b.lat, b.lon]];
    const pts = [];
    let prevLon = null;
    for (let i = 0; i <= n; i++) {
      const f = i / n;
      const A = Math.sin((1 - f) * d) / Math.sin(d), B = Math.sin(f * d) / Math.sin(d);
      const x = A * Math.cos(φ1) * Math.cos(λ1) + B * Math.cos(φ2) * Math.cos(λ2);
      const y = A * Math.cos(φ1) * Math.sin(λ1) + B * Math.cos(φ2) * Math.sin(λ2);
      const z = A * Math.sin(φ1) + B * Math.sin(φ2);
      const lat = deg(Math.atan2(z, Math.sqrt(x * x + y * y)));
      let lon = deg(Math.atan2(y, x));
      if (prevLon != null) { while (lon - prevLon > 180) lon -= 360; while (lon - prevLon < -180) lon += 360; }
      prevLon = lon;
      pts.push([lat, lon]);
    }
    return pts;
  }
  function bearing(p, q) {
    const φ1 = rad(p[0]), φ2 = rad(q[0]), Δλ = rad(q[1] - p[1]);
    return (deg(Math.atan2(Math.sin(Δλ) * Math.cos(φ2), Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ))) + 360) % 360;
  }

  // ---------- data ----------
  function prepare(raw) {
    const airports = raw.airports && typeof raw.airports === "object" ? raw.airports : {};
    const ap = (icao) => {
      const a = icao && airports[icao];
      return a && Number.isFinite(a.lat) && Number.isFinite(a.lon) ? a : null;
    };
    const flights = raw.flights
      .map((f) => {
        const off = new Date(f.off), on = f.on ? new Date(f.on) : null;
        if (isNaN(off)) return null;
        const arrIcao = f.diverted || f.to;
        const A = ap(f.from), B = ap(arrIcao);
        const block = on && !isNaN(on) ? (on - off) / 1000 : null;
        return {
          ...f, offD: off, onD: on, arr: arrIcao, A, B,
          dist: A && B ? gcDist(A, B) : null,
          sec: Number.isFinite(f.airSec) && f.airSec > 0 ? f.airSec : block,
          block,
          lr: Number.isFinite(f.landingRate) && Math.abs(f.landingRate) >= 1 ? Math.abs(f.landingRate) : null,
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.offD - b.offD);
    return { ...raw, airports, flights };
  }

  // =====================================================================
  //  Header + totals
  // =====================================================================
  function renderHeader(data) {
    const p = data.profile || {};
    const name = p.userName || "Pilot";
    $("pilot-name").textContent = name;
    document.title = `${name} · Flight Portfolio`;
    const fl = data.flights;
    const meta = [];
    if (fl.length) meta.push(`Flying since ${fmtDate(fl[0].offD)}`);
    if (Number.isFinite(p.friends)) meta.push(`${p.friends} friends`);
    if (Number.isFinite(p.currentStreak) && p.currentStreak > 0) meta.push(`🔥 ${p.currentStreak}-day streak`);
    $("pilot-meta").textContent = meta.join(" · ");
    const img = $("avatar");
    const hasImg = !!(p.image && /^https:\/\/cdn\.volanta\.app\//.test(p.image));
    if (hasImg) { img.src = p.image; img.alt = `${name}'s Volanta avatar`; } else img.removeAttribute("src");
    img.hidden = !hasImg;
    $("avatar-fallback").hidden = hasImg;
    $("sample-banner").hidden = !data.sample;
    $("updated").textContent = data.generatedAt ? `Flights loaded ${new Date(data.generatedAt).toLocaleString()}.` : "";
  }

  function tile(label, value, unit, sub) {
    const t = el("div", "tile");
    t.appendChild(el("div", "label", label));
    const v = el("div", "value", value);
    if (unit) v.appendChild(el("span", "unit", unit));
    t.appendChild(v);
    if (sub) t.appendChild(el("div", "sub", sub));
    return t;
  }

  function renderTotals(data) {
    const fl = data.flights, T = data.totals || {};
    const secs = Number.isFinite(T.airSeconds) ? T.airSeconds : fl.reduce((s, f) => s + (f.sec || 0), 0);
    const dist = Number.isFinite(T.distanceNm) ? T.distanceNm : fl.reduce((s, f) => s + (f.dist || 0), 0);
    const count = Number.isFinite(T.flights) ? Math.max(T.flights, fl.length) : fl.length;
    const airports = new Set(fl.flatMap((f) => [f.from, f.arr]).filter(Boolean));
    const types = new Set(fl.map((f) => f.type).filter(Boolean));
    const lrs = fl.map((f) => f.lr).filter((x) => x != null);
    const avgLr = lrs.length ? lrs.reduce((a, b) => a + b, 0) / lrs.length : (Number.isFinite(T.avgLandingRate) ? Math.abs(T.avgLandingRate) : null);

    const box = $("totals");
    box.replaceChildren(
      tile("Flights", fmt(count), null, fl.length ? `${fmt(count / Math.max(1, (Date.now() - fl[0].offD) / 6048e5), 1)} per week` : null),
      tile("Time in the air", fmt(secs / 3600, 0), "h", `${fmt(secs / 86400, 1)} days aloft`),
      tile("Distance", fmt(dist), "nm", `${fmt(dist / NM_EARTH, 1)}× around the Earth`),
      tile("Airports visited", fmt(airports.size), null, `${fmt(types.size)} aircraft types`),
      tile("Avg touchdown", avgLr != null ? fmt(avgLr) : "—", "fpm", lrs.length ? `over ${fmt(lrs.length)} landings` : null),
      ...(Number.isFinite(T.fuel) && T.fuel > 0 ? [tile("Fuel burned", fmt(T.fuel / 1000, 1), "t", `≈ ${fmt(T.fuel / 0.8 / 1000)} m³ of Jet-A`)] : []),
    );
  }

  // =====================================================================
  //  Timeline map
  // =====================================================================
  const PLANE_SVG = '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true"><path fill="currentColor" d="M12 2c.8 0 1.3 1 1.3 2.2v5.3l7.7 4.6v2l-7.7-2.4v4.6l2.2 1.7v1.6L12 20.6l-3.5 1v-1.6l2.2-1.7v-4.6L3 16.1v-2l7.7-4.6V4.2C10.7 3 11.2 2 12 2z"/></svg>';

  function initTimeline(data) {
    const all = data.flights;
    const css = getComputedStyle(document.documentElement);
    const col = (v) => css.getPropertyValue(v).trim();
    const dark = window.matchMedia("(prefers-color-scheme: dark)");
    const isDark = () => document.documentElement.dataset.theme ? document.documentElement.dataset.theme === "dark" : dark.matches;

    const ac = new AbortController();
    const sig = { signal: ac.signal };
    const map = L.map("map", { worldCopyJump: true, minZoom: 1, zoomSnap: 0.25, preferCanvas: true, attributionControl: true });
    map.attributionControl.setPrefix(false);
    let tiles;
    const setTiles = () => {
      if (tiles) map.removeLayer(tiles);
      const base = isDark() ? "World_Dark_Gray_Base" : "World_Light_Gray_Base";
      tiles = L.tileLayer(`https://server.arcgisonline.com/ArcGIS/rest/services/Canvas/${base}/MapServer/tile/{z}/{y}/{x}`, {
        maxZoom: 16, attribution: "Basemap © Esri, HERE, Garmin, © OpenStreetMap contributors",
      }).addTo(map);
    };
    setTiles();
    dark.addEventListener("change", () => { setTiles(); restyle(true); }, sig);
    map.setView([30, 0], 2);

    const routeLayer = L.layerGroup().addTo(map);
    const airportLayer = L.layerGroup().addTo(map);
    const plane = L.marker([0, 0], {
      icon: L.divIcon({ className: "plane-icon", html: PLANE_SVG, iconSize: [22, 22], iconAnchor: [11, 11] }),
      interactive: false, keyboard: false,
    });

    let flights = all;
    let lines = [];
    let apMarkers = new Map();
    let idx = 0;
    let playing = false, anim = null;

    // ----- year filter -----
    const years = [...new Set(all.map((f) => f.offD.getFullYear()))].sort();
    const yf = $("year-filter");
    yf.replaceChildren();
    const mkChip = (label, val) => {
      const b = el("button", "chip", label);
      b.type = "button";
      b.dataset.year = val;
      b.setAttribute("aria-pressed", val === "all" ? "true" : "false");
      b.addEventListener("click", () => {
        yf.querySelectorAll(".chip").forEach((c) => c.setAttribute("aria-pressed", String(c === b)));
        setFilter(val);
      });
      yf.appendChild(b);
    };
    if (years.length > 1) { mkChip("All time", "all"); years.forEach((y) => mkChip(String(y), String(y))); }

    // ----- list -----
    const list = $("flight-list");
    function buildList() {
      list.replaceChildren();
      flights.forEach((f, i) => {
        const li = el("li");
        const b = el("button");
        b.type = "button";
        b.appendChild(el("span", "fl-route", `${f.from || "????"} → ${f.arr || "????"}`));
        b.appendChild(el("span", "fl-date", f.offD.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "2-digit" })));
        b.appendChild(el("span", "fl-sub", [f.type, f.dist != null ? `${fmt(f.dist)} nm` : null, fmtDur(f.sec)].filter(Boolean).join(" · ")));
        b.addEventListener("click", () => { stop(); go(i, { fly: true }); });
        li.appendChild(b);
        list.appendChild(li);
      });
      $("list-count").textContent = `${fmt(flights.length)} flights`;
    }

    // ----- layers -----
    function build() {
      routeLayer.clearLayers();
      airportLayer.clearLayers();
      apMarkers = new Map();
      lines = flights.map((f) => {
        if (!f.A || !f.B) return null;
        const pts = gcPoints(f.A, f.B, Math.max(8, Math.min(96, Math.round((f.dist || 0) / 40))));
        // A route that crosses the 180° meridian runs onto the next copy of the world.
        // Draw it once more, shifted by 360°, so both ends meet a real airport dot.
        const lons = pts.map((p) => p[1]);
        const shifts = [0];
        if (Math.max(...lons) > 180) shifts.push(-360);
        if (Math.min(...lons) < -180) shifts.push(360);
        const opts = { weight: 1.5, opacity: 1, interactive: false };
        const main = L.polyline(pts, opts);
        const line = L.featureGroup([main, ...shifts.slice(1).map((d) => L.polyline(pts.map(([la, lo]) => [la, lo + d]), opts))]);
        line._pts = pts;
        line._bounds = main.getBounds();
        return line;
      });
      lines.forEach((l) => l && l.addTo(routeLayer));

      const visits = new Map();
      flights.forEach((f, i) => {
        for (const icao of [f.from, f.arr]) {
          if (!icao) continue;
          const v = visits.get(icao) || { first: i, count: 0 };
          v.count++;
          visits.set(icao, v);
        }
      });
      visits.forEach((v, icao) => {
        const a = data.airports[icao];
        if (!a || !Number.isFinite(a.lat)) return;
        // repeat each dot on the neighbouring world copies so wrapped routes still end on one
        const mo = { radius: Math.min(9, 2.5 + Math.sqrt(v.count)), weight: 1.5, fillOpacity: 0.9 };
        const m = L.featureGroup([-360, 0, 360].map((d) => L.circleMarker([a.lat, a.lon + d], mo)));
        m.bindTooltip(() => {
          const d = el("div");
          d.appendChild(el("b", null, icao + (a.iata ? ` / ${a.iata}` : "")));
          if (a.name) d.appendChild(el("div", null, a.name));
          d.appendChild(el("div", null, `${v.count} visit${v.count === 1 ? "" : "s"}`));
          return d;
        }, { direction: "top", offset: [0, -4] });
        m._first = v.first;
        apMarkers.set(icao, m);
      });

      const slider = $("slider");
      slider.max = String(Math.max(0, flights.length - 1));
      $("date-start").textContent = flights.length ? fmtDate(flights[0].offD) : "";
      $("date-end").textContent = flights.length ? fmtDate(flights[flights.length - 1].offD) : "";
      buildList();
    }

    let lastStyledIdx = -2;
    function restyle(force) {
      const past = col("--route-past"), future = col("--route"), hl = col("--highlight"), accent = col("--accent"), surf = col("--surface-1");
      lines.forEach((l, i) => {
        if (!l) return;
        const state = i < idx ? 0 : i === idx ? 1 : 2;
        if (!force && l._state === state) return;
        l._state = state;
        if (state === 2) { if (routeLayer.hasLayer(l)) routeLayer.removeLayer(l); return; }
        if (!routeLayer.hasLayer(l)) routeLayer.addLayer(l);
        l.setStyle(state === 1 ? { color: hl, weight: 3 } : { color: past, weight: 1.5 });
        if (state === 1) l.bringToFront();
      });
      apMarkers.forEach((m) => {
        const show = m._first <= idx;
        if (show && !airportLayer.hasLayer(m)) airportLayer.addLayer(m);
        if (!show && airportLayer.hasLayer(m)) airportLayer.removeLayer(m);
        if (force || show) m.setStyle({ color: surf, fillColor: accent });
      });
      void future;
      lastStyledIdx = idx;
    }

    function nowCard(f) {
      const c = $("now-card");
      c.replaceChildren();
      if (!f) return;
      const r = el("div", "now-route");
      r.appendChild(document.createTextNode(f.from || "????"));
      r.appendChild(el("span", "arrow", "→"));
      r.appendChild(document.createTextNode(f.arr || "????"));
      c.appendChild(r);
      const names = [data.airports[f.from]?.name, data.airports[f.arr]?.name].filter(Boolean).join(" → ");
      if (names) c.appendChild(el("div", "now-names", names));
      const meta = el("div", "now-meta");
      const item = (k, v) => { if (v == null || v === "—") return; const s = el("span", null, k + " "); s.appendChild(el("b", null, v)); meta.appendChild(s); };
      item("", f.offD.toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }));
      item("Aircraft", f.type);
      item("Distance", f.dist != null ? `${fmt(f.dist)} nm` : null);
      item("Air time", fmtDur(f.sec));
      item("Touchdown", f.lr != null ? `${fmt(f.lr)} fpm` : null);
      item("Callsign", f.callsign);
      if (f.diverted) item("Diverted to", f.diverted);
      c.appendChild(meta);
      if (!data.sample && f.id && /^[0-9a-f-]{20,64}$/i.test(f.id)) {
        const a = el("a", "small", "Open on Volanta ↗");
        a.href = `https://fly.volanta.app/flights/${encodeURIComponent(f.id)}`;
        a.target = "_blank";
        a.rel = "noopener noreferrer";
        c.appendChild(a);
      }
      $("date-now").textContent = `#${idx + 1} · ${fmtDate(f.offD)}`;
    }

    function highlightList() {
      list.querySelectorAll("li").forEach((li, i) => {
        li.classList.toggle("current", i === idx);
        li.classList.toggle("future", i > idx);
      });
      const cur = list.children[idx];
      if (cur) {
        const top = cur.offsetTop, h = list.clientHeight;
        if (top < list.scrollTop || top + cur.offsetHeight > list.scrollTop + h) list.scrollTop = top - h / 2;
      }
    }

    function go(i, { fly = false } = {}) {
      if (!flights.length) return;
      idx = Math.max(0, Math.min(flights.length - 1, i));
      $("slider").value = String(idx);
      restyle(false);
      nowCard(flights[idx]);
      highlightList();
      const l = lines[idx];
      if (l && fly) {
        const b = l._bounds;
        if (!map.getBounds().contains(b)) map.flyToBounds(b.pad(0.6), { duration: 0.8, maxZoom: 7 });
      }
      if (l && !playing) { plane.setLatLng(l._pts[l._pts.length - 1]); setPlaneRot(l._pts[l._pts.length - 2] || l._pts[0], l._pts[l._pts.length - 1]); }
      if (l) plane.addTo(map); else plane.remove();
    }

    function setPlaneRot(p, q) {
      const elx = plane.getElement();
      if (elx && elx.firstChild) elx.firstChild.style.transform = `rotate(${bearing(p, q)}deg)`;
    }

    // ----- playback -----
    const playBtn = $("play");
    function stop() {
      playing = false;
      if (anim) cancelAnimationFrame(anim);
      anim = null;
      playBtn.textContent = "▶";
      playBtn.setAttribute("aria-label", "Play timeline");
    }
    function play() {
      if (!flights.length) return;
      if (idx >= flights.length - 1) go(0);
      playing = true;
      playBtn.textContent = "❚❚";
      playBtn.setAttribute("aria-label", "Pause timeline");
      animateFlight();
    }
    function animateFlight() {
      const f = flights[idx], l = lines[idx];
      const speed = Number($("speed").value) || 1;
      if (!l) { // no coordinates → just tick forward
        anim = requestAnimationFrame(() => setTimeout(next, 250 / speed));
        return;
      }
      const b = l._bounds;
      const pts = l._pts;
      plane.setLatLng(pts[0]);
      setPlaneRot(pts[0], pts[1] || pts[0]);
      if (!map.getBounds().pad(-0.1).contains(b)) {
        map.once("moveend", () => { if (playing) fly(f, pts, speed); });
        map.flyToBounds(b.pad(0.8), { duration: 0.6 / speed + 0.3, maxZoom: 6 });
      } else fly(f, pts, speed);
    }
    function fly(f, pts, speed) {
      const dur = Math.max(500, Math.min(2600, 500 + (f.dist || 0) * 0.35)) / speed;
      const t0 = performance.now();
      const step = (now) => {
        if (!playing) return;
        const t = Math.min(1, (now - t0) / dur);
        const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
        const fi = e * (pts.length - 1), k = Math.min(pts.length - 2, Math.floor(fi)), r = fi - k;
        const p = [pts[k][0] + (pts[k + 1][0] - pts[k][0]) * r, pts[k][1] + (pts[k + 1][1] - pts[k][1]) * r];
        plane.setLatLng(p);
        setPlaneRot(pts[k], pts[k + 1]);
        if (t < 1) anim = requestAnimationFrame(step);
        else setTimeout(next, 120 / speed);
      };
      anim = requestAnimationFrame(step);
    }
    function next() {
      if (!playing) return;
      if (idx >= flights.length - 1) { stop(); return; }
      go(idx + 1);
      animateFlight();
    }

    playBtn.addEventListener("click", () => (playing ? stop() : play()), sig);
    $("step-back").addEventListener("click", () => { stop(); go(idx - 1, { fly: true }); }, sig);
    $("step-fwd").addEventListener("click", () => { stop(); go(idx + 1, { fly: true }); }, sig);
    $("slider").addEventListener("input", (e) => { stop(); go(Number(e.target.value)); }, sig);
    document.addEventListener("keydown", (e) => {
      if (e.target.closest("input, select, textarea")) return;
      const r = $("timeline").getBoundingClientRect();
      if (r.bottom < 0 || r.top > window.innerHeight) return;
      if (e.key === "ArrowRight") { stop(); go(idx + 1, { fly: true }); e.preventDefault(); }
      if (e.key === "ArrowLeft") { stop(); go(idx - 1, { fly: true }); e.preventDefault(); }
    }, sig);

    function fitAll() {
      const b = L.latLngBounds([]);
      lines.forEach((l) => l && b.extend(l._bounds));
      if (b.isValid()) map.fitBounds(b.pad(0.1), { maxZoom: 6 });
    }
    function setFilter(year) {
      stop();
      flights = year === "all" ? all : all.filter((f) => String(f.offD.getFullYear()) === year);
      build();
      idx = flights.length - 1;
      restyle(true);
      go(idx);
      fitAll();
    }

    setFilter("all");
    setTimeout(() => map.invalidateSize(), 50);
    return () => { stop(); ac.abort(); map.remove(); };
  }

  // =====================================================================
  //  Records
  // =====================================================================
  function renderRecords(data) {
    const fl = data.flights, A = data.airports;
    const box = $("records-grid");
    box.replaceChildren();
    if (!fl.length) return;
    const card = (emoji, label, value, sub) => {
      const c = el("div", "record");
      c.appendChild(el("div", "emoji", emoji));
      c.appendChild(el("div", "label", label));
      c.appendChild(el("div", "value", value));
      if (sub) c.appendChild(el("div", "sub", sub));
      box.appendChild(c);
    };
    const route = (f) => `${f.from || "?"} → ${f.arr || "?"}`;
    const when = (f) => `${fmtDate(f.offD)}${f.type ? " · " + f.type : ""}`;
    const maxBy = (arr, fn) => arr.reduce((b, x) => (fn(x) > fn(b) ? x : b), arr[0]);
    const minBy = (arr, fn) => arr.reduce((b, x) => (fn(x) < fn(b) ? x : b), arr[0]);

    const withLr = fl.filter((f) => f.lr != null);
    if (withLr.length) {
      const butter = minBy(withLr, (f) => f.lr), hard = maxBy(withLr, (f) => f.lr);
      card("🧈", "Butteriest landing", `${fmt(butter.lr)} fpm`, `${route(butter)} · ${when(butter)}`);
      card("💥", "Firmest arrival", `${fmt(hard.lr)} fpm`, `${route(hard)} · ${when(hard)}`);
    }
    const withDist = fl.filter((f) => f.dist != null && f.dist > 1);
    if (withDist.length) {
      const far = maxBy(withDist, (f) => f.dist), hop = minBy(withDist, (f) => f.dist);
      card("🌏", "Longest flight", `${fmt(far.dist)} nm`, `${route(far)} · ${fmtDur(far.sec)}`);
      card("🦗", "Shortest hop", `${fmt(hop.dist, 1)} nm`, `${route(hop)} · ${when(hop)}`);
    }
    const withSec = fl.filter((f) => f.sec);
    if (withSec.length) {
      const longT = maxBy(withSec, (f) => f.sec);
      card("⏱️", "Longest time aloft", fmtDur(longT.sec), `${route(longT)} · ${when(longT)}`);
      const avg = withSec.reduce((s, f) => s + f.sec, 0) / withSec.length;
      card("📏", "Average flight", fmtDur(avg), withDist.length ? `${fmt(withDist.reduce((s, f) => s + f.dist, 0) / withDist.length)} nm on average` : null);
    }

    // streaks & busiest days
    const days = [...new Set(fl.map((f) => dayKey(f.offD)))].sort();
    let best = 1, run = 1, bestEnd = days[0];
    for (let i = 1; i < days.length; i++) {
      const diff = Math.round((new Date(days[i] + "T12:00") - new Date(days[i - 1] + "T12:00")) / 864e5);
      run = diff === 1 ? run + 1 : 1;
      if (run > best) { best = run; bestEnd = days[i]; }
    }
    card("🔥", "Longest daily streak", `${best} day${best === 1 ? "" : "s"}`, best > 1 ? `ended ${fmtDate(new Date(bestEnd + "T12:00"))}` : "fly two days in a row to start one");
    const perDay = top(countBy(fl, (f) => dayKey(f.offD)), 1)[0];
    if (perDay && perDay[1] > 1) card("📅", "Busiest day", `${perDay[1]} flights`, fmtDate(new Date(perDay[0] + "T12:00")));
    const perMonth = top(countBy(fl, (f) => monthKey(f.offD)), 1)[0];
    if (perMonth) { const [y, m] = perMonth[0].split("-"); card("🗓️", "Busiest month", `${perMonth[1]} flights`, `${MONTHS[+m - 1]} ${y}`); }

    const night = fl.filter((f) => { const h = f.offD.getHours(); return h >= 22 || h < 5; }).length;
    card("🦉", "Night owl score", `${fmt((night / fl.length) * 100)}%`, "of departures between 22:00 and 05:00 your time");

    const visits = countBy(fl.flatMap((f) => [f.from, f.arr]), (x) => x || null);
    const home = top(visits, 1)[0];
    if (home) card("🏠", "Home base", home[0], `${A[home[0]]?.name || ""} · ${home[1]} visits`.replace(/^ · /, ""));

    const coords = [...visits.keys()].map((k) => [k, A[k]]).filter(([, a]) => a && Number.isFinite(a.lat));
    if (coords.length > 1) {
      const n = maxBy(coords, ([, a]) => a.lat), s = minBy(coords, ([, a]) => a.lat);
      card("🧭", "Northernmost / southernmost", `${n[0]} / ${s[0]}`, `${fmt(n[1].lat, 1)}° to ${fmt(s[1].lat, 1)}° latitude`);
    }

    const total = withDist.reduce((s, f) => s + f.dist, 0);
    if (total) {
      if (total >= NM_MOON) card("🌙", "Flown to the Moon", `${fmt(total / NM_MOON, 1)}×`, `at ${fmt(NM_MOON)} nm per one-way trip`);
      else card("🌙", "Trip to the Moon", `${fmt((total / NM_MOON) * 100, 1)}%`, `${fmt(NM_MOON - total)} nm still to go`);
    }

    const sims = top(countBy(fl, (f) => f.sim), 3);
    if (sims.length) card("🖥️", "Simulator of choice", simName(sims[0][0]), sims.map(([s, c]) => `${simName(s)} ${fmt((c / fl.length) * 100)}%`).join(" · "));

    const first = fl[0];
    card("🐣", "First logged flight", route(first), `${when(first)} · ${fmt((Date.now() - first.offD) / 864e5)} days ago`);
  }

  function simName(s) {
    const m = { msfs24: "MSFS 2024", msfs: "MSFS 2020", msfs20: "MSFS 2020", xp12: "X-Plane 12", xp11: "X-Plane 11", p3d: "Prepar3D", fsx: "FSX", fg: "FlightGear" };
    return m[s] || (s ? s.toUpperCase() : "Unknown");
  }

  // =====================================================================
  //  Activity charts
  // =====================================================================
  // Rolling 12-month "Flights flown" chart with a movable window.
  let rollAC = null;
  function initRolling(byMonth, fl) {
    if (rollAC) rollAC.abort();
    rollAC = new AbortController();
    const sig = { signal: rollAC.signal };
    const WIN = 12;
    const now = new Date();
    const first = new Date(fl[0].offD.getFullYear(), fl[0].offD.getMonth(), 1);
    const lastFlight = fl[fl.length - 1].offD;
    const endMonth = new Date(Math.max(now, lastFlight));
    const last = new Date(endMonth.getFullYear(), endMonth.getMonth(), 1);
    // pad so there are always at least 12 months to show
    const start = new Date(Math.min(first, new Date(last.getFullYear(), last.getMonth() - (WIN - 1), 1)));
    const months = [];
    for (let d = new Date(start); d <= last; d.setMonth(d.getMonth() + 1)) months.push(new Date(d));
    const maxEnd = months.length - 1, minEnd = WIN - 1;
    let end = maxEnd;
    const scrub = $("roll-scrub");
    scrub.min = String(minEnd);
    scrub.max = String(maxEnd);
    scrub.hidden = maxEnd === minEnd;
    const label = (d) => `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

    function draw() {
      const win = months.slice(end - WIN + 1, end + 1);
      const pts = win.map((d, i) => {
        const v = byMonth.get(monthKey(d)) || { n: 0, s: 0 };
        return {
          label: label(d), value: v.n,
          tip: [label(d), `${v.n} flight${v.n === 1 ? "" : "s"} · ${fmt(v.s / 3600, 1)} h`],
          tick: i === 0 || d.getMonth() === 0 ? `${MONTHS[d.getMonth()]} ’${String(d.getFullYear()).slice(2)}` : MONTHS[d.getMonth()],
        };
      });
      Charts.area($("chart-monthly"), pts, { label: `Flights flown, ${label(win[0])} to ${label(win[win.length - 1])}`, height: 240 });
      const n = pts.reduce((a, p) => a + p.value, 0);
      const h = win.reduce((a, d) => a + ((byMonth.get(monthKey(d)) || {}).s || 0), 0) / 3600;
      $("roll-range").textContent = `${label(win[0])} – ${label(win[win.length - 1])}`;
      $("roll-summary").textContent = `${fmt(n)} flight${n === 1 ? "" : "s"}, ${fmt(h, 1)} h`;
      $("roll-back").disabled = end <= minEnd;
      $("roll-fwd").disabled = end >= maxEnd;
      $("roll-latest").disabled = end >= maxEnd;
      scrub.value = String(end);
    }
    const move = (to) => {
      const next = Math.max(minEnd, Math.min(maxEnd, to));
      if (next !== end) { end = next; draw(); }
    };
    $("roll-back").addEventListener("click", (e) => move(end - (e.shiftKey ? 12 : 1)), sig);
    $("roll-fwd").addEventListener("click", (e) => move(end + (e.shiftKey ? 12 : 1)), sig);
    $("roll-latest").addEventListener("click", () => move(maxEnd), sig);
    scrub.addEventListener("input", () => move(Number(scrub.value)), sig);

    const chart = $("chart-monthly");
    // sideways trackpad / shift+wheel scrolling moves through time; vertical scroll is left alone
    let acc = 0;
    chart.addEventListener("wheel", (e) => {
      const dx = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
      if (!dx) return;
      e.preventDefault();
      acc += dx;
      while (Math.abs(acc) >= 40) { move(end + Math.sign(acc)); acc -= 40 * Math.sign(acc); }
    }, { passive: false, signal: rollAC.signal });
    // touch swipe
    let sx = null;
    chart.addEventListener("pointerdown", (e) => { if (e.pointerType === "touch") sx = e.clientX; }, sig);
    chart.addEventListener("pointerup", (e) => {
      if (sx == null) return;
      const d = e.clientX - sx; sx = null;
      if (Math.abs(d) > 30) move(end - Math.round(d / 40));
    }, sig);
    chart.addEventListener("keydown", (e) => {
      if (e.key === "ArrowLeft") { move(end - 1); e.preventDefault(); e.stopPropagation(); }
      if (e.key === "ArrowRight") { move(end + 1); e.preventDefault(); e.stopPropagation(); }
    }, sig);
    draw();
  }

  function renderActivity(data) {
    const fl = data.flights;
    if (!fl.length) return;
    // monthly
    const byMonth = new Map();
    fl.forEach((f) => {
      const k = monthKey(f.offD);
      const v = byMonth.get(k) || { n: 0, s: 0 };
      v.n++; v.s += f.sec || 0;
      byMonth.set(k, v);
    });
    initRolling(byMonth, fl);

    // punchcard
    const grid = Array.from({ length: 7 }, () => Array(24).fill(0));
    fl.forEach((f) => { grid[(f.offD.getDay() + 6) % 7][f.offD.getHours()]++; });
    Charts.heat($("chart-punch"), DAYS, Array.from({ length: 24 }, (_, h) => (h % 3 === 0 ? String(h).padStart(2, "0") : "")),
      (r, c) => grid[r][c],
      (r, c, v) => [`${DAYS[r]} ${String(c).padStart(2, "0")}:00`, `${v} departure${v === 1 ? "" : "s"}`],
      { label: "Departures by weekday and hour", cell: 20 });

    // calendar: last 53 weeks
    const perDay = countBy(fl, (f) => dayKey(f.offD));
    const today = new Date(); today.setHours(12, 0, 0, 0);
    const startCal = new Date(today); startCal.setDate(startCal.getDate() - ((today.getDay() + 6) % 7) - 52 * 7);
    const weeks = 53;
    const colLabels = [];
    for (let w = 0; w < weeks; w++) {
      const d = new Date(startCal); d.setDate(d.getDate() + w * 7);
      const prev = new Date(d); prev.setDate(prev.getDate() - 7);
      colLabels.push(w === 0 || d.getMonth() !== prev.getMonth() ? MONTHS[d.getMonth()] : "");
    }
    const dateAt = (r, c) => { const d = new Date(startCal); d.setDate(d.getDate() + c * 7 + r); return d; };
    Charts.heat($("chart-calendar"), ["Mon", "", "Wed", "", "Fri", "", "Sun"], colLabels,
      (r, c) => { const d = dateAt(r, c); return d > today ? 0 : perDay.get(dayKey(d)) || 0; },
      (r, c, v) => { const d = dateAt(r, c); return [fmtDate(d), d > today ? "—" : `${v} flight${v === 1 ? "" : "s"}`]; },
      { label: "Flights per day over the last year", cell: 13, rowLabelWidth: 30 });
  }

  // =====================================================================
  //  Landings
  // =====================================================================
  function renderLandings(data) {
    const fl = data.flights.filter((f) => f.lr != null);
    const facts = $("landing-facts");
    facts.replaceChildren();
    if (!fl.length) { $("chart-landing").textContent = "No landing data yet."; return; }
    const BIN = 50, MAXB = 700;
    const bins = Array.from({ length: MAXB / BIN + 1 }, () => 0);
    fl.forEach((f) => { bins[Math.min(bins.length - 1, Math.floor(f.lr / BIN))]++; });
    Charts.bars($("chart-landing"), bins.map((n, i) => {
      const lo = i * BIN, last = i === bins.length - 1;
      const label = last ? `${lo}+ fpm` : `${lo}–${lo + BIN} fpm`;
      return { label, value: n, tip: [label, `${n} landing${n === 1 ? "" : "s"} (${fmt((n / fl.length) * 100)}%)`], tick: i % 2 === 0 ? (last ? `${lo}+` : String(lo)) : null };
    }), { label: "Landing rate histogram", height: 220, width: 560 });

    const sorted = fl.map((f) => f.lr).sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)];
    const avg = sorted.reduce((a, b) => a + b, 0) / sorted.length;
    const fact = (label, value, sub) => {
      const d = el("div", "fact");
      d.appendChild(el("div", "label", label));
      d.appendChild(el("div", "value", value));
      if (sub) d.appendChild(el("div", "sub", sub));
      facts.appendChild(d);
    };
    fact("Median touchdown", `${fmt(median)} fpm`, `average ${fmt(avg)} fpm`);
    const butter = sorted.filter((x) => x < 100).length;
    fact("Butter rate", `${fmt((butter / sorted.length) * 100)}%`, "landings softer than 100 fpm");
    const firm = sorted.filter((x) => x > 400).length;
    fact("Firm arrivals", `${fmt((firm / sorted.length) * 100)}%`, "harder than 400 fpm");
    if (fl.length >= 20) {
      const n = Math.min(25, Math.floor(fl.length / 2));
      const a1 = fl.slice(0, n).reduce((s, f) => s + f.lr, 0) / n, a2 = fl.slice(-n).reduce((s, f) => s + f.lr, 0) / n;
      const better = a2 < a1;
      fact("Getting better?", better ? `${fmt(a1 - a2)} fpm softer` : `${fmt(a2 - a1)} fpm firmer`, `last ${n} vs first ${n} landings`);
    }
    const byType = new Map();
    fl.forEach((f) => { if (!f.type) return; const v = byType.get(f.type) || []; v.push(f.lr); byType.set(f.type, v); });
    const ranked = [...byType.entries()].filter(([, v]) => v.length >= 3).map(([t, v]) => [t, v.reduce((a, b) => a + b, 0) / v.length, v.length]).sort((a, b) => a[1] - b[1]);
    if (ranked.length) {
      fact("Smoothest aircraft", ranked[0][0], `${fmt(ranked[0][1])} fpm avg over ${ranked[0][2]} landings`);
      if (ranked.length > 1) { const w = ranked[ranked.length - 1]; fact("Toughest to land", w[0], `${fmt(w[1])} fpm avg over ${w[2]} landings`); }
    }
  }

  // =====================================================================
  //  Fleet, airports, routes
  // =====================================================================
  function renderFleet(data) {
    const fl = data.flights, A = data.airports;
    const hoursByType = new Map();
    fl.forEach((f) => { if (f.type) hoursByType.set(f.type, (hoursByType.get(f.type) || 0) + (f.sec || 0)); });
    Charts.barList($("top-aircraft"), top(countBy(fl, (f) => f.type), 10).map(([t, n]) => ({
      name: t, sub: `· ${fmt(hoursByType.get(t) / 3600, 1)} h`, count: n,
    })));
    Charts.barList($("top-airports"), top(countBy(fl.flatMap((f) => [f.from, f.arr]), (x) => x || null), 10).map(([k, n]) => ({
      name: k, sub: A[k]?.name || "", count: n,
    })));
    Charts.barList($("top-routes"), top(countBy(fl, (f) => (f.from && f.arr ? [f.from, f.arr].sort().join(" ⇄ ") : null)), 10).map(([k, n]) => ({
      name: k, count: n,
    })));
  }

  function renderYears(data) {
    const fl = data.flights;
    const t = $("year-table");
    t.replaceChildren();
    const head = el("thead"), hr = el("tr");
    ["Year", "Flights", "Hours", "Distance (nm)", "Airports", "Types", "Avg touchdown (fpm)", "Longest (nm)"].forEach((h) => { const th = el("th", null, h); th.scope = "col"; hr.appendChild(th); });
    head.appendChild(hr);
    const body = el("tbody");
    const years = [...new Set(fl.map((f) => f.offD.getFullYear()))].sort((a, b) => b - a);
    years.forEach((y) => {
      const ys = fl.filter((f) => f.offD.getFullYear() === y);
      const lrs = ys.map((f) => f.lr).filter((x) => x != null);
      const dists = ys.map((f) => f.dist).filter((x) => x != null);
      const row = el("tr");
      [String(y), fmt(ys.length), fmt(ys.reduce((s, f) => s + (f.sec || 0), 0) / 3600, 1), fmt(dists.reduce((a, b) => a + b, 0)),
        fmt(new Set(ys.flatMap((f) => [f.from, f.arr]).filter(Boolean)).size), fmt(new Set(ys.map((f) => f.type).filter(Boolean)).size),
        lrs.length ? fmt(lrs.reduce((a, b) => a + b, 0) / lrs.length) : "—", dists.length ? fmt(Math.max(...dists)) : "—",
      ].forEach((v, i) => { const c = el(i === 0 ? "th" : "td", null, v); if (i === 0) c.scope = "row"; row.appendChild(c); });
      body.appendChild(row);
    });
    t.append(head, body);
  }

  function renderAchievements(data) {
    const list = data.profile?.achievements || [];
    $("achievements-section").hidden = !list.length;
    if (!list.length) return;
    const box = $("achievements");
    box.replaceChildren();
    [...list].sort((a, b) => b.achieved - a.achieved).forEach((a) => {
      const d = el("div", "ach" + (a.achieved ? "" : " locked"));
      d.appendChild(el("div", "icon", a.achieved ? "🏅" : "🔒"));
      const txt = el("div");
      txt.appendChild(el("div", "name", a.name));
      if (a.description) txt.appendChild(el("div", "desc", a.description));
      d.appendChild(txt);
      box.appendChild(d);
    });
  }

  // =====================================================================
  // =====================================================================
  //  Loading flow: username → Volanta tab + bookmarklet → postMessage back
  // =====================================================================
  const VOLANTA = "https://fly.volanta.app";
  const STORE_DATA = "vp-data", STORE_USER = "vp-user";
  const USER_RE = /^[A-Za-z0-9_.\-]{1,64}$/;
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (_) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); return true; } catch (_) { return false; } },
  };
  let destroyTimeline = null;
  let pendingUser = null;
  let current = null;

  function status(msg, isErr) {
    const s = $("connect-status");
    s.textContent = msg;
    s.classList.toggle("err", !!isErr);
  }

  function show(snapshot, { cache = false } = {}) {
    const data = prepare(snapshot);
    current = data;
    if (cache && !data.sample) store.set(STORE_DATA, JSON.stringify(snapshot));
    if (!data.sample && data.profile?.userName) store.set(STORE_USER, data.profile.userName);
    $("start").hidden = true;
    $("dashboard").hidden = false;
    $("hero-actions").hidden = false;
    $("jump").hidden = false;
    $("btn-refresh").hidden = !!data.sample;
    if (destroyTimeline) { destroyTimeline(); destroyTimeline = null; }
    renderHeader(data);
    renderTotals(data);
    try { destroyTimeline = initTimeline(data); } catch (e) { console.error(e); $("map").textContent = "Map failed to load."; }
    renderRecords(data);
    renderActivity(data);
    renderLandings(data);
    renderFleet(data);
    renderYears(data);
    renderAchievements(data);
    window.scrollTo({ top: 0, behavior: "instant" });
  }

  function showStart({ user, connect = false } = {}) {
    $("start").hidden = false;
    $("sample-banner").hidden = true;
    if (!current) {
      $("pilot-name").textContent = "Your flight portfolio";
      $("pilot-meta").textContent = "A timeline map and stats of every flight you've tracked with Volanta.";
    }
    const input = $("username");
    if (user) input.value = user;
    $("connect").hidden = !connect;
    if (connect) beginConnect(input.value.trim());
    window.scrollTo({ top: 0, behavior: "instant" });
    if (!connect) input.focus();
  }

  function beginConnect(user) {
    pendingUser = user;
    store.set(STORE_USER, user);
    $("connect").hidden = false;
    $("bookmarklet").href = VolantaLoader.bookmarkletHref(location.origin);
    status("");
    $("open-volanta").focus();
  }

  function initStart() {
    $("start-form").addEventListener("submit", (e) => {
      e.preventDefault();
      const u = $("username").value.trim();
      if (!USER_RE.test(u)) { $("username").setCustomValidity("Letters, numbers, dots, dashes and underscores only."); $("username").reportValidity(); return; }
      $("username").setCustomValidity("");
      beginConnect(u);
    });
    $("username").addEventListener("input", () => $("username").setCustomValidity(""));

    $("bookmarklet").addEventListener("click", (e) => {
      e.preventDefault();
      status("Drag that button to your bookmarks bar rather than clicking it here. You'll click it on the Volanta tab.", true);
    });

    $("open-volanta").addEventListener("click", () => {
      // Deliberately keeps window.opener so the bookmark can hand the data back to this tab.
      const w = window.open(VOLANTA + "/", "volanta-portfolio");
      if (!w) status("Your browser blocked the new tab. Allow pop-ups for this site, or open fly.volanta.app yourself: the bookmark will then save a file you can drop below.", true);
      else status("Waiting for you to click ✈ Send to Portfolio on the Volanta tab…");
    });

    document.querySelectorAll('[data-action="switch"]').forEach((b) =>
      b.addEventListener("click", () => showStart({ user: store.get(STORE_USER) || "" })));
    $("btn-refresh").addEventListener("click", () => {
      showStart({ user: current?.profile?.userName || store.get(STORE_USER) || "", connect: true });
    });

    $("try-sample").addEventListener("click", async () => {
      try {
        const res = await fetch("data/sample.json", { cache: "no-cache" });
        show(VolantaNormalize.toSnapshot(await res.json()));
      } catch (_) { status("Couldn't load the sample data.", true); }
    });

    // file fallback (bookmark used without this tab attached)
    const drop = $("drop"), fileInput = $("file-input");
    const readFile = async (file) => {
      if (!file) return;
      if (file.size > 60 * 1024 * 1024) { status("That file is too large.", true); return; }
      try {
        const snap = VolantaNormalize.fromRaw(JSON.parse(await file.text()));
        show(snap, { cache: true });
      } catch (err) {
        $("connect").hidden = false;
        status(`Couldn't read that file: ${err.message}`, true);
      }
    };
    fileInput.addEventListener("change", () => readFile(fileInput.files[0]));
    ["dragenter", "dragover"].forEach((t) => drop.addEventListener(t, (e) => { e.preventDefault(); drop.classList.add("over"); }));
    ["dragleave", "drop"].forEach((t) => drop.addEventListener(t, () => drop.classList.remove("over")));
    drop.addEventListener("drop", (e) => { e.preventDefault(); readFile(e.dataTransfer.files[0]); });

    // the hand-off from the Volanta tab
    window.addEventListener("message", (e) => {
      if (e.origin !== VOLANTA) return;
      const d = e.data;
      if (!d || typeof d !== "object") return;
      if (d.type === "vp-hello") {
        status("Connected to Volanta. Collecting your flights…");
        const user = pendingUser || store.get(STORE_USER);
        if (user && e.source) e.source.postMessage({ type: "vp-user", user }, VOLANTA);
      } else if (d.type === "vp-data") {
        try {
          const snap = VolantaNormalize.fromRaw(d.bundle);
          pendingUser = null;
          show(snap, { cache: true });
          try { window.focus(); } catch (_) { /* ignore */ }
        } catch (err) {
          status(`Something went wrong reading the data: ${err.message}`, true);
        }
      }
    });
  }

  async function main() {
    initStart();
    const params = new URLSearchParams(location.search);
    const urlUser = params.get("user");
    if (urlUser && USER_RE.test(urlUser)) store.set(STORE_USER, urlUser);

    // 1. this browser's last loaded pilot
    const cached = store.get(STORE_DATA);
    if (cached) {
      try {
        const snap = VolantaNormalize.toSnapshot(JSON.parse(cached));
        if (!urlUser || snap.profile?.userName?.toLowerCase() === urlUser.toLowerCase()) { show(snap); return; }
      } catch (_) { /* fall through */ }
    }
    // 2. a portfolio pinned by the site owner (site/data/volanta.json, optional)
    if (!urlUser) {
      try {
        const res = await fetch("data/volanta.json", { cache: "no-cache" });
        if (res.ok) { show(VolantaNormalize.toSnapshot(await res.json())); return; }
      } catch (_) { /* none pinned */ }
    }
    // 3. ask for a username
    showStart({ user: store.get(STORE_USER) || urlUser || "" });
  }
  main();
})();
