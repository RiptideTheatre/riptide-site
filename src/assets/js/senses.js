// What it was like: the five senses arrive one at a time as the list comes into view.
(function () {
  var list = document.querySelector("[data-sx]");
  if (!list || !("IntersectionObserver" in window)) return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var sec = list.closest(".sx"); sec.classList.add("sx--js");
  var rows = list.querySelectorAll(".sx__row");
  var done = false;
  function show() {
    if (done) return; done = true;
    rows.forEach(function (r, i) { setTimeout(function () { r.classList.add("is-in"); }, 150 + i * 340); });
    io.disconnect();
  }
  var io = new IntersectionObserver(function (es) {
    if (es.some(function (e) { return e.isIntersecting; })) show();
  }, { rootMargin: "0px 0px -15% 0px" });
  io.observe(list);
  // never leave the senses hidden: if the list is already passed or the observer is slow, show them
  window.addEventListener("scroll", function () { if (list.getBoundingClientRect().top < window.innerHeight) show(); }, { passive: true });
})();
