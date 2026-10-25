// Startseite (Änderung B1, 25.10.2026): zuerst nur zwei große Knöpfe „Ich spiele mit“ und „Spielleitung“.
//   • Ich spiele mit: Code eingeben (drei Zeichen), beitreten – mehr nicht. Danach kommt die Lobby.
//   • Spielleitung: alles für die Sitzung – zuletzt genutzte Sitzung fortsetzen, neue Sitzung anlegen, bestehende
//     öffnen (zweite Spielleitung, Plenum), Synchronisation, Test ohne Lobby (allein in einem Fenster oder vier
//     Fenster), Auswertung üben, Einweisungskarten, Lasttest.
// Eine Spielleitung führt alle Teams einer Sitzung (ein Fenster ist Host für alle). Die Wahl steht im Anker der
// Adresse (#mitspielen, #spielleitung), damit Neuladen und Zurück funktionieren.
import { useEffect, useState } from "preact/hooks";
import { type Einstellungen, adresseFuer, gemerkterWert, letzteSitzung, merke, merken, sitzungsAdresse } from "../config";
import { ladeInhalte } from "../inhalte/laden";
import type { Inhalte } from "../inhalte/typen";
import { RAUM_MUSTER, type Rolle } from "../kern/ereignisse";
import { ROLLEN_NAME } from "../kern/sichten";
import { CODE_LAENGE, SPIELERNAME_MAX, codeAnzeige, codeNormalisieren, neuerCode } from "../kern/sitzungen";
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
type Seite = "wahl" | "mitspielen" | "spielleitung";

