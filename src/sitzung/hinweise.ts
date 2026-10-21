// Kurze Hinweise unten rechts im Fenster („gesendet“, „nicht ausgeführt: …“). Einer je Fenster,
// gemeinsam für Sitzung, Lobby und alle Team-Spiele des Fensters.
import type { Abmelden } from "../sync/adapter";

export interface Hinweis {
  id: number;
  art: "info" | "warnung" | "fehler";
  text: string;
}

export class Hinweisgeber {
  private nr = 0;
  private hoerer = new Set<() => void>();
  liste: Hinweis[] = [];

  abonnieren(cb: () => void): Abmelden {
    this.hoerer.add(cb);
    return () => this.hoerer.delete(cb);
  }

  hinweis(art: Hinweis["art"], text: string): void {
    const h = { id: ++this.nr, art, text };
    this.liste = [...this.liste.slice(-4), h];
    this.melden();
    setTimeout(() => {
      this.liste = this.liste.filter((x) => x.id !== h.id);
      this.melden();
    }, art === "fehler" ? 9000 : 6000);
  }

  private melden(): void {
    this.hoerer.forEach((cb) => cb());
  }
}
