// Ablage des eigenen Spiels auf dem Team-Laptop (seit 2.6, H1.3): Der Team-Laptop rechnet sein Spiel selbst und hält das Protokoll
// zuerst bei sich – jedes Ereignis sofort im localStorage, erst danach geht es (in Stücken) ins Netz. Fällt das Netz aus oder wird
// das Fenster neu geladen, geht nichts verloren: Beim Öffnen setzt das Spiel mit dem längeren der beiden Protokolle fort (Ablage
// oder hochgeladen) und lädt nach, was fehlt.
//
// Schlüssel: argus:v1:spiel:<sitzung>:<team>:<lauf>:<nnnn> – je 100 Ereignisse ein Stück (JSON-Liste); geschrieben wird nur das
// letzte Stück. Je Sitzung und Team bleiben die letzten drei Läufe.
//
// Im lokalen Modus (ein Rechner, Offline-Datei) liegt das „hochgeladene“ Protokoll ohnehin im localStorage; dort braucht es keine
// zweite Ablage (keineAblage).
import type { Ereignis } from "../kern/ereignisse";

export interface SpielAblage {
  /** Protokoll eines Laufs aus der Ablage (nach seq, lückenlos ab 1; leer, wenn nichts da ist). */
  lade(team: string, lauf: string): Ereignis[];
  /** Ereignisse anhängen (in seq-Reihenfolge, lückenlos an das Gespeicherte). */
  anhaengen(team: string, lauf: string, neu: Ereignis[]): void;
  /**
   * Protokoll eines Laufs ersetzen (Liste K, K2.2): Der rechnende Laptop übernimmt, was im Netz steht, wenn dort ein anderer
   * Spielstand weitergeführt wurde – sonst könnte er nie wieder hochladen.
   */
  ersetze(team: string, lauf: string, liste: Ereignis[]): void;
}

const STUECK = 100;
const MAX_LAEUFE = 3;

export const keineAblage: SpielAblage = {
  lade: () => [],
  anhaengen: () => {},
  ersetze: () => {},
};

export class SpeicherAblage implements SpielAblage {
  /** zuletzt bekannte Länge je Lauf (spart das Lesen beim Anhängen) */
  private laenge = new Map<string, number>();
  private gemeldet = false;

  constructor(private readonly sitzung: string, private readonly speicher: Storage = globalThis.localStorage) {}

  private praefix(team: string, lauf: string): string {
    return `argus:v1:spiel:${this.sitzung}:${team}:${lauf}:`;
  }

  lade(team: string, lauf: string): Ereignis[] {
    const p = this.praefix(team, lauf);
    const out: Ereignis[] = [];
    try {
      for (let i = 0; ; i++) {
        const roh = this.speicher.getItem(`${p}${String(i).padStart(4, "0")}`);
        if (roh === null) break;
        const teil = JSON.parse(roh) as Ereignis[];
        for (const e of teil) {
          if (e?.seq !== out.length + 1) {
            this.laenge.set(p, out.length);
            return out;
          }
          out.push(e);
        }
        if (teil.length < STUECK) break;
      }
    } catch {
      /* beschädigt: so viel wie lesbar */
    }
    this.laenge.set(p, out.length);
    return out;
  }

  anhaengen(team: string, lauf: string, neu: Ereignis[]): void {
    if (!neu.length) return;
    const p = this.praefix(team, lauf);
    let n = this.laenge.get(p);
    if (n === undefined) {
      this.aufraeumen(team, lauf);
      n = this.lade(team, lauf).length;
    }
    try {
      let i = 0;
      while (i < neu.length) {
        const nr = Math.floor(n / STUECK);
        const schl = `${p}${String(nr).padStart(4, "0")}`;
        const alt = n % STUECK ? (JSON.parse(this.speicher.getItem(schl) ?? "[]") as Ereignis[]) : [];
        const platz = STUECK - alt.length;
        const teil = neu.slice(i, i + platz);
        this.speicher.setItem(schl, JSON.stringify([...alt, ...teil]));
        n += teil.length;
        i += teil.length;
      }
      this.laenge.set(p, n);
    } catch (e) {
      // Speicher voll oder gesperrt: Das Spiel läuft weiter (Upload und Datei bleiben), einmal melden
      this.laenge.delete(p);
      if (!this.gemeldet) console.warn("ARGUS: Ablage des Spiels nicht möglich", e);
      this.gemeldet = true;
    }
  }

