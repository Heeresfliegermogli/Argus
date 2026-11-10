import { useEffect, useRef, useState } from "preact/hooks";
import type { Sicht, SichtStand } from "../../sitzung/sicht";
import { meldeSicht } from "../../sitzung/fehlersuche";
import type { Sitzung, SitzungsStand } from "../../sitzung/sitzung";
import { vermerke } from "../../kern/sichten";
import { zielName } from "../../kern/zielnummern";

/**
 * Stand der Sicht; die Komponente zeichnet bei jeder Änderung neu. Hat sich der Stand zwischen Zeichnen und Abonnieren geändert
 * (z. B. der Host des Team-Laptops ist gerade gestartet), wird gleich noch einmal gezeichnet.
 */
export function useStand(s: Sicht): SichtStand {
  const [, setZaehler] = useState(0);
  const st = s.stand;
  const gezeichnet = useRef(st);
  gezeichnet.current = st;
  useEffect(() => {
    const ab = s.abonnieren(() => setZaehler((n) => n + 1));
    if (s.stand !== gezeichnet.current) setZaehler((n) => n + 1);
    return ab;
  }, [s]);
  return st;
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
 * „Meldung entfällt“ (Schritt 7), seit 2.7 (I1.2, I3.2) für jeden Vermerk: Fällt eine Meldung aus dem Eingang (Fahrzeuge zerstört,
 * durchgebrochen, abgezogen, als verbündet erkannt) oder verlässt ein schon entschiedenes Ziel den Raum, sagt ein kurzer Hinweis unten
 * rechts, welches und warum – zusätzlich zum Vermerk im Eingang und dem Zeichen am Kartenrand.
 */
export function useEntfallHinweis(s: Sicht, st: SichtStand, t: number): void {
  const z = st.zustand;
  const liste = vermerke(s.inh, z, t);
  const bekannt = useRef<Set<string> | null>(null);
  const schl = liste.map((v) => `${v.meldung}|${v.art}`).join(",");
  useEffect(() => {
    if (!st.geladen) return;
    if (bekannt.current) {
      for (const v of liste) {
        const k = `${v.meldung}|${v.art}`;
        if (bekannt.current.has(k)) continue;
        s.hinweis("info", `${zielName(s.inh, z, v.meldung, false)}: ${v.text}`);
      }
    }
    bekannt.current = new Set(liste.map((v) => `${v.meldung}|${v.art}`));
  }, [schl, st.geladen, st.lauf]);
}

/**
 * Geöffnete Meldung (Schritt 6b): Eine gewählte Meldung bleibt offen, solange sie im Eingang liegt (`alle`, auch
 * zurückgestellte); sonst öffnet sich von selbst die älteste neue (`auto`, ohne zurückgestellte). wahl(null) gibt die
 * Auswahl frei – nach einer Entscheidung kommt dann die nächste neue.
 */
export function useAuswahl(auto: string[], alle: string[] = auto): [string | null, (id: string | null) => void] {
  const [gewaehlt, setGewaehlt] = useState<string | null>(null);
  const aktuell = gewaehlt && alle.includes(gewaehlt) ? gewaehlt : auto[0] ?? null;
  return [aktuell, setGewaehlt];
}

/** Stand einer Sitzung (Lobby, Spielleitung); zeichnet bei jeder Änderung neu, auch bei Spielständen der Teams. */
export function useSitzung(s: Sitzung): SitzungsStand {
  const [, setZaehler] = useState(0);
  const st = s.stand;
  const gezeichnet = useRef(st);
  gezeichnet.current = st;
  useEffect(() => {
    const ab = [s.abonnieren(() => setZaehler((n) => n + 1)), s.hinweise.abonnieren(() => setZaehler((n) => n + 1))];
    if (s.stand !== gezeichnet.current) setZaehler((n) => n + 1);
    return () => ab.forEach((f) => f());
  }, [s]);
  return st;
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
