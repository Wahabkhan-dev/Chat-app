"use client";

/**
 * Client-side spellcheck for the message box's custom right-click menu. The browser's own
 * native context menu — the one that normally shows spelling suggestions — is replaced by a
 * custom menu elsewhere in the app (for Paste support), which as a side effect hides native
 * spellcheck suggestions too. This runs an independent, in-browser dictionary check so the
 * custom menu can offer the same kind of "did you mean" suggestions itself.
 *
 * typo-js's own suggest() (Hunspell affix-rule based) is fast but weak for ordinary typos —
 * it missed "change" for "chinge" and "the" for "teh" in testing. Candidates are instead
 * generated the classic ("Norvig") way — every possible single edit (and, if that finds
 * nothing, every edit of an edit) of the typed word — then kept only if typo-js's check()
 * recognizes the result as a real word. check() expands Hunspell's affix rules internally,
 * so this also catches inflected/derived forms (plurals, "-ly" adverbs, etc.) that aren't
 * literal entries in the dictionary file. Candidates are then ranked by edit distance, with
 * a small common-word boost so frequent words like "the" don't lose to obscure same-distance
 * matches — closer to how a real "did you mean" ranks results.
 *
 * The ~550KB en_US dictionary is only fetched the first time it's needed (first right-click
 * on a word), then cached in memory for the rest of the session.
 */

let typoInstance: any = null;
let loadingPromise: Promise<any> | null = null;

async function getTypo(): Promise<any> {
  if (typoInstance) return typoInstance;
  if (loadingPromise) return loadingPromise;

  loadingPromise = (async () => {
    const mod: any = await import('typo-js');
    const Typo = mod.default || mod;
    const [affData, wordsData] = await Promise.all([
      fetch('/dictionaries/en_US/en_US.aff').then((r) => r.text()),
      fetch('/dictionaries/en_US/en_US.dic').then((r) => r.text()),
    ]);
    typoInstance = new Typo('en_US', affData, wordsData);
    return typoInstance;
  })();

  return loadingPromise;
}

/** Finds the word touching `pos` in `text`, e.g. the word under the cursor on right-click. */
export function getWordAt(text: string, pos: number): { word: string; start: number; end: number } {
  const left = text.slice(0, pos).search(/\S+$/);
  const rightMatch = text.slice(pos).match(/\s/);
  const start = left === -1 ? pos : left;
  const end = rightMatch ? pos + rightMatch.index! : text.length;
  return { word: text.slice(start, end), start, end };
}

// Common chat shorthand that's intentional, not a typo — flagging these would just be noise.
const CHAT_WHITELIST = new Set([
  'msg', 'pls', 'plz', 'asap', 'lol', 'omg', 'btw', 'fyi', 'idk', 'imo', 'imho', 'thx', 'ty',
  'np', 'brb', 'gtg', 'afaik', 'eta', 'wfh', 'eod', 'eow', 'dm', 'ok', 'okay', 'k', 'u', 'r',
  'ur', 'gonna', 'wanna', 'gotta', 'yep', 'nope', 'yup',
]);

