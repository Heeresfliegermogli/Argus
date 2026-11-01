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
  /** Seit 2.4 (S8): sitzen im Fahrzeug – zählen für die Trefferregel, im Drohnenbild nicht als Figuren */
  im_fahrzeug?: boolean;
}

export interface GroundTruth {
  kategorie: GtKategorie;
  text: string;
  legitim: boolean;
  hinweis?: string;
  bezug?: string;
  /** Seit Szenario 2.0: Zustandswechsel im Gefecht. gt gilt ab ab_s, davor vorher (z. B. Z-24 erst ab 10:19:30 außer Gefecht). */
  ab_s?: number;
  vorher?: Omit<GroundTruth, "ab_s" | "vorher">;
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
  /** Seit Szenario 2.1: Schussrhythmus (Mündungsblitz, Abschussrauch), solange das Fahrzeug steht */
  feuert?: Feuer[];
  /** Seit 2.1: Kampffahrzeug ohne Durchbruch (Auftrag, z. B. Beobachtungsposten); nur Text für die Prüfung */
  kein_durchbruch?: string;
  /** Seit 2.3 (D2): Schaden je Schuss an den eigenen Zügen in Promille, abweichend vom Typ (regeln.verluste.waffen) */
  verlust_promille?: number;
  /** Seit 2.4 (S6): Personen, die aus einem Fahrzeug kommen (abgesessene Schützen) – erscheinen dort, nicht am Kartenrand */
  herkunft?: string;
  /** Seit 2.4 (S7): steigt in diesem Gebäude der Karte auf (Beobachter im Kirchturm) – erscheint dort, nicht am Kartenrand */
  im_gebaeude?: string;
  /** Seit 2.4 (S8): von ARGUS nie gemeldet, aber kein ungemeldetes Ziel – steht als Kontakt auf den Karten (Grund) */
  nur_kontakt?: string;
}

/** Seit 2.4 (E6.3): was im Drohnenbild erkennbar sein muss (statt Sensordaten), geprüft mit tools/drohne_probe.py */
export interface BildMerkmal {
  art: "attrappe" | "rotes_kreuz" | "sanitaeter" | "zivilpersonen" | "weisses_tuch" | "kette_ab" | "verwundete" | "press" | "beobachter" | "mast" | "heck" | "tarnung" | string;
  ziel: string;
  anzahl?: number;
  klein?: number;
  text: string;
}

/** Feuerstöße von von_s bis bis_s: je `salve` Schuss im Abstand takt_s, dann pause_s (Mörser: Rohre im Wechsel). */
export interface Feuer {
  von_s: number;
  bis_s: number;
  takt_s: number;
  salve?: number;
  pause_s?: number;
  /** Seit 2.3 (D2): Zug der eigenen Truppe, auf den das Feuer liegt (Mörser); sonst der Zug im Gefechtsstreifen */
  auf?: string;
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
  /** Seit 2.2 (C3): Die Pause vor dieser Meldung ist länger als 60 s und gewollt (Grund) */
  pause_gewollt?: string;
  argus: ArgusAusgabe;
  /** Seit 2.4 (E6.3): nur noch für Spielleitung und Drehbuch; die Spieler sehen keine Sensordaten */
  sensor: {
    waerme: string;
    bewegung: string;
    spuren: string;
    kennzeichnung: string;
    personen: string;
    bildalter_s?: number;
    hinweis?: string;
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
    /** Seit 2.4 (E6.3): Merkmale, die im Bild erkennbar sind (Attrappe, Rotes Kreuz, Kinder, Verwundete, PRESS …) */
    merkmale?: BildMerkmal[];
  };
  /** wirkmittel (seit 2.4): Wirkmittel der Lösung (Modellteam „ideal“ nimmt nur diese) */
  loesung: { G1: string; G2: string; G3: string; wirkmittel?: string[] };
  zweck: string;
  /** nur Meldungen einer Verstärkung: Gruppe (V-1 …), gesetzt beim Einspielen (src/kern/welt.ts) */
  verstaerkung?: string;
}

