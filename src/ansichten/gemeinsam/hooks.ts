import { useEffect, useState } from "preact/hooks";
import type { Sitzung, SitzungsStand } from "../../sitzung/sitzung";

/** Stand der Sitzung; die Komponente zeichnet bei jeder Änderung neu. */
export function useStand(s: Sitzung): SitzungsStand {
  const [, setZaehler] = useState(0);
  useEffect(() => s.abonnieren(() => setZaehler((n) => n + 1)), [s]);
  return s.stand;
}

/** Aktuelle Spielzeit in s, wird lokal mehrmals pro Sekunde fortgeschrieben. */
export function useSpielzeit(s: Sitzung, intervallMs = 250): number {
  const [t, setT] = useState(() => s.spielzeit());
  useEffect(() => {
    const id = setInterval(() => setT(s.spielzeit()), intervallMs);
    return () => clearInterval(id);
  }, [s, intervallMs]);
  return t;
}

/** Auswahl in einer Liste: bleibt stehen, solange der Eintrag existiert, sonst der erste. */
export function useAuswahl(ids: string[]): [string | null, (id: string) => void] {
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const aktuell = gewaehlt && ids.includes(gewaehlt) ? gewaehlt : ids[0] ?? null;
  return [aktuell, setGewaehlt];
}
