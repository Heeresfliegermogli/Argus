// Startseite: Raum, Synchronisation und Rolle wählen. Jede Rolle hat eine eigene Adresse, die man
// als Lesezeichen auf dem Gruppenrechner ablegen kann.
import { useState } from "preact/hooks";
import { type Einstellungen, adresseFuer, merken } from "../config";
import { RAUM_MUSTER, type Rolle } from "../kern/ereignisse";
import { ROLLEN_NAME } from "../kern/sichten";

const ROLLEN_TEXT: Record<Rolle, string> = {
  g1: "ARGUS-Meldungen prüfen",
  g2: "Einsatzregeln, Wirkmittel",
  g3: "Freigabe, Lagemeldungen",
  sl: "Uhr, Kontrollkarte, Protokoll",
  plenum: "Smartboard: Einweisung, Auflösung",
};

export function Start(p: { e: Einstellungen }) {
  const [e, setE] = useState<Einstellungen>(p.e);
  const raumOk = RAUM_MUSTER.test(e.raum);
  const geh = (rolle: Rolle) => {
    merken(e);
    location.href = adresseFuer(e, rolle);
  };
  const vierFenster = () => {
    merken(e);
    (["sl", "g1", "g2", "g3"] as const).forEach((r, i) => {
      window.open(adresseFuer(e, r), `argus-${r}`, `popup,width=1530,height=860,left=${40 * i},top=${30 * i}`);
    });
  };
  return (
    <div class="start">
      <div class="start-karte stapel" style="gap:18px">
        <div>
          <h1>ARGUS</h1>
          <div class="leise">Planspiel „Auswirkungen von KI auf die Entscheidungsfindung“ · Übungslage, alles fiktiv</div>
        </div>
        <div class="formular">
          <label for="raum">Raum</label>
          <input id="raum" class="feld" value={e.raum} onInput={(ev) => setE({ ...e, raum: (ev.target as HTMLInputElement).value.trim().toLowerCase() })} />
          <span>Synchronisation</span>
          <div class="zeile">
            <label class={`wahl ${e.sync === "firebase" ? "gewaehlt" : ""}`}>
              <input type="radio" name="sync" checked={e.sync === "firebase"} onChange={() => setE({ ...e, sync: "firebase" })} />
              Firebase (mehrere Rechner)
            </label>
            <label class={`wahl ${e.sync === "lokal" ? "gewaehlt" : ""}`}>
              <input type="radio" name="sync" checked={e.sync === "lokal"} onChange={() => setE({ ...e, sync: "lokal" })} />
              Lokal (ein Rechner, mehrere Fenster)
            </label>
          </div>
        </div>
        {!raumOk && <div class="warnung">Raumname: 3–32 Zeichen, nur Kleinbuchstaben, Ziffern und Bindestrich.</div>}
        <div class="rollenwahl">
          {(["g1", "g2", "g3", "sl", "plenum"] as const).map((r) => (
            <a key={r} href={raumOk ? adresseFuer(e, r) : undefined} class={`rolle-${r}`} onClick={(ev) => { ev.preventDefault(); if (raumOk) geh(r); }}>
              {ROLLEN_NAME[r]}<span>{ROLLEN_TEXT[r]}</span>
            </a>
          ))}
        </div>
        <div class="zeile zwischen">
          <span class="klein sehr-leise">Pro Gruppenrechner eine Rolle öffnen. Die Spielleitung startet das Spiel.</span>
          <button type="button" class="knopf klein" disabled={!raumOk} onClick={vierFenster}>Alle vier Fenster öffnen (Test)</button>
        </div>
        <div class="zeile zwischen">
          <a class="klein" style="color:var(--info)" href={`${location.pathname}?druck=einweisung`} target="_blank" rel="noopener">Einweisungskarten drucken (A5)</a>
        </div>
        <div class="klein sehr-leise">Version {__ARGUS_VERSION__} · {__ARGUS_STAND__}{__ARGUS_OFFLINE__ ? " · Offline-Datei" : ""}</div>
      </div>
    </div>
  );
}
