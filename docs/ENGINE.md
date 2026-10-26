# ARGUS – Engine und Live-Lage (Schritt 7)

Stand 26.10.2026 (Szenario 2.1, Änderungen A1–A9 nach dem Solo-Durchlauf). Grundlage: Konzept v2 (§4–§6), Szenario
KRÄHE-01 v2.1 (`anforderungen_technik`),
Referenz `tools/referenz/argus_lib.py` (`einschlag`, `wirkung`, `gt_bei`) und
`tools/referenz/simuliere_durchlauf.py`. Alles ist eine reine Funktion von Inhalten, Protokoll und Spielzeit:
gleiches Protokoll ⇒ gleicher Stand, gleiche Karte, gleiche Effekte in jedem Fenster.

## Ergebnis

| Teil | Umsetzung | Modul |
|---|---|---|
| Trefferregel beim Einschlag | Einschlag = Freigabe + Flugzeit (Mörser 35 s, LM 5 s Start + Flug mit 30 m/s ab `flug.start`, PzAbw 10 s), Ort = Position des ersten bei der Freigabe noch stehenden Fahrzeugs der Meldung zum Einschlagzeitpunkt (Fixpunkt-Iteration beim LM). Getroffen ist alles im Wirkradius nach der Lage beim Einschlag, dazu das bekämpfte Fahrzeug; R2, R3 und Einsatzbereich gelten am Einschlagort. | `src/kern/regeln.ts` (`flugzeit`, `einschlag`, `wirkungBeimEinschlag`, `vorhersage`) |
| Vorausrechnung der Warnungen | G2: je Wirkmittel „Einschlag in n s (Uhrzeit)“, Warnungen, Vorschau am Einschlagort mit gestrichelter Linie vom Ziel jetzt dorthin, Abstände am Einschlagort. G3: „Freigabe jetzt: Einschlag …“ live, dazu die Warnungen von G2. Der Host rechnet bei der Freigabe den Einschlag (Zeit, Ort, bekämpftes Fahrzeug) und schreibt ihn ins Protokoll. | `src/engine/aktionen.ts`, `src/ansichten/g2.tsx`, `g3.tsx` |
| Bewegung | Routen `[t_s, x, y]` mit Halten; Objekte nur zwischen `ab_s` und `bis_s`; zerstörte Fahrzeuge bleiben als Wrack an der Trefferstelle. Die Karte rechnet die Position in jedem Bild aus der Bahn (`bahnLage`), das Lagebild nur bei neuen Ereignissen und im Sekundentakt. | `src/kern/geometrie.ts`, `src/kern/lagebild.ts`, `src/karte/lagekarte.ts` |
| Tracking | Gemeldete Ziele bleiben bei G1, G2, G3 als Zeichen der ARGUS-Klasse (nie Ground Truth) und fahren mit – am ersten noch stehenden Fahrzeug der Meldung, Zahl = noch stehende Fahrzeuge. Nach der eigenen Wirkung bleibt das Zeichen durchgestrichen beim bekämpften Fahrzeug am Einschlagort (den Rest eines Zuges meldet ARGUS neu). Abgezogene Ziele verschwinden, sobald die Meldung erledigt ist. Seit 6b hat auch G1 die Karte. | `src/kern/lagebild.ts` |
| Hintergrundgefecht H-01–H-12 | Feindartillerie (H-01, H-04, H-12) und Rauch (H-03) sind Darstellung. Eigene PzAbw (H-02, H-05–H-11) wirkt nur, wenn das Ziel dann noch steht und diesseits des Bachs ist, sonst `wirkt: false` mit Grund. Folge `zerstoert` (Wrack brennt) oder `ausser_gefecht` (Z-24: Kette ab, kein Brand). | `src/engine/ablauf.ts` |
| Zustandswechsel | Ground Truth zur Zeit t (`gtBei`): Z-24 ist bis 19:30 legitimer T-72 (`gt.vorher`), danach außer Gefecht (`gt.ab_s`). Trefferwertung, Kontrollkarte und Übersicht nehmen die Lage beim Einschlag. | `src/kern/geometrie.ts` |
| Meldung entfällt | beim Erscheinen (`meldung.entfaellt`) oder später in der Kette bei G1, G2 oder G3 (`meldung_entfaellt` mit Stufe und Grund), sobald jedes Fahrzeug der Meldung zerstört oder abgezogen ist. Die Rolle bekommt einen kurzen Hinweis („M13 entfällt – alle Fahrzeuge zerstört“). | `src/engine/ablauf.ts`, `src/ansichten/gemeinsam/hooks.ts` |
| E-01 automatisch | Ist bis 23:30 keine Wirkung auf Z-15–17 freigegeben, schießen die PT-91 nacheinander (Wirkung nur, wenn Schütze und Ziel dann noch stehen und das Ziel legitim ist); eine Freigabe vorher lässt E-01 entfallen. I-08a/I-08b wie bisher. Die SL sieht den Stand („wartet“, „läuft – getroffen …“, „entfällt“). | `src/engine/ablauf.ts` (`faellig`, `bedingtStand`) |
| Verstärkung V-1–V-5 | Übersicht der SL: Menü „Verstärkung ▾“ mit „an alle“ (Standard) und je Team ein Knopf; Teamansicht: „einspielen“ je Gruppe. Jede Gruppe höchstens einmal je Lauf, in den Fenstern `nicht_einspielen` gesperrt (Grund und „wieder ab …“ im Knopf), nach 18:00 Hinweis, wenn ein Team noch Meldungen im Eingang hat. Im Protokoll als `verstaerkung {gruppe, t_ab}`; die Welt des Teams (`welt()`) enthält dann Ziele und Meldungen mit Zeiten ab t_ab. Die Übersicht zeigt „+n V“ je Team. | `src/kern/welt.ts`, `src/ansichten/gemeinsam/verstaerkung.tsx`, `uebersicht.tsx`, `sl.tsx` |
| Effekte auf der Karte | Einschlag, LM im Flug (mit Schatten und Kondensstreifen), Leuchtspur der PzAbw vom Westrand, Mündungsblitz (E-01), Feindartillerie mit Kratern, Nebelwand H-03, brennende Wracks mit Rauchfahne, seit 2.1 Feuer feindlicher Mörser und Kanonen nach Schussrhythmus und Staub hinter fahrenden Fahrzeugen – mit den Assets aus 5b nach `manifest.effekte.zuordnung`. | `src/kern/effekte.ts` (was, wann, wo), `src/karte/effektebene.ts` (wie) |
| Durchbruch (seit 2.1, A4) | Wird eine Feindgruppe (`szenario.durchbruch.gruppen`, auch `verstaerkungen.gruppen[].durchbruch`) bis zu ihrem Angriffszeitpunkt `t_s` nicht aufgehalten (kein Fahrzeug zerstört oder außer Gefecht), schreibt der Host nach `t_s` `durchbruch {gruppe, t_ab, durch: true}`; sonst `durch: false` mit Grund („Z-30 zerstört“, „nicht mehr im Raum“). Die Welt des Teams ersetzt dann die Route jedes Fahrzeugs ab `t_s` durch die Durchbruch-Route über Brücke oder Furt westlich aus dem Bild (`bis_s` = Ausfahrt). Späher und Unterstützung (Mörser, Lkw, EloKa) haben keine Gruppe. I-13 („Feind ist über den Bach ELSTER bei uns eingebrochen“, `bedingung.typ: durchbruch`) kommt 10 s nach dem ersten Fahrzeug über dem Bach, wenn es dann noch steht. Kennzahl „durchgebrochen“ je Team (Fahrzeuge über dem Bach bis Spielende), keine Punkte; die SL sieht je Gruppe „wartet / bricht durch / aufgehalten“. | `src/kern/durchbruch.ts`, `src/kern/welt.ts`, `src/engine/ablauf.ts` (Abschnitt 3b, `bedingtStand`) |
| Feuer und Staub (seit 2.1, A8) | `ziele[].feuert` = Feuerstöße `{von_s, bis_s, takt_s, salve, pause_s}` (`schuesse()`, wie `argus_lib.schuesse`); bei Verstärkungen ab dem Einspielen verschoben. Mörser (`steilfeuer`) zeigen je Schuss `muendungsblitz_steil` am wechselnden Rohr und danach `abschussrauch`, Kanonen `muendungsblitz` in Richtung des Ziels. Fahrende Fahrzeuge (ab 1,5 m/s) ziehen eine Staubspur: alle 1,2 s Spielzeit eine Wolke, 6 Takte sichtbar (`staubSpur`), auf der Karte (`staub`) und im Live-Drohnenbild. | `src/kern/effekte.ts`, `src/karte/effektebene.ts`, `src/drohne/livebild.ts` |

