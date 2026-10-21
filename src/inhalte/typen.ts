// Datenformate der Inhalte (JSON-Dateien in public/daten/).
//
// Die Typen beschreiben die Dateien so, wie Schritt 2 sie angelegt hat. Koordinaten in Metern,
// x nach Osten, y nach Süden, Ursprung oben links im Kartenausschnitt. Zeiten in Sekunden
// Spielzeit ab Spielbeginn (t_s), die Uhrzeit ergibt sich aus spieluhr.start + t_s.
// Neue Felder dürfen hinzukommen; der Code ignoriert, was er nicht kennt.

export type Punkt = [number, number];
/** Stützpunkt einer Route: [t_s, x, y] */
export type RoutenPunkt = [number, number, number];

export interface Bewegung {
  route: RoutenPunkt[];
}

// ---------------------------------------------------------------- Szenario

export type GtKategorie = "feind" | "verbuendet" | "zivil" | "geschuetzt" | "attrappe" | "ausser_gefecht";
export type PersonenArt = "zivil" | "soldat" | "besatzung_ergibt_sich";

export interface Person {
  art: PersonenArt | string;
  anzahl: number;
  /** davon Kinder (nur Darstellung im Drohnenbild) */
  klein?: number;
  pos: Punkt;
  ab_s?: number;
  bis_s?: number;
  text?: string;
  bewegung?: Bewegung;
}

export interface GroundTruth {
  kategorie: GtKategorie;
  text: string;
  legitim: boolean;
  hinweis?: string;
  bezug?: string;
}

export interface Ziel {
  id: string;
  typ: string; // Verweis auf katalog_fahrzeuge.json
  pos: Punkt; // Position zur Meldezeit
  hdg: number;
  ab_s?: number;
  bis_s?: number;
  gruppe?: string;
  /** Wird von ARGUS nie gemeldet; nur Spielleitung und Plenum sehen es. */
  ungemeldet?: boolean;
  bewegung?: Bewegung;
  personen?: Person[];
  gt: GroundTruth;
}

export type ArgusEmpfehlung = "BEKÄMPFEN" | "PRÜFEN" | "UNKLAR" | "NICHT BEKÄMPFEN";

export interface Sichtstoerung {
  art: "wolke" | "rauch" | "dunst" | "baeume" | "tarnnetz" | "stoerung" | "unschaerfe" | string;
  /** verdeckter Anteil: der Bildfläche (lage = Bildbereich) bzw. des Fahrzeugs (lage = "Ziel") */
  anteil: number;
  lage: string;
  /** nur Asset-Generator: wie viel des Ziels eine Bereichsstörung verdecken soll (Ziel am Wolkenrand) */
  ziel_anteil?: number;
  /** nur Asset-Generator: welche Fahrzeugseite eine Zielstörung verdeckt (vorn, hinten, links, rechts) */
  seite?: string;
}

/** Person nur für das Drohnenbild (zählt nicht für die Trefferregel), Lage relativ zum Fahrzeug. */
export interface BildPerson {
  bei: string;
  art: string;
  anzahl: number;
  /** [vorwärts, rechts] in Metern ab Fahrzeugmitte */
  versatz_m: Punkt;
  /** auf dem Fahrzeug (z. B. im Turmluk) */
  oben?: boolean;
}

export interface Meldung {
  id: string;
  t_s: number;
  ziele: string[];
  phase: number;
  fall?: string;
  /** Folgemeldung zu einer früheren Meldung (z. B. M21 zu M16). */
  folge_von?: string;
  argus: {
    klasse: string;
    konfidenz: number;
    empfehlung: ArgusEmpfehlung;
    hinweis?: string;
    einzeln?: number[];
  };
  sensor: {
    waerme: string;
    bewegung: string;
    spuren: string;
    kennzeichnung: string;
    personen: string;
    bildalter_s?: number;
  };
  bild: {
    /** Drohnenbild relativ zu assets/ (Manifest assets/manifest.json → drohne[Meldung]) */
    datei?: string;
    beschreibung: string;
    sicht: Sichtstoerung[];
    /** Bildbreite in Metern (Standard 130 m, mehrere Ziele 150 m) */
    ausschnitt_m?: number;
    /** Verschiebung der Bildmitte in Metern [Ost, Süd] */
    versatz_m?: Punkt;
    /** Darstellung je Ziel: luk_offen, feuert, furt, kette_ab, kisten */
    zustand?: Record<string, string>;
    personen?: BildPerson[];
  };
  loesung: { G1: string; G2: string; G3: string };
  zweck: string;
}

export type Bedingung =
  | { typ: "freigabe"; ziele: string[]; verzoegerung_s: number }
  | { typ: "freigabe_mit_zivil"; ziele: string[]; verzoegerung_s: number }
  | { typ: "keine_freigabe_bis"; ziele: string[]; t_s: number };

export interface Inject {
  id: string;
  /** Feste Zeit. Fehlt sie, ist der Inject bedingt (bedingung). */
  t_s?: number;
  an: string;
  von: string;
  text: string;
  zweck?: string;
  fall?: string;
  aktion?: string;
  bedingung?: Bedingung;
}

export interface ReserveInject {
  id: string;
  an: string;
  von: string;
  text: string;
  einsatz: string;
}

export interface Skriptereignis {
  id: string;
  name: string;
  fall?: string;
  bedingung: Bedingung;
  wirkungen: { t_s: number; von: string; ziel: string }[];
  regel: string;
  papier?: string;
}

export type Geometrie =
  | { typ: "polygon"; punkte: Punkt[] }
  | { typ: "polygone"; teile: Punkt[][] }
  | { typ: "kreis"; mitte: Punkt; radius_m: number };

