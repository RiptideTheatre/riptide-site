// Sonder in the browser: choose who you are and who guides you, download the walk,
// then each numbered scene plays when you reach its place (or when you tap "I'm here").
// Location is used on this phone only and never sent anywhere.
(function () {
  "use strict";
  var STORE = "sonder-walk-v1";
  var CACHE = "sonder-media-v1";
  var $ = function (id) { return document.getElementById(id); };
  var player = $("player");
  var walk = null, state = load(), watchId = null, here = null, wakeLock = null, heading = null;
  var objectUrl = null, playing = -1, maps = {}, photoShown = {}, trail = [], follow = true;
  var DEMO = /[?&]demo=1/.test(location.search);

  /* ---------- state ---------- */
  function load() {
    try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; }
  }
  function save() {
    try { localStorage.setItem(STORE, JSON.stringify(state)); } catch (e) {}
  }

  /* ---------- screens ---------- */
  function show(name) {
    [].forEach.call(document.querySelectorAll("[data-screen]"), function (s) { s.hidden = s.getAttribute("data-screen") !== name; });
    state.screen = name; save();
    document.body.classList.toggle("is-walking", name === "walk");
    window.scrollTo(0, 0);
    if (name === "who") renderChoices("who");
    if (name === "narrator") renderChoices("narrator");
    if (name === "download") prepDownload();
    if (name === "start") prepStart();
    if (name === "walk") { renderWalk(); setTimeout(function () { makeMap("walkMap"); if (maps.walkMap) maps.walkMap.map.resize(); }, 30); }
    var labels = { who: "1 / 2", narrator: "2 / 2" };
    $("barStep").textContent = labels[name] || "";
  }
  [].forEach.call(document.querySelectorAll("[data-go]"), function (b) {
    b.addEventListener("click", function () { show(b.getAttribute("data-go")); });
  });

  /* ---------- choices ---------- */
  function renderChoices(kind) {
    var cfg = walk[kind], list = $(kind === "who" ? "whoList" : "narList"), next = $(kind === "who" ? "whoNext" : "narNext");
    $(kind === "who" ? "whoQ" : "narQ").textContent = cfg.question;
    list.innerHTML = "";
    cfg.options.forEach(function (o) {
      var b = document.createElement("button");
      b.type = "button"; b.className = "sw__choice"; b.setAttribute("role", "radio");
      b.setAttribute("aria-checked", state[kind] === o.id ? "true" : "false");
      b.innerHTML = "<strong></strong><span></span>";
      b.querySelector("strong").textContent = o.label;
      b.querySelector("span").textContent = o.line || "";
      b.addEventListener("click", function () {
        state[kind] = o.id; save();
        [].forEach.call(list.children, function (c) { c.setAttribute("aria-checked", c === b ? "true" : "false"); });
        next.disabled = false;
      });
      list.appendChild(b);
    });
    next.disabled = !state[kind];
  }

  /* ---------- audio & photos for the chosen version ---------- */
  function audioFor(scene) {
    var a = scene.audio || {};
    if (typeof a === "string") return a;
    return a[state.who + "+" + state.narrator] || a[state.who] || a[state.narrator] || a["default"] || null;
  }
  function filesNeeded() {
    var out = [];
    walk.scenes.forEach(function (s) {
      var a = audioFor(s); if (a) out.push(a);
      (s.photos || []).forEach(function (p) { out.push(p.src); });
    });
    return out;
  }
  function variant() { return state.who + "+" + state.narrator; }

  function prepDownload() {
    var done = state.downloaded === variant();
    $("dlBar").style.width = done ? "100%" : "0%";
    $("dlStatus").textContent = done ? "Downloaded. You're ready." : "Download the sound and pictures for your choices.";
    $("dlBtn").textContent = done ? "Next" : "Download";
    $("dlSkip").hidden = done;
  }
  $("dlBtn").addEventListener("click", function () {
    if (state.downloaded === variant()) { show("start"); return; }
    if (!("caches" in window)) { show("start"); return; }
    var files = filesNeeded(), n = 0, btn = $("dlBtn");
    btn.disabled = true; $("dlStatus").textContent = "Downloading…";
    caches.open(CACHE).then(function (cache) {
      return files.reduce(function (p, url) {
        return p.then(function () {
          return cache.match(url).then(function (hit) {
            if (hit) return;
            return fetch(url, { credentials: "same-origin" }).then(function (res) {
              if (!res.ok) throw new Error(res.status);
              return cache.put(url, res);
            });
          }).then(function () {
            n++; $("dlBar").style.width = Math.round((n / files.length) * 100) + "%";
            $("dlStatus").textContent = "Downloading… " + n + " of " + files.length;
          });
        });
      }, Promise.resolve());
    }).then(function () {
      state.downloaded = variant(); save();
      btn.disabled = false; prepDownload();
    }).catch(function () {
      btn.disabled = false;
      $("dlStatus").textContent = "That didn't finish. Check you're on wi-fi and try again, or skip and stream as you go.";
    });
  });

  function sourceFor(url) {
    if (!("caches" in window)) return Promise.resolve(url);
    return caches.open(CACHE).then(function (c) { return c.match(url); }).then(function (hit) {
      if (!hit) return url;
      return hit.blob().then(function (b) {
        if (/\.(m4a|mp3|aac)$/.test(url)) {
          if (objectUrl) URL.revokeObjectURL(objectUrl);
          objectUrl = URL.createObjectURL(b);
          return objectUrl;
        }
        return URL.createObjectURL(b);
      });
    }).catch(function () { return url; });
  }

  /* ---------- location ---------- */
  function metres(a, b) {
    var R = 6371000, r = Math.PI / 180;
    var dLat = (b.lat - a.lat) * r, dLng = (b.lng - a.lng) * r;
    var x = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 2 * R * Math.asin(Math.sqrt(x));
  }
  function bearing(a, b) {
    var r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
    var x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
    return (Math.atan2(y, x) / r + 360) % 360;
  }
  function direction(a, b) {
    return ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(bearing(a, b) / 45) % 8];
  }
  function hasPoint(p) { return p && typeof p.lat === "number" && typeof p.lng === "number"; }
  function distLabel(d) { return d < 1000 ? Math.round(d / 5) * 5 + " m" : (d / 1000).toFixed(1) + " km"; }
  function distText(target) {
    if (!hasPoint(target)) return "Tap I'm here when you arrive";
    if (!here) return "Finding you…";
    var d = metres(here, target);
    if (d < 15) return "You're here";
    return distLabel(d) + " " + direction(here, target);
  }
  // sample route: pretend you're on the route, a little short of the next place, wherever you really are
  function demoHere() {
    var i = playing >= 0 ? playing : state.next, s = walk.scenes[i], prev = anchorBefore(i) || s;
    if (!hasPoint(s)) return;
    var f = playing >= 0 ? 1 : 0.55;
    here = { lat: prev.lat + (s.lat - prev.lat) * f, lng: prev.lng + (s.lng - prev.lng) * f, acc: 5 };
    trail.push([here.lng, here.lat]);
    onMove();
  }
  function watch() {
    if (DEMO) { watchId = 1; setTimeout(demoHere, 50); return; }
    if (watchId !== null || !navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition(function (p) {
      here = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
      if (p.coords.heading != null && !isNaN(p.coords.heading) && p.coords.speed > 0.6) heading = p.coords.heading;
      var last = trail[trail.length - 1];
      if (!last || metres({ lng: last[0], lat: last[1] }, here) > 6) trail.push([here.lng, here.lat]);
      onMove();
    }, function (err) {
      var msg = err.code === 1 ? "Location is off. Turn it on for this site in your settings, or tap I'm here at each place." : "Can't find you right now. Tap I'm here at each place.";
      [$("startDist"), $("nextDist")].forEach(function (el) { el.textContent = msg; });
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
  }
  // the phone's compass, so the arrow can point the way you should walk
  function compass() {
    function on(e) {
      var h = e.webkitCompassHeading != null ? e.webkitCompassHeading : (e.absolute && e.alpha != null ? 360 - e.alpha : null);
      if (h != null) { heading = h; pointArrow(); placeMe(); }
    }
    try {
      if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === "function") {
        DeviceOrientationEvent.requestPermission().then(function (r) { if (r === "granted") window.addEventListener("deviceorientation", on); }).catch(function () {});
      } else if (window.DeviceOrientationEvent) {
        window.addEventListener("deviceorientationabsolute", on); window.addEventListener("deviceorientation", on);
      }
    } catch (e) {}
  }
  function onMove() {
    if (state.screen === "start") $("startDist").textContent = distText(walk.start);
    if (state.screen === "walk") {
      var s = walk.scenes[state.next];
      if (playing < 0 && s) {
        $("nextDist").textContent = distText(s);
        pointArrow();
        var r = (s.radius || walk.radius || 25) + Math.min(here.acc || 0, 30);
        if (state.started && hasPoint(s) && nearest(s) <= r) arrive(state.next);
      }
      drawLive();
    }
    if (window.maplibregl) placeMe();
  }
  function pointArrow() {
    var s = walk && walk.scenes[state.next], a = $("wkArrow");
    if (!a) return;
    if (!here || !hasPoint(s)) { a.classList.add("is-unknown"); a.firstChild.style.transform = ""; return; }
    a.classList.remove("is-unknown");
    var deg = bearing(here, s) - (heading || 0);
    a.firstChild.style.transform = "rotate(" + deg.toFixed(0) + "deg)";
  }
  function keepAwake() {
    if (!("wakeLock" in navigator)) return;
    navigator.wakeLock.request("screen").then(function (l) { wakeLock = l; l.addEventListener("release", function () { wakeLock = null; }); }).catch(function () {});
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && state.started && !wakeLock) keepAwake();
  });

  /* ---------- maps ---------- */
  // Leeds at night, drawn from OpenStreetMap vector tiles (OpenFreeMap): every street as a fine line,
  // the big roads a little brighter, the river picked out, and the odd window lit.
  var INK = "#0a1416";
  var MAP_STYLE = {
    version: 8,
    glyphs: "https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf",
    sources: { osm: { type: "vector", url: "https://tiles.openfreemap.org/planet" } },
    layers: [
      { id: "bg", type: "background", paint: { "background-color": INK } },
      { id: "buildings", type: "fill", source: "osm", "source-layer": "building", minzoom: 15,
        paint: { "fill-color": ["case", ["==", ["%", ["to-number", ["id"], 0], 13], 0], "#3a3320", "#0f1d20"], "fill-opacity": ["interpolate", ["linear"], ["zoom"], 15, 0, 16, 0.9] } },
      { id: "water", type: "fill", source: "osm", "source-layer": "water", paint: { "fill-color": "#103a3e" } },
      { id: "water-edge", type: "line", source: "osm", "source-layer": "water", paint: { "line-color": "#2f7d77", "line-width": 1.2, "line-blur": 0.5 } },
      { id: "waterway", type: "line", source: "osm", "source-layer": "waterway", paint: { "line-color": "#2f7d77", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 1, 17, 4] } },
      { id: "paths", type: "line", source: "osm", "source-layer": "transportation", minzoom: 15, filter: ["in", ["get", "class"], ["literal", ["path", "service", "track"]]],
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#24393b", "line-width": ["interpolate", ["linear"], ["zoom"], 15, 0.4, 18, 1.6] } },
      { id: "minor", type: "line", source: "osm", "source-layer": "transportation", filter: ["in", ["get", "class"], ["literal", ["minor", "pedestrian"]]],
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#34504f", "line-width": ["interpolate", ["linear"], ["zoom"], 13, 0.5, 18, 4] } },
      { id: "major", type: "line", source: "osm", "source-layer": "transportation", filter: ["in", ["get", "class"], ["literal", ["motorway", "trunk", "primary", "secondary", "tertiary"]]],
        layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#4d6b67", "line-width": ["interpolate", ["linear"], ["zoom"], 12, 0.8, 18, 8] } },
      { id: "rail", type: "line", source: "osm", "source-layer": "transportation", filter: ["==", ["get", "class"], "rail"], minzoom: 14,
        paint: { "line-color": "#28403f", "line-width": 1, "line-dasharray": [3, 3] } },
      { id: "road-names", type: "symbol", source: "osm", "source-layer": "transportation_name", minzoom: 15.5,
        layout: { "symbol-placement": "line", "text-field": ["get", "name"], "text-font": ["Noto Sans Regular"], "text-size": 11, "text-letter-spacing": 0.04 },
        paint: { "text-color": "#7f9895", "text-halo-color": INK, "text-halo-width": 1.5 } },
      { id: "river-name", type: "symbol", source: "osm", "source-layer": "waterway", filter: ["has", "name"], minzoom: 13,
        layout: { "symbol-placement": "line", "text-field": ["get", "name"], "text-font": ["Noto Sans Italic"], "text-size": 13, "text-letter-spacing": 0.14 },
        paint: { "text-color": "#6fc4b8", "text-halo-color": INK, "text-halo-width": 1.5 } }
    ]
  };

  function el(cls, html) { var d = document.createElement("div"); d.className = cls; d.innerHTML = html; return d; }
  function geo(coords) { return { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: coords } }; }
  // where the previous scene left you: its end point if it's walked while listening, else its pin
  function anchorBefore(i) {
    for (var k = i - 1; k >= 0; k--) { var p = walk.scenes[k]; if (hasPoint(p)) return hasPoint(p.end) ? p.end : p; }
    return hasPoint(walk.start) ? walk.start : null;
  }
  // the line into a scene (from where the last one ended, along any set path) and, for scenes
  // walked while listening, on to where it ends
  function sceneCoords(i) {
    var s = walk.scenes[i];
    if (!hasPoint(s)) return null;
    var a = anchorBefore(i), out = [];
    if (a && (a.lat !== s.lat || a.lng !== s.lng)) out.push([a.lng, a.lat]);
    (s.path || []).forEach(function (q) { out.push(q); });
    out.push([s.lng, s.lat]);
    if (hasPoint(s.end)) out.push([s.end.lng, s.end.lat]);
    return out.length > 1 ? out : null;
  }
  // a scene can be triggered at its pin or at a "ghost" point on another way there
  function nearest(s) {
    var best = metres(here, s);
    (s.ghosts || []).forEach(function (g) { best = Math.min(best, metres(here, g)); });
    return best;
  }

  function makeMap(id) {
    if (!window.maplibregl) { if (id === "walkMap") $("walkNoMap").hidden = false; return; }
    var box = $(id), scenes = walk.scenes.filter(hasPoint);
    var all = scenes.map(function (s) { return [s.lng, s.lat]; }).concat(hasPoint(walk.start) ? [[walk.start.lng, walk.start.lat]] : []);
    if (!all.length) { if (id === "walkMap") $("walkNoMap").hidden = false; else box.hidden = true; return; }
    if (maps[id]) { refreshPins(); return; }
    var isWalk = id === "walkMap";
    var centre = all.length > 1 ? all[0] : [all[0][0], all[0][1] - 0.0011];
    var map = new maplibregl.Map({ container: box, style: MAP_STYLE, center: centre, zoom: all.length > 1 ? 16 : 15, attributionControl: false, pitchWithRotate: false, dragRotate: false, touchPitch: false });
    map.addControl(new maplibregl.AttributionControl({ compact: true }), isWalk ? "top-left" : "bottom-right");
    if (isWalk) map.touchZoomRotate.disableRotation();
    var m = { map: map, pins: [] };
    maps[id] = m;
    map.on("load", function () {
      map.addSource("done", { type: "geojson", data: geo([]) });
      map.addSource("todo", { type: "geojson", data: geo([]) });
      map.addSource("trail", { type: "geojson", data: geo([]) });
      map.addSource("toNext", { type: "geojson", data: geo([]) });
      map.addLayer({ id: "todo", type: "line", source: "todo", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#6fc4b8", "line-width": 2, "line-opacity": 0.55, "line-dasharray": [1.5, 2] } });
      map.addLayer({ id: "done", type: "line", source: "done", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#6e8482", "line-width": 2, "line-opacity": 0.7 } });
      map.addLayer({ id: "trail", type: "line", source: "trail", layout: { "line-cap": "round", "line-join": "round" }, paint: { "line-color": "#f4f1e9", "line-width": 2.5, "line-opacity": 0.35, "line-blur": 1 } });
      map.addLayer({ id: "toNext-glow", type: "line", source: "toNext", layout: { "line-cap": "round" }, paint: { "line-color": "#6fc4b8", "line-width": 10, "line-opacity": 0.16, "line-blur": 4 } });
      map.addLayer({ id: "toNext", type: "line", source: "toNext", layout: { "line-cap": "round" }, paint: { "line-color": "#6fc4b8", "line-width": 3 } });
      m.ready = true;
      drawRoute(); drawLive();
    });
    walk.scenes.forEach(function (s, i) {
      if (!hasPoint(s)) return;
      var node = el("wk-pin", "<span>" + s.n + "</span><em></em>");
      node.querySelector("em").textContent = s.title;
      (s.ghosts || []).forEach(function (g) { new maplibregl.Marker({ element: el("wk-ghost", "") }).setLngLat([g.lng, g.lat]).addTo(map); });
      m.pins[i] = { node: node, marker: new maplibregl.Marker({ element: node, anchor: "top", offset: [0, -12] }).setLngLat([s.lng, s.lat]).addTo(map) };
    });
    if (!scenes.length) new maplibregl.Marker({ element: el("sw__pin", "<span>1</span>") }).setLngLat([walk.start.lng, walk.start.lat]).addTo(map);
    if (isWalk) {
      map.on("dragstart", function () { follow = false; $("meBtn").setAttribute("aria-pressed", "false"); });
      frameWalk(0);
    } else if (all.length > 1) {
      var b = all.reduce(function (bb, p) { return bb.extend(p); }, new maplibregl.LngLatBounds(all[0], all[0]));
      map.fitBounds(b, { padding: 36, duration: 0 });
    }
    refreshPins();
    if (here) onMove();
  }

  // the parts of the route already walked, and the parts still to come
  function drawRoute() {
    Object.keys(maps).forEach(function (k) {
      var m = maps[k]; if (!m.ready) return;
      var done = [], todo = [], reached = playing >= 0 ? playing : state.next - 1;
      walk.scenes.forEach(function (s, i) {
        var c = sceneCoords(i); if (!c) return;
        (i <= reached ? done : todo).push(c);
      });
      var multi = function (list) { return { type: "Feature", properties: {}, geometry: { type: "MultiLineString", coordinates: list } }; };
      m.map.getSource("done").setData(multi(done));
      m.map.getSource("todo").setData(multi(todo));
    });
  }
  // your own trail, and a line from you to the next place while you're on your way
  function drawLive() {
    var m = maps.walkMap; if (!m || !m.ready) return;
    m.map.getSource("trail").setData(geo(trail.length > 1 ? trail : []));
    var s = walk.scenes[state.next];
    m.map.getSource("toNext").setData(geo(here && playing < 0 && hasPoint(s) ? [[here.lng, here.lat], [s.lng, s.lat]] : []));
    if (follow && here) frameWalk(600);
  }
  // keep you and the next place in view, above the sheet
  function frameWalk(duration) {
    var m = maps.walkMap; if (!m) return;
    var s = walk.scenes[playing >= 0 ? playing : state.next];
    var pts = [];
    if (here) pts.push([here.lng, here.lat]);
    if (hasPoint(s)) pts.push([s.lng, s.lat]);
    if (!pts.length && hasPoint(walk.start)) pts.push([walk.start.lng, walk.start.lat]);
    if (!pts.length) return;
    var top = ($("wkCard").offsetHeight || 110) + 40, bottom = ($("wkSheet").offsetHeight || 240) + 30;
    if (pts.length === 1 || playing >= 0) {
      m.map.easeTo({ center: pts[0], zoom: 16.6, padding: { top: top, bottom: bottom, left: 30, right: 30 }, duration: duration });
    } else {
      var b = new maplibregl.LngLatBounds(pts[0], pts[0]).extend(pts[1]);
      m.map.fitBounds(b, { padding: { top: top, bottom: bottom, left: 50, right: 50 }, maxZoom: 17.2, duration: duration });
    }
  }
  function refreshPins() {
    Object.keys(maps).forEach(function (k) {
      (maps[k].pins || []).forEach(function (p, i) {
        if (!p) return;
        var now = playing >= 0 ? playing : state.next;
        p.node.className = "wk-pin" + (i < now ? " is-done" : "") + (i === now ? " is-next" : "");
        p.node.style.zIndex = i === now ? 3 : 1;
      });
    });
    drawRoute();
  }

  // you: an ivory dot with rings rippling out from it, like the listening circle
  function placeMe() {
    if (!here) return;
    Object.keys(maps).forEach(function (k) {
      var m = maps[k];
      if (!m.me) m.me = new maplibregl.Marker({ element: el("sw__me", "<i></i><i></i><i></i><b></b>") }).setLngLat([here.lng, here.lat]).addTo(m.map);
      else m.me.setLngLat([here.lng, here.lat]);
      var node = m.me.getElement();
      node.classList.toggle("has-heading", heading != null);
      if (heading != null) node.style.setProperty("--hd", heading.toFixed(0) + "deg");
    });
  }
  $("meBtn").addEventListener("click", function () {
    follow = true; this.setAttribute("aria-pressed", "true");
    if (!here) { watch(); toast("Finding you…"); }
    frameWalk(700);
  });

  /* ---------- start ---------- */
  function prepStart() {
    $("startName").textContent = walk.start.name;
    $("startWhere").textContent = walk.start.where || "";
    setTimeout(function () { makeMap("startMap"); }, 30);
    watch();
  }
  $("startBtn").addEventListener("click", function () {
    // a tap unlocks sound on phones that only play audio after a touch
    player.src = "/assets/audio/silence.m4a";
    var p = player.play(); if (p && p.catch) p.catch(function () {});
    keepAwake(); watch(); compass();
    state.started = true; if (state.next == null) state.next = 0; save();
    show("walk");
    var first = walk.scenes[state.next];
    if (!here || !hasPoint(first) || metres(here, first) <= ((first.radius || walk.radius || 25) + 30)) playScene(state.next);
  });

  /* ---------- the walk ---------- */
  var lastCard = "";
  function setCard(eyebrow, title, cue) {
    var key = eyebrow + "|" + title + "|" + cue, card = $("wkCard");
    if (key === lastCard) return;
    var first = !lastCard; lastCard = key;
    var fill = function () { $("sceneNum").textContent = eyebrow; $("sceneTitle").textContent = title; $("sceneMode").textContent = cue; card.classList.remove("is-changing"); };
    if (first || window.matchMedia("(prefers-reduced-motion: reduce)").matches) { fill(); return; }
    card.classList.add("is-changing"); setTimeout(fill, 280);
  }
  function sheetHeight() {
    var h = $("wkSheet").offsetHeight;
    document.querySelector(".wk").style.setProperty("--sheet-h", h + "px");
  }
  function renderWalk() {
    var i = playing >= 0 ? playing : state.next, s = walk.scenes[i];
    if (DEMO && watchId !== null && renderWalk.at !== i + "/" + playing) { renderWalk.at = i + "/" + playing; setTimeout(demoHere, 400); }
    if (!s) { show("end"); return; }
    var of = " of " + walk.scenes.length;
    if (playing >= 0) {
      setCard("Scene " + s.n + of, s.title, s.cue || (s.kind === "walk" ? "Walk with the voice." : "Stay where you are and listen."));
    } else {
      setCard(i === 0 && !state.started ? "Scene 1" + of : "Next · scene " + s.n + of, s.title, hasPoint(s) ? "Follow the line to pin " + s.n + "." : "Head to the next place.");
      $("nextPlace").textContent = s.ghosts ? "If the riverside gate is closed, go down Sovereign Street" : (s.place || "");
      $("nextDist").textContent = distText(s);
      pointArrow();
    }
    $("headingBox").hidden = playing >= 0;
    $("playingBox").hidden = playing < 0;
    $("prevBtn").disabled = $("prevBtn2").disabled = i === 0;
    // the thumbnail: the photo just shown in this scene, or a first look at the next place
    var ph = playing >= 0 ? lastPhoto : (s.photos || [])[0];
    if (ph) { sourceFor(ph.src).then(function (src) { $("thumbImg").src = src; $("thumbBtn").hidden = false; thumbPhoto = ph; }); }
    else $("thumbBtn").hidden = true;
    var list = $("sceneList"); list.innerHTML = "";
    walk.scenes.forEach(function (sc, k) {
      var li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.innerHTML = "<b></b><span></span>";
      b.querySelector("b").textContent = sc.n; b.querySelector("span").textContent = sc.title;
      if (k < state.next && k !== i) li.className = "is-done";
      if (k === i) li.className = "is-now";
      b.addEventListener("click", function () { stop(); state.next = k; save(); closeList(); playScene(k); });
      li.appendChild(b); list.appendChild(li);
    });
    refreshPins();
    requestAnimationFrame(sheetHeight);
  }
  function fmt(t) { t = Math.max(0, Math.round(t || 0)); return Math.floor(t / 60) + ":" + ("0" + (t % 60)).slice(-2); }
  function playScene(i) {
    var s = walk.scenes[i], url = s && audioFor(s);
    if (!s) return;
    playing = i; state.next = i; save(); photoShown = {}; lastPhoto = null; renderWalk();
    setPlayIcon(false);
    if (!url) { $("sceneMode").textContent = "This scene's sound isn't loaded yet."; return; }
    sourceFor(url).then(function (src) {
      player.src = src;
      var p = player.play();
      if (p && p.catch) p.catch(function () { setPlayIcon(true); });
    });
    if (follow) frameWalk(800);
  }
  function arrive(i) {
    if (navigator.vibrate) navigator.vibrate([80, 60, 80]);
    toast("You've arrived");
    playScene(i);
  }
  function toast(t) { var el = $("wkToast"); el.hidden = true; void el.offsetWidth; el.textContent = t; el.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(function () { el.hidden = true; }, 2700); }
  function stop() { player.pause(); playing = -1; hidePhoto(false); }
  function finishScene() {
    var i = playing; stop();
    state.next = i + 1; save();
    if (state.next >= walk.scenes.length) { state.started = false; state.next = 0; save(); show("end"); return; }
    renderWalk();
    if (here) onMove();
    if (follow) frameWalk(900);
  }
  function setPlayIcon(paused) {
    var b = $("playBtn"); b.classList.toggle("is-paused", paused);
    b.setAttribute("aria-label", paused ? "Play" : "Pause");
  }
  player.addEventListener("ended", function () { if (playing >= 0) finishScene(); });
  player.addEventListener("play", function () { setPlayIcon(false); });
  player.addEventListener("pause", function () { setPlayIcon(true); });
  var scrubbing = false;
  player.addEventListener("timeupdate", function () {
    if (playing < 0 || !player.duration) return;
    var f = player.currentTime / player.duration;
    if (!scrubbing) { $("scrub").value = Math.round(f * 1000); $("scrub").style.setProperty("--p", (f * 100).toFixed(2) + "%"); }
    $("tNow").textContent = fmt(player.currentTime);
    $("tLeft").textContent = "-" + fmt(player.duration - player.currentTime);
    (walk.scenes[playing].photos || []).forEach(function (ph, k) {
      var at = typeof ph.at === "object" ? (ph.at[state.narrator] != null ? ph.at[state.narrator] : ph.at[Object.keys(ph.at)[0]]) : ph.at;
      var t = player.currentTime, on = t >= at && t < at + (ph.for || 10);
      if (on && !photoShown[k]) { photoShown[k] = true; showPhoto(ph); }
      if (!on && photoShown[k] === true && t >= at + (ph.for || 10)) { photoShown[k] = "done"; hidePhoto(true); }
    });
  });
  $("scrub").addEventListener("input", function () {
    scrubbing = true; this.style.setProperty("--p", (this.value / 10) + "%");
    if (player.duration) $("tNow").textContent = fmt(player.duration * this.value / 1000);
  });
  $("scrub").addEventListener("change", function () {
    scrubbing = false;
    if (player.duration) player.currentTime = player.duration * this.value / 1000;
  });
  $("playBtn").addEventListener("click", function () { if (player.paused) player.play(); else player.pause(); });
  $("backBtn").addEventListener("click", function () { player.currentTime = Math.max(0, player.currentTime - 10); });
  $("fwdBtn").addEventListener("click", function () { if (player.duration) player.currentTime = Math.min(player.duration - 0.5, player.currentTime + 10); });
  $("skipBtn").addEventListener("click", function () { if (playing >= 0) finishScene(); });
  function previous() {
    if (playing >= 0 && player.currentTime > 5) { player.currentTime = 0; return; }
    var i = (playing >= 0 ? playing : state.next) - 1;
    if (i < 0) return;
    stop(); playScene(i);
  }
  $("prevBtn").addEventListener("click", previous);
  $("prevBtn2").addEventListener("click", previous);
  $("hereBtn").addEventListener("click", function () { playScene(state.next); });
  $("againBtn").addEventListener("click", function () { state.next = 0; state.started = false; state.lastPhoto = null; lastPhoto = null; trail = []; save(); show("who"); });

  function closeList() { $("sceneList").hidden = true; $("listBtn").setAttribute("aria-expanded", "false"); requestAnimationFrame(sheetHeight); }
  $("listBtn").addEventListener("click", function () {
    var open = $("sceneList").hidden;
    $("sceneList").hidden = !open; this.setAttribute("aria-expanded", String(open));
    if (open) { var now = $("sceneList").querySelector(".is-now"); if (now) now.scrollIntoView({ block: "center" }); }
    requestAnimationFrame(sheetHeight);
  });
  window.addEventListener("resize", function () { if (state.screen === "walk") sheetHeight(); });

  /* ---------- photos ---------- */
  var lastPhoto = null, thumbPhoto = null, photoManual = false;
  function openPhoto(ph, manual) {
    if (!ph) return;
    photoManual = !!manual;
    sourceFor(ph.src).then(function (src) {
      $("photoImg").src = src; $("photoImg").alt = ph.alt || "";
      $("photoCap").textContent = ph.caption || "";
      $("photo").hidden = false;
      if (!manual && navigator.vibrate) navigator.vibrate(60);
    });
  }
  function showPhoto(ph) {
    lastPhoto = ph; thumbPhoto = ph; state.lastPhoto = ph; save();
    sourceFor(ph.src).then(function (src) { $("thumbImg").src = src; $("thumbBtn").hidden = false; });
    openPhoto(ph, false);
  }
  function hidePhoto(auto) { if (auto && photoManual) return; $("photo").hidden = true; photoManual = false; }
  $("photoClose").addEventListener("click", function () { hidePhoto(false); });
  $("photo").addEventListener("click", function (e) { if (e.target === $("photo")) hidePhoto(false); });
  $("thumbBtn").addEventListener("click", function () { openPhoto(thumbPhoto || lastPhoto, true); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && !$("photo").hidden) hidePhoto(false); });

  /* ---------- a sample route, for reviewing the map before the real GPS points are in ---------- */
  var SAMPLE = [[53.79496, -1.54738], [53.79622, -1.54621], [53.79617, -1.54325], [53.79620, -1.53980], [53.79468, -1.53790], [53.79305, -1.53725],
    [53.79230, -1.53560], [53.79055, -1.53210], [53.79110, -1.53400], [53.79180, -1.53620], [53.79262, -1.53900], [53.79075, -1.53290],
    [53.79340, -1.54050], [53.79390, -1.54260], [53.79470, -1.53860], [53.79430, -1.54130], [53.79395, -1.54420], [53.79440, -1.54600], [53.79500, -1.54730]];
  function applySample() {
    walk.scenes.forEach(function (s, i) { if (!hasPoint(s) && SAMPLE[i]) { s.lat = SAMPLE[i][0]; s.lng = SAMPLE[i][1]; s.sample = true; } });
    $("draftNote").textContent = "Sample route: the pins are in rough places so you can see how the map works. The real GPS points are still to come.";
  }

  /* ---------- boot ---------- */
  fetch("/sonder/media/walk.json", { credentials: "same-origin", cache: "no-cache" })
    .then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); })
    .catch(function () {
      // offline: use the copy saved with the download
      return caches.open(CACHE).then(function (c) { return c.match("/sonder/media/walk.json"); }).then(function (r) { if (!r) throw new Error("offline"); return r.json(); });
    })
    .then(function (data) {
      walk = data;
      if (walk.draft) $("draftNote").hidden = false;
      if ("caches" in window) caches.open(CACHE).then(function (c) { c.put("/sonder/media/walk.json", new Response(JSON.stringify(walk), { headers: { "Content-Type": "application/json" } })); });
      if (DEMO) applySample();
      if (state.lastPhoto) lastPhoto = state.lastPhoto;
      if (location.search.indexOf("welcome=1") > -1) { $("welcomeEyebrow").textContent = "Thank you. Your ticket is ready"; history.replaceState(null, "", location.pathname + (DEMO ? "?demo=1" : "")); }
      fetch("/api/sonder/me", { credentials: "same-origin" }).then(function (r) { return r.ok ? r.json() : null; }).then(function (me) {
        if (me && me.untilLabel) $("untilNote").textContent = "Your ticket lets you walk Sonder as often as you like until " + me.untilLabel + ".";
      }).catch(function () {});
      var resume = state.started ? "walk" : (state.screen && state.screen !== "walk" && state.screen !== "end" ? state.screen : "welcome");
      if (resume === "walk") { show("start"); $("startBtn").textContent = "Carry on from scene " + walk.scenes[state.next || 0].n; }
      else show(resume);
    })
    .catch(function () {
      document.querySelector("[data-screen=welcome]").innerHTML = '<h1 class="sw__h">We couldn\'t load the walk</h1><p class="sw__p">Check your connection and open your link again. If it keeps happening, email info@theriptide.co.uk.</p>';
    });

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sonder/walk/sw.js", { scope: "/sonder/walk/" }).catch(function () {});
})();