## Effekte

`kern/effekte.ts` sagt nur, **was** geschieht (Quelle: Wirkmittel, Art des Hintergrundereignisses, was feuert,
Folge am Wrack), **wann** und **wo**. Das **Aussehen** steht im Asset-Manifest (Schritt 5b):

| Quelle | Flug | Einschlag | danach |
|---|---|---|---|
| Mörser (MRS) | – | `explosion_mittel` | `krater` |
| Loitering Munition (LM) | `lm_flug`, Spielzeit von Abflug (Freigabe + 5 s) bis Einschlag, gedreht, Schatten 4 m versetzt | `explosion_klein` | `krater` |
| Panzerabwehr (PZA), eigene PzAbw im Hintergrundgefecht | `leuchtspur` vom Westrand auf Höhe der Kompanie, 0,6 s Echtzeit | `treffer_direkt` | – |
| Feindartillerie | – | `einschlag_artillerie` je Eintrag in `einschlaege` | `krater` |
| Rauch (H-03) | Fläche aus mehreren `nebel` über `radius_m`, ein- und ausblenden | | |
| Wrack | zerstört: `feuer` (150 s) und `rauch` (420 s); außer Gefecht: nichts, Zustands-Sprite `*_kette_ab.png` | | |
| feuert (E-01) | `muendungsblitz` an der Mündung, Richtung zum Ziel; Leuchtspur und `treffer_direkt` | | |
| feuert Kanone (seit 2.1, `ziele[].feuert`) | `muendungsblitz` je Schuss nach Schussrhythmus, Richtung zum Ziel | | |
| feuert Mörser (seit 2.1) | `muendungsblitz_steil` am Rohr (wechselt je Schuss) | | `abschussrauch` (steigt auf, ca. 6 s) |
| fährt (seit 2.1) | `staub` hinter dem Fahrzeug, nur ab 1,5 m/s, auf Karte und im Live-Drohnenbild (Zuordnung `fahrt`) | | |