/** ARGUS-Ausgabe einer Meldung (seit 2.4: Klasse Panzer/Fahrzeug/Infanterie oder „unbekannt“, Zugehörigkeit Feind/unbekannt). */
export interface ArgusAusgabe {
  klasse: string;
  /** Seit 2.4 (E6.2): Zugehörigkeit laut ARGUS („Feind“, „unbekannt“) */
  zugehoerigkeit?: string;
  konfidenz: number;
  empfehlung: ArgusEmpfehlung;
  hinweis?: string;
  einzeln?: number[];
  /** Seit 2.4 (E4): Ausgabe bei gestörtem Datenlink (EloKa) – siehe kern/eloka.ts */
  gestoert?: boolean;
}

export type Bedingung =
  | { typ: "freigabe"; ziele: string[]; verzoegerung_s: number }
  | { typ: "freigabe_mit_zivil"; ziele: string[]; verzoegerung_s: number }
  | { typ: "keine_freigabe_bis"; ziele: string[]; t_s: number }
  /** Seit 2.4 (S8): eine eigene Wirkung trifft eines der Ziele oder Personen bei ihm – verzoegerung_s nach diesem Einschlag */
  | { typ: "treffer"; ziele: string[]; verzoegerung_s: number };

/** Seit Szenario 2.1: Lagemeldung, wenn eine nicht aufgehaltene Feindgruppe über den Bach durchbricht (I-13). */
export type BedingungDurchbruch = { typ: "durchbruch"; verzoegerung_s: number };

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
  bedingung?: Bedingung | BedingungDurchbruch;
  /** Seit 2.3 (D3.2): Der Text nennt den Stand dieses Zuges ({zug}, {kk}, {verw}); {kp_kk}, {kp_verw} für die Kompanie */
  verluste_zug?: string;
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

// ---------------------------------------------------------------- Hintergrundgefecht und Verstärkungen (seit Szenario 2.0)

/** Feindartillerie: Einschläge [t_s, x, y] (Darstellung, trifft keine Spielobjekte). */
export interface HgArtillerie {
  id: string;
  t_s: number;
  art: "feindartillerie";
  ziel?: string;
  einschlaege: RoutenPunkt[];
  text: string;
}

/** Eigene Panzerabwehr: wirkt nur, wenn das Ziel dann noch steht und diesseits der Einsatzgrenze liegt. */
export interface HgPanzerabwehr {
  id: string;
  t_s: number;
  art: "panzerabwehr";
  /** schießende Kraft: seit 2.3 ein Zug der eigenen Truppe (Leuchtspur aus seiner Stellung), früher kraefte[].id (Westrand) */
  von: string;
  ziel: string;
  folge: "zerstoert" | "ausser_gefecht";
  text: string;
}

/** Rauch (Darstellung). */
export interface HgRauch {
  id: string;
  t_s: number;
  art: "rauch";
  von?: string;
  pos: Punkt;
  radius_m: number;
  dauer_s: number;
  text: string;
}

export type HintergrundEreignis = HgArtillerie | HgPanzerabwehr | HgRauch;

/** Meldung einer Verstärkung: Zeit relativ zum Einspielen (dt_s). */
export type VerstaerkungsMeldung = Omit<Meldung, "t_s" | "phase" | "verstaerkung"> & { dt_s: number; phase?: number };

export interface Verstaerkung {
  id: string;
  name: string;
  kurz: string;
  dauer_s: number;
  zweck: string;
  /** Einspielzeiten [von, bis] in s, zu denen ein Fahrzeug einem geschützten Objekt zu nahe käme */
  nicht_einspielen?: [number, number][];
  /** Ziele mit Routen relativ zum Einspielen ([dt_s, x, y]) */
  ziele: Ziel[];
  meldungen: VerstaerkungsMeldung[];
  /** Seit 2.1: Durchbruch, wenn der Zug nicht aufgehalten wird (Zeiten relativ zum Einspielen) */
  durchbruch?: DurchbruchPlan;
}

/** Durchbruch einer Feindgruppe (seit Szenario 2.1): ab t_s fährt jedes Fahrzeug seine Route über Brücke oder Furt
 * westlich aus dem Bild; ueber_s = Zeitpunkt über dem Bach. Nur, wenn bis t_s kein Fahrzeug zerstört oder außer Gefecht ist. */
