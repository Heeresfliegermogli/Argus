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

export interface Drohnenbild {
  datei: string;
  breite: number;
  hoehe: number;
  t_s: number;
  uhr: string;
  pq: string;
  ausschnitt_m: { x: number; y: number; breite: number; hoehe: number };
  m_pro_px: number;
  ziele: BildZiel[];
  objekte: { id: string; mitte: [number, number]; hdg: number }[];
  personen: { bei: string; art: string; anzahl: number; verdeckt: number; punkte: [number, number][] }[];
  sicht: BildSicht[];
  bytes: number;
  nur_spielleitung?: boolean;
}

export interface SpriteRahmen {
  px_pro_m: number;
  groesse_m: [number, number];
  typ?: string;
  wrack?: boolean;
  person?: string;
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
  px: number;
  groesse_m: number;
  fps: number;
  schleife: boolean;
  px_pro_m: number;
}

export interface AssetManifest {
  version: number;
  erzeugt: string;
  generator: string;
  szenario: { id: string; version: string; datei: string };
  groessen_bytes: Record<string, number>;
  karte: Kartenpaket;
  fahrzeuge: Atlas & { px_pro_m: number; ausrichtung: string; schatten: string; rahmen: Record<string, SpriteRahmen> };
  effekte: Atlas & { animationen: Record<string, Effekt> };
  ziele: Record<string, { typ: string; sprite: string | null; sprite_wrack: string | null; bilder: string[]; auch_in: string[]; nur_spielleitung?: boolean }>;
  drohne: Record<string, Drohnenbild>;
  zielbilder: Record<string, Drohnenbild>;
}