Kurze Animationen laufen in Echtzeit (bei Tempo ×10 sieht ein Einschlag aus wie bei ×1), der LM-Flug in
Spielzeit (er ist Teil der Regel). Schleifen laufen auch bei stehender Uhr weiter (dann mit ca. 12 Bildern/s).

**Wer was sieht** (`effekte(inh, z, sichtbar)`):

| Ansicht | Effekte |
|---|---|
| Spielleitung (Kontrollkarte), Plenum nach Spielende | alle |
| G1, G2, G3 | eigene Wirkungen, Feindartillerie, Nebel; Hintergrundgefecht, E-01 und Wracks nur zu Zielen, die die Rolle aus einer Meldung kennt (`bekannteZiele`); Mündungsblitz nur, wenn sie auch den Schützen kennt |
| Plenum während des Spiels | nur Feindartillerie und Nebel (nichts verrät ein Ziel) |

## Gleichzeitigkeit (wie `simuliere_durchlauf.py`)

* Zerstörungen zum Zeitpunkt T gelten für Entscheidungen zum Zeitpunkt T schon.
* Was davon abhängt, dass bis T keine Freigabe kam (E-01, I-08b), wird erst fällig, wenn die Uhr T
  überschritten hat – eine Freigabe genau um T zählt also noch.
* Bei gleichem Zeitpunkt wirkt das Drehbuch (Hintergrundgefecht) vor den eigenen Einschlägen.
* Die Spielzeit einer Aktion ist die des Klicks; kommt sie später an (Netz), rechnet der Host mit der
  Klickzeit, nie vor dem letzten Ereignis.

## Protokoll (neu in Schritt 7)

| typ | daten |
|---|---|
| `g3_entscheid` (Freigabe) | + `einschlag {t, pos, ziel}` (vorausberechnet) |
| `wirkung` | + `t_einschlag`, `ziel`, `verstoesse[]` (am Einschlagort); `getroffen[]` nach der Lage beim Einschlag |
| `meldung_entfaellt` | meldung, stufe, grund |
| `hintergrund` | id, art, ziel?, wirkt?, folge?, grund? |
| `ereignis` | ereignis, nr?, von?, ziel?, wirkt?, entfaellt?, grund? |
| `verstaerkung` | gruppe, t_ab (Aktion `verstaerkung_einspielen`, nur SL) |
| `durchbruch` (seit 2.1) | gruppe, t_ab (= t_s der Gruppe), durch, grund? |

