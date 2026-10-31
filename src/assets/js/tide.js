// Our work: each experience rises over the last on a rolling tide line as you scroll.
(function () {
  var root = document.querySelector('[data-tide]');
  if (!root) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var stage = root.querySelector('.tide__stage');
  var panels = [].slice.call(root.querySelectorAll('.tide__panel'));
  var dots = [].slice.call(root.querySelectorAll('.tide__dots button'));
  var foam = root.querySelector('.tide__foam');
  // the crest, a little spray ahead of it, and swells rolling in behind
  var LINES = [
    { off: -0.03, amp: 0.45, ph: 0.9, op: 0.22, sw: 1 },
    { off: 0, amp: 1, ph: 0, op: 0.85, sw: 1.6 },
    { off: 0.035, amp: 0.92, ph: -0.45, op: 0.5, sw: 1.2 },
    { off: 0.08, amp: 0.8, ph: -1.0, op: 0.34, sw: 1 },
    { off: 0.14, amp: 0.66, ph: -1.6, op: 0.24, sw: 1 },
    { off: 0.22, amp: 0.52, ph: -2.3, op: 0.16, sw: 1 },
    { off: 0.32, amp: 0.4, ph: -3.0, op: 0.1, sw: 1 }
  ];
  foam.innerHTML = '';
  var paths = LINES.map(function (l) {
    var el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    el.setAttribute('stroke-opacity', l.op);
    el.setAttribute('stroke-width', l.sw);
    foam.appendChild(el);
    return el;
  });
  var n = panels.length;
  if (n < 2) return;

  var DWELL = 1.25; // scroll lengths per panel
  var W = 0, H = 0, run = 0, top = 0, ticking = false, active = -1;

  root.classList.add('tide--live');

  function ease(t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); }
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  function measure() {
    var mh = document.querySelector('.masthead');
    root.style.setProperty('--mh', (mh ? mh.getBoundingClientRect().height : 0) + 'px');
    W = stage.clientWidth;
    H = stage.clientHeight;
    root.style.height = Math.round(H * (1 + (n - 1) * DWELL)) + 'px';
    run = root.offsetHeight - H;
    top = root.getBoundingClientRect().top + window.scrollY - (mh ? mh.getBoundingClientRect().height : 0);
    foam.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    update();
  }

  // y position of the wave line at x: a long swell with a shorter chop on top
  function edgeY(e, amp, phase, x) {
    return e + amp * Math.sin((x / W) * Math.PI * 2 * 0.9 + phase) + amp * 0.35 * Math.sin((x / W) * Math.PI * 2 * 2.3 - phase * 1.7);
  }

  function edge(t, i) {
    var a0 = H * 0.015, a1 = H * 0.07, amax = a0 + a1 * 1.35;
    var amp = a0 + a1 * Math.sin(Math.PI * t);
    var e = H + amax - t * (H + 2 * amax);
    return { e: e, amp: amp, phase: t * Math.PI * 1.6 + i * 1.3 };
  }

  function points(e, amp, phase) {
    var pts = [], steps = 36;
    for (var s = 0; s <= steps; s++) {
      var x = (W * s) / steps;
      pts.push([x, edgeY(e, amp, phase, x)]);
    }
    return pts;
  }

  function pathD(pts) {
    return 'M' + pts.map(function (q) { return q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' L');
  }

  function update() {
    ticking = false;
    var p = run > 0 ? clamp((window.scrollY - top) / run) * (n - 1) : 0;
    var foamOn = false;

    for (var i = 0; i < n; i++) {
      var panel = panels[i];
      var art = panel.querySelector('.tide__art');
      var amb = panel.querySelector('.tide__ambient');
      var content = panel.querySelector('.tide__content');
      var t = i === 0 ? 1 : ease(clamp((p - (i - 1) - 0.12) / 0.76));
      var next = i < n - 1 ? ease(clamp((p - i - 0.12) / 0.76)) : 0;

      if (t <= 0) {
        panel.style.clipPath = 'inset(100% 0 0 0)';
      } else if (t >= 1) {
        panel.style.clipPath = 'none';
      } else {
        var w = edge(t, i);
        var pts = points(w.e, w.amp, w.phase);
        var poly = pts.map(function (q) { return q[0].toFixed(1) + 'px ' + q[1].toFixed(1) + 'px'; });
        poly.push(W + 'px ' + (H + 4) + 'px', '0px ' + (H + 4) + 'px');
        panel.style.clipPath = 'polygon(' + poly.join(',') + ')';

        LINES.forEach(function (l, k) {
          paths[k].setAttribute('d', pathD(points(w.e + l.off * H, w.amp * l.amp, w.phase + l.ph)));
        });
        foam.style.opacity = Math.min(1, Math.sin(Math.PI * t) * 1.6).toFixed(3);
        foamOn = true;
      }

      // the incoming artwork rises with the water; the outgoing one is lifted gently away
      if (art) art.style.transform = 'translate3d(0,' + ((1 - t) * 24 - next * 8).toFixed(2) + 'vh,0) rotate(' + ((1 - t) * -1.5).toFixed(2) + 'deg) scale(' + (1 - next * 0.04).toFixed(3) + ')';
      if (amb) amb.style.transform = 'translate3d(0,' + ((1 - t) * 10 - next * 4).toFixed(2) + 'vh,0) scale(1.1)';
      if (content) {
        content.style.transform = 'translate3d(0,' + ((1 - t) * 90 - next * 50).toFixed(1) + 'px,0)';
        content.style.opacity = (Math.min(t * 1.4, 1) * (1 - next * 0.6)).toFixed(3);
      }
    }
    if (!foamOn) foam.style.opacity = 0;

    var now = Math.min(n - 1, Math.max(0, Math.round(p)));
    if (now !== active) {
      active = now;
      dots.forEach(function (b, k) { b.setAttribute('aria-current', k === now ? 'true' : 'false'); });
    }
  }

  function goTo(i, smooth) {
    window.scrollTo({ top: top + (run * i) / (n - 1) + 1, behavior: smooth ? 'smooth' : 'auto' });
  }

  // keyboard users tabbing into a panel are carried to it
  panels.forEach(function (pn, k) {
    pn.addEventListener('focusin', function () { if (k !== active) goTo(k, false); });
  });

  dots.forEach(function (b) {
    b.addEventListener('click', function () { goTo(+b.getAttribute('data-go'), true); });
  });

  window.addEventListener('scroll', function () {
    if (!ticking) { ticking = true; requestAnimationFrame(update); }
  }, { passive: true });
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  measure();
})();
