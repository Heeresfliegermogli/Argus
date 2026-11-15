// Liste O (O2): ARGUS-Logo – Dateien und Maße, Favicon, Einsatzorte; dazu Festlegungen des kurzen Plenums im Quelltext (keine
// Teamnamen auf den Fallfolien, keine Rangliste, „Zurück zur Präsentation“).
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const datei = (p: string) => new URL(`../${p}`, import.meta.url);
const text = (p: string) => readFileSync(datei(p), "utf-8");

function pngGroesse(p: string): [number, number] {
  const b = readFileSync(datei(p));
  expect(b.toString("ascii", 1, 4)).toBe("PNG");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe("Logo (O2)", () => {
  it("Varianten aus argus_logo.png (240 × 265): Schild, Schriftzug, Favicons 32/64", () => {
    expect(pngGroesse("public/assets/argus_logo.png")).toEqual([240, 265]);
    const [w, h] = pngGroesse("public/assets/argus_schild.png");
    expect(w).toBe(240);
    expect(h).toBeLessThanOrEqual(211); // Schild = Zeilen 0–210
    expect(pngGroesse("public/assets/argus_schrift.png")[1]).toBeLessThan(60);
    expect(pngGroesse("public/assets/argus_favicon_32.png")).toEqual([32, 32]);
    expect(pngGroesse("public/assets/argus_favicon_64.png")).toEqual([64, 64]);
    expect(existsSync(datei("tools/logo/logo_varianten.py"))).toBe(true);
    expect(existsSync(datei("tools/logo/bild1_vorlage.png"))).toBe(true);
  });

  it("Favicon als data-Adresse in index.html (auch in der Offline-Datei), das alte Kreis-Symbol ist weg", () => {
    const html = text("index.html");
    expect(html.match(/<link rel="icon" type="image\/png" sizes="(32x32|64x64)" href="data:image\/png;base64,/g)).toHaveLength(2);
    expect(html).not.toContain("image/svg+xml");
  });

  it("Einsatzorte: Kopfzeilen (Schild vor „ARGUS“), Startseite (Schild 120 px über „ARGUS“), Testpult, Plenum, Druck – nicht im Drohnenbild", () => {
    expect(text("src/ansichten/gemeinsam/rahmen.tsx")).toContain("<ArgusMarke />");
    expect(text("src/ansichten/auswertung.tsx")).toContain("<ArgusMarke />");
    expect(text("src/ansichten/start.tsx")).toContain("<ArgusTitel hoehe={120} />");
    expect(text("src/ansichten/testpult.tsx")).toMatch(/pult-marke"><Schild hoehe=\{24\}/);
    expect(text("src/ansichten/plenum.tsx")).toContain("<Schild hoehe={34} />");
    expect(text("src/ansichten/plenum-kurz.tsx")).toContain("<Schild hoehe={230}");
    expect(text("src/ansichten/einweisung.tsx")).toContain("<LogoGanz hoehe={44} />");
    // kein einzelnes „ARGUS“ als Marke mehr ohne Schild
    for (const f of ["gemeinsam/rahmen.tsx", "sl-fenster.tsx", "lobby.tsx", "auswertung.tsx", "start.tsx", "tt-fenster.tsx"]) {
      expect(text(`src/ansichten/${f}`), f).not.toContain('<span class="marke">ARGUS</span>');
      expect(text(`src/ansichten/${f}`), f).not.toContain("<h1>ARGUS</h1>");
    }
    for (const f of ["gemeinsam/livedrohne.tsx", "gemeinsam/drohnenbild.tsx"]) expect(text(`src/ansichten/${f}`), f).not.toMatch(/Schild|argus_logo/);
  });
});

describe("Kurzes Plenum im Quelltext (O1)", () => {
  it("Fallfolien ohne Teamnamen, Gesamt ohne Rangliste; „Zurück zur Präsentation“ und „Merkt euch diese Zahl.“", () => {
    const pk = text("src/ansichten/plenum-kurz.tsx");
    const fall = pk.slice(pk.indexOf("export function FallFolie"), pk.indexOf("export function GesamtFolie"));
    const gesamt = pk.slice(pk.indexOf("export function GesamtFolie"), pk.indexOf("export function PraesentationEnde"));
    for (const teil of [fall, gesamt]) {
      expect(teil).not.toMatch(/TeamMarke|\.name\b|a\.teams/);
      expect(teil).not.toMatch(/\.sort\(/);
    }
    expect(fall).toContain("Was habt ihr entschieden?");
    expect(gesamt).toContain("Merkt euch diese Zahl.");
    expect(gesamt).toContain("Zurück zur Präsentation");
    expect(pk).toContain("ARGUS – Planspiel beendet");
  });
});
