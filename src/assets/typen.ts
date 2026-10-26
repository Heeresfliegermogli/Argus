// Format von public/assets/manifest.json (erzeugt mit tools/assets/gen_assets.py).
// Pfade sind relativ zu assets/. Koordinaten in Metern (x Ost, y Süd), Bildpositionen in Pixeln
// des jeweiligen Bildes. Neue Felder dürfen hinzukommen.

export interface BildStufe {
  datei: string;
  m_pro_px: number;
  breite: number;
  hoehe: number;
  bytes: number;
}

export interface Kartenpaket {
  id: string;
  ausdehnung_m: { breite: number; hoehe: number };
  luftbild: {
    stufen: BildStufe[];
    kacheln: { muster: string; m_pro_px: number; kachel_px: number; spalten: number; zeilen: number; bytes: number };
  };
  topo: BildStufe;
  lagekarte: BildStufe & { hinweis?: string };
  gelaende: { datei: string; bytes: number };
}

export interface BildZiel {
  id: string;
  /** Mitte des Fahrzeugs im Bild (px) */
  mitte: [number, number];
  hdg: number;
  /** Rahmen der ARGUS-Markierung: x, y, Breite, Höhe in px */
  box: [number, number, number, number];
  /** verdeckter Anteil des Fahrzeugs (0…1, gemessen) */
  verdeckt: number;
  kennzeichen_verdeckt?: number;
}

export interface BildSicht {
  art: string;
  lage: string;
  anteil: number;
  anteil_ist?: number;
  bezug?: "Bildfläche" | "Ziel" | "Stärke";
  ziel_anteil?: number;
  ziel_ist?: number;
  seite?: string;
}

/** Fahrzeug im Live-Drohnenbild (Schritt 5b): Sprite aus dem Fahrzeug-Atlas zur Meldezeit. */
export interface EbenenFahrzeug {
  id: string;
  /** Rahmen im Fahrzeug-Atlas zur Meldezeit: intakt, Zustand (z. B. kpz_t72_kette_ab.png) oder Wrack */
  sprite: string;
  /** nach dem Hintergrundgefecht zur Meldezeit */
  zustand: "intakt" | "zerstoert" | "ausser_gefecht";
  hauptziel: boolean;
  /** Lage zur Meldezeit im Bild (px) */
  mitte: [number, number];
  hdg: number;
  /** bild.zustand bzw. Zustand nach Treffer (luk_offen, kette_ab, feuert, kisten, furt) */
  darstellung?: string;
  seit_s?: number | null;
  /** Effekte am Fahrzeug (Namen im Effekt-Atlas), z. B. Feuer und Rauch auf dem Wrack, Mündungsblitz */
  effekte?: string[];
}

/** Person im Live-Drohnenbild: Lage = Bezugspunkt zur Spielzeit + Versatz. */
export interface EbenenFigur {
  bei: string;
  art: string;
  /** Personen-Variante im Fahrzeug-Atlas (Farbe, Kind, weißes Tuch) */
  sprite: string;
  /** gruppe: Position von ziel.personen[gruppe] + versatz_m (x Ost, y Süd); fahrzeug: Fahrzeugmitte + versatz_m (vorwärts, rechts), mit hdg gedreht */
  bezug: "gruppe" | "fahrzeug";
  gruppe?: number;
  versatz_m: [number, number];
  /** Blickrichtung der Figur (Grad, Sprite darum drehen) */
  hdg: number;
  /** Lage zur Meldezeit im Bild (px) */
  px: [number, number];
  klein?: boolean;
  tuch?: boolean;
  /** steht auf dem Fahrzeug (über dem Sprite, ohne Schatten) */
  oben?: boolean;
  haende_hoch?: boolean;
}

/** Drohnenbild als Ebenen für das Live-Drohnenbild (Konzept v2, Abschnitt 6). */
export interface DrohnenEbenen {
  boden: string;
  kronen: string | null;
  stoerung: string | null;
  bytes: number;
  fahrzeuge: EbenenFahrzeug[];
  figuren: EbenenFigur[];
  /** verdeckter Anteil je Hauptziel durch Kronen und Störung zur Meldezeit (gemessen) */
  verdeckt: Record<string, number>;
  /** je "Ziel/art" mittlerer verdeckter Anteil der Figuren */
  figuren_verdeckt: Record<string, number>;
  kennzeichen_verdeckt?: number;
  unschaerfe?: { ziel: string; laenge_m: number; laenge_px: number; winkel: number; rand_m: number; hinweis: string };
  /** Stärke der Bildstörung (Rauschen und Zeilenversatz zeichnet die Oberfläche) */
  bildstoerung?: number;
}