/** True if `word` is a real word per the dictionary — mentions, URLs, codes etc. should be pre-filtered by the caller. */
export async function isMisspelled(word: string): Promise<boolean> {
  if (!word || !/^[a-zA-Z']+$/.test(word)) return false;
  if (CHAT_WHITELIST.has(word.toLowerCase())) return false;
  try {
    const typo = await getTypo();
    return !typo.check(word);
  } catch {
    return false;
  }
}

const ALPHABET = 'abcdefghijklmnopqrstuvwxyz';

/** Every word reachable from `word` by one deletion, insertion, substitution, or adjacent transposition. */
function edits1(word: string): Set<string> {
  const results = new Set<string>();
  for (let i = 0; i <= word.length; i++) {
    if (i < word.length) results.add(word.slice(0, i) + word.slice(i + 1)); // deletion
    for (const c of ALPHABET) results.add(word.slice(0, i) + c + word.slice(i)); // insertion
  }
  for (let i = 0; i < word.length; i++) {
    for (const c of ALPHABET) {
      if (c !== word[i]) results.add(word.slice(0, i) + c + word.slice(i + 1)); // substitution
    }
    if (i < word.length - 1) {
      results.add(word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2)); // transposition
    }
  }
  return results;
}

function knownWords(candidates: Iterable<string>, typo: any): string[] {
  const out: string[] = [];
  for (const w of candidates) {
    if (typo.check(w)) out.push(w);
  }
  return out;
}

// Edits-of-edits blows up fast (hundreds of edits1 -> hundreds of thousands of edits2), so it's
// skipped for anything longer than a normal word — those fall back to typo-js's own suggest().
const MAX_LENGTH_FOR_EDITS2 = 12;

function editDistance(a: string, b: string, maxDist: number): number {
  const al = a.length;
  const bl = b.length;
  if (Math.abs(al - bl) > maxDist) return maxDist + 1;

  let prev2 = new Array(bl + 1).fill(0);
  let prev1 = new Array(bl + 1);
  let curr = new Array(bl + 1);
  for (let j = 0; j <= bl; j++) prev1[j] = j;

  for (let i = 1; i <= al; i++) {
    curr[0] = i;
    let rowMin = curr[0];
    for (let j = 1; j <= bl; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let val = Math.min(prev1[j] + 1, curr[j - 1] + 1, prev1[j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
        val = Math.min(val, prev2[j - 2] + 1);
      }
      curr[j] = val;
      if (val < rowMin) rowMin = val;
    }
    if (rowMin > maxDist) return maxDist + 1;
    const tmp = prev2;
    prev2 = prev1;
    prev1 = curr;
    curr = tmp;
  }
  return prev1[bl];
}

// A small boost list of very common words — without real frequency data, this is what keeps
// "the" ahead of "tea"/"ted"/"tel" etc. for a typo like "teh".
const COMMON_WORDS = new Set([
  'the', 'be', 'to', 'of', 'and', 'a', 'in', 'that', 'have', 'it', 'for', 'not', 'on', 'with',
  'he', 'as', 'you', 'do', 'at', 'this', 'but', 'his', 'by', 'from', 'they', 'we', 'say', 'her',
  'she', 'or', 'an', 'will', 'my', 'one', 'all', 'would', 'there', 'their', 'what', 'so', 'up',
  'out', 'if', 'about', 'who', 'get', 'which', 'go', 'me', 'when', 'make', 'can', 'like', 'time',
  'no', 'just', 'him', 'know', 'take', 'people', 'into', 'year', 'your', 'good', 'some', 'could',
  'them', 'see', 'other', 'than', 'then', 'now', 'look', 'only', 'come', 'its', 'over', 'think',
  'also', 'back', 'after', 'use', 'two', 'how', 'our', 'work', 'first', 'well', 'way', 'even',
  'new', 'want', 'because', 'any', 'these', 'give', 'day', 'most', 'us', 'is', 'are', 'was',
  'were', 'been', 'has', 'had', 'did', 'does', 'am', 'chat', 'message', 'send', 'file', 'meeting',
  'team', 'please', 'thanks', 'thank', 'hello', 'hi', 'ok', 'okay', 'yes', 'sure', 'today',
  'tomorrow', 'change', 'update', 'review', 'share', 'call', 'email', 'need', 'help', 'sorry',
]);

function matchCase(suggestion: string, original: string): string {
  if (original === original.toUpperCase() && original.length > 1) return suggestion.toUpperCase();
  if (original[0] === original[0]?.toUpperCase()) return suggestion[0].toUpperCase() + suggestion.slice(1);
  return suggestion;
}

/** Up to `limit` "did you mean" corrections for `word`, closest/most-common match first. */
export async function suggest(word: string, limit = 5): Promise<string[]> {
  try {
    const typo = await getTypo();
    const lower = word.toLowerCase();

    let candidates: string[] = knownWords(edits1(lower), typo);
    if (candidates.length === 0 && lower.length <= MAX_LENGTH_FOR_EDITS2) {
      const e2 = new Set<string>();
      for (const e of edits1(lower)) {
        for (const e2w of edits1(e)) e2.add(e2w);
      }
      candidates = knownWords(e2, typo);
    }

    const seen = new Set<string>(candidates);
    const scored = candidates.map((w) => ({
      w,
      commonRank: COMMON_WORDS.has(w) ? 0 : 1,
      dist: editDistance(lower, w, 2),
      lenDiff: Math.abs(w.length - lower.length),
    }));
    scored.sort((a, b) => a.commonRank - b.commonRank || a.dist - b.dist || a.lenDiff - b.lenDiff || a.w.localeCompare(b.w));

    const result = scored.slice(0, limit).map((s) => s.w);

    // Fill any remaining slots with typo-js's own suggestions (dedup'd) as a last resort.
    if (result.length < limit) {
      for (const s of typo.suggest(word, limit) || []) {
        const lowerS = s.toLowerCase();
        if (seen.has(lowerS)) continue;
        seen.add(lowerS);
        result.push(lowerS);
        if (result.length >= limit) break;
      }
    }

    return result.map((s) => matchCase(s, word));
  } catch {
    return [];
  }
}
