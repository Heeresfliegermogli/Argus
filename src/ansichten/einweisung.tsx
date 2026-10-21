// Einweisungskarten je Gruppe: Auftrag (aus dem Szenario, lage.G1 …), Bedienung in drei Schritten
// (gleiche Nummern wie in der Ansicht), was die Gruppe sieht und was nicht. Erscheint als Fenster in
// der Ansicht (Knopf „Einweisung“ in der Kopfzeile, vor Spielbeginn von selbst) und als Druckseite
// (…/?druck=einweisung, A5 quer).
import type { ComponentChildren } from "preact";
import type { Inhalte } from "../inhalte/typen";
import type { Rolle } from "../kern/ereignisse";
import { ROLLEN_NAME } from "../kern/sichten";
import { uhrzeit } from "../kern/uhr";

type KartenRolle = Exclude<Rolle, "plenum">;

interface Schrittinfo {
  nr: number | null;
  zeichen?: string;
  titel: string;
  text: ComponentChildren;
}

interface KartenText {
  lage: string;
  unter: string;
  schritte: Schrittinfo[];
  sieht: string;
  siehtNicht: string;
  wichtig: ComponentChildren;
}

const M = (p: { k?: string; children: ComponentChildren }) => <span class={`muster ${p.k ?? ""}`}>{p.children}</span>;

/** Bedienung je Rolle. Auftrag und Lage kommen aus dem Szenario; hier steht nur, wie die Ansicht geht. */
function texte(inh: Inhalte): Record<KartenRolle, KartenText> {
  const ft = inh.regeln.fast_track.schwelle;
  const uhr = inh.szenario.spieluhr;
  const von = uhrzeit(uhr.start, 0).slice(0, 5);
  const bis = uhrzeit(uhr.start, uhr.dauer_s).slice(0, 5);
  const wm = Object.values(inh.wirkmittel).map((w) => w.kurz).join(", ");
  return {
    g1: {
      lage: "G1",
      unter: "Ihr prüft jede ARGUS-Meldung zuerst.",
      schritte: [
        { nr: 1, titel: "Meldung wählen", text: <>Neue Meldungen stehen links im Eingang. Die oberste ist schon gewählt.</> },
        { nr: 2, titel: "Bild und Daten prüfen", text: <>In der Mitte das Drohnenbild mit <M k="argus">ARGUS-Markierung</M>. Klick aufs Bild öffnet eine Vergrößerung mit Lupe. Rechts stehen Klasse, Konfidenz, Empfehlung und die Sensordaten der Drohne.</> },
        { nr: 3, titel: "Entscheiden", text: <><M>ANNEHMEN</M> schickt das Ziel an G2, <M>ABLEHNEN</M> beendet die Meldung. Ein Vermerk (eine Zeile) geht mit an G2.</> },
      ],
      sieht: "Drohnenbild, ARGUS-Daten, Sensordaten, Lagehinweise von G3",
      siehtNicht: "Lagekarte, Lagemeldungen der Brigade, was G2 und G3 entscheiden",
      wichtig: <>Ihr seid die erste Prüfstufe. Was ihr annehmt, geht als Ziel an G2 – G2 und G3 sehen weder Bild noch Sensordaten.</>,
    },
    g2: {
      lage: "G2",
      unter: "Ihr prüft die Einsatzregeln und wählt das Wirkmittel.",
      schritte: [
        { nr: 1, titel: "Zielmeldung wählen", text: <>Ziele, die G1 angenommen hat, stehen links. Auf der Lagekarte ist das gewählte Ziel gelb umrandet.</> },
        { nr: 2, titel: "Wirkmittel wählen und Warnungen prüfen", text: <>{wm}: Die Karte zeigt den Wirkradius – grün ohne Warnung, rot bei Verstoß gegen R2 (No-Strike-Zone), R3 (Einschränkungsgebiet) oder die Einsatzgrenze.</> },
        { nr: 3, titel: "Empfehlen", text: <><M k="toedlich">BEKÄMPFEN mit …</M> geht an G3. <M>BEOBACHTEN</M> stellt das Ziel zurück, es bleibt bei euch. <M>NICHT BEKÄMPFEN</M> schließt ab.</> },
      ],
      sieht: "Zielmeldung (Ziel-Nr., Lage, ARGUS-Klasse, Konfidenz, Vermerk G1), Lagekarte mit Zonen, Lagehinweise von G3",
      siehtNicht: "Drohnenbild, Sensordaten, Lagemeldungen der Brigade",
      wichtig: <>Das System warnt, verhindert aber nichts. Wirkmittel sind begrenzt – der Bestand steht am Wirkmittel.</>,
    },
    g3: {
      lage: "G3",
      unter: "Ihr gebt frei und führt das Gefecht.",
      schritte: [
        { nr: 1, titel: "Empfehlung wählen", text: <>Empfehlungen von G2 stehen links. Empfehlungen mit Regelwarnung sind rot markiert.</> },
        { nr: 2, titel: "Entscheiden", text: <><M k="toedlich">FREIGABE</M> löst die Wirkung aus. <M>ABLEHNEN</M> beendet, <M>ZURÜCK AN G2</M> schickt zur erneuten Prüfung. Die Karte zeigt Ziel und Wirkradius; nach der Freigabe steht dort bis zum Einschlag ein gestrichelter roter Kreis.</> },
        { nr: null, zeichen: "✉", titel: "Jederzeit: Lagemeldungen", text: <>Nur ihr bekommt Meldungen von Brigade, Nachbarn und Kompanien (rechts). Lesen, dann <M k="weiter">Gelesen</M>. Mit einem Lagehinweis informiert ihr G1 und G2. Fast-Track (ab {ft} % ohne G1) schaltet ihr selbst.</> },
      ],
      sieht: "Zielmeldung mit Empfehlung von G2, Lagekarte, Lagemeldungen",
      siehtNicht: "Drohnenbild, Sensordaten",
      wichtig: <>Ohne eure Freigabe wird nichts bekämpft. Ihr verantwortet jede Wirkung.</>,
    },
    sl: {
      lage: "spielleitung",
      unter: "SL 1 steuert alle Teams, SL 2 beobachtet und protokolliert.",
      schritte: [
        { nr: null, zeichen: "▶", titel: "Vor dem Spiel", text: <>Sitzung anlegen, „Plenum öffnen“ – das Smartboard zeigt den Code. Die Teilnehmer geben ihn ein und bilden Teams à drei (Doppelrolle, wenn jemand fehlt). Dann <M k="weiter">Spiel öffnen – alle Teams</M>, Einweisung lesen lassen, <M k="weiter">▶ Uhr starten – alle</M>. Die Uhr läuft {von}–{bis}.</> },
        { nr: null, zeichen: "◷", titel: "Während des Spiels", text: <>Meldungen und Injects kommen von selbst. Die Übersicht zeigt je Team Eingang, Schlüsselfälle und Fehltreffer. „ansehen ›“ öffnet ein Team: Steuerung (Fast-Track, Reserve, Notiz) oder Zuschauen bei G1–G3.</> },
        { nr: null, zeichen: "■", titel: "Spielende", text: <>Um {bis} hält die Uhr an und die Ansichten der Teams sperren. Das Plenum zeigt die Auflösung je Team. Protokolle je Team als JSON exportieren.</> },
      ],
      sieht: "alles: Ground Truth, ungemeldete Ziele, alle Entscheidungen, Protokoll",
      siehtNicht: "–",
      wichtig: <>Nicht eingreifen und keine Hinweise geben. Fragen zur Bedienung beantworten, Fragen zur Lage nicht.</>,
    },
  };
}

