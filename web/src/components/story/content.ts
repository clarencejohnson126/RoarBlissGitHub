// All copy for the /story cinematic page in one place — verbatim, legal-safe.
// Sourced from the existing landing components (BattleTemplates, PersonalizationDepth,
// Languages, FAQ, HowItWorks, WhyRoarBliss, SafeUseNote) + the approved story brief.
// Never surface the internal `champion` keys here — this is marketing copy only.

export const HERO = {
  eyebrow: "The voice that reminds you who you are",
  lines: ["Your story.", "Your battle.", "Your roar."] as const,
  sub: "Turn the audio you love into the speech that reminds you who you are.",
  primary: { label: "Create My Speech", href: "/create" },
  secondary: { label: "Watch How It Works", target: "#chapter-04" },
};

export const SILENCE = {
  eyebrow: "Chapter I — The silence before the roar",
  lines: [
    "Before the roar, there is silence.",
    "The moment where the noise stops.",
    "The excuses disappear.",
    "And a man hears the truth he has been avoiding.",
  ] as const,
};

export const REASON = {
  eyebrow: "Chapter II — Your reason",
  lines: [
    "You do not fight because life is easy.",
    "You fight because someone is watching.",
    "Someone is learning what strength looks like.",
    "Someone needs you to become who you said you would be.",
  ] as const,
};

export const BATTLE = {
  eyebrow: "Chapter III — Choose your battle",
  heading: "Every man carries a different war.",
  sub: "Choose yours. Then turn it into words that move you.",
  templates: [
    { title: "Discipline", desc: "For the grind nobody sees — the reps, the early mornings, the quiet work." },
    { title: "Heartbreak", desc: "Turn the wound into resolve. Rise from what broke you." },
    { title: "Grief", desc: "Carry the loss forward with strength, not silence." },
    { title: "Muscle Gain", desc: "Fuel the training — pain thresholds, last sets, new records." },
    { title: "Business Comeback", desc: "For the founder rebuilding after the setback. Back on your feet." },
    { title: "Fatherhood", desc: "Be the example, not just the words. For the ones who watch you." },
    { title: "Confidence", desc: "Step into the room as the man who already decided." },
    { title: "Dark Season", desc: "When it's heaviest — the voice that keeps you standing." },
    { title: "Custom Prompt", desc: "Write exactly how you want it — your story, your words, your way." },
  ] as const,
};

export const PLAN = {
  eyebrow: "Chapter IV — The plan",
  heading: "A battle without a plan is only pain.",
  sub: "RoarBliss takes your story, your goal, your wound, your reason, and turns it into a script that sounds like it was forged for you.",
  steps: [
    { n: "01", title: "Upload your audio", desc: "Bring a motivational speech, song, or podcast stem you own or have permission to use." },
    { n: "02", title: "Choose your battle", desc: "Pick a template — discipline, heartbreak, comeback — or write your own prompt." },
    { n: "03", title: "Add your story", desc: "Your name, your struggle, your goal. The engine writes lines that are unmistakably yours." },
    { n: "04", title: "Choose rewrite depth", desc: "Decide how much becomes yours — a few key lines or a complete rewrite." },
    { n: "05", title: "Generate your speech", desc: "We rewrite the speech for your story while preserving the emotional tone and music." },
  ] as const,
};

export const DEPTH = {
  eyebrow: "Chapter V — How much becomes yours",
  heading: "You decide how deep it goes.",
  levels: [
    { pct: "25%", title: "Light personalization", desc: "Keep most of the original. A few key lines become your story — your name, your fight." },
    { pct: "50%", title: "Balanced transformation", desc: "Half the spoken lines are rewritten for you, half stay in the original's world." },
    { pct: "75%", title: "Deeply personal", desc: "Most of the speech is yours now — the original tone carries your life." },
    { pct: "Full", title: "Your complete battle speech", desc: "A brand-new script, start to finish, spoken in the preserved voice and tone over the same music." },
  ] as const,
};

