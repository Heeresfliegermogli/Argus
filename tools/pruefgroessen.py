"""Prüfgrößen und Layout-Prüfungen für alle Probe-Werkzeuge (seit Liste J, 10.11.2026).

Die Dienst-Laptops haben ein Browserfenster von etwa 1536 × 730 (1920 × 1080 mit 125 % Skalierung, abzüglich Tabs, Adressleiste und
Taskleiste) – das ist seit J die Standardgröße. Dazu ein kleiner Laptop (1366 × 650), das Smartboard (1530 × 800) und ein großer
Bildschirm (1920 × 960). In allen Größen gilt: kein Rollbalken, nichts abgeschnitten, ganze Karte sichtbar (auch der Ostrand mit den
Wäldern MARDER und DACHS), die drei Knöpfe der Zielbearbeitung ganz sichtbar und an fester Stelle; kleinste Schrift ab 1366 × 650
mindestens 12 px. Unter 1280 × 600 wird die Ansicht gleichmäßig verkleinert.

Benutzung in einer Probe:
    from pruefgroessen import GROESSEN, STANDARD, pruefe_layout, in_groessen
    for (w, h), fehler in in_groessen(seite, GROESSEN, lambda: pruefe_layout(seite, karte_ganz=True)): ...
"""

STANDARD = (1536, 730)
GROESSEN = [(1536, 730), (1366, 650), (1530, 800), (1920, 960)]
# kleinste Schrift (CSS-Pixel am Bildschirm) ab dieser Größe
SCHRIFT_MIN = 12


def groesse_text(g):
    return f"{g[0]}x{g[1]}"


def lies_groesse(text):
    """„1536x730“ → (1536, 730)"""
    b, h = text.lower().replace("×", "x").split("x")
    return int(b), int(h)


def groessen_argument(ap, standard=STANDARD):
    """--groesse 1536x730 (Standard) und --alle-groessen für argparse."""
    ap.add_argument("--groesse", default=groesse_text(standard), help="Fenstergröße, z. B. 1536x730 (Standard: Dienst-Laptop)")
    ap.add_argument("--alle-groessen", action="store_true", help="Fotos und Prüfungen in allen vier Prüfgrößen")


