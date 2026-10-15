/*
 * Service worker mínimo requerido para que la app sea instalable en Android/iOS.
 * Deliberadamente no cachea nada: cada navegación va a la red, así el preview
 * y las versiones nuevas nunca quedan servidas desde una copia vieja.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", () => {
  // No-op: solo hace falta que exista un handler de fetch para cumplir
  // los criterios de instalación de la PWA.
});
