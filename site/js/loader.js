/* The bookmarklet that runs on fly.volanta.app.
 *
 * It only ever runs when the visitor clicks it on Volanta's own site, so the
 * requests come from Volanta's own origin, just like the Volanta web app.
 * It reads the pilot's PUBLIC profile and flight list, then hands the result
 * to the portfolio tab that opened it (postMessage, locked to the portfolio's
 * origin). If no portfolio tab is attached, it saves a JSON file instead.
 *
 * Keep the body free of // comments and always use semicolons: some browsers
 * strip newlines from bookmarklet URLs. */
(function () {
  "use strict";

  function vpLoader(ORIGIN) {
    if (location.hostname !== "fly.volanta.app") {
      alert("Open fly.volanta.app first, then click this bookmark there.");
      return;
    }
    if (window.__vpRunning) return;
    window.__vpRunning = true;
    var box = document.createElement("div");
    box.setAttribute("style", "position:fixed;top:16px;right:16px;z-index:2147483647;max-width:340px;background:#1a1a19;color:#f0efec;border:1px solid #3987e5;border-radius:10px;padding:12px 14px;font:14px/1.4 system-ui,sans-serif;box-shadow:0 6px 24px rgba(0,0,0,.4)");
    document.body.appendChild(box);
    var say = function (t) { box.textContent = "✈ Flight Portfolio: " + t; };
    var op = window.opener;
    var ask = function () { return prompt("Your Volanta username:") || ""; };
    var getUser = function () {
      return new Promise(function (res) {
        if (!op) { res(ask()); return; }
        var on = function (e) {
          if (e.origin !== ORIGIN || !e.data || e.data.type !== "vp-user") return;
          clearTimeout(t);
          removeEventListener("message", on);
          res(String(e.data.user || "") || ask());
        };
        var t = setTimeout(function () { removeEventListener("message", on); res(ask()); }, 2500);
        addEventListener("message", on);
        try { op.postMessage({ type: "vp-hello" }, ORIGIN); } catch (err) { clearTimeout(t); res(ask()); }
      });
    };
    var sleep = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    (async function () {
      try {
        say("connecting…");
        var user = String(await getUser()).trim();
        if (!/^[A-Za-z0-9_.\-]{1,64}$/.test(user)) { say("that doesn't look like a Volanta username."); return; }
        var base = "https://api.volanta.app/api/v1/Profiles/" + encodeURIComponent(user);
        var get = async function (path, optional) {
          var r = await fetch(base + path, { headers: { Accept: "application/json" } });
          if (r.ok) return r.json();
          if (optional) return null;
          if (r.status === 404) throw new Error("pilot \"" + user + "\" not found. Is the profile public?");
          throw new Error("Volanta answered HTTP " + r.status + ". Try again in a minute.");
        };
        say("loading " + user + "'s profile…");
        var profile = await get("", false);
        var summary = await get("/Summary", true);
        var routes = await get("/Flights/Routes", true);
        var items = [];
        var page = 1;
        var total = 1;
        do {
          await sleep(400);
          var res = await get("/Flights/Search?Page=" + page + "&PageSize=100", false);
          var got = (res && Array.isArray(res.items)) ? res.items : [];
          items = items.concat(got);
          total = Math.min((res && res.totalPages) || 1, 200);
          say("loading flights… " + items.length + ((res && res.totalEntries) ? " of " + res.totalEntries : ""));
          if (!got.length) break;
          page++;
        } while (page <= total);
        var bundle = { kind: "volanta-raw", v: 1, userName: user, fetchedAt: new Date().toISOString(), profile: profile, summary: summary, routes: routes, items: items };
        if (op && !op.closed) {
          op.postMessage({ type: "vp-data", bundle: bundle }, ORIGIN);
          say("sent " + items.length + " flights to your portfolio. You can close this tab.");
        } else {
          var a = document.createElement("a");
          a.href = URL.createObjectURL(new Blob([JSON.stringify(bundle)], { type: "application/json" }));
          a.download = "volanta-" + user + ".json";
          document.body.appendChild(a);
          a.click();
          a.remove();
          say("saved volanta-" + user + ".json. Drop it onto your portfolio page.");
        }
      } catch (err) {
        say("error: " + (err && err.message ? err.message : err));
      } finally {
        window.__vpRunning = false;
        setTimeout(function () { box.remove(); }, 20000);
      }
    })();
  }

  window.VolantaLoader = {
    bookmarkletHref: function (origin) {
      return "javascript:" + encodeURIComponent("(" + vpLoader.toString() + ")(" + JSON.stringify(origin) + ");void 0");
    },
    run: vpLoader,
  };
})();
