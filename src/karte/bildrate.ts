// Höchste Bildrate der Lagekarte (Adresszeile fps=…, im Browser gemerkt). Eigenes kleines Modul, damit die
// Startseite sie setzen kann, ohne die Karte (PixiJS) zu laden.
let hoechstens = 30;

export function setzeBildrateMax(fps: number): void {
  hoechstens = Math.max(1, Math.min(30, fps));
}

export function bildrateMax(): number {
  return hoechstens;
}
