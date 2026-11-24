// Statusprüfung für status.ibuildit.org (Marco, 27.11.2026). Läuft in GitHub Actions, also außerhalb von Hostinger.
// Ohne Abhängigkeiten (Node 20+). Schreibt status.json (jetzt) und verlauf.json (je Dienst und Tag, 90 Tage).
// Bei Ausfall: Datei ausfall.txt, daraus öffnet der Ablauf ein Issue (GitHub schickt eine Mail).
// Aufruf: node pruefen.mjs [oeffentlich|intern]
import { readFile, writeFile } from "node:fs/promises";
import tls from "node:tls";

const ART = process.argv[2] === "intern" ? "intern" : "oeffentlich";
const erreichbar = (s) => (s >= 200 && s < 400) || s === 401; // 401 = Passwortschutz vor der Seite, Server antwortet

const OEFFENTLICH = [
  { id: "app", name: "App und Anleitungen", url: "https://app.ibuildit.org/", ok: erreichbar },
  { id: "kurzlinks", name: "QR-Kurzlinks", url: "https://ibuildit.org/a/beispiel-schuhregal", ok: erreichbar },
  { id: "portal", name: "Hersteller-Portal", url: "https://portal.ibuildit.org/", ok: erreichbar },
  { id: "anmeldung", name: "Anmeldung", url: process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL}/auth/v1/health` : null, ok: (s) => s === 200 || s === 401 },
  { id: "datenbank", name: "Meldungen und Tickets", url: process.env.SUPABASE_URL ? `${process.env.SUPABASE_URL}/rest/v1/` : null, ok: (s) => s > 0 && s < 500 },
  { id: "mail", name: "E-Mail-Versand", tls: "smtp.gmail.com:465" },
];
const INTERN = [
  { id: "coolify", name: "Coolify", url: "https://coolify.ibuildit.org/", ok: erreichbar },
  { id: "twenty", name: "Twenty CRM", url: process.env.TWENTY_URL || null, ok: erreichbar },
  { id: "server-tls", name: "Zertifikat ibuildit.org", tls: "ibuildit.org:443", tage: 14 },
  { id: "portal-tls", name: "Zertifikat portal", tls: "portal.ibuildit.org:443", tage: 14 },
  { id: "supabase-status", name: "Supabase (Anbieter)", url: "https://status.supabase.com/api/v2/status.json", json: true },
  { id: "anthropic-status", name: "Claude-API (Anbieter)", url: "https://status.claude.com/api/v2/status.json", json: true },
];

async function http(d) {
  if (!d.url) return { ok: null, ms: null, info: "nicht eingerichtet" };
  const t0 = Date.now();
  try {
    const r = await fetch(d.url, { redirect: d.json ? "follow" : "manual", signal: AbortSignal.timeout(10000), headers: d.json ? {} : { "user-agent": "ibuildit-status" } });
    if (d.json) { const j = await r.json().catch(() => null); if (!j) return { ok: null, ms: Date.now() - t0, info: `keine Statusdaten (Antwort ${r.status})` }; // „minor“ (teilweise eingeschränkt) ist kein Ausfall, erst „major“ oder „critical“
      const ind = j?.status?.indicator; return { ok: ind === "none" || ind === "minor", ms: Date.now() - t0, info: ind === "none" ? null : j?.status?.description ?? null }; }
    const ok = d.ok(r.status);
    return { ok, ms: Date.now() - t0, info: ok ? null : `Antwort ${r.status}` };
  } catch (e) { return { ok: false, ms: null, info: e?.name === "TimeoutError" ? "keine Antwort in 10 s" : String(e?.message ?? e).slice(0, 120) }; }
}
function tlsPruefen(d) {
  const [host, port] = d.tls.split(":");
  const t0 = Date.now();
  return new Promise((fertig) => {
    const s = tls.connect({ host, port: Number(port), servername: host, timeout: 10000 }, () => {
      const c = s.getPeerCertificate(); s.end();
      const tage = c?.valid_to ? Math.floor((new Date(c.valid_to) - Date.now()) / 864e5) : null;
      const ok = d.tage ? tage !== null && tage >= d.tage : true;
      fertig({ ok, ms: Date.now() - t0, info: d.tage ? `noch ${tage} Tage gültig` : null });
    });
    s.on("error", (e) => fertig({ ok: false, ms: null, info: e.message.slice(0, 120) }));
    s.on("timeout", () => { s.destroy(); fertig({ ok: false, ms: null, info: "keine Antwort" }); });
  });
}

const liste = ART === "intern" ? INTERN : OEFFENTLICH;
// zweiter Versuch nach 20 s, bevor etwas als Ausfall gilt (kurze Wackler sind kein Ausfall)
async function einmal(d) { return d.tls ? tlsPruefen(d) : http(d); }
const erg = [];
for (const d of liste) {
  let r = await einmal(d);
  if (r.ok === false) { await new Promise((x) => setTimeout(x, 20000)); r = await einmal(d); }
  erg.push({ id: d.id, name: d.name, ...r });
}

const jetzt = new Date().toISOString();
const tag = jetzt.slice(0, 10);
let verlauf = {};
try { verlauf = JSON.parse(await readFile("verlauf.json", "utf8")); } catch { /* erster Lauf */ }
for (const e of erg) {
  if (e.ok === null) continue;
  const v = (verlauf[e.id] ??= {});
  const t = (v[tag] ??= { ok: 0, n: 0 });
  t.n++; if (e.ok) t.ok++;
  for (const k of Object.keys(v).sort().slice(0, -90)) delete v[k];
}
await writeFile("verlauf.json", JSON.stringify(verlauf));
await writeFile("status.json", JSON.stringify({ geprueft: jetzt, dienste: erg }, null, 1));
const weg = erg.filter((e) => e.ok === false);
if (weg.length) await writeFile("ausfall.txt", weg.map((e) => `${e.name}: ${e.info ?? "gestört"}`).join("\n"));
console.log(erg.map((e) => `${e.ok === null ? "–" : e.ok ? "OK" : "AUSFALL"} ${e.name} ${e.ms ?? ""}ms ${e.info ?? ""}`).join("\n"));