export interface DurchbruchPlan {
  t_s: number;
  ueber: string;
  routen: Record<string, RoutenPunkt[]>;
  ueber_s: Record<string, number>;
}

export interface DurchbruchGruppe extends DurchbruchPlan {
  id: string;
  name: string;
  ziele: string[];
  zweck?: string;
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
  /** nur Darstellung: Lage der Beschriftung auf der Lagekarte (sonst berechnet) */
  beschriftung?: Punkt;
  /** Seit 2.1: sichtbarer Name („Schule“, „Ortschaft“); die ID bleibt intern */
  kurz?: string;
}

/** Seit 2.3 (D1): Zug der eigenen 2. Kompanie in Stellung am Westrand. */
export interface EigenerZug {
  id: string;
  name: string;
  kurz: string;
  ort: string;
  /** Fahrzeugpositionen in Metern */
  fahrzeuge: Punkt[];
  /** Blickrichtung in Grad (0 = Osten) */
  hdg: number;
  /** Gefechtsstreifen [y_von, y_bis): Feinde darin schießen auf diesen Zug */
  streifen?: [number, number];
}

export interface EigeneTruppe {
  hinweis?: string;
  kompanie: string;
  name: string;
  /** Fahrzeugtyp im Katalog (Sprite in Stellung) */
  fahrzeug: string;
  gefechtsstand: { name: string; pos: Punkt };
  zuege: EigenerZug[];
}

/** Seit 2.3 (D2, D3, D5): szenariobezogene Teile des Verlustmodells. */
export interface SzenarioVerluste {
  hinweis?: string;
  /** Wirkung auf die Attrappe verrät die Stellung: Einschläge [dt_s, dx, dy] relativ zur Zugmitte ab Einschlag + verzoegerung_s */
  attrappe?: { ziel: string; zug: string; verzoegerung_s: number; einschlaege: RoutenPunkt[] };
  /** Übergang (Brücke ELSTER, Furt Nord) → Zug, den ein Durchbruch trifft */
  durchbruch?: Record<string, string>;
  /** Herkunft des Feuers in den Meldungen („aus Hof RABE“) */
  orte?: { text: string; pos: Punkt; radius_m?: number }[];
  meldungen?: {
    von: string;
    kennung: string;
    texte: Record<string, string>;
    waffe: Record<string, string>;
    forderung: Record<string, string>;
  };
  auswertung?: { titel: string; leitfragen: { weniger: string; mehr: string }; offenlegung: string; bezuege: string[] };
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
  /** Seit 2.4 (E5): im Replay der Auswertung nur, wenn die Spielleitung den Fall zuschaltet */
  zuschaltbar?: boolean;
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
  spieluhr: { start: string; dauer_s: number; tempo: number; pause_gewollt_ende?: string };
  phasen: Phase[];
  ablauf_unterricht: { phase: string; dauer_min: number; inhalt: string }[];
  argus_system: { name: string; beschreibung: string; herstellerangabe: string; kleingedrucktes: string; kleingedrucktes_kurz?: string };
  lage: Record<string, Lagetext>;
  kraefte: Kraft[];
  zonen: Zone[];
  ziele: Ziel[];
  meldungen: Meldung[];
  injects: Inject[];
  reserve_injects: ReserveInject[];
  ereignisse: Skriptereignis[];
  hintergrund?: { hinweis?: string; ereignisse: HintergrundEreignis[] };
  verstaerkungen?: { hinweis?: string; gruppen: Verstaerkung[] };
  /** Seit 2.1: Gruppen, die durchbrechen, wenn sie nicht aufgehalten werden */
  durchbruch?: { hinweis?: string; gruppen: DurchbruchGruppe[] };
  /** Seit 2.3 (D1): eigene 2. Kompanie mit drei Zügen am Westrand */
  eigene_truppe?: EigeneTruppe;
  /** Seit 2.3 (D2): szenariobezogene Teile des Verlustmodells */
  verluste?: SzenarioVerluste;
  /** Seit 2.4 (E4): EloKa-Fahrzeug, das den Datenlink stört (alle Bilder, ARGUS unsicherer) */
  eloka?: EloKa;
  schluesselfaelle: Schluesselfall[];
  nebenfaelle: Nebenfall[];
  anforderungen_technik?: { schritt: string; text: string }[];
  auswertung: {
    einstieg: string; kernaussage: string; schlussfrage: string;
    /** Seit 2.4 (E5): Replay-Reihenfolge (Standard) und zuschaltbare Fälle, Zeitbudget in s */
    replay?: { standard: string[]; zuschaltbar: string[]; budget_s: number; hinweis?: string };
  };
}

