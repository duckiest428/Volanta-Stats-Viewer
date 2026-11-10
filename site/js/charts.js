/* Tiny dependency-free SVG charts. All text is set with textContent (never innerHTML). */
(function () {
  "use strict";
  const NS = "http://www.w3.org/2000/svg";

  function svgEl(tag, attrs, parent) {
    const n = document.createElementNS(NS, tag);
    for (const k in attrs) n.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(n);
    return n;
  }

  // ---------- tooltip ----------
  const tip = () => document.getElementById("tooltip");
  function showTip(evt, lines) {
    const t = tip();
    t.replaceChildren();
    lines.forEach((line, i) => {
      const d = document.createElement(i === 0 ? "b" : "div");
      d.textContent = line;
      t.appendChild(d);
      if (i === 0) t.appendChild(document.createElement("br"));
    });
    t.hidden = false;
    const r = t.getBoundingClientRect();
    let x = evt.clientX + 14, y = evt.clientY - r.height - 10;
    if (x + r.width > window.innerWidth - 8) x = evt.clientX - r.width - 14;
    if (y < 8) y = evt.clientY + 16;
    t.style.left = x + "px";
    t.style.top = y + "px";
  }
  function hideTip() { tip().hidden = true; }
  function bindTip(node, lines) {
    node.addEventListener("mousemove", (e) => showTip(e, lines));
    node.addEventListener("mouseleave", hideTip);
    node.setAttribute("tabindex", "0");
    node.setAttribute("aria-label", lines.join(", "));
    node.addEventListener("focus", () => {
      const b = node.getBoundingClientRect();
      showTip({ clientX: b.left + b.width / 2, clientY: b.top }, lines);
    });
    node.addEventListener("blur", hideTip);
  }

  function niceMax(v) {
    if (v <= 0) return 1;
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
  }

  /** Vertical bar chart. data: [{label, value, tip:[..], tick?:string, hl?:bool}] */
  function bars(el, data, opts = {}) {
    el.replaceChildren();
    const W = opts.width || 900, H = opts.height || 220;
    const m = { t: 10, r: 6, b: 26, l: 34 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.label || "bar chart" }, el);
    const max = niceMax(Math.max(1, ...data.map((d) => d.value)));
    const ticks = 4;
    for (let i = 0; i <= ticks; i++) {
      const v = (max / ticks) * i, y = m.t + ih - (v / max) * ih;
      svgEl("line", { x1: m.l, x2: W - m.r, y1: y, y2: y, class: "gridline" }, svg);
      const t = svgEl("text", { x: m.l - 6, y: y + 4, "text-anchor": "end", class: "axis" }, svg);
      t.textContent = Number.isInteger(v) ? v : v.toFixed(1);
    }
    const n = data.length || 1;
    const slot = iw / n;
    const gap = Math.min(2, slot * 0.2);
    const bw = Math.max(1, slot - gap);
    data.forEach((d, i) => {
      const x = m.l + i * slot + gap / 2;
      const h = (d.value / max) * ih;
      const y = m.t + ih - h;
      const hit = svgEl("rect", { x: m.l + i * slot, y: m.t, width: slot, height: ih, class: "hit" }, svg);
      if (h > 0) {
        const r = Math.min(4, bw / 2, h);
        // rounded top, square baseline
        svgEl("path", {
          class: "bar" + (d.hl ? " hl" : ""),
          d: `M${x},${y + h}V${y + r}Q${x},${y} ${x + r},${y}H${x + bw - r}Q${x + bw},${y} ${x + bw},${y + r}V${y + h}Z`,
        }, svg);
      }
      bindTip(hit, d.tip || [d.label, String(d.value)]);
      if (d.tick) {
        const t = svgEl("text", { x: x + bw / 2, y: H - 8, "text-anchor": "middle", class: "axis" }, svg);
        t.textContent = d.tick;
      }
    });
  }

  /** Heat grid. rows/cols: label arrays; value(r,c) → number; tipFn(r,c,v) → lines */
  function heat(el, rows, cols, value, tipFn, opts = {}) {
    el.replaceChildren();
    const cell = opts.cell || 22, gap = 0;
    const m = { t: opts.colLabels === false ? 4 : 18, l: opts.rowLabelWidth ?? 34 };
    const W = m.l + cols.length * cell + 4, H = m.t + rows.length * cell + 4;
    const svg = svgEl("svg", { viewBox: `0 0 ${W} ${H}`, role: "img", "aria-label": opts.label || "heatmap" }, el);
    let max = 0;
    rows.forEach((_, r) => cols.forEach((_, c) => { max = Math.max(max, value(r, c)); }));
    const steps = ["--seq-0", "--seq-1", "--seq-2", "--seq-3", "--seq-4", "--seq-5"];
    const colour = (v) => (v <= 0 ? steps[0] : steps[Math.min(5, 1 + Math.floor((v / max) * 4.999))]);
    rows.forEach((rl, r) => {
      if (rl) {
        const t = svgEl("text", { x: m.l - 6, y: m.t + r * cell + cell / 2 + 4, "text-anchor": "end", class: "axis" }, svg);
        t.textContent = rl;
      }
      cols.forEach((cl, c) => {
        const v = value(r, c);
        const rect = svgEl("rect", {
          x: m.l + c * cell + gap, y: m.t + r * cell + gap, width: cell - gap, height: cell - gap, rx: 4,
          class: "cell", style: `fill: var(${colour(v)})`,
        }, svg);
        bindTip(rect, tipFn(r, c, v));
      });
    });
    if (opts.colLabels !== false) cols.forEach((cl, c) => {
      if (!cl) return;
      const t = svgEl("text", { x: m.l + c * cell + cell / 2, y: 12, "text-anchor": "middle", class: "axis" }, svg);
      t.textContent = cl;
    });
    // legend
    const lg = document.createElement("div");
    lg.className = "legend";
    const less = document.createElement("span"); less.textContent = "Less";
    lg.appendChild(less);
    steps.forEach((s) => { const i = document.createElement("i"); i.style.background = `var(${s})`; lg.appendChild(i); });
    const more = document.createElement("span"); more.textContent = "More";
    lg.appendChild(more);
    el.appendChild(lg);
  }

  /** Horizontal bar list. items: [{name, sub?, count, label?}] */
  function barList(el, items) {
    el.replaceChildren();
    const max = Math.max(1, ...items.map((i) => i.count));
    items.forEach((it) => {
      const row = document.createElement("div");
      row.className = "bar-row";
      const name = document.createElement("div");
      name.className = "name";
      const b = document.createElement("b");
      b.textContent = it.name;
      name.appendChild(b);
      if (it.sub) { name.appendChild(document.createTextNode(" " + it.sub)); name.title = it.name + " " + it.sub; }
      const count = document.createElement("div");
      count.className = "count";
      count.textContent = it.label ?? it.count;
      const track = document.createElement("div");
      track.className = "track";
      const fill = document.createElement("div");
      fill.className = "fill";
      fill.style.width = (it.count / max) * 100 + "%";
      track.appendChild(fill);
      row.append(name, count, track);
      el.appendChild(row);
    });
    if (!items.length) { const p = document.createElement("p"); p.className = "muted small"; p.textContent = "No data yet."; el.appendChild(p); }
  }

  window.Charts = { bars, heat, barList, showTip, hideTip };
})();
