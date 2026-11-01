// EloKa wirkt global (seit Szenario 2.4, Änderung E4). Wie argus_lib.eloka_aktiv / argus_bei.
//
// Solange das EloKa-Fahrzeug (szenario.eloka.ziel) im Raum steht und nicht zerstört ist, ist der Datenlink der Drohne
// gestört: Alle Drohnenbilder rauschen und haben Streifen, das Bildalter steigt, und ARGUS ist unsicherer – die Konfidenz
// sinkt um konfidenz_minus, darunter unbekannt_unter erkennt ARGUS weder Klasse noch Zugehörigkeit („unbekannt“), die
// Empfehlung folgt den Schwellen (eine Warnung NICHT BEKÄMPFEN bleibt). Für ARGUS zählt der Stand zur Meldezeit (er steht
// als `gestoert` im Protokoll der Meldung), für das Bild der Augenblick: Zerstören stellt das Bild sofort wieder her.
// Auf der Karte gibt es keinen Effekt außer dem Zeichen des Fahrzeugs.
import type { ArgusAusgabe, Inhalte, Meldung } from "../inhalte/typen";
import { vorhanden } from "./geometrie";
import { argusEmpfehlung } from "./regeln";

/** Stört das EloKa-Fahrzeug zur Spielzeit t den Datenlink (im Raum und nicht zerstört)? */
export function elokaAktiv(inh: Inhalte, zerstoert: Record<string, number>, t: number): boolean {
  const e = inh.szenario.eloka;
  const z = e ? inh.ziele[e.ziel] : undefined;
  return !!z && vorhanden(z, t) && !((zerstoert[z.id] ?? Infinity) <= t);
}

/** ARGUS-Ausgabe einer Meldung: bei gestörtem Datenlink unsicherer (sonst die Daten). */
export function argusBei(inh: Inhalte, m: Meldung, gestoert: boolean | undefined): ArgusAusgabe {
  const e = inh.szenario.eloka;
  if (!gestoert || !e) return m.argus;
  const minus = e.konfidenz_minus;
  const konfidenz = Math.max(5, m.argus.konfidenz - minus);
  const unbekannt = konfidenz < e.unbekannt_unter;
  return {
    ...m.argus,
    konfidenz,
    ...(m.argus.einzeln ? { einzeln: m.argus.einzeln.map((k) => Math.max(5, k - minus)) } : {}),
    ...(unbekannt ? { klasse: "unbekannt", zugehoerigkeit: "unbekannt" } : {}),
    empfehlung: m.argus.empfehlung === "NICHT BEKÄMPFEN" ? "NICHT BEKÄMPFEN" : argusEmpfehlung(konfidenz, inh.regeln),
    gestoert: true,
  };
}

/** Bildalter in s, wie die Aufklärung es sieht (seit 2.4: Grundwert aus regeln.argus, bei gestörtem Datenlink mehr). */
export function bildalter(inh: Inhalte, m: Meldung, gestoert: boolean | undefined): number {
  const basis = m.sensor?.bildalter_s ?? inh.regeln.argus.bildalter_s ?? 3;
  return basis + (gestoert && inh.szenario.eloka ? inh.szenario.eloka.bildalter_plus_s : 0);
}

/** Stärke der Bildstörung durch EloKa zur Zeit t (0 = ungestört); für das Live-Drohnenbild. */
export function elokaStoerung(inh: Inhalte, zerstoert: Record<string, number>, t: number): number {
  return elokaAktiv(inh, zerstoert, t) ? inh.szenario.eloka!.bildstoerung : 0;
}