/** Seit 2.4 (E4): Solange das Ziel im Raum steht und nicht zerstört ist, ist der Datenlink gestört. */
export interface EloKa {
  hinweis?: string;
  ziel: string;
  /** ARGUS: Konfidenz sinkt um diesen Wert … */
  konfidenz_minus: number;
  /** … darunter Klasse und Zugehörigkeit „unbekannt“ */
  unbekannt_unter: number;
  /** Stärke der Bildstörung (Rauschen, Streifen) im Live-Drohnenbild, 0–1 */
  bildstoerung: number;
  /** so viel älter ist jedes Bild */
  bildalter_plus_s: number;
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
  /** beschriftung_anteil: Lage des Namens entlang der Linie (Anteil der Länge, Standard 0,4) */
  linien: { id: string; name: string; art: string; breite_m: number; glatt?: boolean; allee?: boolean; punkte: Punkt[]; beschriftung_anteil?: number }[];
  flaechen: { id: string; name: string; art: string; neu?: boolean; punkte: Punkt[] }[];
  gebaeude: { id: string; art: string; mitte: Punkt; laenge: number; breite: number; winkel: number }[];
  bebauung?: {
    hinweis: string;
    abschnitte?: { linie: string; x_von?: number; x_bis?: number; y_von?: number; y_bis?: number }[];
    abstand_m?: [number, number];
    schritt_m?: number;
  };
  einzelbaeume?: Punkt[];
  /** anker: Bezugspunkt des Textes ([0,0] links oben … [1,1] rechts unten), Standard Mitte */
  namen: { text: string; pos: Punkt; neu?: boolean; anker?: Punkt }[];
  punkte: { id: string; name: string; pos: Punkt; art: string; neu?: boolean }[];
}

// ---------------------------------------------------------------- Kataloge

export interface Fahrzeug {
  id: string;
  name: string;
  argus_klasse: string | null;
  gepanzert: boolean;
  groesse_m: [number, number];
  /**
   * Taktisches Zeichen: sidc = Funktionsteil nach MIL-STD-2525C/APP-6 (z. B. „EVAT“ Kampfpanzer),
   * groesse = Größenangabe (z. B. „E“ Kompanie). Zugehörigkeit und Status setzt die Oberfläche.
   */
  symbol: { art: string; sidc?: string; groesse?: string; einheit?: string };
  generator: string | null;
  sprite: string | null;
  sprite_wrack: string | null;
  /** Seit Katalog 1.3: Sprite während der Fahrt (Mörsertrupp auf Lkw); im Stand `sprite` */
  sprite_fahrt?: string | null;
  /** Seit Katalog 1.5: „keiner“ – das Ziel feuert nicht selbst (Beobachter lenkt Artillerie): kein Mündungsblitz */
  feuer_effekt?: string;
  farbe?: string;
  hinweis?: string;
}

export interface KatalogFahrzeuge {
  version: string;
  hinweis?: string;
  /** Seit 1.3 (C7): Größenangabe nach APP-6 je Anzahl noch stehender Fahrzeuge einer zugweisen Meldung („2“ → „C“) */
  groesse_nach_anzahl?: Record<string, string>;
  /** Seit 1.5 (E6.2): die drei ARGUS-Klassen mit taktischem Zeichen (sidc) und Zeichen der Einheit für Zugmeldungen */
  klassen?: Record<string, ArgusKlasse>;
  fahrzeuge: Fahrzeug[];
  personen: { id: string; name: string; darstellung: string; sprite?: string; sprite_tuch?: string }[];
}

export interface ArgusKlasse {
  text: string;
  sidc: string;
  einheit?: string;
}

