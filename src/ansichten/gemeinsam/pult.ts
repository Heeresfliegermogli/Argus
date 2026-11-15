// Testpult (Liste N, 15.11.2026): Verbindung eines Reiters (Frame) zum Pult darüber.
//
// Das Pult (ansichten/testpult.tsx) hält drei Frames derselben Seite übereinander – Spielleitung, Zielbearbeitung, Plenum – und
// verdeckt die nicht gewählten über `visibility` (nicht `display: none`, damit die Karten ihre Größe behalten). Alle drei laufen weiter;
// die Zielbearbeitung rechnet das Spiel. Pult und Frames sprechen nur über postMessage (geht auch in der Offline-Datei, wo file://-Frames
// einander nicht in die Seite greifen dürfen):
//   Frame → Pult   stand {…}        was der Reiter am Pult zeigen lässt (Zahl im Eingang, Bild des Plenums)
//                  reiter {ziel}    „→ Reiter Zielbearbeitung“ u. ä.: anderen Reiter nach vorn
//                  neuLaden         „Neue Version – bitte neu laden“: das ganze Pult neu laden (das Spiel läuft an derselben Stelle weiter)
//                  startseite       „Alle Sitzungen beenden“: das Pult geht zur Startseite
//   Pult → Frame   sichtbar {an}    der Reiter ist vorn bzw. verdeckt – verdeckt zeichnet die Karte nur noch 2 Bilder/s (rechnet weiter)
import { bildrateMax, setzeBildrateMax } from "../../karte/bildrate";
import { warteschlange } from "../../kern/sichten";
import { DIREKT_TEAM } from "../../kern/sitzungen";
import type { Sitzung } from "../../sitzung/sitzung";
import type { FensterArt } from "../../sync/adapter";

export type PultReiter = "sl" | "zb" | "plenum";

/** Bilder je Sekunde der Karte in einem verdeckten Reiter (Lage, Uhr und Spiel laufen unverändert weiter). */
export const VERDECKT_FPS = 2;

let imPultFrame = false;
let sichtbar = true;
let fpsVoll = 30;

function nachricht(d: unknown): { art: string; [k: string]: unknown } | null {
  if (!d || typeof d !== "object" || (d as { argusPult?: unknown }).argusPult !== 1) return null;
  const art = (d as { art?: unknown }).art;
  return typeof art === "string" ? (d as { art: string }) : null;
}

/**
 * Dieses Fenster ist ein Reiter des Testpults (…&pult=1 und in einem Frame). Einmal beim Start aufrufen; danach liefern imPult(),
 * anPult() und zuReiter() die Verbindung. Außerhalb eines Frames (Adresse direkt in einem Tab geöffnet) bleibt alles wie sonst.
 */
export function pultAnmelden(pult: boolean | undefined): boolean {
  if (imPultFrame) return true;
  if (!pult || typeof window === "undefined" || window.parent === window) return false;
  imPultFrame = true;
  fpsVoll = bildrateMax();
  window.addEventListener("message", (ev) => {
    if (ev.source !== window.parent) return;
    const d = nachricht(ev.data);
    if (d?.art !== "sichtbar") return;
    sichtbar = d.an !== false;
    setzeBildrateMax(sichtbar ? fpsVoll : Math.min(fpsVoll, VERDECKT_FPS));
  });
  anPult("hallo");
  return true;
}

/** Ist dieses Fenster ein Reiter des Testpults? */
export function imPult(): boolean {
  return imPultFrame;
}

/** Ist der Reiter gerade vorn? (außerhalb des Pults immer) */
export function pultSichtbar(): boolean {
  return !imPultFrame || sichtbar;
}

/** Nachricht an das Pult (außerhalb des Pults: nichts). */
export function anPult(art: string, daten: Record<string, unknown> = {}): void {
  if (!imPultFrame) return;
  try {
    window.parent.postMessage({ argusPult: 1, art, ...daten }, "*");
  } catch {
    /* Pult schon weg */
  }
}

/** Einen anderen Reiter des Pults nach vorn holen. */
export function zuReiter(ziel: PultReiter): void {
  anPult("reiter", { ziel });
}

/** Seite neu laden – im Pult das ganze Pult (sonst liefe nur dieser Reiter mit neuem Programmstand). */
export function seiteNeuLaden(): void {
  if (imPultFrame) anPult("neuLaden");
  else location.reload();
}

/** Zur Startseite – im Pult das ganze Pult. */
export function zurStartseite(): void {
  if (imPultFrame) anPult("startseite");
  else location.href = location.pathname;
}

/** Was die Zielbearbeitung dem Pult meldet (Zahl am Reiter, „So geht's“). */
export interface PultStandZB {
  lauf: string | null;
  /** neue Meldungen im Eingang (ohne zurückgestellte) – wie die Zahl am Eingang */
  eingang: number;
  /** Meldungen bisher (für „neue Meldung, seit der Reiter verdeckt ist“) */
  meldungen: number;
  begonnen: boolean;
  ende: boolean;
  rechnet: boolean;
  /** „Testraum geleert – neu laden“ bzw. abgemeldet */
  entfernt: boolean;
}

/** Bild des Plenums: einweisung, lage, aufloesung (Modus), abschluss („Gefecht beendet“), auswertung, warten. */
function plenumBild(): string {
  const ansicht = document.querySelector<HTMLElement>("#app .rahmen[data-ansicht]")?.dataset.ansicht;
  if (ansicht && ansicht !== "warten") return ansicht;
  return document.querySelector<HTMLElement>("#app main.plenum[data-modus]")?.dataset.modus ?? ansicht ?? "";
}

/**
 * Stand des Reiters ans Pult melden, solange das Fenster steht (alle 0,3 s geprüft, gesendet nur bei Änderung): die Zielbearbeitung
 * ihren Eingang, das Plenum sein Bild. Gibt die Abmeldung zurück.
 */
export function pultMelden(s: Sitzung, art: FensterArt): () => void {
  if (!imPultFrame) return () => {};
  let letzte = "";
  const melden = () => {
    let stand: PultStandZB | { bild: string } | Record<string, never>;
    if (art === "tt") {
      const sp = s.spiel(DIREKT_TEAM);
      const z = sp?.stand.zustand;
      stand = {
        lauf: sp?.stand.lauf ?? null,
        eingang: z ? warteschlange(z).filter((m) => !m.zurueckgestellt).length : 0,
        meldungen: z?.reihenfolge.length ?? 0,
        begonnen: !!z && (z.uhr.laeuft || z.uhr.t_s > 0 || z.ende),
        ende: !!z?.ende,
        rechnet: s.stand.ich.rechnet,
        entfernt: !!s.stand.ich.entfernt,
      };
    } else if (art === "plenum") {
      stand = { bild: plenumBild() };
    } else {
      stand = {};
    }
    const schl = JSON.stringify(stand);
    if (schl === letzte) return;
    letzte = schl;
    anPult("stand", { stand });
  };
  const id = setInterval(melden, 300);
  melden();
  return () => clearInterval(id);
}

/** Für das Pult: Nachricht aus einem Frame lesen (null, wenn sie nicht vom Pult-Protokoll ist). */
export function pultNachricht(d: unknown): { art: string; [k: string]: unknown } | null {
  return nachricht(d);
}
