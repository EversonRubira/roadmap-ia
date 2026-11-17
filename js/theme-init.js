// Corre antes de desenhar a página (script clássico no <head>) para evitar um relâmpago de tema errado.
(function () {
  try {
    var m = localStorage.getItem("lj-theme");
    if (m === "light" || m === "dark") document.documentElement.setAttribute("data-theme", m);
  } catch (_e) { /* sem storage: segue o sistema */ }
})();
