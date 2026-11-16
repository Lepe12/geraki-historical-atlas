// N7_APEX_VOICE_QUALITY_V1: what is sent to the voice, and which Greek voice is used.
// The text on screen never changes; only the spoken version does.

// Latin names are written the way they are said in Greek, so no voice spells them out or reads them with English rules.
const SPOKEN: Array<[RegExp, string]> = [
  [/\bN7\b/g, "Ν επτά"], [/\bNABOU\b/gi, "Ναμπού"], [/\bAgents\b/g, "Έιτζεντς"], [/\bAgent\b/g, "Έιτζεντ"],
  [/\bchat\b/gi, "τσατ"], [/\bHumanoid\b/gi, "Χιούμανοϊντ"], [/\bAPEX\b/g, "Άπεξ"],
  [/\bOpen-Meteo\b/gi, "Όπεν Μετέο"], [/\bWikipedia\b/gi, "Βικιπαίδεια"], [/\bGoogle News\b/gi, "Γκούγκλ Νιούς"],
  [/\bBing News\b/gi, "Μπινγκ Νιούς"], [/\bGitHub\b/gi, "Γκιτχαμπ"], [/\bPDF\b/g, "πι ντι εφ"], [/\bAI\b/g, "έι άι"],
];
export function forSpeech(text: string): string {
  let out = text;
  for (const [pattern, spoken] of SPOKEN) out = out.replace(pattern, spoken);
  return out;
}

export type VoiceInfo = { name: string; lang: string; voiceURI: string; localService?: boolean };
const MALE = /Stefanos|Nestoras|Στέφανος|Νέστορας|\bmale\b(?!.*female)|\bΑνδρ/i;
// The best Greek FEMALE voice the browser offers (the Humanoid is a woman), or null: then the built-in voice is used.
// Edge's natural voices first, then Google's Greek voice, then any other Greek voice that is not a male name.
export function pickGreekVoice<T extends VoiceInfo>(voices: T[]): T | null {
  const greek = voices.filter(v => /^el([-_]|$)/i.test(v.lang) || /ελλην|greek/i.test(v.name)).filter(v => !MALE.test(v.name));
  const score = (v: VoiceInfo) =>
    (/natural|neural/i.test(v.name) ? 100 : 0) + (/google/i.test(v.name) ? 60 : 0) + (/online/i.test(v.name) ? 40 : 0) +
    (/athina|αθηνά|melina|μελίνα|female|γυναικ/i.test(v.name) ? 20 : 0) + (v.localService === false ? 5 : 0);
  let best: T | null = null;
  for (const v of greek) if (!best || score(v) > score(best)) best = v;
  return best;
}

// Pieces for the voice: whole sentences (a voice phrases better inside a sentence than across a cut), the first one on its
// own so speech starts quickly, the rest packed up to `size` characters; a sentence longer than `size` is cut at a comma, else a space.
export function speechPieces(text: string, size: number): string[] {
  const sentences = text.replace(/\s+/g, " ").trim().split(/(?<=[.;!?·…])\s+/).filter(Boolean);
  const cut = (s: string): string[] => {
    if (s.length <= size) return [s];
    const stop = Math.max(s.lastIndexOf(", ", size), s.lastIndexOf("; ", size)), space = s.lastIndexOf(" ", size);
    const at = stop > size * 0.3 ? stop : space; // a comma is the better place to breathe
    const k = at > size * 0.3 ? at + 1 : size;
    return [s.slice(0, k).trim(), ...cut(s.slice(k).trim())];
  };
  const pieces: string[] = [];
  let current = "";
  sentences.flatMap(cut).forEach((s, i) => {
    if (i === 0) { pieces.push(s); return; }
    if (current && (current + " " + s).length > size) { pieces.push(current); current = s; } else current = current ? current + " " + s : s;
  });
  if (current) pieces.push(current);
  return pieces;
}
