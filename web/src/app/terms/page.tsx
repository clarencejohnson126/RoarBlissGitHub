import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Impressum & AGB — Roar Bliss",
  description: "Impressum, Nutzungsbedingungen und rechtliche Hinweise zu Roar Bliss.",
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

export default function TermsPage() {
  return (
    <div style={C.wrap}>
      <div style={C.inner}>
        <Link href="/" style={C.back}>← Zurück zur Startseite</Link>
        <h1 style={C.h1}>Impressum &amp; Nutzungsbedingungen</h1>
        <p style={C.muted}>Stand: 09.06.2026 · Roar Bliss ist eine App von Rebelz AI (Marke von Johnson Services).</p>

        <h2 style={C.h2}>Impressum (Angaben gemäß § 5 TMG)</h2>
        <p>
          Clarence Johnson<br />
          Rebelz AI<br />
          George-Washington-Str. 219<br />
          68309 Mannheim<br />
          Deutschland<br />
          <br />
          E-Mail: <a href="mailto:thinkbig@rebelz-ai.com" style={{ color: "#D6A84F" }}>thinkbig@rebelz-ai.com</a><br />
          <br />
          Kleinunternehmer gemäß § 19 UStG · Zuständiges Finanzamt: Finanzamt Mannheim-Neckarstadt
        </p>

        <h2 style={C.h2}>1. Geltungsbereich &amp; Anbieter</h2>
        <p>
          Diese Nutzungsbedingungen gelten für die Nutzung der Webanwendung „Roar Bliss" (nachfolgend „der Dienst"),
          erreichbar unter der jeweiligen Roar-Bliss-Domain. Anbieter ist die oben genannte Person/Marke. Mit der
          Nutzung des Dienstes – insbesondere mit der Registrierung oder dem Erstellen eines Audios – erkennst du diese
          Bedingungen an.
        </p>

        <h2 style={C.h2}>2. Leistungsbeschreibung</h2>
        <p>
          Roar Bliss personalisiert hochgeladene Audiodateien (z. B. motivierende Reden) zu einer auf dich
          zugeschnittenen Version, indem es originale, neue Sprachpassagen erzeugt und in dein Audio einbettet, während
          Tonalität und Musik erhalten bleiben. Der Dienst erstellt <span style={C.strong}>eigenständige, originale Inhalte</span> im
          Stil der Quelle – er reproduziert keine fremden Skripte wortgleich und imitiert keine realen Personen.
          Audiodateien über 6 Minuten werden auf die ersten 6 Minuten gekürzt. Funktionsumfang und Modelle können sich
          weiterentwickeln.
        </p>

        <h2 style={C.h2}>3. Erlaubte Nutzung &amp; Verbote (Deepfakes, Identitäten)</h2>
        <p>Du verpflichtest dich, den Dienst nicht für Folgendes zu nutzen:</p>
        <ul>
          <li>das Nachahmen, Klonen oder Imitieren der Stimme oder Identität einer realen Person ohne deren ausdrückliche Einwilligung („Deepfakes");</li>
          <li>Täuschung, Betrug, Identitätsdiebstahl, Belästigung, Diffamierung, Hass oder rechtswidrige Inhalte;</li>
          <li>das Erzeugen von Inhalten, die Persönlichkeitsrechte, Markenrechte oder das Recht am eigenen Bild/an der eigenen Stimme Dritter verletzen;</li>
          <li>politische oder werbliche Irreführung durch synthetische Stimmen ohne Kennzeichnung.</li>
        </ul>
        <p>
          Roar Bliss ist für die <span style={C.strong}>erlaubte Adaption eigener oder lizenzierter Audios</span> sowie für originale
          motivierende Inhalte gebaut. Verstöße führen zur sofortigen Sperrung ohne Erstattung und können rechtlich
          verfolgt werden.
        </p>

        <h2 style={C.h2}>4. Hochgeladene Inhalte, Rechte &amp; Urheberrecht</h2>
        <p>
          Du sicherst zu, dass du an jeder hochgeladenen Audiodatei die erforderlichen Rechte besitzt oder eine
          Erlaubnis zur Nutzung hast. Die Verantwortung für hochgeladene Inhalte liegt allein bei dir. Roar Bliss
          beansprucht <span style={C.strong}>keine Eigentumsrechte</span> an deinen Uploads; wir verarbeiten sie ausschließlich zur Erstellung
          deines Ergebnisses und <span style={C.strong}>löschen den Upload unmittelbar nach der Verarbeitung</span> (es wird nur das fertige
          Ergebnis gespeichert, siehe Datenschutzerklärung). Am erzeugten Ergebnis räumen wir dir ein einfaches
          Nutzungsrecht ein; bezahlte Ergebnisse darfst du auch kommerziell nutzen, soweit du an den Eingangsmaterialien
          berechtigt bist. Die Software, das Design und die Modelle von Roar Bliss unterliegen dem deutschen
          Urheberrecht; eine Vervielfältigung außerhalb der gesetzlichen Grenzen bedarf der schriftlichen Zustimmung.
        </p>

        <h2 style={C.h2}>5. Konto &amp; Registrierung</h2>
        <p>
          Für bezahlte Funktionen ist ein Konto erforderlich. Du bist für die Geheimhaltung deiner Zugangsdaten
          verantwortlich. Du musst eine gültige, dir gehörende E-Mail-Adresse verwenden. Wir behalten uns vor, Konten
          bei Missbrauch zu sperren.
        </p>

        <h2 style={C.h2}>6. Preise, Abrechnung &amp; Minuten</h2>
        <p>
          Bezahlte Tarife sind monatliche Abonnements mit einem festen <span style={C.strong}>Minuten-Kontingent pro Monat</span>
          (z. B. 25 / 60 / 120 Minuten). Die Abrechnung erfolgt über unseren Zahlungsdienstleister Stripe.
        </p>
        <ul>
          <li><span style={C.strong}>Kein Rollover:</span> Nicht verbrauchte Minuten verfallen am Ende der Abrechnungsperiode (gebunden an dein Abodatum) und werden nicht übertragen.</li>
          <li><span style={C.strong}>Abrechnung nur bei Lieferung:</span> Minuten werden ausschließlich abgezogen, wenn eine fertige, abspielbare Datei erstellt wurde – gemessen an der Laufzeit (gedeckelt auf 6 Min). Schlägt eine Generierung fehl oder erhältst du keine fertige Datei, werden <span style={C.strong}>keine Minuten berechnet</span>.</li>
          <li>Das Abo verlängert sich automatisch monatlich, bis du kündigst. Die Kündigung ist jederzeit zum Ende der laufenden Periode möglich.</li>
        </ul>

        <h2 style={C.h2}>7. Widerrufsrecht bei digitalen Inhalten</h2>
        <p>
          Bei Verträgen über digitale Inhalte/Dienstleistungen erlischt dein gesetzliches Widerrufsrecht, sobald wir mit
          der Ausführung begonnen haben (d. h. sobald du eine Generierung startest), nachdem du ausdrücklich zugestimmt
          und zur Kenntnis genommen hast, dass du dadurch dein Widerrufsrecht verlierst. Für bereits gelieferte digitale
          Ergebnisse besteht – außer bei gesetzlich zwingenden Ausnahmen – kein Erstattungsanspruch. Fehlgeschlagene,
          nicht gelieferte Generierungen kosten dich nichts (siehe Ziffer 6).
        </p>

        <h2 style={C.h2}>8. Verfügbarkeit &amp; Haftung</h2>
        <p>
          Die Inhalte und der Dienst werden mit größtmöglicher Sorgfalt bereitgestellt; eine ununterbrochene
          Verfügbarkeit oder ein bestimmtes Qualitätsergebnis wird nicht garantiert. Für leichte Fahrlässigkeit haften
          wir nur bei Verletzung wesentlicher Vertragspflichten und begrenzt auf den vertragstypischen, vorhersehbaren
          Schaden. Die Haftung für Vorsatz, grobe Fahrlässigkeit sowie für Schäden aus der Verletzung von Leben, Körper
          und Gesundheit bleibt unberührt. Für externe Links ist der jeweilige Anbieter verantwortlich.
        </p>

        <h2 style={C.h2}>9. Kündigung &amp; Änderungen</h2>
        <p>
          Du kannst dein Abo jederzeit kündigen; der Zugang bleibt bis zum Ende der bezahlten Periode bestehen. Wir
          können diese Bedingungen mit angemessener Vorankündigung anpassen; die fortgesetzte Nutzung gilt als
          Zustimmung.
        </p>

        <h2 style={C.h2}>10. Anwendbares Recht &amp; Gerichtsstand</h2>
        <p>
          Es gilt deutsches Recht. Gerichtsstand für alle Streitigkeiten ist – soweit gesetzlich zulässig – Mannheim,
          Deutschland.
        </p>

        <p style={{ ...C.muted, marginTop: "2.5rem" }}>
          Siehe auch unsere <Link href="/privacy" style={{ color: "#D6A84F" }}>Datenschutzerklärung</Link>.
        </p>
      </div>
    </div>
  );
}