Die Firebase-Regeln prüfen Typen nur nach Form; neue Typen gehen ohne Regeländerung durch. Dabei gilt:
Feldnamen in `daten` nur aus Kleinbuchstaben und `_` (keine Ziffern, daher `t_ab` statt `t0`), höchstens drei
Ebenen unter `daten`. Sonst weist Firebase das Ereignis ab und der Host gibt die Steuerung ab.
`tests/firebase_regeln.test.ts` schreibt alle Ereignisse zweier echter Läufe und das ganze Drehbuch mit fünf
Teams (jedes Ereignis, jede Aktion) durch die Regeln.

## Nachweis „Fertig, wenn“

| Prüfung | Ergebnis |
|---|---|
| `tests/durchlauf.test.ts`: die fünf Läufe von `simuliere_durchlauf.py` (naiv, ideal, beide mit V-1…V-4, naiv mit V-1…V-5) als **fünf Teams an einem Taktgeber** mit der echten Engine (Host, Zeitplan, Trefferregel, Hintergrundgefecht, E-01, Verstärkungen); Referenz `tests/referenz_durchlauf.json` aus `tools/referenz/erzeuge_durchlauf.py` (neu erzeugt: unverändert) | je Meldung gleicher Ausgang, gleiche Zeiten (G1, G2, Freigabe), gleiches Wirkmittel, Einschlag (Zeit ± 0,06 s, Ort ± 0,2 m, bekämpftes Fahrzeug), gleiche Treffer und Verstöße beim Einschlag; gleiche Injects (I-08a/b, I-09) mit Zeit, Hintergrundgefecht (wirkt/entfällt), E-01, Restbestand und erreichte Schlüssel-/Nebenfälle – **alle fünf Teams stimmen überein** |
| `tools/e2e_drehbuch.py`: **18 Browserfenster** (5 Teams à 3 über Lobby und Code, SL 1 als Host aller Teams, SL 2 beobachtet, Plenum), Tempo ×5, Modellpersonen schicken die Aktionen der fünf Läufe über die Sicht ihres Fensters (Weg wie ein Klick), die SL spielt die Verstärkungen ein | alle fünf Teams bis Spielende (25:00), **Protokolle wie die Engine im Prozess** (= Simulation): dieselben Meldungen, Entscheidungen, Einschläge mit Ort, Fahrzeug, Treffern und Verstößen, entfallene Meldungen, Injects, Hintergrundgefecht, E-01, Verstärkungen; gleicher Restbestand und dieselben zerstörten Fahrzeuge; größte Zeitabweichung 0,9 s Spielzeit (Klickverzug bei ×5); keine Aktion abgelehnt; je Team gleicher Stand in allen vier Fenstern; alle 18 Fenster in 1530 × 800; keine Konsolenfehler. Laufzeit 5,5 min. **Ebenso mit der Offline-Datei** (Variante C, file://): größte Zeitabweichung 0,8 s. **Firebase-Nachbildung** (WebSocket, Regeln aktiv): mit den Teams „naiv“ und „ideal“ bestanden (größte Abweichung 0,6 s); mit allen fünf Teams spielen alle bis zum Ende, der Host bleibt stabil, Treffer, Verstöße, Wirkmittel, Bestand und zerstörte Fahrzeuge sind gleich, aber ab ca. 15:00 kommen Aktionen bis zu 7 s später beim Host an (siehe Befund unten). Verglichen werden Ergebnisse genau, Zeiten des Zeitplans auf 0,5 s, was aus einem Klick folgt (Entscheidung, Einschlag, Meldung einer Verstärkung, bedingter Inject) auf 1 s Echtzeit; Abstände und Uhrzeiten in Warnungen hängen von der Klickzeit ab und zählen nicht, der Einschlagort auf einem fahrenden Ziel darf sich um den späteren Klick verschieben (8,5 m/s). Neu gemessen: Weg Klick → Protokoll (lokal Median 12–42 ms, höchstens 0,35 s) |
| `tools/livelage_probe.py` (WebGL und Rückfall Canvas): Verstärkung über „einspielen“ und über das Menü der Übersicht („an alle“, ein Team, Sperrfenster), Feindartillerie, Kette über die Knöpfe mit LM im Flug und Einschlag am vorausberechneten Ort, Leuchtspur H-02, Nebel H-03 und brennendes Wrack, Z-24 „Kette ab“, E-01, Auflösung | alle Prüfpunkte erfüllt, Fotos aller Effekte, alle Ansichten in 1530 × 800 |
| Bildrate (Kontrollkarte, G2, G3, Plenum) | Zeichenzeit je Bild Ø 1–2 ms, höchstens ca. 13 ms (Budget bei 30 Bildern/s: 33 ms). Rückfall Canvas ohne Grafikkarte: Kontrollkarte allein ×10 29–30 Bilder/s, ×1 12–21 (adaptiv), gezoomt 15–30; vier Kartenfenster gleichzeitig 10–30. WebGL nur per Software (SwiftShader, keine Grafikkarte in der Testumgebung): 7–8 Bilder/s für ein Fenster – Grenze der Software-Rasterung, nicht der Karte. Am Dienst-PC (WebGL 2, Intel UHD, Netztest 61 Bilder/s bei 1.500 Objekten) zu bestätigen |
| `tests/effekte.test.ts` (neu, 6), Tracking in `tests/lagebild.test.ts` (neu, 2), Drehbuch mit fünf Teams durch die Firebase-Regeln (jedes Ereignis, jede Aktion) in `tests/firebase_regeln.test.ts` (neu, 2), insgesamt **97 automatische Tests** | bestanden (Firebase-Adapter gegen die Nachbildung eingeschlossen) |
| Werkzeuge aus 4–6: `ui_bilder.py` und `ui_faelle.py` (an die Live-Engine angepasst: seit Schritt 7 entfallen Meldungen, deren Fahrzeuge zerstört oder abgezogen sind), `bedientest_probe.py`, `e2e_vier_fenster.py` (lokal und Offline-Datei), `e2e_teams.py` (16 Fenster), `lobby_probe.py` | alle bestanden: 19 + 21 Bilder ohne Rollbalken, 14/14 Aufgaben des Bedientests, vier Fenster synchron, 5 Teams synchron mit jeder Aktion im Protokoll ihres Teams, 19/19 Aufgaben der Lobby. `e2e_teams.py` und `lobby_probe.py` laufen wie `e2e_drehbuch.py` im Rückfall Canvas mit höchstens 2 Bildern/s (`--renderer`, `--fps`) |

**Befund Bildrate:** Mit 18 Fenstern an einem Rechner ohne Grafikkarte warten WebGL-Fenster auf den
überlasteten GPU-Prozess und stehen sekundenlang (G2/G3 klickten bis zu 2 min Spielzeit zu spät). Deshalb läuft
der Browser-Durchlauf im Rückfall Canvas mit höchstens 2 Bildern/s je Karte. Im Hörsaal hat jedes Fenster
seinen Rechner. Für schwache Rechner und Variante C (alle Fenster an einem PC) gibt es `?fps=…` (Höchstwert,
im Browser gemerkt); die Karte zeichnet ohnehin nur so oft wie nötig (30 Bilder/s nur, solange etwas fliegt
oder einschlägt, bei ×1 sonst 12).

**Befund Firebase (22.10.):** Die Regeln wiesen das Ereignis `verstaerkung {gruppe, t0}` ab (Ziffer im
Feldnamen), der Host gab daraufhin die Steuerung für alle Teams ab. Behoben mit `t_ab`; keine Regeländerung.
Danach mit fünf Teams gegen die Nachbildung: Der Weg Klick → Protokoll wächst von ca. 0,2 s auf bis zu 7 s
gegen Spielende, mit zwei Teams auf ca. 1 s, lokal bleibt er unter 0,35 s. Ursache ist die Nachbildung
(`firebase-server`): Sie filtert keine Abfragen und schickt bei jedem neuen Ereignis das ganze Protokoll an
jeden Zuhörer (bis 35 KB je Team, 2 Prozessorkerne für 18 Fenster). Die echte Datenbank schickt nur das
neue Ereignis; die Zuhörer der App sind darauf ausgelegt (`startAfter` beim Protokoll). Nachweis mit der
echten Datenbank und 16 Rechnern steht aus.

## Szenario 2.1 (26.10.2026): Nachweis

| Prüfung | Ergebnis |
|---|---|
| `pruefe_szenario.py` (prüft jetzt auch Durchbruch-Routen über Brücke/Furt, Feuer nur im Stand, sichtbare Zonennamen) | OK, keine Fehler |
| `simuliere_durchlauf.py` | naiv und ideal erreichen alle Schlüssel- und Nebenfälle (auch mit V-1…V-4). naiv: Z-27, Z-28 brechen durch (D-04, D-05), I-13 um 24:11; ideal: niemand, I-08b um 24:40 |
| `tests/durchlauf.test.ts` (fünf Teams an einem Taktgeber, Referenz neu erzeugt) | je Meldung, Inject, Hintergrundereignis, E-01 und Durchbruch gleich der Simulation, dazu die Kennzahl „durchgebrochen“ |
| `tests/szenario21.test.ts` (neu) | Durchbruch-Routen, I-13, Feuer, Zonennamen, nur 2. Kp |
| `tools/livelage_probe.py` (A4 und A4b neu) | Durchbruch V-2 gesperrt bis 07:00; Mörser M05 feuert sichtbar (Blitz, Abschussrauch), Staub hinter fahrenden Fahrzeugen auf der Kontrollkarte |
| `tools/drohne_probe.py` (2b neu) | Live-Drohnenbild: Mündungsblitz und Abschussrauch zur Schusszeit, kein Blitz zwischen den Stößen, Staub hinter M13 |
| `tools/e2e_drehbuch.py` (18 Fenster, ×5) | alle fünf Teams bis Spielende, Protokolle wie die Engine im Prozess, auch die Durchbruch-Ereignisse; gleiche Ausgänge, Treffer, Bestände und zerstörten Fahrzeuge, keine Konsolen- oder Layoutfehler. Abweichungen nur bei Zeiten aus Klicks: Die Modellpersonen klicken in dieser Testumgebung 2–7 s Spielzeit zu spät (bei G1 vereinzelt bis 34 s, ein Fenster), wie schon bei B1–B12 beschrieben. Befund: Der Vergleich der Warnungen erwartete noch „beim Einschlag hh:mm:ss“ (vor B4) und meldete deshalb Abweichungen der Uhrzeit – behoben |
| Bildrate Live-Drohnenbild mit Staub | M15 (SPz-Zug fährt durchs Bild), Fenster am Ort, G1 allein, Rückfall Canvas: Ø 3,4 ms je Bild (Stand vor 2.1: 2,8 ms), höchstens 11 ms, 30 Bilder/s |
| Übrige Probe-Werkzeuge | `ui_bilder.py` 29 und `ui_faelle.py` 22 Bilder in 1530 × 800 ohne Rollbalken, `bedientest_probe.py` 18/18, `lobby_probe.py` 20/20, `auswertung_probe.py`, `e2e_vier_fenster.py`, `e2e_teams.py` (16 Fenster) bestanden |
| Gesamt | 130 automatische Tests (1 übersprungen) |

## Oberfläche (Schritt 6b, umgesetzt)

* Karte für G1 wie für G2/G3: `lagebildZielmeldungen(inh, z, "g1", tLage)` und
  `effekte(inh, z, bekannteZiele(inh, z, "g1"))`, Uhr über `sicht.kartenUhr()`.
* Marken und das Drohnenbild am Ort hängen an den Zeichen, deren Bildschirmlage die Karte nach jedem Bild
  meldet (`onBild`, `KartenBild`); siehe [`UI.md`](UI.md).
* Live-Drohnenbild (`src/drohne/livebild.ts`): Positionen aus denselben Bahnen (`position`, `vorhanden`),
  angehalten bei Zerstörung (`z.zerstoert`) bzw. außer Gefecht (`ausserGefechtAb`), Wrack/Zustand wie auf der
  Kontrollkarte. Hat das Ziel den Ausschnitt verlassen, zeigt G1 die Aufnahme zur Meldezeit.
* Die Bildrate der Karte steht an ihrem Element (`argusKarte.diagnose`), die des Live-Drohnenbilds an seiner
  Leinwand (`data-fps`, `argusLive`).
