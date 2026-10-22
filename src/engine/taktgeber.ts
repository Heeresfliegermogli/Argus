// Gemeinsamer Takt für alle Team-Hosts im Fenster der steuernden Spielleitung.
// Ein Zeitgeber für alle Teams: Meldungen, Injects und Wirkungen werden in allen Teams im selben
// Durchgang fällig. Die Spielzeit selbst kommt weiter aus den Uhr-Ereignissen jedes Teams.
import type { Host } from "./host";

export class Taktgeber {
  private hosts = new Set<Host>();
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(private readonly taktMs = 250) {}

  anmelden(h: Host): void {
    this.hosts.add(h);
    // taktMs 0: kein Zeitgeber, jemand anderes ruft takt() auf (Tests mit gesteuerter Uhr)
    if (!this.timer && this.taktMs > 0) this.timer = setInterval(() => this.takt(), this.taktMs);
  }

  abmelden(h: Host): void {
    this.hosts.delete(h);
    if (!this.hosts.size && this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  get anzahl(): number {
    return this.hosts.size;
  }

  takt(): void {
    for (const h of [...this.hosts]) {
      if (h.aktiv) h.takt();
      else this.hosts.delete(h);
    }
  }

  stoppen(): void {
    this.hosts.clear();
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
