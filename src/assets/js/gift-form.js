/* "This is a gift": shows the extra fields and reads them for the booking script.
   RiptideGift.read(form) → null (not a gift) | {gift} | {error, field} */
(function () {
  function within(form, sel) { return form.querySelector(sel); }
  function sync(box) {
    var on = within(box, "[data-gift-on]").checked;
    within(box, "[data-gift-fields]").hidden = !on;
    var send = within(box, "input[type=radio]:checked");
    var wrap = within(box, "[data-gift-email-wrap]");
    if (wrap) wrap.hidden = !send || send.value !== "email";
    var form = box.closest("form");
    if (form) form.classList.toggle("is-gift", on);
  }
  [].forEach.call(document.querySelectorAll("[data-gift]"), function (box) {
    box.addEventListener("change", function () { sync(box); });
    within(box, "[data-gift-on]").addEventListener("change", function (e) {
      if (e.target.checked) setTimeout(function () { within(box, "[data-gift-to]").focus(); }, 30);
    });
    sync(box);
  });

  window.RiptideGift = {
    read: function (form) {
      var box = within(form, "[data-gift]");
      if (!box || !within(box, "[data-gift-on]").checked) return null;
      var to = within(box, "[data-gift-to]"), from = within(box, "[data-gift-from]"),
          note = within(box, "[data-gift-note]"), email = within(box, "[data-gift-email]"),
          send = (within(box, "input[type=radio]:checked") || {}).value || "email";
      if (!to.value.trim()) return { error: "Please add the name of the person you're giving it to.", field: to };
      if (!from.value.trim()) return { error: "Please add your name, as you'd like it on the gift card.", field: from };
      if (send === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.value.trim()))
        return { error: "Please add their email address, or choose to have the gift sent to you.", field: email };
      return { gift: { to: to.value.trim(), from: from.value.trim(), note: note.value.trim(), send: send, email: send === "email" ? email.value.trim() : "" } };
    },
    errors: {
      gift: "Please add their name and yours.",
      giftEmail: "Please add their email address, or choose to have the gift sent to you."
    }
  };
})();