export interface Wirkmittel {
  id: string;
  name: string;
  kurz: string;
  wirkradius_m: number;
  /** Zeit von der Freigabe bis zum Einschlag (ohne `flug`) */
  vorlauf_s: number;
  vorlauf_text?: string;
  /** Flugkörper (LM): Startpunkt westlich der Karte, Geschwindigkeit, Startvorbereitung; Einschlagzeit hängt vom Ziel ab */
  flug?: { start: Punkt; geschwindigkeit_mps: number; vorbereitung_s?: number };
  /** null = unbegrenzt */
  bestand: number | null;
  einsatzbereich: { x_max?: number; text: string } | null;
  effekt: string;
  /** Seit 2.2 (C6): trifft von den Fahrzeugen nur das bekämpfte (LM); Personen im Wirkradius schon */
  nur_zielfahrzeug?: boolean;
  /** Seit 2.3 (Szenario 2.4, E3): Wirkung auf einen Zug – je_fahrzeug (ein Schuss je Fahrzeug im Abstand abstand_s) oder flaeche */
  zug?: { art: "je_fahrzeug" | "flaeche"; abstand_s?: number };
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
    /** Seit 2.4: Bildalter ohne Störung (s) */
    bildalter_s?: number;
    klassen?: string;
    eloka?: string;
  };
  /** Seit 2.4 (E1): Schalter der Spielleitung */
  spielleitung?: { verstaerkung_menue: boolean; hinweis?: string };
  fast_track: { schwelle: number; standard: boolean; schaltet: string; wirkung: string; mvp?: string };
  ablauf: unknown[];
  einsatzregeln: {
    regeln: { id: string; text: string; prueft: string; maschinell?: boolean }[];
    verstoss: string;
    sicherheitsabstand_eigene_kraefte_m?: number;
  };
  wirkung: { trefferregel: string; begruendung: string; bewegung_mvp?: string; unbearbeitet: string; durchbruch?: string };
  kennzahlen: { id: string; text: string }[];
  eigene_kraefte?: string;
  /** Seit 2.3 (D2): Verlustmodell der eigenen Kompanie */
  verluste?: RegelnVerluste;
}

export type VerlustArt = "direkt" | "steil" | "artillerie" | "attrappe" | "durchbruch" | "beobachter";

export interface RegelnVerluste {
  hinweis?: string;
  untergrenze_prozent: number;
  promille_je_verwundeter: number;
  schwellen_prozent: number[];
  verzug_s: { direkt: number; steil: number; beobachter?: number };
  waffen: Record<string, { art: "direkt" | "steil" | "beobachter"; promille: number; takt_s?: number; feuerbereit_s?: number; reichweite_m?: number }>;
  feindartillerie: { promille: number; radius_m: number };
  attrappe: { promille: number };
  durchbruch: { promille: number };
  versatz_m: Punkt[];
  meldungen: { je_verwundete: number; abstand_zug_s: number; abstand_alle_s: number; abstand_limit_s: number; fenster_s: number; sofort?: string[] };
}

// ---------------------------------------------------------------- Geladene Inhalte

/** Alles, was ein Spiel braucht, mit Nachschlage-Tabellen. Wird einmal geladen und nie verändert. */
export interface Inhalte {
  szenario: Szenario;
  karte: Karte;
  fahrzeuge: Record<string, Fahrzeug>;
  /** Größenangabe je Anzahl (Katalog groesse_nach_anzahl, C7) */
  groessen?: Record<string, string>;
  /** Seit 2.4 (E6.2): ARGUS-Klassen mit Zeichen (Katalog klassen) */
  klassen?: Record<string, ArgusKlasse>;
  wirkmittel: Record<string, Wirkmittel>;
  regeln: Regeln;
  ziele: Record<string, Ziel>;
  meldungen: Record<string, Meldung>;
  /** feste, bedingte und Reserve-Injects */
  injects: Record<string, Inject | ReserveInject>;
  /** nur in der Welt eines Teams (src/kern/welt.ts): die Inhalte ohne Verstärkungen und was eingespielt ist */
  basis?: Inhalte;
  eingespielt?: { gruppe: string; t0: number }[];
  /** nur in der Welt eines Teams: Durchbruch-Gruppen, deren Fahrzeuge ihre Durchbruch-Route fahren */
  durchgebrochen?: string[];
}
