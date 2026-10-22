import { useEffect, useRef, useState } from "preact/hooks";
import type { Sicht, SichtStand } from "../../sitzung/sicht";
import { meldeSicht } from "../../sitzung/fehlersuche";
import type { Sitzung, SitzungsStand } from "../../sitzung/sitzung";

/** Stand der Sicht; die Komponente zeichnet bei jeder Änderung neu. */
export function useStand(s: Sicht): SichtStand {
  const [, setZaehler] = useState(0);
  useEffect(() => s.abonnieren(() => setZaehler((n) => n + 1)), [s]);
  return s.stand;
}

/**
 * Aktuelle Spielzeit in s. Jede Darstellung rechnet sie frisch aus (auch wenn ein neues Ereignis die
 * Ansicht neu zeichnet); der Takt sorgt nur dafür, dass eine laufende Uhr weiterzählt.
 */
export function useSpielzeit(s: Sicht, intervallMs = 250): number {
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

/**
 * „Meldung entfällt“ (Schritt 7): Fallen bei dieser Rolle Meldungen weg, weil jedes ihrer Fahrzeuge zerstört
 * oder abgezogen ist, sagt ein kurzer Hinweis unten rechts, welche und warum – sonst verschwände die gerade
 * geprüfte Meldung kommentarlos aus dem Eingang.
 */
export function useEntfallHinweis(s: Sicht, st: SichtStand, rolle: "g1" | "g2" | "g3"): void {
  const z = st.zustand;
  const ids = z.reihenfolge.filter((id) => z.meldungen[id].entfallen?.stufe === rolle);
  const bekannt = useRef<Set<string> | null>(null);
  const schl = ids.join(",");
  useEffect(() => {
    if (!st.geladen) return;
    if (bekannt.current) {
      for (const id of ids) {
        if (bekannt.current.has(id)) continue;
        const e = z.meldungen[id].entfallen!;
        s.hinweis("info", `${id} entfällt – ${e.grund}`);
      }
    }
    bekannt.current = new Set(ids);
  }, [schl, st.geladen, st.lauf]);
}

/**
 * Offene Meldung einer Rolle (Schritt 6b): Eine gewählte Meldung bleibt offen, solange sie bei der Rolle liegt
 * (`alle`, auch zurückgestellte); sonst öffnet sich von selbst die älteste neue (`auto`, ohne zurückgestellte).
 * wahl(null) gibt die Auswahl frei – nach einer Entscheidung oder BEOBACHTEN kommt dann die nächste neue.
 */
export function useAuswahl(auto: string[], alle: string[] = auto): [string | null, (id: string | null) => void] {
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const aktuell = gewaehlt && alle.includes(gewaehlt) ? gewaehlt : auto[0] ?? null;
  return [aktuell, setGewaehlt];
}

/** Stand einer Sitzung (Lobby, Spielleitung); zeichnet bei jeder Änderung neu, auch bei Spielständen der Teams. */
export function useSitzung(s: Sitzung): SitzungsStand {
  const [, setZaehler] = useState(0);
  useEffect(() => {
    const ab = [s.abonnieren(() => setZaehler((n) => n + 1)), s.hinweise.abonnieren(() => setZaehler((n) => n + 1))];
    return () => ab.forEach((f) => f());
  }, [s]);
  return s.stand;
}

/** Takt für Anzeigen, die die Uhr mehrerer Teams zeigen (Übersicht der Spielleitung). */
export function useTakt(intervallMs = 500): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setN((x) => x + 1), intervallMs);
    return () => clearInterval(id);
  }, [intervallMs]);
  return n;
}

/** Meldet die gezeigte Sicht für Fehlersuche und Tests (window.argus), solange die Komponente steht. */
export function useMeldeSicht(s: Sicht | null): void {
  useEffect(() => {
    meldeSicht(s);
    return () => meldeSicht(null);
  }, [s]);
}

/**
 * Stand einer Sitzung, aber nur neu zeichnen, wenn sich der Schlüssel ändert. Für Fenster, die nur
 * wissen müssen, WAS sie zeigen (Lobby oder Spiel, welches Team): Die Anwesenheit aller Fenster pulst
 * alle 5 s, das allein soll keine ganze Ansicht neu zeichnen.
 */
export function useSitzungWert(s: Sitzung, schluessel: (st: SitzungsStand) => string): SitzungsStand {
  const [, setZaehler] = useState(0);
  const f = useRef(schluessel);
  f.current = schluessel;
  // Schlüssel beim Zeichnen merken: Ändert sich der Stand zwischen Zeichnen und Abonnieren, fiele die
  // Änderung sonst unter den Tisch (Befund 21.10.: Direktaufruf blieb bei „Spiel wird angelegt …“).
  const gezeichnet = useRef("");
  gezeichnet.current = schluessel(s.stand);
  useEffect(() => {
    const pruefen = () => {
      const neu = f.current(s.stand);
      if (neu !== gezeichnet.current) {
        gezeichnet.current = neu;
        setZaehler((n) => n + 1);
      }
    };
    const ab = s.abonnieren(pruefen);
    pruefen();
    return ab;
  }, [s]);
  return s.stand;
}
