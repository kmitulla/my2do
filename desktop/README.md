# 2Do für Windows

Desktop-App für Windows 10/11 mit denselben Konten und Daten wie die
Browser-/iPhone-Version (die Web-App aus `../src` läuft in einem eigenen
Fenster, unter Windows 11 mit Mica-Hintergrund).

## Aufbau

- **Links** Navigation: Aufgaben, Notizen, Übersicht, Inbox, intelligente
  Listen (Alle, Fällig, Favoriten, Geteilt, Erledigt, Archiv) und Tags.
- **Mitte** die Aufgabenliste mit Schnellerfassung, Sortierung und Filter.
- **Rechts** das ausgewählte 2do – Änderungen werden automatisch gespeichert.
- Nichts überlagert die Arbeitsfläche; 2dos und Notizen lassen sich bei Bedarf
  zusätzlich in eigenen Fenstern öffnen.

## Infobereich

Minimieren und Schließen legen 2Do in den Infobereich der Taskleiste (rechts
unten). Ein Klick aufs Symbol holt es zurück, Rechtsklick öffnet das Menü
(u. a. „2Do beenden"). Beides lässt sich in den Einstellungen abschalten.

## Tastenkürzel

| Wo | Kürzel |
| --- | --- |
| Überall in Windows | `Strg+Alt+Leertaste` 2Do zeigen/verstecken · `Strg+Alt+N` neues 2do (beide einstellbar) |
| In 2Do | `Strg+N` neues 2do · `Strg+F` suchen · `Strg+1…5` Bereiche |
| In der Liste | `↑` `↓` wechseln · `Eingabe` bearbeiten · `Leertaste` erledigt · `Entf` löschen · Rechtsklick für mehr |
| Im 2do | `Esc` schließen · `Strg+S` sofort speichern · `Strg+Umschalt+Eingabe` eigenes Fenster · `Strg+T` Zeitmarke |

Ein 2do wird erst gesperrt, wenn man es tatsächlich bearbeitet (nicht schon
beim Ansehen), und nach 2 Minuten ohne Eingabe wieder freigegeben.

## Bauen

Automatisch über `.github/workflows/desktop.yml` auf einem Windows-Runner:
bei Änderungen auf `main` als Artefakt, bei einem Tag `desktop-v…` zusätzlich
als GitHub-Release mit Installer und portabler exe.

Lokal (Windows, Node 22):

```bash
npm ci            # im Hauptordner
cd desktop
npm ci
npm start         # zum Ausprobieren
npm run dist      # → desktop/release/2Do-Setup-<version>.exe + -portable.exe
```

Die Version steht in `desktop/package.json`. Die exe ist nicht signiert –
Windows SmartScreen fragt beim ersten Start nach („Weitere Informationen →
Trotzdem ausführen").