LAYOUT_JS = r"""
(opt) => {
  const fehler = [];
  const de = document.documentElement;
  const vw = innerWidth, vh = innerHeight;
  // 1. kein Rollbalken
  if (de.scrollWidth > vw + 1 || de.scrollHeight > vh + 1) fehler.push(`Seite ${de.scrollWidth}×${de.scrollHeight} größer als ${vw}×${vh}`);
  // 2. feste Felder schneiden nichts ab (nur Listen mit data-liste dürfen rollen)
  for (const r of document.querySelectorAll('.panel > .rumpf:not([data-liste])')) {
    if (r.scrollHeight > r.clientHeight + 2 || r.scrollWidth > r.clientWidth + 2) {
      const t = r.parentElement.querySelector('header h2')?.textContent?.trim() || '?';
      fehler.push(`Feld „${t}“: ${r.scrollWidth}×${r.scrollHeight} in ${r.clientWidth}×${r.clientHeight}`);
    }
  }
  for (const el of document.querySelectorAll('.stapel, .inhalt, main, .zb-meldung, .zb-rechts, .eingang, .folie-rumpf, .folie-inhalt, .ekarte')) {
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') continue;
    if (el.scrollHeight > el.clientHeight + 2 || el.scrollWidth > el.clientWidth + 2) fehler.push(`${el.className}: ${el.scrollWidth}×${el.scrollHeight} in ${el.clientWidth}×${el.clientHeight}`);
  }
  // 3. Text in Knöpfen, Kacheln, Chips passt (kein Zuschnitt, keine Auslassungspunkte)
  const sichtbar = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0 && getComputedStyle(el).visibility !== 'hidden'; };
  for (const el of document.querySelectorAll('.zb-knoepfe .knopf, .zb-knoepfe .unterzeile, .wm-kachel .wk-oben, .wm-kachel .wk-unten, .kopf .knopf, .kopf .badge, .pz-kachel, .bestand, .eingang > header, .unterwegs-leiste, .karte-knoepfe .knopf, .tour-blase, .folie-fuss .knopf')) {
    if (!sichtbar(el)) continue;
    if (el.scrollWidth > el.clientWidth + 1) fehler.push(`Text passt nicht: ${el.className.split(' ')[0]} „${el.textContent.trim().slice(0, 40)}“ ${el.scrollWidth} > ${el.clientWidth}`);
  }
  // 4. Kopfzeile: nichts überlappt und nichts ragt hinaus
  const kopf = document.querySelector('.kopf');
  if (kopf) {
    const teile = [...kopf.querySelectorAll(':scope > *')].filter(sichtbar).map((e) => [e, e.getBoundingClientRect()]);
    for (let i = 1; i < teile.length; i++) {
      if (teile[i][1].left < teile[i - 1][1].right - 1 && teile[i][1].width > 0 && teile[i - 1][1].width > 0) fehler.push(`Kopfzeile: ${teile[i][0].className} überlappt ${teile[i - 1][0].className}`);
    }
    for (const el of kopf.querySelectorAll('.kopf-rechts > *, .kopf-links > *')) {
      if (!sichtbar(el)) continue;
      const r = el.getBoundingClientRect();
      if (r.right > vw + 1 || r.left < -1) fehler.push(`Kopfzeile: ${el.className} außerhalb des Fensters`);
    }
  }
  // 5. ganze Karte (data-sichtbar in Metern: 0,0,1000,700) – Zielbearbeitung, Plenum, Kontrollkarte
  if (opt.karte_ganz) {
    for (const k of document.querySelectorAll(opt.karten || '.karte[data-sichtbar]')) {
      if (!sichtbar(k)) continue;
      const s = (k.dataset.sichtbar || '').split(',').map(Number);
      if (s.length !== 4 || !(s[0] <= 0.5 && s[1] <= 0.5 && s[2] >= 999.5 && s[3] >= 699.5)) fehler.push(`Karte ${k.dataset.testid}: nicht ganz sichtbar (${k.dataset.sichtbar || 'unbekannt'} m)`);
    }
  }
  // 6. die drei Knöpfe der Zielbearbeitung ganz im Fenster und von keinem Feld beschnitten
  const knoepfe = {};
  for (const id of ['zb-bekaempfen', 'zb-zurueckstellen', 'zb-ablehnen']) {
    const el = document.querySelector(`[data-testid=${id}]`);
    if (!el) continue;
    const r = el.getBoundingClientRect();
    knoepfe[id] = [Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)];
    if (r.left < 0 || r.top < 0 || r.right > vw + 0.5 || r.bottom > vh + 0.5) fehler.push(`Knopf ${id} ragt aus dem Fenster (${knoepfe[id]})`);
    for (let a = el.parentElement; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.overflow === 'visible' && cs.overflowX === 'visible' && cs.overflowY === 'visible') continue;
      const ar = a.getBoundingClientRect();
      if (r.left < ar.left - 0.5 || r.top < ar.top - 0.5 || r.right > ar.right + 0.5 || r.bottom > ar.bottom + 0.5) { fehler.push(`Knopf ${id} von ${a.className} beschnitten`); break; }
    }
  }
  // 7. kleinste Schrift (am Bildschirm, mit Verkleinerung)
  const skala = Number(de.dataset.skala || 1) || 1;
  let min = 99, wo = '';
  const wurzel = document.querySelector('#app') || document.body;
  const w = document.createTreeWalker(wurzel, NodeFilter.SHOW_TEXT);
  while (w.nextNode()) {
    const n = w.currentNode;
    if (!n.textContent.trim()) continue;
    const el = n.parentElement;
    if (!el || el.closest('svg, canvas, [aria-hidden=true]')) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1 || r.bottom < 0 || r.top > vh || r.right < 0 || r.left > vw) continue;
    const cs = getComputedStyle(el);
    if (cs.visibility === 'hidden' || Number(cs.opacity) === 0) continue;
    const fs = parseFloat(cs.fontSize) * skala;
    if (fs < min) { min = fs; wo = `${el.className || el.tagName} „${n.textContent.trim().slice(0, 30)}“`; }
  }
  return { fehler, knoepfe, skala, schrift: { min: Math.round(min * 10) / 10, entwurf: Math.round(min / skala * 10) / 10, wo }, text: document.body.innerText };
}
"""


def pruefe_layout(seite, karte_ganz=True, karten=None, schrift_min=SCHRIFT_MIN):
    """Layout der Seite prüfen; Rückgabe (fehler, ergebnis)."""
    erg = seite.evaluate(LAYOUT_JS, {"karte_ganz": karte_ganz, "karten": karten})
    fehler = list(erg["fehler"])
    vw, vh = seite.viewport_size["width"], seite.viewport_size["height"]
    # verkleinerte Ansicht (Auswertung unter 1530 × 800, alles unter 1280 × 600): Schrift im Entwurf zählt, am Bildschirm nur gemeldet
    massgeblich = erg["schrift"]["entwurf"] if erg["skala"] < 1 else erg["schrift"]["min"]
    if schrift_min and vw >= 1366 and vh >= 650 and massgeblich < schrift_min:
        fehler.append(f"kleinste Schrift {massgeblich} px < {schrift_min} px: {erg['schrift']['wo']}")
    return fehler, erg


def in_groessen(seite, groessen, tun, warten_ms=700):
    """Für jede Größe: Fenster setzen, kurz warten (Karte zeichnet neu), tun() ausführen; danach zurück zur ersten Größe."""
    alt = seite.viewport_size
    erg = []
    for (w, h) in groessen:
        seite.set_viewport_size({"width": w, "height": h})
        seite.wait_for_timeout(warten_ms)
        erg.append(((w, h), tun((w, h))))
    seite.set_viewport_size(alt)
    seite.wait_for_timeout(warten_ms)
    return erg