export interface DrohnenEbenenInfo {
  hinweis: string;
  /** gemeinsame Kamera-Ebene (Vignette) über allem */
  kamera: string;
  kamera_bytes: number;
  /** Kamerafarbe für Sprites und Effekte, PixiJS ColorMatrixFilter (4 × 5) */
  farbmatrix: number[][];
  farbmatrix_hinweis: string;
  person_ueberhoehung: number;
  schatten: { fahrzeug_m: number; person_m: number; alpha: number; unschaerfe_m: number; hinweis: string };
  figuren: string;
  budget_bytes: { je_ebene: Record<string, number>; je_meldung: number };
}

export interface Drohnenbild {
  datei: string;
  breite: number;
  hoehe: number;
  /** Bildzeit; bei Verstärkungen relativ zum Einspielen (relativ = true) */
  t_s: number;
  /** Uhrzeit der Bildzeit; null bei Verstärkungen (Uhrzeit ergibt sich erst beim Einspielen) */
  uhr: string | null;
  pq: string;
  ausschnitt_m: { x: number; y: number; breite: number; hoehe: number };
  m_pro_px: number;
  ziele: BildZiel[];
  objekte: { id: string; mitte: [number, number]; hdg: number; zustand?: "zerstoert" | "ausser_gefecht" }[];
  personen: { bei: string; art: string; anzahl: number; verdeckt: number; punkte: [number, number][] }[];
  sicht: BildSicht[];
  bytes: number;
  nur_spielleitung?: boolean;
  /** Ebenen für das Live-Drohnenbild (alle Meldungen und Verstärkungen, nicht die Bilder der Spielleitung) */
  ebenen?: DrohnenEbenen;
  relativ?: boolean;
  verstaerkung?: string;
  /** Wracks mit Rauchfahne im Standbild (staerke 0…1, weniger, wenn sie ein Ziel verdecken würde) */
  wracks?: { id: string; staerke: number }[];
}

export interface SpriteRahmen {
  px_pro_m: number;
  groesse_m: [number, number];
  typ?: string;
  wrack?: boolean;
  zustand?: string;
  person?: string;
  variante?: boolean;
  klein?: boolean;
  tuch?: boolean;
  luftfahrzeug?: string;
}

export interface Atlas {
  bild: string;
  json: string;
  breite: number;
  hoehe: number;
  bytes: number;
}

export interface Effekt {
  bilder: number;
  /** Breite in px bzw. m; Höhe gleich, wenn hoehe_px fehlt */
  px: number;
  groesse_m: number;
  fps: number;
  schleife: boolean;
  px_pro_m: number;
  hoehe_px?: number;
  hoehe_m?: number;
  /** Anker (Anteil von Breite/Höhe), sonst Mitte; steht auch je Rahmen im JSON */
  anker?: [number, number];
  hinweis?: string;
}

/** Welche Animation wofür (Namen im Effekt-Atlas). */
export interface EffektZuordnung {
  wirkmittel: Record<string, { flug: string | null; einschlag: string; danach: string[] }>;
  hintergrund: Record<string, { flug?: string; einschlag?: string; danach?: string[]; flaeche?: string }>;
  wrack: Record<string, string[]>;
  feuert: Record<string, string>;
  /** seit 2.1: Rauch nach dem Abschuss je Art (moerser, kanone) */
  abschuss?: Record<string, string>;
  /** seit 2.1: Staubwolke hinter fahrenden Fahrzeugen */
  fahrt?: string;
}

export interface AssetManifest {
  version: number;
  erzeugt: string;
  generator: string;
  szenario: { id: string; version: string; datei: string };
  groessen_bytes: Record<string, number>;
  karte: Kartenpaket;
  fahrzeuge: Atlas & { px_pro_m: number; ausrichtung: string; schatten: string; rahmen: Record<string, SpriteRahmen> };
  effekte: Atlas & { animationen: Record<string, Effekt>; zuordnung: EffektZuordnung };
  drohne_ebenen: DrohnenEbenenInfo;
  ziele: Record<string, {
    typ: string; sprite: string | null; sprite_wrack: string | null; bilder: string[]; auch_in: string[]; nur_spielleitung?: boolean;
    verstaerkung?: string; hintergrund?: { t_s: number; folge: "zerstoert" | "ausser_gefecht" };
  }>;
  drohne: Record<string, Drohnenbild>;
  zielbilder: Record<string, Drohnenbild>;
}
