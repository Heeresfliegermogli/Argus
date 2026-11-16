// Teamnamen ändern (Liste Q, Q2): ein Feld für Lobby, Kopf des Team-Fensters und Übersicht der Spielleitung.
//   • Feld mit dem jetzigen Namen, 🎲 schlägt einen freien vor; Enter oder „Übernehmen“ speichert, Escape bricht ab.
//   • Geprüft wird in Sitzung.teamUmbenennen (teamnamePruefen): nicht leer, ≤ 24 Zeichen, kein Name eines anderen Teams, nicht
//     „Sitzung beendet“. Lehnt die Prüfung ab, bleibt das Feld offen und der Hinweis sagt warum; der alte Name bleibt.
//   • Das Team darf nur bis zum Start (Sitzung.teamnameAenderbar), die Spielleitung immer.
import { useEffect, useRef, useState } from "preact/hooks";
import { TEAMNAME_MAX, teamnameVorschlag } from "../../kern/sitzungen";
import type { Sitzung, TeamStand } from "../../sitzung/sitzung";

export function TeamnameFeld(p: {
  s: Sitzung; t: TeamStand; fertig: () => void;
  /** 🎲 zeigen (Lobby, Team-Fenster) */
  wuerfel?: boolean;
  /** Spielleitung in der Tabelle: nur das Feld (Enter speichert, Escape bricht ab, Verlassen des Felds speichert – wie bis Liste P) */
  kompakt?: boolean;
}) {
  const { s, t } = p;
  const [wert, setWert] = useState(t.name);
  const [warte, setWarte] = useState(false);
  const feld = useRef<HTMLInputElement>(null);
  const zu = useRef(false);
  useEffect(() => {
    feld.current?.focus();
    feld.current?.select();
  }, []);
  const schliessen = () => {
    if (zu.current) return;
    zu.current = true;
    p.fertig();
  };
  const speichern = async (ausBlur = false) => {
    if (warte || zu.current) return;
    setWarte(true);
    const ok = await s.teamUmbenennen(t.id, wert);
    setWarte(false);
    // abgelehnt: der alte Name bleibt, der Hinweis sagt warum – das Feld bleibt zum Verbessern offen (Spielleitung: beim Verlassen zu)
    if (ok || ausBlur) schliessen();
    else feld.current?.focus();
  };
  const andere = s.stand.teams.filter((x) => x.id !== t.id).map((x) => x.name);
  // Knöpfe nehmen den Fokus nicht (sonst speicherte das Verlassen des Felds schon beim Klick auf ✕)
  const ohneFokus = (e: MouseEvent) => e.preventDefault();
  return (
    <span class={`teamname-feld ${p.kompakt ? "kompakt" : ""}`} data-testid="teamname-feld" data-team={t.id}>
      <input ref={feld} class="feld team-umbenennen" value={wert} maxLength={TEAMNAME_MAX} aria-label="Neuer Teamname" data-testid="teamname-eingabe"
        onInput={(e) => setWert((e.target as HTMLInputElement).value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") void speichern();
          if (e.key === "Escape") {
            e.stopPropagation();
            schliessen();
          }
        }}
        onBlur={() => { if (p.kompakt) void speichern(true); }} />
      {p.wuerfel && (
        <button type="button" class="knopf wuerfel" title="Namen vorschlagen" data-testid="teamname-wuerfel"
          onMouseDown={ohneFokus} onClick={() => { setWert(teamnameVorschlag(andere)); feld.current?.focus(); }}>🎲</button>
      )}
      {!p.kompakt && (
        <>
          <button type="button" class="knopf klein weiter" disabled={warte} data-testid="teamname-uebernehmen" onMouseDown={ohneFokus} onClick={() => void speichern()}>Übernehmen</button>
          <button type="button" class="knopf klein leise" title="Abbrechen (Esc)" data-testid="teamname-abbrechen" onMouseDown={ohneFokus} onClick={schliessen}>✕</button>
        </>
      )}
    </span>
  );
}
