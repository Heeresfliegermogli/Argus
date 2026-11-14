// Notbremse „Alle Sitzungen beenden“ (Liste L, L3.1) und Banner „Neue Version“ (L4.1).
import { useState } from "preact/hooks";
import { useNeueVersion } from "./version";

/**
 * Unauffälliger Knopf; die Bestätigung ist das Eintippen von RESET. Setzt die globale Marke argus/v1/reset – jedes offene Fenster
 * jeder Sitzung und des Testraums schließt ab und geht zur Startseite. Lehnt die Datenbank ab (alte Regeln), steht das am Knopf.
 */
export function Notbremse(p: { ausloesen: () => Promise<"ok" | "regeln" | "fehler">; klasse?: string }) {
  const [offen, setOffen] = useState(false);
  const [wort, setWort] = useState("");
  const [stand, setStand] = useState<"" | "laeuft" | "ok" | "regeln" | "fehler">("");
  const los = async () => {
    if (wort.trim() !== "RESET" || stand === "laeuft") return;
    setStand("laeuft");
    setStand(await p.ausloesen().catch(() => "fehler" as const));
    setWort("");
  };
  if (stand === "regeln") {
    return (
      <span class="notbremse warnung" role="alert" data-testid="notbremse-regeln"
        title="Die Datenbank kennt den Pfad argus/v1/reset noch nicht. Firebase-Konsole → Projekt argus-sync-e9fbc → Realtime Database → Regeln → Inhalt von firebase/database.rules.json einsetzen → Veröffentlichen. Alles andere läuft mit den alten Regeln weiter.">
        <b>Firebase-Regeln veraltet – bitte veröffentlichen.</b> „Alle Sitzungen beenden“ braucht den neuen Pfad argus/v1/reset; sonst läuft alles normal.{" "}
        <button type="button" class="knopf klein mini" onClick={() => { setStand(""); setOffen(false); }}>ok</button>
      </span>
    );
  }
  if (!offen) {
    return (
      <button type="button" class={`knopf klein leise notbremse-knopf ${p.klasse ?? ""}`} onClick={() => { setOffen(true); setStand(""); }} data-testid="notbremse"
        title="Notbremse: beendet ALLE Sitzungen und den Testraum. Jedes offene ARGUS-Fenster (Teams, Spielleitung, Plenum) hält an, lädt sein Protokoll hoch und geht zur Startseite. Daten werden nicht gelöscht.">
        Alle Sitzungen beenden
      </button>
    );
  }
  return (
    <span class="notbremse" data-testid="notbremse-offen">
      <span class="klein">Alle Sitzungen beenden? <b>RESET</b> eintippen:</span>
      <input class="feld mono" style="width:86px" value={wort} maxLength={8} autoComplete="off" spellcheck={false} ref={(el) => el?.focus()} data-testid="notbremse-wort"
        onInput={(e) => setWort((e.target as HTMLInputElement).value.toUpperCase())}
        onKeyDown={(e) => { if (e.key === "Enter") void los(); if (e.key === "Escape") setOffen(false); }} />
      <button type="button" class="knopf klein schlecht" disabled={wort.trim() !== "RESET" || stand === "laeuft"} onClick={() => void los()} data-testid="notbremse-los">
        {stand === "laeuft" ? "wird gesendet …" : "beenden"}
      </button>
      <button type="button" class="knopf klein leise" onClick={() => setOffen(false)}>abbrechen</button>
      {stand === "fehler" && <span class="klein warnung">nicht gesendet – Netz prüfen</span>}
    </span>
  );
}

/** L4.1: „Neue Version – bitte neu laden“ (in jeder Ansicht; Startseite und Lobby laden selbst neu). */
export function VersionsBanner() {
  const v = useNeueVersion();
  if (!v) return null;
  return (
    <div class="versions-banner" role="status" data-testid="versions-banner" data-neu={v}>
      <b>Neue Version – bitte neu laden.</b> <span class="klein">Dieses Fenster: {__ARGUS_COMMIT__}, aktuell: {v}. Das Spiel läuft nach dem Neuladen an derselben Stelle weiter.</span>
      <button type="button" class="knopf klein" onClick={() => location.reload()} data-testid="neu-laden">neu laden</button>
    </div>
  );
}