  ersetze(team: string, lauf: string, liste: Ereignis[]): void {
    const p = this.praefix(team, lauf);
    try {
      const weg: string[] = [];
      for (let i = 0; i < this.speicher.length; i++) {
        const k = this.speicher.key(i);
        if (k?.startsWith(p)) weg.push(k);
      }
      weg.forEach((k) => this.speicher.removeItem(k));
    } catch {
      /* gesperrt */
    }
    this.laenge.set(p, 0);
    this.anhaengen(team, lauf, liste);
  }

  /** Ältere Läufe dieses Teams entfernen (höchstens MAX_LAEUFE bleiben, der aktuelle immer). */
  private aufraeumen(team: string, aktuell: string): void {
    try {
      const p = `argus:v1:spiel:${this.sitzung}:${team}:`;
      const laeufe = new Set<string>();
      for (let i = 0; i < this.speicher.length; i++) {
        const k = this.speicher.key(i);
        if (k?.startsWith(p)) laeufe.add(k.slice(p.length).split(":")[0]);
      }
      const alt = [...laeufe].filter((l) => l !== aktuell).sort().reverse().slice(MAX_LAEUFE - 1);
      const weg: string[] = [];
      for (let i = 0; i < this.speicher.length; i++) {
        const k = this.speicher.key(i);
        if (k && alt.some((l) => k.startsWith(`${p}${l}:`))) weg.push(k);
      }
      weg.forEach((k) => this.speicher.removeItem(k));
    } catch {
      /* egal */
    }
  }
}

/** Protokoll als Datei (H1.3: „Protokoll als Datei speichern“ am Team-Laptop, „Protokoll laden“ bei der Spielleitung). */
export interface ProtokollDatei {
  format: "argus-protokoll/1";
  szenario: string;
  version: string;
  sitzung: string;
  team: string;
  /** Teamkennung (zum Zuordnen beim Laden) */
  team_id?: string;
  farbe?: string;
  lauf: string | null;
  exportiert: string;
  protokoll: Ereignis[];
}

export function protokollDatei(d: Omit<ProtokollDatei, "format" | "exportiert">): ProtokollDatei {
  return { format: "argus-protokoll/1", exportiert: new Date().toISOString(), ...d };
}

/** Datei herunterladen (Browser). */
export function speichereDatei(d: ProtokollDatei): void {
  const blob = new Blob([JSON.stringify(d, null, 1)], { type: "application/json" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  const team = d.team.replace(/[^A-Za-z0-9ÄÖÜäöüß-]+/g, "_");
  a.download = `argus-protokoll-${d.sitzung}-${team}-${d.lauf ?? "ohne-lauf"}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}

/** Protokolldatei lesen und prüfen (lückenlos ab seq 1). Wirft mit verständlichem Text. */
export function leseProtokollDatei(text: string): ProtokollDatei {
  let d: ProtokollDatei;
  try {
    d = JSON.parse(text) as ProtokollDatei;
  } catch {
    throw new Error("keine ARGUS-Protokolldatei (kein JSON)");
  }
  if (d?.format !== "argus-protokoll/1" || !Array.isArray(d.protokoll)) throw new Error("keine ARGUS-Protokolldatei");
  const liste = [...d.protokoll].sort((a, b) => a.seq - b.seq);
  liste.forEach((e, i) => {
    if (e?.seq !== i + 1) throw new Error(`Protokoll lückenhaft bei Ereignis ${i + 1}`);
  });
  return { ...d, protokoll: liste };
}
