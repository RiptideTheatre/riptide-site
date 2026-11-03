// Our work: each experience rolls in over the last as you scroll, seen from above:
// a breaking wave with white water at its edge and foam lines behind it.
// The panel underneath is revealed along the same edge the foam is drawn on.
(function () {
  var root = document.querySelector('[data-tide]');
  if (!root) return;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

  var stage = root.querySelector('.tide__stage');
  var panels = [].slice.call(root.querySelectorAll('.tide__panel'));
  var dots = [].slice.call(root.querySelectorAll('.tide__dots button'));
  var foamSvg = root.querySelector('.tide__foam');
  var n = panels.length;
  if (n < 2) return;

  var DWELL = 1.25;          // scroll lengths per panel
  var K = 48;                // edge samples across the width
  var AMP = 0.09, FOAM_W = 0.07, DEPTH_K = 4.5;
  var W = 0, H = 0, run = 0, top = 0, active = -1, scheduled = false;

  root.classList.add('tide--live');

  function ease(t) { return 0.5 - 0.5 * Math.cos(Math.PI * t); }
  function clamp(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }

  // smooth value noise for the shape of the wave front
  function h2(x, y) { var s = Math.sin(x * 127.1 + y * 311.7) * 43758.5453; return s - Math.floor(s); }
  function vn(x, y) {
    var ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
    fx = fx * fx * (3 - 2 * fx); fy = fy * fy * (3 - 2 * fy);
    var a = h2(ix, iy), b = h2(ix + 1, iy), c = h2(ix, iy + 1), d = h2(ix + 1, iy + 1);
    return a + (b - a) * fx + (c - a) * fy + (a - b - c + d) * fx * fy;
  }
  function fbm(x, y) { var s = 0, a = 0.5; for (var i = 0; i < 4; i++) { s += a * vn(x, y); x = x * 2.03 + 11.7; y = y * 2.03 + 3.1; a *= 0.5; } return s; }

  // height of the water's edge (0 = bottom of the stage, 1 = top) at K+1 points
  var edgeBuf = new Float32Array(K + 1);
  function edges(base, time, seed) {
    var aspect = W / H;
    for (var k = 0; k <= K; k++) {
      var x = (k / K) * aspect + seed * 3.7;
      edgeBuf[k] = base + AMP * (fbm(x * 2.2, time * 0.25) - 0.5) + AMP * 0.45 * Math.sin(x * 7 + time * 1.1) * (fbm(x * 1.3 + 5, time * 0.2) - 0.3);
    }
    return edgeBuf;
  }

  /* ---------- the water, drawn with WebGL over the stage ---------- */
  var canvas = document.createElement('canvas');
  canvas.className = 'tide__water';
  canvas.setAttribute('aria-hidden', 'true');
  var gl = null, U = {};
  try { gl = canvas.getContext('webgl', { premultipliedAlpha: true, antialias: false }); } catch (e) { gl = null; }

  var FS = [
    'precision highp float;',
    'varying vec2 uv;',
    'uniform float E[' + (K + 1) + '];',
    'uniform float time, aspect, water, settle;',
    'float h21(vec2 q){ q = fract(q * vec2(123.34, 456.21)); q += dot(q, q + 45.32); return fract(q.x * q.y); }',
    'float vn(vec2 q){ vec2 i = floor(q), f = fract(q); f = f * f * (3. - 2. * f); return mix(mix(h21(i), h21(i + vec2(1., 0.)), f.x), mix(h21(i + vec2(0., 1.)), h21(i + vec2(1., 1.)), f.x), f.y); }',
    'float fbm(vec2 q){ float a = .5, s = 0.; for (int i = 0; i < 5; i++){ s += a * vn(q); q = q * 2.03 + 11.7; a *= .5; } return s; }',
    'float edgeAt(float u){',
    '  float f = clamp(u, 0., 1.) * ' + K + '.; float a = 0., b = 0.; float fi = floor(f);',
    '  for (int k = 0; k < ' + K + '; k++){ if (float(k) == fi){ a = E[k]; b = E[k + 1]; } }',
    '  if (fi >= ' + K + '.) { a = E[' + K + ']; b = a; }',
    '  return mix(a, b, f - fi);',
    '}',
    'void main(){',
    '  vec2 st = vec2(uv.x * aspect, uv.y);',
    '  float t = time;',
    '  float hw = edgeAt(uv.x);',
    '  float d = hw - uv.y;',
    '  float depth = d > 0. ? exp(-d * ' + DEPTH_K.toFixed(2) + ') : 0.;',
    '  vec3 c = vec3(0.); float a = 0.;',
    // a soft shadow just ahead of the lip
    '  float sh = d < 0. ? .32 * exp(d * 140.) : 0.;',
    '  c = vec3(0., .02, .03) * sh; a = sh;',
    // the sea: teal, deepest near the edge, clearing behind it
    '  float seaA = depth * .72;',
    '  c = vec3(.05, .24, .26) * seaA + c * (1. - seaA); a = seaA + a * (1. - seaA);',
    '  vec2 g = vec2(fbm(st * 7. + vec2(0., t * .5)) - .5, fbm(st * 7. + vec2(9., -t * .45)) - .5);',
    '  float cz = fbm(st * 16. + g * 3. + vec2(0., t * .7));',
    '  float caustic = pow(1. - abs(cz - .5) * 2., 16.) * depth * .2;',
    '  c += vec3(.75, .92, .9) * caustic; a += caustic * .6;',
    // white water at the edge
    '  float n1 = fbm(st * vec2(38., 56.) + vec2(t * .3, -t * .9));',
    '  float n2 = fbm(st * vec2(90., 120.) + vec2(-t * .5, t * .2));',
    '  float band = smoothstep(-.004, .004, d) * (1. - smoothstep(' + (FOAM_W * 0.35).toFixed(4) + ', ' + FOAM_W.toFixed(3) + ', d));',
    '  float foam = band * smoothstep(.38, .62, n1 + (1. - d / ' + FOAM_W.toFixed(3) + ') * .45) * (.75 + .25 * n2);',
    '  float crest = exp(-abs(d) * 520.) * smoothstep(.3, .75, n2 + n1 * .3);',
    // a net of foam trailing behind, stretched along the shore
    '  float lace = 1. - smoothstep(0., .045, abs(fbm(st * vec2(6., 20.) + vec2(t * .08, -water * 3.)) - .5));',
    '  lace *= d > ' + FOAM_W.toFixed(3) + ' ? exp(-(d - ' + FOAM_W.toFixed(3) + ') * 6.) * .8 : 0.;',
    // foam lines following the wave in
    '  float lines = 0.;',
    '  for (int i = 1; i <= 4; i++){',
    '    float fi = float(i);',
    '    float hl = hw - fi * .07 + ' + AMP.toFixed(3) + ' * .5 * (vn(vec2(st.x * 2.6 + fi * 4.1, t * .3 + fi)) - .5);',
    '    float l = exp(-abs(hl - uv.y) * 230.) * smoothstep(.35, .7, fbm(st * vec2(30., 50.) + fi * 7. + t * .2));',
    '    lines += l * (1. - fi * .17);',
    '  }',
    '  float w = clamp(foam + crest * .8 + lace + lines * .7, 0., 1.);',
    '  c = vec3(.95, .97, .95) * w + c * (1. - w); a = w + a * (1. - w);',
    '  gl_FragColor = vec4(c, a) * settle;',
    '}'
  ].join('\n');

  if (gl) {
    var ok = (function () {
      function sh(type, src) { var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s); return gl.getShaderParameter(s, gl.COMPILE_STATUS) ? s : null; }
      var vs = sh(gl.VERTEX_SHADER, 'attribute vec2 p; varying vec2 uv; void main(){ uv = p * .5 + .5; gl_Position = vec4(p, 0., 1.); }');
      var fs = sh(gl.FRAGMENT_SHADER, FS);
      if (!vs || !fs) return false;
      var pr = gl.createProgram(); gl.attachShader(pr, vs); gl.attachShader(pr, fs); gl.linkProgram(pr);
      if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) return false;
      gl.useProgram(pr);
      var buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      var loc = gl.getAttribLocation(pr, 'p'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
      ['time', 'aspect', 'water', 'settle'].forEach(function (k) { U[k] = gl.getUniformLocation(pr, k); });
      U.E = gl.getUniformLocation(pr, 'E');
      return true;
    })();
    if (!ok) gl = null;
  }
  if (gl) { stage.insertBefore(canvas, foamSvg); foamSvg.style.display = 'none'; }

  /* ---------- fallback: the old foam lines, on the same edge ---------- */
  var paths = [];
  if (!gl) {
    foamSvg.innerHTML = '';
    [[0, .85, 1.6], [.035, .5, 1.2], [.08, .34, 1], [.14, .24, 1], [.22, .16, 1]].forEach(function (l) {
      var el = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      el.setAttribute('stroke-opacity', l[1]); el.setAttribute('stroke-width', l[2]);
      foamSvg.appendChild(el); paths.push({ el: el, off: l[0] });
    });
  }

  function measure() {
    var mh = document.querySelector('.masthead');
    var mhH = mh ? mh.getBoundingClientRect().height : 0;
    root.style.setProperty('--mh', mhH + 'px');
    W = stage.clientWidth;
    H = stage.clientHeight;
    root.style.height = Math.round(H * (1 + (n - 1) * DWELL)) + 'px';
    run = root.offsetHeight - H;
    top = root.getBoundingClientRect().top + window.scrollY - mhH;
    if (gl) {
      // keep the pixel count modest so phones stay smooth
      var dpr = Math.min(window.devicePixelRatio || 1, 2), scale = Math.min(dpr, Math.sqrt(1400000 / Math.max(1, W * H)));
      canvas.width = Math.max(1, Math.round(W * scale)); canvas.height = Math.max(1, Math.round(H * scale));
      gl.viewport(0, 0, canvas.width, canvas.height);
    } else {
      foamSvg.setAttribute('viewBox', '0 0 ' + W + ' ' + H);
    }
    kick();
  }

  function progress() { return run > 0 ? clamp((window.scrollY - top) / run) * (n - 1) : 0; }

  function frame(now) {
    scheduled = false;
    var p = progress(), time = now / 1000, moving = false;

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
        moving = true;
        var base = -0.25 + 1.55 * t;
        var e = edges(base, time, i);
        var poly = [];
        for (var k = 0; k <= K; k++) poly.push(((W * k) / K).toFixed(1) + 'px ' + (H * (1 - e[k])).toFixed(1) + 'px');
        poly.push(W + 'px ' + (H + 4) + 'px', '0px ' + (H + 4) + 'px');
        panel.style.clipPath = 'polygon(' + poly.join(',') + ')';
        draw(e, base, time, 1 - (t > 0.86 ? ease((t - 0.86) / 0.14) : 0));
      }

      if (art) art.style.transform = 'translate3d(0,' + ((1 - t) * 24 - next * 8).toFixed(2) + 'vh,0) rotate(' + ((1 - t) * -1.5).toFixed(2) + 'deg) scale(' + (1 - next * 0.04).toFixed(3) + ')';
      if (amb) amb.style.transform = 'translate3d(0,' + ((1 - t) * 10 - next * 4).toFixed(2) + 'vh,0) scale(1.1)';
      if (content) {
        content.style.transform = 'translate3d(0,' + ((1 - t) * 90 - next * 50).toFixed(1) + 'px,0)';
        content.style.opacity = (Math.min(t * 1.4, 1) * (1 - next * 0.6)).toFixed(3);
      }
    }
    if (!moving) clear();

    var nowI = Math.min(n - 1, Math.max(0, Math.round(p)));
    if (nowI !== active) {
      active = nowI;
      dots.forEach(function (b, k) { b.setAttribute('aria-current', k === nowI ? 'true' : 'false'); });
    }

    // keep the water moving while a wave is on screen; otherwise rest until the next scroll
    if (moving) kick();
  }

  var cleared = false;
  function clear() {
    if (cleared) return;
    cleared = true;
    if (gl) { gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT); }
    else foamSvg.style.opacity = 0;
  }

  function draw(e, base, time, settle) {
    cleared = false;
    if (gl) {
      gl.uniform1fv(U.E, e);
      gl.uniform1f(U.time, time % 1000);
      gl.uniform1f(U.aspect, W / H);
      gl.uniform1f(U.water, base);
      gl.uniform1f(U.settle, settle);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    } else {
      paths.forEach(function (l) {
        var d = '';
        for (var k = 0; k <= K; k++) d += (k ? ' L' : 'M') + ((W * k) / K).toFixed(1) + ' ' + (H * (1 - e[k] + l.off)).toFixed(1);
        l.el.setAttribute('d', d);
      });
      foamSvg.style.opacity = settle.toFixed(3);
    }
  }

  function kick() { if (!scheduled) { scheduled = true; requestAnimationFrame(frame); } }

  function goTo(i, smooth) {
    window.scrollTo({ top: top + (run * i) / (n - 1) + 1, behavior: smooth ? 'smooth' : 'auto' });
  }

  panels.forEach(function (pn, k) {
    pn.addEventListener('focusin', function () { if (k !== active) goTo(k, false); });
  });
  dots.forEach(function (b) {
    b.addEventListener('click', function () { goTo(+b.getAttribute('data-go'), true); });
  });

  window.addEventListener('scroll', kick, { passive: true });
  window.addEventListener('resize', measure);
  window.addEventListener('load', measure);
  measure();
})();
