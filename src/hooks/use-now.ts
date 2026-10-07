/**
 * Hook d'horloge réactif compatible react-hooks/purity : `Date.now()` n'est
 * JAMAIS appelé pendant le rendu. La valeur est lue depuis un store global
 * caché, rafraîchi dans un tick partagé toutes les 30 s — les décomptes
 * (« expire dans X min », âge d'une position…) se mettent à jour
 * périodiquement sans impureté dans les composants.
 */
import { useSyncExternalStore } from "react";

const TICK_MS = 30_000;

let currentNow = Date.now();
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function subscribe(listener: () => void): () => void {
  // Valeur fraîche dès l'abonnement (au montage du composant).
  currentNow = Date.now();
  listeners.add(listener);
  if (timer === null) {
    timer = setInterval(() => {
      currentNow = Date.now();
      for (const l of listeners) l();
    }, TICK_MS);
  }
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** Snapshot caché : renvoie la même valeur tant qu'aucun tick n'a eu lieu. */
function getSnapshot(): number {
  return currentNow;
}

export function useNow(): number {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
