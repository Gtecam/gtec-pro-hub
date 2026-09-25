import { useCallback, useEffect, useRef, useState } from "react";

import type { GpsCoords } from "@/lib/gps";

export type GeoFix = {
  coords: GpsCoords;
  /** Précision estimée en mètres. */
  accuracy: number;
  at: number;
};

export type GeoState = {
  position: GeoFix | null;
  error: string | null;
  loading: boolean;
  supported: boolean;
};

export function geoErrorMessage(err: GeolocationPositionError): string {
  if (err.code === 1)
    return "Accès à la position refusé — autorisez la géolocalisation dans votre navigateur.";
  if (err.code === 2)
    return "Position indisponible — vérifiez que le GPS de l'appareil est activé.";
  if (err.code === 3)
    return "Délai dépassé — réessayez, de préférence en extérieur.";
  return err.message || "Erreur de géolocalisation.";
}

/**
 * Accès au GPS de l'appareil (API Geolocation du navigateur).
 *  - `locate()` : une position unique.
 *  - `useGeolocation({ watch: true })` : suivi continu (partage temps réel).
 * Aucune donnée n'est envoyée automatiquement : c'est l'appelant qui décide.
 */
export function useGeolocation(opts?: { watch?: boolean }) {
  const [state, setState] = useState<GeoState>({
    position: null,
    error: null,
    loading: false,
    supported: typeof navigator !== "undefined" && "geolocation" in navigator,
  });
  const watchId = useRef<number | null>(null);
  const [watching, setWatching] = useState(false);

  const stop = useCallback(() => {
    if (watchId.current !== null) {
      navigator.geolocation.clearWatch(watchId.current);
      watchId.current = null;
      setWatching(false);
    }
  }, []);

  const locate = useCallback(() => {
    if (!("geolocation" in navigator)) {
      setState((s) => ({
        ...s,
        error: "Géolocalisation non prise en charge par cet appareil.",
        loading: false,
      }));
      return;
    }
    setState((s) => ({ ...s, loading: true, error: null }));
    const onOk = (pos: GeolocationPosition) => {
      setState({
        position: {
          coords: {
            lat: pos.coords.latitude,
            lon: pos.coords.longitude,
          },
          accuracy: pos.coords.accuracy,
          at: pos.timestamp,
        },
        error: null,
        loading: false,
        supported: true,
      });
    };
    const onErr = (err: GeolocationPositionError) => {
      setState((s) => ({
        ...s,
        loading: false,
        error: geoErrorMessage(err),
      }));
    };
    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 20000,
      maximumAge: 15000,
    };
    if (opts?.watch) {
      stop();
      watchId.current = navigator.geolocation.watchPosition(
        onOk,
        onErr,
        options,
      );
      setWatching(true);
    } else {
      navigator.geolocation.getCurrentPosition(onOk, onErr, options);
    }
  }, [opts?.watch, stop]);

  // Nettoyage au démontage.
  useEffect(() => stop, [stop]);

  return { ...state, locate, stop, watching };
}