export interface Zone {
  id: string;
  typ: "no_strike" | "einschraenkung";
  name: string;
  max_wirkradius_m?: number;
  geometrie: Geometrie;
  regel: string;
  entstehung?: string;
}

export interface Kraft {
  id: string;
  name: string;
  kurz: string;
  zugehoerigkeit: "eigen" | "feind" | "verbuendet";
  typ: string;
  ausserhalb?: boolean;
  pos: Punkt;
  pfeil_y?: number;
  text?: string;
}

export interface Phase {
  nr: number;
  name: string;
  von_s: number;
  bis_s: number;
  absicht: string;
}

export interface Lagetext {
  titel: string;
  absaetze: string[];
}

export interface Schluesselfall {
  id: string;
  reihenfolge: number;
  titel: string;
  meldung: string;
  ziele: string[];
  info_bei: string;
  info_kurz: string;
  kern: string;
  gut: string;
  leitfragen: string[];
  bezuege: string[];
}

export interface Nebenfall {
  id: string;
  titel: string;
  meldung: string;
  ziele: string[];
  kurz: string;
}

export interface Szenario {
  id: string;
  anzeige: string;
  titel: string;
  version: string;
  stand: string;
  fiktiv: string;
  kataloge: { karte: string; fahrzeuge: string; wirkmittel: string; regeln: string };
  spieluhr: { start: string; dauer_s: number; tempo: number };
  phasen: Phase[];
  ablauf_unterricht: { phase: string; dauer_min: number; inhalt: string }[];
  argus_system: { name: string; beschreibung: string; herstellerangabe: string; kleingedrucktes: string };
  lage: Record<string, Lagetext>;
  kraefte: Kraft[];
  zonen: Zone[];
  ziele: Ziel[];
  meldungen: Meldung[];
  injects: Inject[];
  reserve_injects: ReserveInject[];
  ereignisse: Skriptereignis[];
  schluesselfaelle: Schluesselfall[];
  nebenfaelle: Nebenfall[];
  anforderungen_technik?: { schritt: string; text: string }[];
  auswertung: { einstieg: string; kernaussage: string; schlussfrage: string };
}

// ---------------------------------------------------------------- Karte

export interface Karte {
  id: string;
  titel: string;
  version: string;
  hinweis?: string;
  ausdehnung_m: { breite: number; hoehe: number };
  raster: { zelle_m: number; spalten: string; zeilen_ab: number; regel?: string };
  /** Pfade relativ zu assets/ (alle Stufen im Asset-Manifest) */
  bilder: { hinweis?: string; luftbild: string; lagekarte: string; aufloesung_m_pro_px: number };
  linien: { id: string; name: string; art: string; breite_m: number; glatt?: boolean; allee?: boolean; punkte: Punkt[] }[];
  flaechen: { id: string; name: string; art: string; neu?: boolean; punkte: Punkt[] }[];
  gebaeude: { id: string; art: string; mitte: Punkt; laenge: number; breite: number; winkel: number }[];
  bebauung?: {
    hinweis: string;
    abschnitte?: { linie: string; x_von?: number; x_bis?: number; y_von?: number; y_bis?: number }[];
    abstand_m?: [number, number];
    schritt_m?: number;
  };
  einzelbaeume?: Punkt[];
  namen: { text: string; pos: Punkt; neu?: boolean }[];
  punkte: { id: string; name: string; pos: Punkt; art: string; neu?: boolean }[];
}

// ---------------------------------------------------------------- Kataloge

export interface Fahrzeug {
  id: string;
  name: string;
  argus_klasse: string | null;
  gepanzert: boolean;
  groesse_m: [number, number];
  symbol: { art: string };
  generator: string | null;
  sprite: string | null;
  sprite_wrack: string | null;
  farbe?: string;
  hinweis?: string;
}

export interface KatalogFahrzeuge {
  version: string;
  hinweis?: string;
  fahrzeuge: Fahrzeug[];
  personen: { id: string; name: string; darstellung: string; sprite?: string; sprite_tuch?: string }[];
}

export interface Wirkmittel {
  id: string;
  name: string;
  kurz: string;
  wirkradius_m: number;
  vorlauf_s: number;
  /** null = unbegrenzt */
  bestand: number | null;
  einsatzbereich: { x_max?: number; text: string } | null;
  effekt: string;
}

export interface KatalogWirkmittel {
  version: string;
  hinweis?: string;
  wirkmittel: Wirkmittel[];
}

export interface Regeln {
  version: string;
  argus: {
    schwellen: { bekaempfen: number; pruefen: number };
    empfehlungen: Record<string, string>;
    klassifiziert_nur: string;
  };
  fast_track: { schwelle: number; standard: boolean; schaltet: string; wirkung: string; mvp?: string };
  ablauf: unknown[];
  einsatzregeln: {
    regeln: { id: string; text: string; prueft: string; maschinell?: boolean }[];
    verstoss: string;
    sicherheitsabstand_eigene_kraefte_m?: number;
  };
  wirkung: { trefferregel: string; begruendung: string; bewegung_mvp: string; unbearbeitet: string };
  kennzahlen: { id: string; text: string }[];
  eigene_kraefte?: string;
}

// ---------------------------------------------------------------- Geladene Inhalte

/** Alles, was ein Spiel braucht, mit Nachschlage-Tabellen. Wird einmal geladen und nie verändert. */
export interface Inhalte {
  szenario: Szenario;
  karte: Karte;
  fahrzeuge: Record<string, Fahrzeug>;
  wirkmittel: Record<string, Wirkmittel>;
  regeln: Regeln;
  ziele: Record<string, Ziel>;
  meldungen: Record<string, Meldung>;
  /** feste, bedingte und Reserve-Injects */
  injects: Record<string, Inject | ReserveInject>;
}
