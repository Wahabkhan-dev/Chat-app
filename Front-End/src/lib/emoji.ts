/**
 * Emoji-only message detection for "jumbo" emoji rendering (like WhatsApp / Teams):
 * a message made of just 1–3 emojis is shown large without a bubble.
 */

export const MAX_JUMBO_EMOJIS = 3;

// One emoji "piece": pictographs, flags, skin tones, joiners, variation selectors,
// keycaps (1️⃣ #️⃣) and tag sequences (🏴󠁧󠁢󠁥󠁮󠁧󠁿).
const EMOJI_ONLY =
  /^(?:\p{Extended_Pictographic}|\p{Regional_Indicator}|\p{Emoji_Modifier}|‍|️|[#*0-9]️?⃣|[\u{E0020}-\u{E007F}]|\s)+$/u;
const HAS_EMOJI = /\p{Extended_Pictographic}|\p{Regional_Indicator}|⃣/u;

function countGraphemes(text: string): number {
  if (typeof Intl !== 'undefined' && 'Segmenter' in Intl) {
    const segmenter = new (Intl as any).Segmenter(undefined, { granularity: 'grapheme' });
    let count = 0;
    for (const { segment } of segmenter.segment(text)) {
      if (segment.trim()) count++;
    }
    return count;
  }
  // Older browsers: count pictographs/flag pairs roughly
  const pictographs = text.match(/\p{Extended_Pictographic}/gu)?.length || 0;
  const flags = Math.floor((text.match(/\p{Regional_Indicator}/gu)?.length || 0) / 2);
  return pictographs + flags;
}

/** Number of emojis if the text is only 1–3 emojis (spaces allowed), otherwise 0. */
export function getJumboEmojiCount(text: string | undefined | null): number {
  const t = (text || '').trim();
  if (!t || t.length > 64 || !EMOJI_ONLY.test(t) || !HAS_EMOJI.test(t)) return 0;
  const count = countGraphemes(t);
  return count >= 1 && count <= MAX_JUMBO_EMOJIS ? count : 0;
}
