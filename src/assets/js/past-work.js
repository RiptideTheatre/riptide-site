// Past Work: one show open at a time; the latest starts open.
(function () {
  var root = document.querySelector("[data-arc]");
  if (!root) return;
  root.classList.add("ta--js");
  var items = Array.prototype.slice.call(root.querySelectorAll(".ta__item"));
  function open(item, focus) {
    items.forEach(function (it) {
      var on = it === item;
      it.classList.toggle("is-open", on);
      var b = it.querySelector(".ta__spine");
      if (b) b.setAttribute("aria-expanded", on ? "true" : "false");
    });
    if (focus) { var a = item.querySelector(".ta__btn"); if (a) a.focus({ preventScroll: true }); }
    if (window.matchMedia("(max-width: 899px)").matches) {
      var r = item.getBoundingClientRect();
      if (r.top < 60 || r.top > window.innerHeight * 0.5) item.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }
  items.forEach(function (it) {
    var b = it.querySelector(".ta__spine");
    if (b) b.addEventListener("click", function () { open(it, true); });
  });
})();
