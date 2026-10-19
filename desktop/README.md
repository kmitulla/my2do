# 2Do für Windows

Die Desktop-App ist eine Seitenleiste für Windows 10/11. Sie enthält dieselbe
Web-App wie die Browser-/iPhone-Version (aus `../src`) und läuft mit
denselben Konten und Daten.

## Bedienung

| Aktion | Wie |
| --- | --- |
| Panel ein-/ausfahren | `Strg + Alt + Leertaste` (einstellbar). Das Panel fährt auf dem Bildschirm aus, auf dem gerade die Maus ist. |
| Neues 2do erfassen | `Strg + Alt + N` (einstellbar) |
| Am Rand ausfahren | Maus an den rechten Bildschirmrand schieben |
| Automatisch einfahren | Panel bleibt, solange die Maus drin oder am Rand ist, und fährt danach nach 3 s wieder ein (einstellbar, ein dünner Balken zeigt den Countdown) |
| Anheften | Pinnnadel oben oder `Strg + P` – dann fährt das Panel nicht automatisch ein |
| Breite | Am linken Rand des Panels ziehen |
| Im Panel | `Strg+N` neues 2do · `Strg+F` suchen · `Strg+1…6` Bereiche · `Strg+,` Einstellungen · `F1` alle Tastenkürzel · `Esc` einfahren |
| Im 2do-Editor | `Strg+S` speichern · `Strg+Enter` speichern & schließen · `Esc` schließen (speichert) · `Strg+T` Zeitmarke |

Über das Symbol im Infobereich der Taskleiste (rechts unten) gibt es
Einstellungen, Autostart („Mit Windows starten") und „2Do beenden".
Erinnerungen: Windows-Hinweis bei heute fälligen Wiedervorlagen und
15 Minuten vor einer Deadline.

## Bauen

Automatisch: der Workflow `.github/workflows/desktop.yml` baut bei Änderungen
auf `main` auf einem Windows-Runner (Download unter *Actions → Lauf →
Artifacts*). Ein Tag `desktop-v1.0.1` erzeugt zusätzlich ein GitHub-Release.

Lokal (Windows, Node 22):

```bash
npm ci            # im Hauptordner
cd desktop
npm ci
npm start         # zum Ausprobieren
npm run dist      # → desktop/release/2Do-Setup-<version>.exe + -portable.exe
```

Unter Linux geht `npm run dist` mit installiertem Wine (inkl. 32-Bit, für den
Installer).

Die Version steht in `desktop/package.json`. Die exe ist nicht signiert –
Windows SmartScreen fragt beim ersten Start nach („Weitere Informationen →
Trotzdem ausführen").
