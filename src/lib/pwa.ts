/**
 * Enregistrement du service worker PWA GTEC PRO.
 * Sans effet en développement local (localhost / *.vly.sh sans build) pour
 * éviter d'intercepter le flux de dev de Vite — le SW reste actif sur la
 * preview publiée et en production.
 */
export function registerServiceWorker() {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
  const { protocol, hostname } = window.location;
  if (protocol !== "https:" && hostname !== "localhost" && hostname !== "127.0.0.1") {
    return; // le SW exige un contexte sécurisé
  }

  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      console.warn("[PWA] Service worker non enregistré :", err.message);
    });
  });
}