function seiteAusAnker(): Seite {
  const h = location.hash.replace(/^#/, "");
  return h === "mitspielen" || h === "spielleitung" ? h : "wahl";
}

/** Code prüfen und die Sitzung öffnen. Fehlt sie, bleibt man auf der Startseite mit einem klaren Satz. */
async function oeffne(e: Einstellungen, eingabe: string, setze: (p: Pruefung) => void, extra: { rolle?: Rolle; name?: string } = {}) {
  const code = codeNormalisieren(eingabe);
  if (!code) {
    setze({ art: "fehler", text: `„${eingabe.trim() || " "}“ ist kein Code. Ein Code hat ${CODE_LAENGE} Zeichen, z. B. K7P.` });
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

function Kopf() {
  return (
    <div class="start-titel">
      <h1>ARGUS</h1>
      <div class="leise">Planspiel „Auswirkungen von KI auf die Entscheidungsfindung“ · Übungslage, alles fiktiv</div>
    </div>
  );
}

function Fuss() {
  return (
    <div class="zeile zwischen klein sehr-leise start-fuss">
      <span />
      <span>Version {__ARGUS_VERSION__} · {__ARGUS_STAND__}{__ARGUS_OFFLINE__ ? " · Offline-Datei" : ""}</span>
    </div>
  );
}

/** Erste Seite: zwei große Knöpfe. */
function Wahl(p: { gehe: (s: Seite) => void }) {
  return (
    <div class="start-wahl">
      <button type="button" class="start-gross mitspielen" onClick={() => p.gehe("mitspielen")} data-testid="ich-spiele-mit">
        Ich spiele mit<span>Code eingeben, Team bilden</span>
      </button>
      <button type="button" class="start-gross spielleitung" onClick={() => p.gehe("spielleitung")} data-testid="zur-spielleitung">
        Spielleitung<span>Sitzung anlegen oder fortsetzen</span>
      </button>
    </div>
  );
}

/** Mitspielen: nur der Code. */
function Mitspielen(p: { e: Einstellungen; zurueck: () => void }) {
  const [code, setCode] = useState("");
  const [tt, setTt] = useState<Pruefung>(null);
  return (
    <section class="start-karte start-tt start-mitte" data-testid="start-tt">
      <h2>Mitspielen</h2>
      <form class="stapel" style="gap:12px" onSubmit={(ev) => { ev.preventDefault(); void oeffne(p.e, code, setTt); }}>
        <label for="code" class="leise">Code der Sitzung</label>
        <input id="code" class="feld code-feld" autoFocus autoComplete="off" spellcheck={false} placeholder="K7P" maxLength={12}
          value={code} onInput={(ev) => { setCode((ev.target as HTMLInputElement).value.toUpperCase()); setTt(null); }} data-testid="code-eingabe" />
        <button type="submit" class="knopf gut gross" disabled={tt?.art === "laeuft"} data-testid="beitreten">
          {tt?.art === "laeuft" ? "Sitzung wird gesucht …" : "Beitreten"}
        </button>
        {tt?.art === "fehler" && <div class="warnung" data-testid="code-fehler">{tt.text}</div>}
        <div class="klein sehr-leise">Den Code zeigt die Spielleitung am Smartboard.</div>
      </form>
      <button type="button" class="knopf klein leise start-zurueck" onClick={p.zurueck}>◂ zurück</button>
    </section>
  );
}

/** Spielleitung: fortsetzen, anlegen, öffnen, Test ohne Lobby und Werkzeuge. */
function Spielleitung(p: { e: Einstellungen; setE: (e: Einstellungen) => void; inh: Inhalte | null; ladeFehler: string | null; zurueck: () => void }) {
  const { e } = p;
  const [slName, setSlName] = useState(() => gemerkterWert("slname") ?? "");
  const [slCode, setSlCode] = useState("");
  const [sl, setSl] = useState<Pruefung>(null);
  const [neu, setNeu] = useState<Pruefung>(p.ladeFehler ? { art: "fehler", text: p.ladeFehler } : null);
  const [weiter, setWeiter] = useState<Pruefung>(null);
  const [raum, setRaum] = useState(e.raum ?? gemerkterWert("raum") ?? "kraehe");
  const letzte = letzteSitzung();
  const raumOk = RAUM_MUSTER.test(raum);
  const direkt: Einstellungen = { ...e, raum };
  const name = slName.trim() || undefined;

  const anlegen = async () => {
    if (!p.inh) return;
    setNeu({ art: "laeuft" });
    merke("slname", slName.trim());
    try {
      const s = await Sitzung.anlegen(p.inh, (c) => adapterFuer(e, c), slName.trim() || ROLLEN_NAME.sl, neuerCode);
      if (!s) {
        setNeu({ art: "fehler", text: "Kein freier Code gefunden – bitte noch einmal." });
        return;
      }
      merken(e);
      location.href = sitzungsAdresse(e, s, { rolle: "sl", name });
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
  const fortsetzen = (rolle: "sl" | "plenum") => {
    if (!letzte) return;
    const mit: Einstellungen = { ...e, sync: letzte.sync };
    void oeffne(mit, letzte.code, setWeiter, rolle === "sl" ? { rolle, name } : { rolle });
  };
  const uhr = (ts: number) => new Date(ts).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

  return (
    <div class="stapel" style="gap:14px" data-testid="start-sl">
      <div class="start-spalten">
        <section class="start-karte start-sl">
          <h2>Sitzung</h2>
          {letzte && (
            <div class="stapel start-letzte" style="gap:8px" data-testid="letzte-sitzung">
              <div>Zuletzt genutzt: Sitzung <b class="mono">{codeAnzeige(letzte.code)}</b> <span class="sehr-leise klein">· {uhr(letzte.zeit)} · {letzte.sync === "lokal" ? "lokal" : "Firebase"}</span></div>
              <div class="zeile" style="flex-wrap:nowrap">
                <button type="button" class="knopf weiter" disabled={weiter?.art === "laeuft"} onClick={() => fortsetzen("sl")} data-testid="fortsetzen">Fortsetzen als Spielleitung</button>
                <button type="button" class="knopf" disabled={weiter?.art === "laeuft"} onClick={() => fortsetzen("plenum")}>Plenum</button>
              </div>
              {weiter?.art === "fehler" && <div class="warnung">{weiter.text}</div>}
            </div>
          )}
          <div class="stapel" style="gap:8px">
            <div class="klein leise">{letzte ? "Oder neu anlegen – die Spielleitung führt dann alle Teams dieser Sitzung" : "Neue Sitzung – die Spielleitung führt alle Teams dieser Sitzung"}</div>
            <div class="zeile" style="flex-wrap:nowrap">
              <input class="feld" placeholder="Name, z. B. SL 1" maxLength={SPIELERNAME_MAX} value={slName}
                onInput={(ev) => setSlName((ev.target as HTMLInputElement).value)} data-testid="sl-name" />
              <button type="button" class={`knopf ${letzte ? "" : "weiter"}`} style="white-space:nowrap" disabled={!p.inh || neu?.art === "laeuft"} onClick={() => void anlegen()} data-testid="sitzung-anlegen">
                {neu?.art === "laeuft" ? "wird angelegt …" : "Neue Sitzung anlegen"}
              </button>
            </div>
            {neu?.art === "fehler" && <div class="warnung">{neu.text}</div>}
          </div>
        </section>

        <section class="start-karte">
          <h2>Bestehende Sitzung öffnen</h2>
          <div class="stapel" style="gap:8px">
            <div class="klein leise">Zweite Spielleitung oder Smartboard</div>
            <div class="zeile" style="flex-wrap:nowrap">
              <input class="feld mono" placeholder="K7P" maxLength={12} value={slCode} spellcheck={false} style="width:110px"
                onInput={(ev) => { setSlCode((ev.target as HTMLInputElement).value.toUpperCase()); setSl(null); }} data-testid="sl-code" />
              <button type="button" class="knopf" style="white-space:nowrap" disabled={sl?.art === "laeuft"}
                onClick={() => void oeffne(e, slCode, setSl, { rolle: "sl", name })}>als Spielleitung</button>
              <button type="button" class="knopf" style="white-space:nowrap" disabled={sl?.art === "laeuft"}
                onClick={() => void oeffne(e, slCode, setSl, { rolle: "plenum" })}>Plenum</button>
            </div>
            {sl?.art === "fehler" && <div class="warnung">{sl.text}</div>}
          </div>
          <div class="zeile" style="margin-top:16px;gap:6px">
            <span class="klein leise">Synchronisation</span>
            <label class={`wahl klein ${e.sync === "firebase" ? "gewaehlt" : ""}`}>
              <input type="radio" name="sync" checked={e.sync === "firebase"} onChange={() => p.setE({ ...e, sync: "firebase" })} />
              Firebase (mehrere Rechner)
            </label>
            <label class={`wahl klein ${e.sync === "lokal" ? "gewaehlt" : ""}`}>
              <input type="radio" name="sync" checked={e.sync === "lokal"} onChange={() => p.setE({ ...e, sync: "lokal" })} />
              Lokal (ein Rechner)
            </label>
          </div>
        </section>
      </div>

      <details class="start-karte start-test">
        <summary>Test ohne Lobby: ein Team, jede Rolle bedienbar</summary>
        <div class="stapel" style="gap:10px;margin-top:10px">
          <div class="zeile" style="flex-wrap:nowrap">
            <label for="raum" class="klein leise">Raum</label>
            <input id="raum" class="feld" style="width:180px" value={raum} onInput={(ev) => setRaum((ev.target as HTMLInputElement).value.trim().toLowerCase())} />
            {!raumOk && <span class="klein warnung">4–32 Zeichen: Kleinbuchstaben, Ziffern, Bindestrich</span>}
            <span style="flex:1" />
            <a class={`knopf klein weiter ${raumOk ? "" : "aus"}`} href={raumOk ? adresseFuer(direkt, "sl") : undefined} onClick={() => merken(direkt)}
              title="Ein Fenster: Steuerung und alle drei Rollen bedienbar (oben links umschalten)" data-testid="solo">Allein testen (ein Fenster)</a>
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

      <div class="zeile zwischen">
        <button type="button" class="knopf klein leise" onClick={p.zurueck}>◂ zurück</button>
        <span class="zeile klein" style="gap:14px">
          {!__ARGUS_OFFLINE__ && <a style="color:var(--info)" href={`${location.pathname}?auswertung=demo`} target="_blank" rel="noopener" data-testid="auswertung-demo"
            title="Auswertung mit fünf Beispielteams (Modellteams des Drehbuchs) – zum Üben der Auflösung ohne Spiel">Auswertung üben (Beispiel, 5 Teams)</a>}
          <a style="color:var(--info)" href={`${location.pathname}?druck=einweisung`} target="_blank" rel="noopener">Einweisungskarten drucken (A5)</a>
          {!__ARGUS_OFFLINE__ && <a style="color:var(--info)" href={`${location.pathname.replace(/[^/]*$/, "")}lasttest.html`} target="_blank" rel="noopener"
            title="Lasttest gegen Firebase: Bots spielen das Drehbuch in n Teams">Lasttest</a>}
        </span>
      </div>
    </div>
  );
}

export function Start(p: { e: Einstellungen }) {
  const [e, setE] = useState<Einstellungen>(p.e);
  const [inh, setInh] = useState<Inhalte | null>(null);
  const [ladeFehler, setLadeFehler] = useState<string | null>(null);
  const [seite, setSeite] = useState<Seite>(seiteAusAnker);
  useEffect(() => {
    ladeInhalte(e.szenario).then(setInh).catch((err: Error) => setLadeFehler(`Szenario nicht geladen: ${err.message}`));
    const anker = () => setSeite(seiteAusAnker());
    window.addEventListener("hashchange", anker);
    return () => window.removeEventListener("hashchange", anker);
  }, []);
  const gehe = (s: Seite) => {
    setSeite(s);
    history.pushState(null, "", s === "wahl" ? `${location.pathname}${location.search}` : `#${s}`);
  };
  return (
    <div class="start">
      <div class={`start-rahmen seite-${seite}`}>
        <Kopf />
        {seite === "wahl" && <Wahl gehe={gehe} />}
        {seite === "mitspielen" && <Mitspielen e={e} zurueck={() => gehe("wahl")} />}
        {seite === "spielleitung" && <Spielleitung e={e} setE={setE} inh={inh} ladeFehler={ladeFehler} zurueck={() => gehe("wahl")} />}
        <Fuss />
      </div>
    </div>
  );
}