export function Einweisungskarte(p: { inh: Inhalte; rolle: KartenRolle; schliessen?: () => void; druck?: boolean }) {
  const tx = texte(p.inh)[p.rolle];
  const lage = p.inh.szenario.lage[tx.lage];
  return (
    <article class={`ekarte ${p.rolle}`} data-testid={`einweisung-${p.rolle}`} onClick={(e) => e.stopPropagation()}>
      <header class="ekarte-kopf">
        <h1>{ROLLEN_NAME[p.rolle]}</h1>
        <span class="unter">{tx.unter}</span>
      </header>
      <div class="ekarte-rumpf">
        <section>
          <h3>Euer Auftrag</h3>
          {(lage?.absaetze ?? []).map((a) => <p>{a}</p>)}
          <div class="sicht">
            <div><b>Ihr seht</b>{tx.sieht}</div>
            <div><b>Ihr seht nicht</b>{tx.siehtNicht}</div>
          </div>
        </section>
        <section>
          <h3>So bedient ihr die Ansicht</h3>
          <ol class="schrittliste">
            {tx.schritte.map((s) => (
              <li>
                {s.nr !== null ? <span class="schritt">{s.nr}</span> : <span class="schritt" aria-hidden="true">{s.zeichen}</span>}
                <div><b>{s.titel}</b><span>{s.text}</span></div>
              </li>
            ))}
          </ol>
          <div class="wichtig">{tx.wichtig}</div>
        </section>
      </div>
      <footer class="ekarte-fuss">
        <span>{p.inh.szenario.anzeige} · {p.inh.szenario.fiktiv}</span>
        {p.schliessen && <button type="button" class="knopf" onClick={p.schliessen} data-testid="einweisung-schliessen">Verstanden – zur Ansicht</button>}
      </footer>
    </article>
  );
}

export function EinweisungFenster(p: { inh: Inhalte; rolle: KartenRolle; schliessen: () => void }) {
  return (
    <div class="einweisung-schirm" onClick={p.schliessen} onKeyDown={(e) => e.key === "Escape" && p.schliessen()}>
      <Einweisungskarte inh={p.inh} rolle={p.rolle} schliessen={p.schliessen} />
    </div>
  );
}

/** Druckseite mit allen vier Karten. */
export function EinweisungDruck(p: { inh: Inhalte }) {
  return (
    <div class="druck-seiten">
      <div class="druck-leiste">
        <span>Einweisungskarten {p.inh.szenario.anzeige} – A5 quer, eine Karte je Seite</span>
        <button type="button" class="knopf" onClick={() => window.print()}>Drucken</button>
      </div>
      {(["g1", "g2", "g3", "sl"] as const).map((r) => <Einweisungskarte inh={p.inh} rolle={r} druck />)}
    </div>
  );
}

/** Einzeiler je Gruppe für die Plenumsansicht. */
export function gruppenKurz(inh: Inhalte): { rolle: "g1" | "g2" | "g3"; text: string }[] {
  const tx = texte(inh);
  return (["g1", "g2", "g3"] as const).map((r) => ({ rolle: r, text: tx[r].unter }));
}
