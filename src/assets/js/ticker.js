// What people say: duplicate the line once so it loops without a gap.
(function () {
  var box = document.querySelector("[data-ticker]");
  if (!box) return;
  var track = box.querySelector(".pt__track");
  var items = Array.prototype.slice.call(track.children);
  items.forEach(function (li) { var c = li.cloneNode(true); c.setAttribute("aria-hidden", "true"); track.appendChild(c); });
  box.classList.add("pt--js");
  // keep the speed steady whatever the length: about 60px a second
  requestAnimationFrame(function () { box.style.setProperty("--pt-dur", Math.round(track.scrollWidth / 2 / 60) + "s"); });
})();
