// Cloud test for OmniVoice cog version 40215740 (fb41623: eager attention + relax-filter).
// Usage: node cloudtest_omnivoice.mjs got|clarence
import { put } from '@vercel/blob';
import { readFileSync, writeFileSync } from 'node:fs';
import { basename } from 'node:path';

const VERSION = process.env.COG_VERSION
  || '40215740afa34d2094db49bc302b342aed66ee6eb99a1d4be60b16538f4b9766';

// read web/.env.local
const env = {};
for (const line of readFileSync(new URL('./.env.local', import.meta.url), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
}

const which = process.argv[2];
const TESTS = {
  got: {
    file: '/Users/clarence/Music/Music/Media.localized/Music/Peter Gundry/Unknown Album/The Targaryen Wolf (Original Soundtrack) Game of Thrones.mp3',
    input: {
      name: 'Clarence Johnson',
      personalization: 75,
      tts_provider: 'omnivoice',
      clone_source_voices: true,
      paid: true,
    },
    out: `RoarBliss_TEST_GoT75_${(process.env.COG_VERSION || '40215740').slice(0, 8)}.mp3`,
  },
  // German 100% — verifies the TTS_LANGUAGE threading (was hardcoded English in the synth).
  german: {
    file: '/Users/clarence/Desktop/RoarBliss_Clarence.mp3',
    input: {
      name: 'Clarence Johnson',
      personalization: 100,
      tts_provider: 'omnivoice',
      clone_source_voices: true,
      paid: true,
      language: 'German',
      prompt:
        'Clarence Johnson baut seine AI-Agentur Rebelz AI auf und kämpft um seine ersten Kunden — erinnere ihn daran, niemals aufzugeben, jedes Nein bringt das Ja näher. Seine Mutter hat Herzprobleme — mach aus der Sorge Kraft, sei stark für sie. Ton: unerbittlich, warmer Stahl, Big-Brother-Energie.',
    },
    out: `RoarBliss_TEST_ClarenceDE_${(process.env.COG_VERSION || '40215740').slice(0, 8)}.mp3`,
  },
  clarence: {
    file: '/Users/clarence/Desktop/RoarBliss_Clarence.mp3',
    input: {
      name: 'Clarence Johnson',
      personalization: 100,
      tts_provider: 'omnivoice',
      clone_source_voices: true,
      paid: true,
      prompt:
        'Clarence Johnson is building his AI agency Rebelz AI and grinding to find clients — remind him to never give up on the agency, every no brings the yes closer. His mother has heart problems and he carries that worry — turn it into fuel, be strong for her. He co-parents with a difficult baby mama — keeping his cool and staying calm for his child is strength, not weakness. Tone: relentless, warm steel, big-brother energy.',
    },
    out: `RoarBliss_TEST_Clarence100_${(process.env.COG_VERSION || '40215740').slice(0, 8)}.mp3`,
  },
}[which];
if (!TESTS) { console.error('usage: node cloudtest_omnivoice.mjs got|clarence'); process.exit(1); }

const fileBuf = readFileSync(TESTS.file);
console.log(`[1/4] uploading ${basename(TESTS.file)} (${(fileBuf.length / 1e6).toFixed(1)} MB) to Blob...`);
const blob = await put(`cloudtest/${Date.now()}_${which}.mp3`, fileBuf, {
  access: 'public',
  token: env.BLOB_READ_WRITE_TOKEN,
});
console.log('      blob url:', blob.url);

const input = {
  audio: blob.url,
  ...TESTS.input,
  anthropic_api_key: env.ANTHROPIC_API_KEY,
  hf_token: env.HF_TOKEN,
  blob_token: env.BLOB_READ_WRITE_TOKEN,
};

console.log('[2/4] creating prediction on version', VERSION.slice(0, 16), '...');
const createRes = await fetch('https://api.replicate.com/v1/predictions', {
  method: 'POST',
  headers: {
    Authorization: `Bearer ${env.REPLICATE_API_TOKEN}`,
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ version: VERSION, input }),
});
const pred = await createRes.json();
if (!pred.id) { console.error('create failed:', JSON.stringify(pred)); process.exit(1); }
console.log('      prediction id:', pred.id);

let p = pred;
const t0 = Date.now();
while (['starting', 'processing'].includes(p.status)) {
  await new Promise((r) => setTimeout(r, 10000));
  const res = await fetch(`https://api.replicate.com/v1/predictions/${pred.id}`, {
    headers: { Authorization: `Bearer ${env.REPLICATE_API_TOKEN}` },
  });
  p = await res.json();
  process.stdout.write(`\r      [${Math.round((Date.now() - t0) / 1000)}s] status=${p.status}   `);
}
console.log(`\n[3/4] final status: ${p.status}, predict_time=${p.metrics?.predict_time}s`);

writeFileSync(`cloudtest_${which}_logs.txt`, p.logs ?? '');
console.log(`      full logs -> cloudtest_${which}_logs.txt`);

const logs = p.logs ?? '';
const lines = logs.split('\n');
const grab = (re) => lines.filter((l) => re.test(l));
console.log('--- device ---');
for (const l of grab(/on (cuda|cpu)|pyannote pipeline|CUDA/i).slice(0, 8)) console.log(' ', l.trim());
console.log('--- slots / speakers ---');
const slotLines = grab(/\[SPEAKER_\d+\]/);
console.log(`  ${slotLines.length} [SPEAKER_xx] lines`);
for (const l of slotLines.slice(0, 6)) console.log(' ', l.trim().slice(0, 140));
if (slotLines.length > 6) console.log(`  ... (${slotLines.length - 6} more)`);
console.log('--- summary lines ---');
for (const l of grab(/Slots OK|slots|gibberish|first|snippet|drift|relax/i).slice(0, 20)) console.log(' ', l.trim().slice(0, 160));

if (p.status === 'succeeded' && p.output) {
  const url = Array.isArray(p.output) ? p.output[0] : p.output;
  console.log('[4/4] downloading output ->', TESTS.out);
  const audio = await fetch(url);
  writeFileSync(`../${TESTS.out}`, Buffer.from(await audio.arrayBuffer()));
  console.log('      saved.');
} else {
  console.log('[4/4] no output (status:', p.status, ')');
  if (p.error) console.log('      error:', p.error);
}
