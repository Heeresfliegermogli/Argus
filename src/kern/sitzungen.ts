// Sitzung, Teams und Rollen (Schritt 4b): Codes, Teamnamen, Teamfarben und die Frage „wer sitzt wo“.
// Reine Funktionen ohne Netz, damit Lobby, Spielleitung, Adapter und Tests dieselben Regeln nutzen.
//
// Eine Sitzung hat einen kurzen Code aus drei Zeichen (z. B. K7P). Die Teilnehmer geben ihn auf der Startseite
// ein und bilden in der Lobby Teams à drei (Aufklärung, Zielprüfung, Führung; intern g1, g2, g3). Fehlt jemand,
// übernimmt eine Person zwei oder drei Rollen (Doppelrolle). Jedes Team spielt dieselbe Lage in einem eigenen Spielstand.
import { type Rolle, zufall } from "./ereignisse";

export type GruppenRolle = "g1" | "g2" | "g3";
export const GRUPPEN_ROLLEN: GruppenRolle[] = ["g1", "g2", "g3"];

export function istGruppenRolle(r: unknown): r is GruppenRolle {
  return r === "g1" || r === "g2" || r === "g3";
}

// ---------------------------------------------------------------- Codes

/**
 * Pfadschlüssel einer Sitzung (Firebase, localStorage): Kleinbuchstaben, Ziffern, Bindestrich. Sitzungen der
 * Startseite haben seit B2 (25.10.2026) einen Code aus drei Zeichen (CODE_MUSTER); längere Schlüssel sind Räume
 * des Tests ohne Lobby (?raum=…, ab vier Zeichen).
 */
export const SITZUNG_MUSTER = /^[a-z0-9-]{3,32}$/;
/** Team-Kennung, z. B. tk3x9 („traum“ ist das Team des Direktaufrufs ohne Lobby). */
export const TEAM_MUSTER = /^t[a-z0-9]{4,8}$/;
export const TEAMNAME_MAX = 24;
export const SPIELERNAME_MAX = 40;
/** Team des Direktaufrufs …/?rolle=g1&raum=… (ein Team, ohne Lobby, wie bis Schritt 6). */
export const DIREKT_TEAM = "traum";

/**
 * Zeichen der Codes ohne verwechselbare Paare: kein 0/O/Q/D, 1/I/L, 2/Z, 5/S, 8/B, 6/G, U (zu V). Groß angezeigt,
 * klein gespeichert. 21 Zeichen ⇒ 9 261 Codes; beim Anlegen wird ein belegter Code verworfen.
 */
export const CODE_ZEICHEN = "ACEFHJKMNPRTVWXY34679";
export const CODE_LAENGE = 3;
/** Code einer Sitzung als Pfadschlüssel (klein), z. B. „k7p“ */
export const CODE_MUSTER = new RegExp(`^[${CODE_ZEICHEN.toLowerCase()}]{${CODE_LAENGE}}$`);

/** Neuer Code zur Anzeige, z. B. K7P. */
export function neuerCode(): string {
  let code = "";
  const werte = new Uint32Array(CODE_LAENGE);
  crypto.getRandomValues(werte);
  for (const w of werte) code += CODE_ZEICHEN[w % CODE_ZEICHEN.length];
  return code;
}

/** Code zur Anzeige (Großbuchstaben). */
export function codeAnzeige(schluessel: string): string {
  return schluessel.toUpperCase();
}

/**
 * Eingabe eines Teilnehmers in den Pfadschlüssel wandeln: drei Zeichen, Groß-/Kleinschreibung und Leerzeichen egal
 * („k 7 p“ → k7p). Gibt null zurück, wenn daraus kein gültiger Code wird.
 */
export function codeNormalisieren(eingabe: string): string | null {
  const k = eingabe.trim().toLowerCase().replace(/[\s._-]+/g, "");
  return CODE_MUSTER.test(k) ? k : null;
}

export function neueTeamId(): string {
  return `t${zufall(5)}`;
}

