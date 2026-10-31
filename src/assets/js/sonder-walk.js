// Sonder in the browser: choose who you are and who guides you, download the walk,
// then each numbered scene plays when you reach its place (or when you tap "I'm here").
// Location is used on this phone only and never sent anywhere.
(function () {
  "use strict";
  var STORE = "sonder-walk-v1";
  var CACHE = "sonder-media-v1";
  var $ = function (id) { return document.getElementById(id); };
  var player = $("player");
  var walk = null, state = load(), watchId = null, here = null, wakeLock = null;
  var objectUrl = null, playing = -1, maps = {}, photoShown = {};

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
    window.scrollTo(0, 0);
    if (name === "who") renderChoices("who");
    if (name === "narrator") renderChoices("narrator");
    if (name === "download") prepDownload();
    if (name === "start") prepStart();
    if (name === "walk") renderWalk();
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
        if (objectUrl) URL.revokeObjectURL(objectUrl);
        objectUrl = URL.createObjectURL(b);
        return objectUrl;
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
  function direction(a, b) {
    var r = Math.PI / 180, y = Math.sin((b.lng - a.lng) * r) * Math.cos(b.lat * r);
    var x = Math.cos(a.lat * r) * Math.sin(b.lat * r) - Math.sin(a.lat * r) * Math.cos(b.lat * r) * Math.cos((b.lng - a.lng) * r);
    var deg = (Math.atan2(y, x) / r + 360) % 360;
    return ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"][Math.round(deg / 45) % 8];
  }
  function hasPoint(p) { return p && typeof p.lat === "number" && typeof p.lng === "number"; }
  function distText(target) {
    if (!hasPoint(target)) return "Tap I'm here when you arrive";
    if (!here) return "Finding you…";
    var d = metres(here, target);
    if (d < 15) return "You're here";
    return (d < 1000 ? Math.round(d / 5) * 5 + " m " : (d / 1000).toFixed(1) + " km ") + direction(here, target);
  }
  function watch() {
    if (watchId !== null || !navigator.geolocation) return;
    watchId = navigator.geolocation.watchPosition(function (p) {
      here = { lat: p.coords.latitude, lng: p.coords.longitude, acc: p.coords.accuracy };
      onMove();
    }, function (err) {
      var msg = err.code === 1 ? "Location is off. Turn it on for this site in your settings, or use the I'm here button at each place." : "Can't find you right now. Use the I'm here button at each place.";
      [$("startDist"), $("nextDist")].forEach(function (el) { el.textContent = msg; });
    }, { enableHighAccuracy: true, maximumAge: 2000, timeout: 20000 });
  }
  function onMove() {
    if (state.screen === "start") $("startDist").textContent = distText(walk.start);
    if (state.screen === "walk") {
      var s = walk.scenes[state.next];
      if (playing < 0 && s) {
        $("nextDist").textContent = distText(s);
        var r = (s.radius || walk.radius || 25) + Math.min(here.acc || 0, 30);
        if (state.started && hasPoint(s) && metres(here, s) <= r) playScene(state.next);
      }
    }
    Object.keys(maps).forEach(function (k) { if (maps[k].me) maps[k].me.setLatLng([here.lat, here.lng]); else if (window.L) maps[k].me = L.circleMarker([here.lat, here.lng], { radius: 7, color: "#f4f1e9", weight: 2, fillColor: "#6fc4b8", fillOpacity: 1 }).addTo(maps[k].map); });
  }
  function keepAwake() {
    if (!("wakeLock" in navigator)) return;
    navigator.wakeLock.request("screen").then(function (l) { wakeLock = l; }).catch(function () {});
  }
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "visible" && state.started && !wakeLock) keepAwake();
  });

  /* ---------- maps ---------- */
  function makeMap(id) {
    if (maps[id] || !window.L) return;
    var el = $(id), pts = walk.scenes.filter(hasPoint).map(function (s) { return [s.lat, s.lng]; });
    var all = pts.concat(hasPoint(walk.start) ? [[walk.start.lat, walk.start.lng]] : []);
    if (!all.length) { el.hidden = true; return; }
    var map = L.map(el, { zoomControl: false, attributionControl: true });
    L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19, attribution: "© OpenStreetMap" }).addTo(map);
    if (pts.length > 1) L.polyline(pts, { color: "#6fc4b8", weight: 3, opacity: .8, dashArray: "6 6" }).addTo(map);
    walk.scenes.filter(hasPoint).forEach(function (s) {
      L.marker([s.lat, s.lng], { icon: L.divIcon({ className: "sw__pin", html: "<span>" + s.n + "</span>", iconSize: [26, 26] }) }).addTo(map);
    });
    if (!pts.length && hasPoint(walk.start)) L.marker(all[0], { icon: L.divIcon({ className: "sw__pin", html: "<span>1</span>", iconSize: [26, 26] }) }).addTo(map);
    if (all.length > 1) map.fitBounds(L.latLngBounds(all), { padding: [30, 30] }); else map.setView(all[0], 17);
    maps[id] = { map: map };
    if (here) onMove();
  }

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
    keepAwake(); watch();
    state.started = true; if (state.next == null) state.next = 0; save();
    show("walk");
    var first = walk.scenes[state.next];
    if (!here || !hasPoint(first) || metres(here, first) <= ((first.radius || walk.radius || 25) + 30)) playScene(state.next);
  });

  /* ---------- the walk ---------- */
  function renderWalk() {
    var i = playing >= 0 ? playing : state.next, s = walk.scenes[i];
    if (!s) { show("end"); return; }
    $("sceneNum").textContent = "Scene " + s.n + " of " + walk.scenes.length;
    $("sceneTitle").textContent = s.title;
    $("headingBox").hidden = playing >= 0;
    $("playingBox").hidden = playing < 0;
    if (playing >= 0) {
      $("sceneMode").textContent = s.kind === "walk" ? "Walk with the voice." : "Stay where you are and listen.";
    } else {
      $("sceneMode").textContent = "Head to " + (s.place || "the next place") + ".";
      $("nextPlace").textContent = s.place || "";
      $("nextDist").textContent = distText(s);
    }
    var list = $("sceneList"); list.innerHTML = "";
    walk.scenes.forEach(function (sc, k) {
      var li = document.createElement("li"), b = document.createElement("button");
      b.type = "button"; b.textContent = sc.n + ". " + sc.title;
      if (k < state.next) li.className = "is-done";
      if (k === i) li.className = "is-now";
      b.addEventListener("click", function () { stop(); state.next = k; save(); playScene(k); });
      li.appendChild(b); list.appendChild(li);
    });
  }
  function playScene(i) {
    var s = walk.scenes[i], url = s && audioFor(s);
    if (!s) return;
    playing = i; photoShown = {}; renderWalk();
    if (!url) { $("sceneMode").textContent = "This scene's sound isn't loaded yet."; return; }
    sourceFor(url).then(function (src) {
      player.src = src;
      var p = player.play();
      if (p && p.catch) p.catch(function () { $("playBtn").textContent = "Play"; });
      $("playBtn").textContent = "Pause";
    });
  }
  function stop() { player.pause(); playing = -1; hidePhoto(); }
  function finishScene() {
    var i = playing; stop();
    state.next = i + 1; save();
    if (state.next >= walk.scenes.length) { state.started = false; state.next = 0; save(); show("end"); return; }
    renderWalk();
    if (here) onMove();
  }
  player.addEventListener("ended", function () { if (playing >= 0) finishScene(); });
  player.addEventListener("timeupdate", function () {
    if (playing < 0 || !player.duration) return;
    $("playBar").style.width = (player.currentTime / player.duration * 100) + "%";
    (walk.scenes[playing].photos || []).forEach(function (ph, k) {
      var at = typeof ph.at === "object" ? (ph.at[state.narrator] != null ? ph.at[state.narrator] : ph.at[Object.keys(ph.at)[0]]) : ph.at;
      var t = player.currentTime, on = t >= at && t < at + (ph.for || 10);
      if (on && !photoShown[k]) { photoShown[k] = true; showPhoto(ph); }
      if (!on && photoShown[k] === true && t >= at + (ph.for || 10)) { photoShown[k] = "done"; hidePhoto(); }
    });
  });
  $("playBtn").addEventListener("click", function () {
    if (player.paused) { player.play(); this.textContent = "Pause"; this.setAttribute("aria-label", "Pause"); }
    else { player.pause(); this.textContent = "Play"; this.setAttribute("aria-label", "Play"); }
  });
  $("backBtn").addEventListener("click", function () { player.currentTime = Math.max(0, player.currentTime - 15); });
  $("skipBtn").addEventListener("click", function () { if (playing >= 0) finishScene(); });
  $("hereBtn").addEventListener("click", function () { playScene(state.next); });
  $("againBtn").addEventListener("click", function () { state.next = 0; state.started = false; save(); show("who"); });

  function toggle(btn, el, after) {
    btn.addEventListener("click", function () {
      el.hidden = !el.hidden; btn.setAttribute("aria-expanded", String(!el.hidden));
      if (!el.hidden && after) after();
    });
  }
  toggle($("mapBtn"), $("walkMap"), function () { setTimeout(function () { makeMap("walkMap"); if (maps.walkMap) maps.walkMap.map.invalidateSize(); }, 30); });
  toggle($("listBtn"), $("sceneList"));

  /* ---------- photos ---------- */
  function showPhoto(ph) {
    sourceFor(ph.src).then(function (src) {
      $("photoImg").src = src; $("photoImg").alt = ph.alt || "";
      $("photoCap").textContent = ph.caption || "";
      $("photo").hidden = false;
      if (navigator.vibrate) navigator.vibrate(60);
    });
  }
  function hidePhoto() { $("photo").hidden = true; }
  $("photoClose").addEventListener("click", hidePhoto);

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
      if (!walk.scenes.some(hasPoint)) $("mapBtn").hidden = true;
      if ("caches" in window) caches.open(CACHE).then(function (c) { c.put("/sonder/media/walk.json", new Response(JSON.stringify(walk), { headers: { "Content-Type": "application/json" } })); });
      if (location.search.indexOf("welcome=1") > -1) { $("welcomeEyebrow").textContent = "Thank you. Your ticket is ready"; history.replaceState(null, "", location.pathname); }
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
