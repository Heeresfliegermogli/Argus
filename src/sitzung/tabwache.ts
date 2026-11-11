// Tab-Wache (Liste K, K1.3): Seit K1.1 nimmt derselbe Browser in einer Sitzung dieselbe Kennung wieder. Zwei Tabs im selben Browser
// hätten damit dieselbe Kennung – beide würden das Spiel des Teams rechnen. Die Wache sorgt dafür, dass je Kennung genau ein Tab
// „Inhaber“ ist; ein zweiter Tab erfährt das beim Öffnen und sieht nur zu („Das Spiel läuft schon in einem anderen Tab dieses
// Browsers“). „hierher holen“ bittet den Inhaber abzugeben; der stoppt sauber und meldet „frei“.
//
// Weg: BroadcastChannel argus:tab:<name> (antwortet nur ein lebender Tab – ein geschlossener oder abgestürzter blockiert nichts).
// Ohne BroadcastChannel: Puls im localStorage (alle 1 s, gilt 3 s).
//   wer      ein Tab möchte Inhaber werden
//   ich      der Inhaber antwortet (oder meldet sich nach dem Beanspruchen)
//   abgeben  ein zweiter Tab bittet den Inhaber abzugeben
//   frei     der Inhaber hat abgegeben
import { zufall } from "../kern/ereignisse";

type Nachricht = { t: "wer" | "ich" | "abgeben" | "frei"; tab: string; seit?: number };

interface Kanal {
  postMessage(m: unknown): void;
  onmessage: ((ev: { data: unknown }) => void) | null;
  close(): void;
}

export type KanalFabrik = (name: string) => Kanal | null;

const standardKanal: KanalFabrik = (name) => {
  try {
    return typeof BroadcastChannel === "undefined" ? null : (new BroadcastChannel(name) as unknown as Kanal);
  } catch {
    return null;
  }
};

const PULS_MS = 1000;
const PULS_GILT_MS = 3000;

export class TabWache {
  readonly tab = zufall(8);
  private kanal: Kanal | null = null;
  private zustand: "neu" | "fragt" | "inhaber" | "zweiter" | "aus" = "neu";
  private seit = 0;
  private verloren: (() => void)[] = [];
  private entscheide: ((inhaber: boolean) => void) | null = null;
  private wartetAufFrei: (() => void) | null = null;
  private puls: ReturnType<typeof setInterval> | null = null;
  private readonly schluessel: string;
  private beiSchliessen = () => this.stoppen();

  constructor(
    name: string,
    private readonly kanalFabrik: KanalFabrik = standardKanal,
    private readonly speicher: Storage | undefined = (() => {
      try {
        return globalThis.localStorage;
      } catch {
        return undefined;
      }
    })(),
  ) {
    this.schluessel = `argus:tab:${name}`;
  }

  get inhaber(): boolean {
    return this.zustand === "inhaber";
  }

  /** Inhaber werden, wenn kein anderer Tab es schon ist. true = dieser Tab führt die Kennung. */
  async beanspruchen(wartenMs = 350): Promise<boolean> {
    if (this.zustand === "inhaber") return true;
    this.oeffnen();
    this.zustand = "fragt";
    if (!this.kanal) {
      // ohne BroadcastChannel: Puls eines anderen Tabs im Speicher?
      const p = this.pulsLesen();
      if (p && p.tab !== this.tab && Date.now() - p.puls < PULS_GILT_MS) {
        this.zustand = "zweiter";
        return false;
      }
      this.werdeInhaber();
      return true;
    }
    const ergebnis = new Promise<boolean>((ok) => {
      this.entscheide = ok;
      setTimeout(() => ok(true), wartenMs);
    });
    this.senden({ t: "wer", tab: this.tab });
    const ja = await ergebnis;
    this.entscheide = null;
    if (this.zustand !== "fragt") return this.inhaber; // inzwischen gestoppt oder unterlegen
    if (!ja) {
      this.zustand = "zweiter";
      return false;
    }
    this.werdeInhaber();
    return true;
  }

