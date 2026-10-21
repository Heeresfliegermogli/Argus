// Startseite. Links für die Teilnehmer: Code eingeben, beitreten – mehr nicht. Rechts für die
// Spielleitung: neue Sitzung anlegen oder eine bestehende öffnen (zweite Spielleitung, Plenum).
// Darunter klein: Synchronisation, Test ohne Lobby (ein Team, wie bis Schritt 6), Einweisungskarten.
import { useEffect, useState } from "preact/hooks";
import { type Einstellungen, adresseFuer, gemerkterWert, merke, merken, sitzungsAdresse } from "../config";
import { ladeInhalte } from "../inhalte/laden";
import type { Inhalte } from "../inhalte/typen";
import { RAUM_MUSTER, type Rolle } from "../kern/ereignisse";
import { ROLLEN_NAME } from "../kern/sichten";
import { SPIELERNAME_MAX, codeAnzeige, codeNormalisieren, codeVorsilbe, neuerCode } from "../kern/sitzungen";
import { Sitzung } from "../sitzung/sitzung";
import { adapterFuer, sitzungVorhanden } from "../sync/fabrik";

const ROLLEN_TEXT: Record<Rolle, string> = {
  g1: "ARGUS-Meldungen prüfen",
  g2: "Einsatzregeln, Wirkmittel",
  g3: "Freigabe, Lagemeldungen",
  sl: "Uhr, Kontrollkarte, Protokoll",
  plenum: "Smartboard: Einweisung, Auflösung",
};

type Pruefung = { art: "laeuft" } | { art: "fehler"; text: string } | null;

/** Code prüfen und die Sitzung öffnen. Fehlt sie, bleibt man auf der Startseite mit einem klaren Satz. */
async function oeffne(e: Einstellungen, eingabe: string, vorsilbe: string, setze: (p: Pruefung) => void, extra: { rolle?: Rolle; name?: string } = {}) {
  const code = codeNormalisieren(eingabe, vorsilbe);
  if (!code) {
    setze({ art: "fehler", text: `„${eingabe.trim() || " "}“ ist kein Code. Er sieht so aus: ${vorsilbe}-7Q` });
    return;
  }
  setze({ art: "laeuft" });
  try {
    const da = await sitzungVorhanden(e, code);
    if (da === "fehlt") {
      setze({ art: "fehler", text: `Die Sitzung ${codeAnzeige(code)} gibt es nicht. Bitte den Code prüfen.` });
      return;
    }
    if (da === "keine_antwort") {
      setze({ art: "fehler", text: "Keine Antwort von der Datenbank. Netzverbindung prüfen und noch einmal versuchen." });
      return;
    }
  } catch (err) {
    setze({ art: "fehler", text: `Keine Verbindung: ${(err as Error).message}` });
    return;
  }
  merken(e);
  location.href = sitzungsAdresse(e, code, extra);
}

