import { useEffect, useRef, useState } from "preact/hooks";
import type { Sitzung, SitzungsStand } from "../../sitzung/sitzung";

/** Stand der Sitzung; die Komponente zeichnet bei jeder Änderung neu. */
export function useStand(s: Sitzung): SitzungsStand {
  const [, setZaehler] = useState(0);
  useEffect(() => s.abonnieren(() => setZaehler((n) => n + 1)), [s]);
  return s.stand;
}

/**
 * Aktuelle Spielzeit in s. Jede Darstellung rechnet sie frisch aus (auch wenn ein neues Ereignis die
 * Ansicht neu zeichnet); der Takt sorgt nur dafür, dass eine laufende Uhr weiterzählt.
 */
export function useSpielzeit(s: Sitzung, intervallMs = 250): number {
  const [, setTakt] = useState(0);
  const letzte = useRef(s.spielzeit());
  useEffect(() => {
    const id = setInterval(() => {
      const v = s.spielzeit();
      if (v !== letzte.current) {
        letzte.current = v;
        setTakt((n) => n + 1);
      }
    }, intervallMs);
    return () => clearInterval(id);
  }, [s, intervallMs]);
  const t = s.spielzeit();
  letzte.current = t;
  return t;
}

/** Auswahl in einer Liste: bleibt stehen, solange der Eintrag existiert, sonst der erste. */
export function useAuswahl(ids: string[]): [string | null, (id: string) => void] {
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const aktuell = gewaehlt && ids.includes(gewaehlt) ? gewaehlt : ids[0] ?? null;
  return [aktuell, setGewaehlt];
}
