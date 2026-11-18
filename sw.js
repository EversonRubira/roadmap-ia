/* Service worker do Learning Journey (substitui o do Roadmap antigo, cache "roadmap-ia-v1").
   - Rede primeiro para a app (HTML/JS/CSS): uma versão nova aparece logo que há ligação.
     Sem ligação (ou rede lenta > 4 s) serve a cópia guardada => modo offline SÓ DE LEITURA.
   - Fontes: stale-while-revalidate.
   - Pedidos a outras origens não são intercetados. Os dados (data/*.json) seguem a mesma regra
     de rede primeiro: uma análise nova aparece logo que há ligação; sem ligação vê-se a última guardada.
   Para forçar atualização: mudar VERSION. Só apaga caches com os prefixos "roadmap-ia-" e "lj-"
   (a origem github.io é partilhada com o portfólio e outros projetos). */
var VERSION = "3.2.0";
var CACHE = "lj-v" + VERSION;
var SHELL = [
  "./", "index.html", "manifest.webmanifest",
  "css/app.css?v=" + VERSION, "js/app.js?v=" + VERSION,
  "js/config.js", "js/dom.js", "js/i18n.js", "js/store.js", "js/auth.js", "js/advisor.js", "js/theme.js", "js/theme-init.js?v=" + VERSION,
  "js/locales/pt-PT.js", "js/locales/en-GB.js",
  "js/ui/advisor.js", "js/ui/common.js", "js/ui/journey.js", "js/ui/now.js", "js/ui/skills.js",
  "data/competencias.json", "data/cursos-feitos.json", "data/analises/latest.json",
  "icons/icon-192.png", "icons/icon-512.png", "icons/icon-maskable-512.png", "icons/apple-touch-icon.png"
];
var FONT_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com"];
var OURS = /^(roadmap-ia-|lj-)/;

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil((async function () {
    var keys = await caches.keys();
    var old = keys.filter(function (k) { return OURS.test(k) && k !== CACHE; });
    await Promise.all(old.map(function (k) { return caches.delete(k); }));
    await self.clients.claim();
    if (old.length) {   // havia uma versão anterior instalada: recarregar as janelas abertas para largar a interface antiga
      var wins = await self.clients.matchAll({ type: "window" });
      wins.forEach(function (w) { try { w.navigate(w.url); } catch (_e) { /* ignora */ } });
    }
  })());
});

function networkFirst(req) {
  return caches.open(CACHE).then(function (cache) {
    return new Promise(function (resolve) {
      var settled = false;
      var timer = setTimeout(function () {
        cache.match(req).then(function (hit) { if (hit && !settled) { settled = true; resolve(hit); } });
      }, 4000);
      fetch(req).then(function (res) {
        clearTimeout(timer);
        if (res && res.ok) cache.put(req, res.clone());
        if (!settled) { settled = true; resolve(res); }
      }).catch(function () {
        clearTimeout(timer);
        cache.match(req).then(function (hit) {
          if (settled) return;
          settled = true;
          if (hit) return resolve(hit);
          if (req.mode === "navigate") return cache.match("index.html").then(function (h) { resolve(h || Response.error()); });
          resolve(Response.error());
        });
      });
    });
  });
}

function staleWhileRevalidate(req) {
  return caches.open(CACHE).then(function (cache) {
    return cache.match(req).then(function (hit) {
      var net = fetch(req).then(function (res) { if (res && (res.ok || res.type === "opaque")) cache.put(req, res.clone()); return res; }).catch(function () { return hit; });
      return hit || net;
    });
  });
}

self.addEventListener("fetch", function (e) {
  var req = e.request;
  if (req.method !== "GET") return;
  var url = new URL(req.url);
  if (FONT_HOSTS.indexOf(url.hostname) >= 0) { e.respondWith(staleWhileRevalidate(req)); return; }
  if (url.origin !== self.location.origin) return;                       // outras origens: fora do service worker
  if (url.pathname.indexOf("/legacy/") >= 0) return;                     // roadmap antigo: sempre da rede
  e.respondWith(networkFirst(req));
});
