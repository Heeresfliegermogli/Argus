// Gemerkte Sitzung eines Team-Fensters (Liste K, K1.1): Kennung und Team je Sitzung im localStorage dieses Browsers.
//
// Bis Stand J stand die Kennung eines Team-Fensters nur in der Adresse (ich=…). Wer den Tab schloss und über die Startseite neu kam,
// bekam eine neue Kennung – das geschlossene Fenster blieb für immer „der Laptop des Teams“, das neue durfte nur zuschauen. Jetzt
// nimmt derselbe Browser in derselben Sitzung dieselbe Kennung wieder (Startseite → Code, Lesezeichen, Browser neu gestartet) und ist
// sofort wieder der Laptop seines Teams.
//
// Schlüssel: argus:ich:<sitzung> (mit ?geraet=x für Tests und Vorführung: argus:ich:<sitzung>@x – so lassen sich an einem Rechner
// mehrere „Geräte“ in einem Browser nachstellen). Einträge älter als 12 h werden entfernt und gelten nicht mehr (Liste L, L5.1; bis Liste K 7 Tage).
export interface GemerkteSitzung {
  /** Pfadschlüssel der Sitzung, z. B. p9p */
  sitzung: string;
  /** Kennung des Fensters */
  client: string;
  /** Team, in dem das Fenster zuletzt war (nur Anzeige auf der Startseite; maßgeblich ist die Sitzung) */
  team: string | null;
  teamName: string | null;
  /** dieses Fenster hat das Spiel des Teams gerechnet (für den Hinweis „wird an einem anderen Laptop weitergeführt“) */
  rechnete: boolean;
  sync: "firebase" | "lokal";
  /** Ortszeit (ms) des letzten Schreibens */
  zeit: number;
}

const PRAEFIX = "argus:ich:";
/** Liste L (L5.1): 12 h statt 7 Tage – ein Merker vom Vortag führt nicht mehr in eine alte Sitzung. */
export const MERKER_MAX_ALTER_MS = 12 * 3600 * 1000;
const KENNUNG = /^[a-z0-9]{6}$/;

function schluessel(sitzung: string, geraet: string | null): string {
  return `${PRAEFIX}${sitzung}${geraet ? `@${geraet}` : ""}`;
}

function gueltig(g: unknown, sitzung?: string): g is GemerkteSitzung {
  const x = g as GemerkteSitzung | null;
  return !!x && typeof x.sitzung === "string" && (!sitzung || x.sitzung === sitzung) && typeof x.client === "string" && KENNUNG.test(x.client)
    && typeof x.zeit === "number" && (x.sync === "lokal" || x.sync === "firebase");
}

/** Merker eines Fensters für eine Sitzung (die Sitzung schreibt hinein, sobald sich Team oder „rechnet“ ändert). */
export class Merker {
  constructor(
    readonly sitzung: string,
    readonly geraet: string | null = null,
    private readonly speicher: Storage | undefined = (() => {
      try {
        return globalThis.localStorage;
      } catch {
        return undefined;
      }
    })(),
  ) {}

  lies(): GemerkteSitzung | null {
    try {
      const g = JSON.parse(this.speicher?.getItem(schluessel(this.sitzung, this.geraet)) ?? "null") as unknown;
      return gueltig(g, this.sitzung) && Date.now() - g.zeit <= MERKER_MAX_ALTER_MS ? g : null;
    } catch {
      return null;
    }
  }

  schreibe(g: Omit<GemerkteSitzung, "sitzung" | "zeit">): void {
    try {
      this.speicher?.setItem(schluessel(this.sitzung, this.geraet), JSON.stringify({ ...g, sitzung: this.sitzung, zeit: Date.now() } satisfies GemerkteSitzung));
    } catch {
      /* privater Modus, Speicher voll */
    }
  }

  vergiss(): void {
    try {
      this.speicher?.removeItem(schluessel(this.sitzung, this.geraet));
    } catch {
      /* privater Modus */
    }
  }
}

/** Alle gemerkten Sitzungen dieses Browsers (dieses „Geräts“), neueste zuerst; räumt Einträge älter als 12 h weg. */
export function gemerkteSitzungen(geraet: string | null = null, speicher: Storage | undefined = globalThis.localStorage): GemerkteSitzung[] {
  const out: GemerkteSitzung[] = [];
  const weg: string[] = [];
  try {
    if (!speicher) return [];
    for (let i = 0; i < speicher.length; i++) {
      const k = speicher.key(i);
      if (!k?.startsWith(PRAEFIX)) continue;
      const [, g = ""] = k.slice(PRAEFIX.length).split("@");
      let wert: unknown = null;
      try {
        wert = JSON.parse(speicher.getItem(k) ?? "null");
      } catch {
        /* beschädigt */
      }
      if (!gueltig(wert) || Date.now() - wert.zeit > MERKER_MAX_ALTER_MS) {
        weg.push(k);
        continue;
      }
      if (g === (geraet ?? "")) out.push(wert);
    }
    weg.forEach((k) => speicher.removeItem(k));
  } catch {
    return [];
  }
  return out.sort((a, b) => b.zeit - a.zeit);
}

/**
 * Liste L (L3.2): Notbremse „Alle Sitzungen beenden“ – dieser Browser vergisst ALLE gemerkten Sitzungen (argus:ich:*, auch die der
 * Test-„Geräte“) und die zuletzt genutzte Sitzung der Spielleitung.
 */
export function vergissAlleSitzungen(speicher: Storage | undefined = globalThis.localStorage): void {
  try {
    if (!speicher) return;
    const weg: string[] = [];
    for (let i = 0; i < speicher.length; i++) {
      const k = speicher.key(i);
      if (k && (k.startsWith(PRAEFIX) || k === "argus:einst:letzte_sitzung")) weg.push(k);
    }
    weg.forEach((k) => speicher.removeItem(k));
  } catch {
    /* privater Modus */
  }
}

/** Derselbe Kalendertag (Ortszeit)? L5.1: „Zurück zu Team …“ und „Zuletzt genutzt“ nur für Sitzungen von heute. */
export function selberTag(a: number, b: number = Date.now()): boolean {
  const x = new Date(a);
  const y = new Date(b);
  return x.getFullYear() === y.getFullYear() && x.getMonth() === y.getMonth() && x.getDate() === y.getDate();
}
