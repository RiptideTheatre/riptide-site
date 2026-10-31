// Our work: each experience washes in over the last on a rolling wave edge as you scroll.
(function () {
  var root = document.querySelector('[data-tide]');
  if (!root) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var stage = root.querySelector('.tide__stage');
  var panels = [].slice.call(root.querySelectorAll('.tide__panel'));
  var dots = [].slice.call(root.querySelectorAll('.tide__dots button'));
  var foamA = root.querySelector('.tide__foam-a');
  var foamB = root.querySelector('.tide__foam-b');
  var foam = root.querySelector('.tide__foam');
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

  // x position of the wave edge at height y
  function edgeX(e, amp, phase, y) {
    return e + amp * Math.sin((y / H) * Math.PI * 2 * 0.8 + phase) + amp * 0.35 * Math.sin((y / H) * Math.PI * 2 * 2.1 - phase * 1.7);
  }

  function edge(t, i) {
    var a0 = W * 0.012, a1 = W * 0.085, amax = a0 + a1 * 1.35;
    var amp = a0 + a1 * Math.sin(Math.PI * t);
    var e = W + amax - t * (W + 2 * amax);
    return { e: e, amp: amp, phase: t * Math.PI * 1.6 + i * 1.3 };
  }

  function points(w, offset) {
    var pts = [], steps = 28;
    for (var s = 0; s <= steps; s++) {
      var y = (H * s) / steps;
      pts.push([edgeX(w.e + offset, w.amp, w.phase, y), y]);
    }
    return pts;
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
        panel.style.clipPath = 'inset(0 0 0 100%)';
      } else if (t >= 1) {
        panel.style.clipPath = 'none';
      } else {
        var w = edge(t, i);
        var pts = points(w, 0);
        var poly = pts.map(function (q) { return q[0].toFixed(1) + 'px ' + q[1].toFixed(1) + 'px'; });
        poly.push((W + 4) + 'px ' + H + 'px', (W + 4) + 'px 0px');
        panel.style.clipPath = 'polygon(' + poly.join(',') + ')';

        var d = 'M' + pts.map(function (q) { return q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' L');
        var trail = points({ e: w.e + w.amp * 0.9 + W * 0.02, amp: w.amp * 0.8, phase: w.phase - 0.7 }, 0);
        foamA.setAttribute('d', d);
        foamB.setAttribute('d', 'M' + trail.map(function (q) { return q[0].toFixed(1) + ' ' + q[1].toFixed(1); }).join(' L'));
        foam.style.opacity = Math.sin(Math.PI * t).toFixed(3);
        foamOn = true;
      }

      // the incoming artwork rides in behind the wave; the outgoing one is pushed gently back
      if (art) art.style.transform = 'translate3d(' + ((1 - t) * 22 - next * 10).toFixed(2) + '%,0,0) rotate(' + ((1 - t) * 2.5).toFixed(2) + 'deg)';
      if (amb) amb.style.transform = 'translate3d(' + ((1 - t) * 8 - next * 4).toFixed(2) + '%,0,0) scale(1.1)';
      if (content) {
        content.style.transform = 'translate3d(' + ((1 - t) * 90 - next * 40).toFixed(1) + 'px,0,0)';
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