  /** Inhaber: wird gerufen, wenn ein anderer Tab die Kennung übernimmt („hierher holen“). Danach rechnet dieser Tab nicht mehr. */
  aufVerlust(cb: () => void): void {
    this.verloren.push(cb);
  }

  /**
   * Zweiter Tab: den Inhaber bitten abzugeben. Kommt „frei“ (oder antwortet niemand mehr), ist der Weg frei – der Aufrufer lädt die
   * Seite neu und wird dabei Inhaber.
   */
  async holen(wartenMs = 2000): Promise<void> {
    this.oeffnen();
    if (!this.kanal) {
      this.speicher?.removeItem(this.schluessel);
      return;
    }
    const frei = new Promise<void>((ok) => {
      this.wartetAufFrei = ok;
      setTimeout(ok, wartenMs);
    });
    this.senden({ t: "abgeben", tab: this.tab });
    await frei;
    this.wartetAufFrei = null;
  }

  stoppen(): void {
    if (this.zustand === "aus") return;
    const war = this.zustand;
    this.zustand = "aus";
    if (this.puls) clearInterval(this.puls);
    this.puls = null;
    if (war === "inhaber") {
      try {
        if (this.pulsLesen()?.tab === this.tab) this.speicher?.removeItem(this.schluessel);
      } catch {
        /* privater Modus */
      }
    }
    if (typeof window !== "undefined") window.removeEventListener("pagehide", this.beiSchliessen);
    this.kanal?.close();
    this.kanal = null;
  }

  private oeffnen(): void {
    if (this.kanal || this.zustand === "aus") return;
    this.kanal = this.kanalFabrik(this.schluessel);
    if (this.kanal) this.kanal.onmessage = (ev) => this.empfange(ev.data as Nachricht);
    if (typeof window !== "undefined") window.addEventListener("pagehide", this.beiSchliessen);
  }

  private werdeInhaber(): void {
    this.zustand = "inhaber";
    this.seit = Date.now();
    this.senden({ t: "ich", tab: this.tab, seit: this.seit });
    const schreiben = () => {
      try {
        this.speicher?.setItem(this.schluessel, JSON.stringify({ tab: this.tab, puls: Date.now() }));
      } catch {
        /* privater Modus */
      }
    };
    schreiben();
    this.puls = setInterval(schreiben, PULS_MS);
  }

  private pulsLesen(): { tab: string; puls: number } | null {
    try {
      return JSON.parse(this.speicher?.getItem(this.schluessel) ?? "null") as { tab: string; puls: number } | null;
    } catch {
      return null;
    }
  }

  private senden(n: Nachricht): void {
    try {
      this.kanal?.postMessage(n);
    } catch {
      /* Fenster wird gerade geschlossen */
    }
  }

  private abgeben(): void {
    if (this.zustand !== "inhaber") return;
    this.zustand = "zweiter";
    if (this.puls) clearInterval(this.puls);
    this.puls = null;
    try {
      this.speicher?.removeItem(this.schluessel);
    } catch {
      /* privater Modus */
    }
    this.verloren.forEach((cb) => cb());
  }

  private empfange(n: Nachricht): void {
    if (!n || n.tab === this.tab || this.zustand === "aus") return;
    switch (n.t) {
      case "wer":
        // Inhaber antwortet; fragen zwei Tabs gleichzeitig (Browser stellt Tabs wieder her), gewinnt die kleinere Tab-Kennung
        if (this.zustand === "inhaber" || (this.zustand === "fragt" && this.tab < n.tab)) this.senden({ t: "ich", tab: this.tab, seit: this.seit });
        else if (this.zustand === "fragt") this.entscheide?.(false);
        break;
      case "ich":
        if (this.zustand === "fragt") this.entscheide?.(false);
        // zwei Inhaber (ein eingefrorener Tab wacht wieder auf): der ältere gibt ab
        else if (this.zustand === "inhaber" && (n.seit ?? 0) >= this.seit) this.abgeben();
        break;
      case "abgeben":
        if (this.zustand === "inhaber") {
          this.abgeben();
          this.senden({ t: "frei", tab: this.tab });
        }
        break;
      case "frei":
        this.wartetAufFrei?.();
        break;
    }
  }
}