// ---------------------------------------------------------------- Teamnamen und Farben

/** Vorschläge für den Würfel – bewusst keine Namen aus der Lage (Vögel, Marder, Fuchs …). */
export const TEAMNAMEN = [
  "Orion", "Sirius", "Wega", "Atlas", "Polaris", "Kassiopeia", "Andromeda", "Lyra", "Pegasus", "Phönix",
  "Rigel", "Antares", "Deneb", "Castor", "Pollux", "Aldebaran", "Capella", "Altair", "Arktur", "Spica",
  "Draco", "Perseus", "Herkules", "Merkur", "Saturn", "Jupiter", "Titan", "Nova", "Komet", "Zenit",
];

/** Würfel: ein Name, der in der Sitzung noch nicht vergeben ist (sonst mit Nummer). */
export function teamnameVorschlag(vergeben: string[], zufallszahl: () => number = Math.random): string {
  const belegt = new Set(vergeben.map((n) => n.trim().toLowerCase()));
  const frei = TEAMNAMEN.filter((n) => !belegt.has(n.toLowerCase()));
  if (frei.length) return frei[Math.floor(zufallszahl() * frei.length) % frei.length];
  for (let i = 2; ; i++) {
    const n = `${TEAMNAMEN[Math.floor(zufallszahl() * TEAMNAMEN.length) % TEAMNAMEN.length]} ${i}`;
    if (!belegt.has(n.toLowerCase())) return n;
  }
}

/** Teamname bereinigen: Leerraum zusammenfassen, höchstens 24 Zeichen. Leer → null. */
export function teamnameBereinigt(name: string): string | null {
  const n = name.replace(/\s+/g, " ").trim().slice(0, TEAMNAME_MAX).trim();
  return n || null;
}

/**
 * Teamfarben: gut unterscheidbar auf dunklem Grund und weder Rollenfarbe (G1 blau, G2 violett,
 * G3 türkis) noch Signalfarbe (ARGUS-Bernstein, Rot, Grün). Erscheinen nie ohne den Teamnamen.
 */
export const TEAMFARBEN = ["#e8839b", "#e3d36b", "#a6cf5b", "#5ccfe0", "#8b93f0", "#d77ad6", "#d8dde3", "#b88b62"];

/** Erste Farbe, die noch kein Team hat (bei mehr als acht Teams wieder von vorn). */
export function freieFarbe(belegt: string[]): string {
  const set = new Set(belegt);
  return TEAMFARBEN.find((f) => !set.has(f)) ?? TEAMFARBEN[belegt.length % TEAMFARBEN.length];
}

// ---------------------------------------------------------------- Rollen im Team

/** Rollen als Text in der Datenbank: „g1“ oder „g1,g2“ (fest sortiert). */
export function rollenText(rollen: GruppenRolle[]): string {
  return GRUPPEN_ROLLEN.filter((r) => rollen.includes(r)).join(",");
}

export function rollenAus(text: string | undefined | null): GruppenRolle[] {
  if (!text) return [];
  const teile = text.split(",").map((x) => x.trim());
  return GRUPPEN_ROLLEN.filter((r) => teile.includes(r));
}

/** Rollen ohne G-Nummern (B3); kurz genug für Knöpfe und Chips. */
export const ROLLEN_KURZ: Record<GruppenRolle, string> = { g1: "Aufklärung", g2: "Zielprüfung", g3: "Führung" };

/** „Aufklärung · Zielprüfung“ */
export function rollenAnzeige(rollen: GruppenRolle[]): string {
  return rollen.map((r) => ROLLEN_KURZ[r]).join(" · ");
}

/** Absender-Rolle einer Aktion bei Doppelrolle: die erste eigene Rolle, die die Aktion darf. */
export function rolleFuerAktion(eigene: Rolle[], erlaubt: Rolle[]): Rolle | null {
  return eigene.find((r) => erlaubt.includes(r)) ?? null;
}
