# Statusseite status.ibuildit.org (Vorlage, 27.11.2026)

Liegt als eigenes **öffentliches** Repo `ibuildit-app/status` auf GitHub (Actions-Minuten in öffentlichen Repos kostenlos) und wird über GitHub Pages ausgeliefert, komplett außerhalb von Hostinger. Konzept: `docs/betrieb-ausfallsicherheit.md`.

- `pruefen.mjs`: prüft die Dienste (zweiter Versuch nach 20 s, bevor etwas als Ausfall gilt), schreibt `status.json` und `verlauf.json` (90 Tage je Dienst).
- `.github/workflows/pruefen.yml`: alle 5 Minuten; bei Ausfall ein Issue mit Label `ausfall` (GitHub schickt eine Mail an die Beobachter des Repos), schließt es wieder, wenn alles läuft.
- `index.html`: die Seite im iBuildit-Stil (Orange, 90-Tage-Balken), lädt jede Minute neu.
- `CNAME`: status.ibuildit.org. DNS bei domainfactory: CNAME `status` → `ibuildit-app.github.io` (Marco).
- Repo-Variable `SUPABASE_URL` (öffentliche Projektadresse, steht ohnehin in der App).

Privates Rückfall-Repo `ibuildit-app/status-intern`: dieselben Dateien, im Ablauf `ART: intern` und `cron: "*/30 * * * *"`, Secret `TWENTY_URL`; ohne Pages (nur Issues und `status.json` im Repo, sichtbar für das Team mit GitHub-Zugang).

Gebaut wird die Seite nicht, sie ist statisch. Änderungen hier pflegen und ins Status-Repo kopieren.
