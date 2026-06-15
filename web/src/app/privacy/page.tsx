import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Datenschutzerklärung — Roar Bliss",
  description: "Wie Roar Bliss deine Daten erhebt, verarbeitet und schützt.",
};

const C = {
  wrap: { minHeight: "100vh", background: "#0a0a0c", color: "#d9d4c8" } as const,
  inner: { maxWidth: 820, margin: "0 auto", padding: "clamp(4rem,9vh,6rem) 1.25rem 5rem", lineHeight: 1.7, fontSize: "0.98rem" } as const,
  h1: { fontFamily: "var(--font-serif)", fontWeight: 800, fontSize: "clamp(2rem,1.2rem+3vw,2.8rem)", color: "#ece7db", letterSpacing: "-0.01em" } as const,
  h2: { fontFamily: "var(--font-serif)", fontWeight: 700, fontSize: "1.35rem", color: "#D6A84F", marginTop: "2.2rem", marginBottom: "0.5rem" } as const,
  back: { color: "#9a958c", textDecoration: "none", fontSize: "0.85rem" } as const,
  muted: { color: "#9a958c", fontSize: "0.85rem" } as const,
  strong: { color: "#ece7db" } as const,
};

export default function PrivacyPage() {
  return (
    <div style={C.wrap}>
      <div style={C.inner}>
        <Link href="/" style={C.back}>← Zurück zur Startseite</Link>
        <h1 style={C.h1}>Datenschutzerklärung</h1>
        <p style={C.muted}>Stand: 09.06.2026 · Roar Bliss ist eine App von Rebelz AI.</p>

        <h2 style={C.h2}>Verantwortlicher</h2>
        <p>
          Clarence Johnson<br />
          Rebelz AI<br />
          George-Washington-Str. 219<br />
          68309 Mannheim<br />
          Deutschland<br />
          <br />
          E-Mail: <a href="mailto:thinkbig@rebelz-ai.com" style={{ color: "#D6A84F" }}>thinkbig@rebelz-ai.com</a>
        </p>

        <h2 style={C.h2}>Überblick</h2>
        <p>
          Der Schutz deiner persönlichen Daten ist mir wichtig. Diese Erklärung informiert dich darüber, welche Daten
          ich beim Betrieb von Roar Bliss erhebe, zu welchem Zweck und auf welcher Rechtsgrundlage, an welche
          Dienstleister sie weitergegeben werden und welche Rechte du hast.
        </p>

        <h2 style={C.h2}>Welche Daten werden verarbeitet?</h2>
        <ul>
          <li><span style={C.strong}>Kontodaten:</span> E-Mail-Adresse, (optional) Name/Spitzname und dein gespeichertes Profil (z. B. gewählte Tonalität, Sprache) – für Login und Wiederverwendung.</li>
          <li><span style={C.strong}>Hochgeladene Audiodateien:</span> die von dir hochgeladene Audiodatei – ausschließlich zur Erstellung deines personalisierten Ergebnisses.</li>
          <li><span style={C.strong}>Erzeugte Ergebnisse:</span> das fertige, personalisierte Audio, das wir für dich bereitstellen/speichern.</li>
          <li><span style={C.strong}>Zahlungsdaten:</span> bei Abos verarbeitet unser Zahlungsdienstleister Stripe deine Zahlungsdaten. Wir speichern selbst keine vollständigen Kartendaten.</li>
          <li><span style={C.strong}>Technische Daten:</span> IP-Adresse, Browser-/Gerätetyp und eine pseudonyme Geräte-Kennung – für Sicherheit, Funktion und zur Missbrauchsabwehr des kostenlosen Kontingents.</li>
        </ul>

        <h2 style={C.h2}>Zwecke &amp; Rechtsgrundlagen</h2>
        <p>
          Wir verarbeiten Daten zur Erfüllung des Nutzungsvertrags (Art. 6 Abs. 1 lit. b DSGVO – Bereitstellung des
          Dienstes, Erstellung deiner Audios, Abrechnung), aufgrund berechtigter Interessen (Art. 6 Abs. 1 lit. f DSGVO –
          Sicherheit, Betrugs-/Missbrauchsabwehr, Stabilität) sowie ggf. aufgrund deiner Einwilligung
          (Art. 6 Abs. 1 lit. a DSGVO).
        </p>

        <h2 style={C.h2}>Audio-Verarbeitung &amp; Löschung</h2>
        <p>
          Deine <span style={C.strong}>hochgeladene Audiodatei wird unmittelbar nach der Verarbeitung gelöscht</span> – wir behalten nur das
          fertige Ergebnis. Lädst du eine längere Datei hoch, wird sie auf die ersten 6 Minuten gekürzt; auch die
          ungekürzte Originaldatei wird nicht dauerhaft gespeichert. Nicht abgeschlossene Uploads werden automatisch
          spätestens innerhalb von 24 Stunden entfernt.
        </p>

        <h2 style={C.h2}>Dienstleister (Auftragsverarbeiter) &amp; internationale Übermittlung</h2>
        <p>Zur Erbringung des Dienstes setzen wir sorgfältig ausgewählte Dienstleister ein:</p>
        <ul>
          <li><span style={C.strong}>Supabase</span> – Authentifizierung &amp; Datenbank (Konto/Profil), EU-Hosting.</li>
          <li><span style={C.strong}>Vercel</span> – Hosting der Anwendung &amp; temporäre/finale Audiospeicherung (Blob).</li>
          <li><span style={C.strong}>Replicate</span> – Ausführung der gesamten Audio-Verarbeitungs- und Sprachsynthese-Pipeline (USA).</li>
          <li><span style={C.strong}>Anthropic</span> – Textgenerierung für die Personalisierung (USA).</li>
          <li><span style={C.strong}>Stripe</span> – Zahlungsabwicklung der Abonnements.</li>
          <li><span style={C.strong}>Resend</span> – Versand von System-/Login-E-Mails (Server in EU/USA).</li>
        </ul>
        <p>
          Soweit Daten an Dienstleister in den USA übermittelt werden, erfolgt dies auf Grundlage geeigneter Garantien
          (z. B. EU-Standardvertragsklauseln). Die Übermittlung beschränkt sich auf das für die jeweilige Funktion
          Erforderliche.
        </p>

        <h2 style={C.h2}>Speicherdauer</h2>
        <p>
          Kontodaten speichern wir, solange dein Konto besteht. Ergebnisse speichern wir, damit du sie abrufen kannst, und
          löschen sie auf Anfrage bzw. nach Kontolöschung. Uploads werden wie oben beschrieben unmittelbar nach
          Verarbeitung gelöscht. Gesetzliche Aufbewahrungsfristen (z. B. für Rechnungsdaten) bleiben unberührt.
        </p>

        <h2 style={C.h2}>Cookies &amp; Analyse</h2>
        <p>
          Roar Bliss verwendet nur technisch notwendige Cookies/Speicher (z. B. für Login-Sitzung und die
          Geräte-Kennung). Es findet kein seitenübergreifendes Tracking und kein Verkauf von Daten an Dritte statt.
        </p>

        <h2 style={C.h2}>Deine Rechte</h2>
        <ul>
          <li>Recht auf Auskunft über die gespeicherten Daten</li>
          <li>Recht auf Berichtigung unrichtiger Daten</li>
          <li>Recht auf Löschung deiner Daten</li>
          <li>Recht auf Einschränkung der Verarbeitung</li>
          <li>Recht auf Datenübertragbarkeit</li>
          <li>Recht auf Widerspruch gegen Verarbeitungen auf Basis berechtigter Interessen</li>
          <li>Recht auf Beschwerde bei einer Datenschutz-Aufsichtsbehörde</li>
        </ul>

        <h2 style={C.h2}>Kontakt für Datenschutzanfragen</h2>
        <p>
          Bei Fragen zum Datenschutz oder zur Ausübung deiner Rechte erreichst du mich jederzeit unter{" "}
          <a href="mailto:thinkbig@rebelz-ai.com" style={{ color: "#D6A84F" }}>thinkbig@rebelz-ai.com</a>.
        </p>

        <p style={{ ...C.muted, marginTop: "2.5rem" }}>
          Siehe auch unser <Link href="/terms" style={{ color: "#D6A84F" }}>Impressum &amp; AGB</Link>.
        </p>
      </div>
    </div>
  );
}