export const LANGUAGE = {
  eyebrow: "Chapter VI — Your voice, your language",
  heading: "Sometimes the words that save you need to arrive in the language you think in.",
  sub: "Upload a speech and hear a personalized version in another language while the emotional tone and delivery are preserved. Your battle, in the words you think in.",
  langs: ["English", "Deutsch", "Español", "Français", "Italiano", "Português", "Nederlands", "Polski"] as const,
};

export const WHY = {
  eyebrow: "Chapter VII",
  // The gold italic phrase is rendered separately in the component.
  pre: "It is not motivation. It is your story turned into the ",
  gold: "voice that pulls you forward.",
  sub: "A man does not open RoarBliss because he wants another AI tool. He opens it because he needs to hear the speech that reminds him who he is.",
};

export const FAQ = {
  eyebrow: "Chapter VIII — Before your first roar",
  items: [
    { q: "What audio can I upload?", a: "Any motivational speech, song, or podcast stem you own or have permission to use. RoarBliss is built for permitted audio adaptation and your own original content." },
    { q: "Does it copy a real person's voice?", a: "No. RoarBliss preserves the emotional tone and delivery style of the audio you provide — it does not impersonate real people. You choose the tone; your story drives the words." },
    { q: "How much gets rewritten?", a: "You decide: 25%, 50%, 75%, or a full rewrite. Light personalization keeps most of the original; a full rewrite makes the whole speech your own — while the music stays the same." },
    { q: "Can it be in another language?", a: "Yes. Choose a target language and the whole speech is delivered in it, with the original tone preserved." },
    { q: "How long does it take?", a: "A short preview is ready in moments. Full personalized speeches are generated in the cloud and delivered as soon as they're done — you can wait on the page or get notified." },
    { q: "Who owns the result?", a: "You do. RoarBliss is designed for personal transformation and original motivational content you create from audio you're allowed to use." },
  ] as const,
};

export const FINAL = {
  eyebrow: "Chapter IX",
  pre: "Stop scrolling. ",
  gold: "Hear who you are.",
  sub: "Your first preview is free. No account needed to start.",
  primary: { label: "Create My Speech", href: "/create" },
  secondary: { label: "See Demo", href: "/create" },
};

export const SAFE_NOTE =
  "Only upload audio you own or have permission to use. RoarBliss is designed for personal transformation, permitted audio adaptation, and original motivational content — it preserves emotional tone and style for audio you have the rights to, and does not impersonate real people.";

export const SOUND = {
  eyebrow: "Choose your sound",
  heading: "Choose the sound of your battle.",
  sub: "Every story needs a pulse. Pick the instrumental that carries your words.",
  selectedLabel: "Selected for your speech",
  upload: {
    title: "Upload your own instrumental",
    desc: "Bring your own score and let Roar Bliss shape the speech around it.",
    button: "Coming soon",
  },
};

export const MARQUEE = [
  "Discipline",
  "Heartbreak",
  "Grief",
  "Muscle Gain",
  "Business Comeback",
  "Fatherhood",
  "Confidence",
  "Dark Season",
] as const;

export const TESTIMONIALS = {
  eyebrow: "Men who heard it",
  heading: "The voice they needed.",
  items: [
    { quote: "I played my own speech before the hardest meeting of my year. I walked in a different man.", name: "Marcus T.", role: "Founder, rebuilding" },
    { quote: "It put my kids' names into the words that get me out of bed. That hits in a way nothing else does.", name: "David R.", role: "Father of two" },
    { quote: "Grief had me frozen. Hearing my story turned into a battle finally gave me somewhere to put it.", name: "Samuel K.", role: "After the loss" },
  ] as const,
};

export const NAV = {
  links: [
    { label: "The Silence", href: "#chapter-01" },
    { label: "Your Reason", href: "#chapter-02" },
    { label: "Your Battle", href: "#chapter-03" },
    { label: "The Plan", href: "#chapter-04" },
    { label: "Questions", href: "#chapter-08" },
  ],
  cta: { label: "Create My Speech", href: "/create" },
};
