/* Words From Word — PWA glue: registers the service worker and wires up
   the "Install" button that appears when the browser offers installation. */
(function () {
  "use strict";

  // Register the service worker (needs http(s) or localhost — not file://).
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", function () {
      navigator.serviceWorker.register("sw.js").catch(function (err) {
        console.warn("Service worker registration failed:", err);
      });
    });
  }

  // Custom install prompt.
  var deferredPrompt = null;
  var btn = document.getElementById("installBtn");

  window.addEventListener("beforeinstallprompt", function (e) {
    e.preventDefault();
    deferredPrompt = e;
    if (btn) btn.classList.remove("hidden");
  });

  if (btn) {
    btn.addEventListener("click", function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () {
        deferredPrompt = null;
        btn.classList.add("hidden");
      });
    });
  }

  window.addEventListener("appinstalled", function () {
    deferredPrompt = null;
    if (btn) btn.classList.add("hidden");
  });
})();