export function Start(p: { e: Einstellungen }) {
  const [e, setE] = useState<Einstellungen>(p.e);
  const [inh, setInh] = useState<Inhalte | null>(null);
  const [code, setCode] = useState("");
  const [tt, setTt] = useState<Pruefung>(null);
  const [slName, setSlName] = useState(() => gemerkterWert("slname") ?? "");
  const [slCode, setSlCode] = useState("");
  const [sl, setSl] = useState<Pruefung>(null);
  const [neu, setNeu] = useState<Pruefung>(null);
  const [raum, setRaum] = useState(e.raum ?? gemerkterWert("raum") ?? "kraehe");
  useEffect(() => {
    ladeInhalte(e.szenario).then(setInh).catch((err: Error) => setNeu({ art: "fehler", text: `Szenario nicht geladen: ${err.message}` }));
  }, []);
  const vorsilbe = inh ? codeVorsilbe(inh.szenario.anzeige) : "KRAEHE";
  const raumOk = RAUM_MUSTER.test(raum);
  const direkt: Einstellungen = { ...e, raum };

  const anlegen = async () => {
    if (!inh) return;
    setNeu({ art: "laeuft" });
    merke("slname", slName.trim());
    try {
      const s = await Sitzung.anlegen(inh, (c) => adapterFuer(e, c), slName.trim() || ROLLEN_NAME.sl, neuerCode);
      if (!s) {
        setNeu({ art: "fehler", text: "Kein freier Code gefunden – bitte noch einmal." });
        return;
      }
      merken(e);
      location.href = sitzungsAdresse(e, s, { rolle: "sl", name: slName.trim() || undefined });
    } catch (err) {
      setNeu({ art: "fehler", text: `Sitzung nicht angelegt: ${(err as Error).message}` });
    }
  };

  const vierFenster = () => {
    merken(direkt);
    (["sl", "g1", "g2", "g3"] as const).forEach((r, i) => {
      window.open(adresseFuer(direkt, r), `argus-${r}`, `popup,width=1530,height=860,left=${40 * i},top=${30 * i}`);
    });
  };

  return (
    <div class="start">
      <div class="start-rahmen">
        <div class="start-titel">
          <h1>ARGUS</h1>
          <div class="leise">Planspiel „Auswirkungen von KI auf die Entscheidungsfindung“ · Übungslage, alles fiktiv</div>
        </div>

        <div class="start-spalten">
          <section class="start-karte start-tt" data-testid="start-tt">
            <h2>Mitspielen</h2>
            <form class="stapel" style="gap:12px" onSubmit={(ev) => { ev.preventDefault(); void oeffne(e, code, vorsilbe, setTt); }}>
              <label for="code" class="leise">Code der Sitzung</label>
              <input id="code" class="feld code-feld" autoFocus autoComplete="off" spellcheck={false} placeholder={`${vorsilbe}-7Q`} maxLength={32}
                value={code} onInput={(ev) => { setCode((ev.target as HTMLInputElement).value.toUpperCase()); setTt(null); }} data-testid="code-eingabe" />
              <button type="submit" class="knopf gut gross" disabled={tt?.art === "laeuft"} data-testid="beitreten">
                {tt?.art === "laeuft" ? "Sitzung wird gesucht …" : "Beitreten"}
              </button>
              {tt?.art === "fehler" && <div class="warnung" data-testid="code-fehler">{tt.text}</div>}
              <div class="klein sehr-leise">Den Code zeigt die Spielleitung am Smartboard.</div>
            </form>
          </section>

          <section class="start-karte start-sl" data-testid="start-sl">
            <h2>Spielleitung</h2>
            <div class="stapel" style="gap:8px">
              <div class="zeile" style="flex-wrap:nowrap">
                <input class="feld" placeholder="Name, z. B. SL 1" maxLength={SPIELERNAME_MAX} value={slName}
                  onInput={(ev) => setSlName((ev.target as HTMLInputElement).value)} data-testid="sl-name" />
                <button type="button" class="knopf weiter" style="white-space:nowrap" disabled={!inh || neu?.art === "laeuft"} onClick={() => void anlegen()} data-testid="sitzung-anlegen">
                  {neu?.art === "laeuft" ? "wird angelegt …" : "Neue Sitzung anlegen"}
                </button>
              </div>
              {neu?.art === "fehler" && <div class="warnung">{neu.text}</div>}
            </div>
            <div class="stapel" style="gap:8px;margin-top:16px">
              <div class="klein leise">Bestehende Sitzung öffnen (zweite Spielleitung, Smartboard)</div>
              <div class="zeile" style="flex-wrap:nowrap">
                <input class="feld mono" placeholder={`${vorsilbe}-7Q`} maxLength={32} value={slCode} spellcheck={false}
                  onInput={(ev) => { setSlCode((ev.target as HTMLInputElement).value.toUpperCase()); setSl(null); }} data-testid="sl-code" />
                <button type="button" class="knopf" style="white-space:nowrap" disabled={sl?.art === "laeuft"}
                  onClick={() => void oeffne(e, slCode, vorsilbe, setSl, { rolle: "sl", name: slName.trim() || undefined })}>als Spielleitung</button>
                <button type="button" class="knopf" style="white-space:nowrap" disabled={sl?.art === "laeuft"}
                  onClick={() => void oeffne(e, slCode, vorsilbe, setSl, { rolle: "plenum" })}>Plenum</button>
              </div>
              {sl?.art === "fehler" && <div class="warnung">{sl.text}</div>}
            </div>
            <div class="zeile" style="margin-top:16px;gap:6px">
              <span class="klein leise">Synchronisation</span>
              <label class={`wahl klein ${e.sync === "firebase" ? "gewaehlt" : ""}`}>
                <input type="radio" name="sync" checked={e.sync === "firebase"} onChange={() => setE({ ...e, sync: "firebase" })} />
                Firebase (mehrere Rechner)
              </label>
              <label class={`wahl klein ${e.sync === "lokal" ? "gewaehlt" : ""}`}>
                <input type="radio" name="sync" checked={e.sync === "lokal"} onChange={() => setE({ ...e, sync: "lokal" })} />
                Lokal (ein Rechner)
              </label>
            </div>
          </section>
        </div>

        <details class="start-karte start-test">
          <summary>Test ohne Lobby: ein Team, jede Rolle mit eigener Adresse</summary>
          <div class="stapel" style="gap:10px;margin-top:10px">
            <div class="zeile" style="flex-wrap:nowrap">
              <label for="raum" class="klein leise">Raum</label>
              <input id="raum" class="feld" style="width:180px" value={raum} onInput={(ev) => setRaum((ev.target as HTMLInputElement).value.trim().toLowerCase())} />
              {!raumOk && <span class="klein warnung">3–32 Zeichen: Kleinbuchstaben, Ziffern, Bindestrich</span>}
              <span style="flex:1" />
              <button type="button" class="knopf klein" disabled={!raumOk} onClick={vierFenster}>Alle vier Fenster öffnen</button>
            </div>
            <div class="rollenwahl">
              {(["g1", "g2", "g3", "sl", "plenum"] as const).map((r) => (
                <a key={r} href={raumOk ? adresseFuer(direkt, r) : undefined} class={`rolle-${r}`} onClick={() => merken(direkt)}>
                  {ROLLEN_NAME[r]}<span>{ROLLEN_TEXT[r]}</span>
                </a>
              ))}
            </div>
          </div>
        </details>

        <div class="zeile zwischen klein sehr-leise">
          <a style="color:var(--info)" href={`${location.pathname}?druck=einweisung`} target="_blank" rel="noopener">Einweisungskarten drucken (A5)</a>
          <span>Version {__ARGUS_VERSION__} · {__ARGUS_STAND__}{__ARGUS_OFFLINE__ ? " · Offline-Datei" : ""}</span>
        </div>
      </div>
    </div>
  );
}
