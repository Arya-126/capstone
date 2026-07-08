/**
 * interviewGameContentService.ts
 *
 * Deterministic (no-LLM) game content generation for the Interview Prep module.
 * Generates content for the 6 classic game engines from a static InterviewTheory
 * row (topic name + raw theory text + key points + formulas).
 *
 * Pure and deterministic given the same input, EXCEPT option/order shuffling,
 * which uses Math.random. Throws Error('Unknown game type: …') for bad types
 * and throws when a generator cannot produce at least 4 items even after
 * padding from rawTheory sentences.
 *
 * Content shapes are imported (type-only, so no Groq/redis side effects) from
 * gameContentService.ts so they match the game engines exactly.
 */

import type {
  MemoryMatchContent,
  WordScrambleContent,
  CrosswordContent,
  HangmanContent,
  FillBlankContent,
  ConceptCannonContent,
  GameContent,
} from './gameContentService';

// ── Public input shape ──

export interface TheoryInput {
  topicName: string;
  rawTheory: string;
  keyPoints: string[];
  formulas: string[];
}

// ── Stopwords & filler ──

// ~100 common English stopwords (3-letter entries kept for safety even though
// term mining enforces a 4-letter minimum).
const STOPWORDS = new Set<string>([
  'the', 'and', 'that', 'with', 'from', 'this', 'have', 'will', 'each',
  'which', 'their', 'would', 'there', 'about', 'when', 'only', 'also',
  'into', 'other', 'some', 'then', 'than', 'them', 'they', 'these',
  'those', 'been', 'being', 'were', 'what', 'where', 'while', 'your',
  'yours', 'after', 'before', 'between', 'both', 'because', 'does',
  'doing', 'down', 'during', 'first', 'second', 'third', 'hence', 'here',
  'however', 'itself', 'just', 'know', 'known', 'like', 'made', 'make',
  'makes', 'many', 'more', 'most', 'much', 'must', 'need', 'needs',
  'never', 'often', 'once', 'ones', 'others', 'over', 'same', 'says',
  'seen', 'shall', 'should', 'since', 'such', 'take', 'taken', 'tell',
  'thus', 'times', 'together', 'under', 'upon', 'used', 'uses', 'using',
  'very', 'want', 'well', 'went', 'whether', 'whom', 'whose', 'within',
  'without', 'work', 'above', 'again', 'almost', 'along', 'already',
  'always', 'among', 'another', 'any', 'are', 'around', 'called',
  'cannot', 'come', 'comes', 'could', 'did', 'different', 'either',
  'else', 'etc', 'even', 'every', 'for', 'get', 'gets', 'goes', 'going',
  'had', 'has', 'her', 'him', 'his', 'its', 'let', 'may', 'might', 'not',
  'now', 'one', 'our', 'out', 'own', 'per', 'put', 'said', 'she', 'still',
  'therefore', 'through', 'too', 'two', 'was', 'way', 'whereas', 'who',
  'why', 'yet', 'you',
]);

// Generic domain filler that would make boring/ambiguous game terms.
const FILLER = new Set<string>([
  'number', 'numbers', 'value', 'values', 'example', 'examples', 'method',
  'methods', 'formula', 'formulas', 'answer', 'answers', 'question',
  'questions', 'step', 'steps', 'case', 'cases', 'type', 'types', 'given',
  'find', 'total', 'solution', 'solutions', 'problem', 'problems',
  'calculate', 'following', 'result', 'results', 'equal', 'equals',
  'note', 'notes', 'important', 'concept', 'concepts', 'point', 'points',
]);

function isStopOrFiller(wordLower: string): boolean {
  return STOPWORDS.has(wordLower) || FILLER.has(wordLower);
}

// ── Small pure helpers ──
//
// Unit-style self-checks (manual, no test framework):
//   collapse('  a \n b ')                       === 'a b'
//   clampText('short', 70)                      === 'short'
//   clampText('x'.repeat(80), 10).length        === 10   (ends with '…')
//   clampAroundMask('SI = ___ x T', 80)         === 'SI = ___ x T' (untouched, fits)
//   clampAroundMask('aaa… long …___… long …', 20) includes '___'
//   splitNameExpr('SI = PRT/100')               => term 'SI', definition 'PRT/100'
//   flipDirectionWords('Always add 2')          => 'Never add 2' (first flip wins)
//   perturbNumber('divide by 7')                => 'divide by 15' (7*2+1)

function collapse(s: string): string {
  return (s || '').replace(/\s+/g, ' ').trim();
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function clampText(text: string, maxLen: number): string {
  const clean = collapse(text);
  if (clean.length <= maxLen) return clean;
  return clean.slice(0, maxLen - 1).trimEnd() + '…';
}

/** Clamp text to maxLen while guaranteeing the '___' mask stays visible. */
function clampAroundMask(text: string, maxLen: number): string {
  const clean = collapse(text);
  if (clean.length <= maxLen) return clean;
  const idx = clean.indexOf('___');
  if (idx === -1) return clampText(clean, maxLen);
  const budget = maxLen - 2; // room for possible leading + trailing ellipsis
  let start = Math.min(Math.max(0, idx - Math.floor((budget - 3) / 2)), Math.max(0, clean.length - budget));
  if (start > idx) start = idx; // never cut the mask off the front
  const end = Math.min(clean.length, start + budget);
  let out = clean.slice(start, end);
  if (start > 0) out = '…' + out;
  if (end < clean.length) out = out + '…';
  return out;
}

function dedupeStrings(list: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of list) {
    const key = s.toLowerCase();
    if (!s || seen.has(key)) continue;
    seen.add(key);
    out.push(s);
  }
  return out;
}

/** Fisher-Yates shuffle (the one intentionally non-deterministic helper). */
function shuffle<T>(arr: T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = out[i];
    out[i] = out[j];
    out[j] = tmp;
  }
  return out;
}

/** Defensive normalization — Prisma Json fields arrive as `any`. */
function normalizeTheory(theory: TheoryInput): TheoryInput {
  const strArray = (v: unknown): string[] =>
    Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim().length > 0) : [];
  return {
    topicName: typeof theory?.topicName === 'string' ? collapse(theory.topicName) : '',
    rawTheory: typeof theory?.rawTheory === 'string' ? theory.rawTheory : '',
    keyPoints: strArray(theory?.keyPoints),
    formulas: strArray(theory?.formulas),
  };
}

// ── Sentence & term mining ──

/** Split rawTheory into clean, deduped sentences. */
function extractSentences(raw: string): string[] {
  const withBreaks = (raw || '').replace(/([.!?])\s+/g, '$1\n');
  const parts = withBreaks
    .split(/[\n\r]+/)
    .map(collapse)
    .filter((s) => s.length >= 12 && /[a-zA-Z]/.test(s));
  return dedupeStrings(parts);
}

/** keyPoints first (highest quality), then rawTheory sentences. */
function sentencePool(theory: TheoryInput): string[] {
  return dedupeStrings([...theory.keyPoints.map(collapse).filter(Boolean), ...extractSentences(theory.rawTheory)]);
}

/**
 * Mine single-word technical terms (letters only, minLen..maxLen) from
 * keyPoints + rawTheory (+ topicName as a relevance pad). Lowercase-deduped,
 * stopword/filler filtered, ranked by frequency then length then alphabetically
 * — fully deterministic.
 */
function mineTerms(theory: TheoryInput, minLen: number, maxLen: number): string[] {
  const corpus = `${theory.keyPoints.join(' ')} ${theory.rawTheory} ${theory.topicName}`;
  const freq = new Map<string, number>();
  for (const token of corpus.split(/[^a-zA-Z]+/)) {
    const w = token.toLowerCase();
    if (w.length < minLen || w.length > maxLen) continue;
    if (isStopOrFiller(w)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return Array.from(freq.entries())
    .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length || a[0].localeCompare(b[0]))
    .map((e) => e[0]);
}

/** First sentence containing `word`, with the word masked as '___'. */
function maskedHint(word: string, sentences: string[], maxLen: number, topicName: string): string {
  const re = new RegExp(`\\b${escapeRegExp(word)}\\b`, 'gi');
  for (const s of sentences) {
    re.lastIndex = 0;
    if (re.test(s)) {
      re.lastIndex = 0;
      return clampAroundMask(s.replace(re, '___'), maxLen);
    }
  }
  return clampText(`A key term in ${topicName || 'this topic'}`, maxLen);
}

/** Split "Name = expr" / "Name: expr" — term is the shorter (name) side. */
function splitNameExpr(src: string): { term: string; definition: string } | null {
  const idx = src.search(/[=:]/);
  if (idx <= 0 || idx >= src.length - 1) return null;
  const left = src.slice(0, idx).trim();
  const right = src.slice(idx + 1).trim();
  if (!left || !right) return null;
  return left.length <= right.length
    ? { term: left, definition: right }
    : { term: right, definition: left };
}

// ── MEMORY_MATCH ──

function genMemoryMatch(theory: TheoryInput): MemoryMatchContent {
  const MAX = 8;
  const pairs: { term: string; definition: string }[] = [];
  const seenTerms = new Set<string>();
  const seenDefs = new Set<string>();

  const add = (rawTerm: string, rawDef: string): void => {
    if (pairs.length >= MAX) return;
    // Strip dangling separators picked up by naive splits ("Simple Interest -").
    const term = clampText(rawTerm.replace(/[\s:;,–—-]+$/, ''), 48);
    const definition = clampText(rawDef.replace(/^[\s:;,–—-]+/, ''), 120);
    if (term.length < 2 || definition.length < 3) return;
    if (term.toLowerCase() === definition.toLowerCase()) return;
    const termKey = term.toLowerCase();
    const defKey = definition.toLowerCase();
    if (seenTerms.has(termKey) || seenDefs.has(defKey)) return;
    seenTerms.add(termKey);
    seenDefs.add(defKey);
    pairs.push({ term, definition });
  };

  // 1) Formulas: "Name = expr" / "Name: expr" → shorter side is the term.
  for (const f of theory.formulas) {
    if (pairs.length >= MAX) break;
    const split = splitNameExpr(collapse(f));
    if (split) add(split.term, split.definition);
  }

  // 2) keyPoints containing ':' or ' - ' → head (≤4 words) / tail.
  const consumedKeyPoints = new Set<string>();
  for (const kp of theory.keyPoints) {
    if (pairs.length >= MAX) break;
    const src = collapse(kp);
    let head = '';
    let tail = '';
    const colon = src.indexOf(':');
    const dash = src.indexOf(' - ');
    if (colon > 0 && (dash < 0 || colon < dash)) {
      head = src.slice(0, colon).trim();
      tail = src.slice(colon + 1).trim();
    } else if (dash > 0) {
      head = src.slice(0, dash).trim();
      tail = src.slice(dash + 3).trim();
    } else {
      continue;
    }
    if (!head || !tail) continue;
    if (head.split(/\s+/).length > 4) continue;
    const before = pairs.length;
    add(head, tail);
    if (pairs.length > before) consumedKeyPoints.add(src.toLowerCase());
  }

  // 3) Pad: first 3 words of a keyPoint → rest (skip keyPoints already used above).
  const padFrom = (sentences: string[]): void => {
    for (const s of sentences) {
      if (pairs.length >= MAX) return;
      const src = collapse(s);
      if (consumedKeyPoints.has(src.toLowerCase())) continue;
      const words = src.split(/\s+/);
      if (words.length < 5) continue;
      add(words.slice(0, 3).join(' '), words.slice(3).join(' '));
    }
  };
  padFrom(theory.keyPoints);
  // 4) Last-resort pad from rawTheory sentences.
  if (pairs.length < 4) padFrom(extractSentences(theory.rawTheory));

  if (pairs.length < 4) {
    throw new Error(`Insufficient theory content for MEMORY_MATCH: only ${pairs.length} pair(s) available`);
  }
  return { pairs };
}

// ── WORD_SCRAMBLE ──

function genWordScramble(theory: TheoryInput): WordScrambleContent {
  const MAX = 10;
  const terms = mineTerms(theory, 4, 12);
  const sentences = sentencePool(theory);
  const words: { original: string; hint: string }[] = [];
  for (const term of terms) {
    if (words.length >= MAX) break;
    words.push({ original: term, hint: maskedHint(term, sentences, 90, theory.topicName) });
  }
  if (words.length < 4) {
    throw new Error(`Insufficient theory content for WORD_SCRAMBLE: only ${words.length} word(s) available`);
  }
  return { words };
}

// ── HANGMAN ──

function genHangman(theory: TheoryInput): HangmanContent {
  const MAX = 8;
  const terms = mineTerms(theory, 4, 12);
  const sentences = sentencePool(theory);
  const category = theory.topicName || 'General';
  const words: { word: string; hint: string; category: string }[] = [];
  for (const term of terms) {
    if (words.length >= MAX) break;
    words.push({ word: term, hint: maskedHint(term, sentences, 90, theory.topicName), category });
  }
  if (words.length < 4) {
    throw new Error(`Insufficient theory content for HANGMAN: only ${words.length} word(s) available`);
  }
  return { words };
}

// ── CROSSWORD ──

function genCrossword(theory: TheoryInput): CrosswordContent {
  const MAX = 8;
  const terms = mineTerms(theory, 4, 10);
  const sentences = sentencePool(theory);
  const clues: { clue: string; answer: string }[] = [];
  for (const term of terms) {
    if (clues.length >= MAX) break;
    clues.push({ clue: maskedHint(term, sentences, 80, theory.topicName), answer: term.toUpperCase() });
  }
  if (clues.length < 4) {
    throw new Error(`Insufficient theory content for CROSSWORD: only ${clues.length} clue(s) available`);
  }
  return { clues };
}

// ── FILL_BLANK ──

const GENERIC_DISTRACTORS = [
  'ratio', 'average', 'multiple', 'divisor', 'fraction', 'integer',
  'product', 'quotient', 'percent', 'factor',
];

const FORMULA_SYMBOL_POOL = ['P', 'R', 'T', 'N', 'K', 'X', 'Y', '100', '2', '10', '5'];

/** 3 distractors of similar length from the term pool; blank appears exactly once overall. */
function pickDistractors(blank: string, pool: string[]): string[] {
  const blankLower = blank.toLowerCase();
  const candidates = pool
    .filter((t) => t.toLowerCase() !== blankLower)
    .sort(
      (a, b) =>
        Math.abs(a.length - blank.length) - Math.abs(b.length - blank.length) || a.localeCompare(b)
    );
  const out: string[] = [];
  for (const c of candidates) {
    if (out.length >= 3) break;
    if (!out.includes(c)) out.push(c);
  }
  for (const g of GENERIC_DISTRACTORS) {
    if (out.length >= 3) break;
    if (g !== blankLower && !out.includes(g)) out.push(g);
  }
  return out;
}

function genFillBlank(theory: TheoryInput): FillBlankContent {
  const MAX = 10;
  const pool = mineTerms(theory, 4, 12);
  const items: { text: string; blank: string; options: string[] }[] = [];
  const usedBlanks = new Set<string>();
  const usedTexts = new Set<string>();

  // From prose: blank the most "technical" word (longest non-stopword ≥4
  // letters that occurs exactly once in the sentence, so there is exactly one ___).
  const addFromSentence = (src: string): void => {
    if (items.length >= MAX) return;
    const s = collapse(src);
    if (s.length < 15) return;
    const wordsIn = dedupeStrings(
      s.split(/[^a-zA-Z]+/).filter((w) => w.length >= 4 && !isStopOrFiller(w.toLowerCase()))
    ).sort((a, b) => b.length - a.length || a.localeCompare(b));
    for (const w of wordsIn) {
      const countRe = new RegExp(`\\b${escapeRegExp(w)}\\b`, 'gi');
      if ((s.match(countRe) || []).length !== 1) continue;
      const blank = w.toLowerCase();
      if (usedBlanks.has(blank)) continue;
      const distractors = pickDistractors(blank, pool);
      if (distractors.length < 3) return;
      const text = clampAroundMask(s.replace(new RegExp(`\\b${escapeRegExp(w)}\\b`, 'i'), '___'), 140);
      if (usedTexts.has(text.toLowerCase())) return;
      usedBlanks.add(blank);
      usedTexts.add(text.toLowerCase());
      items.push({ text, blank, options: shuffle([blank, ...distractors]) });
      return; // one item per sentence
    }
  };

  // From formulas: blank one variable/number token on the RHS,
  // e.g. "SI = P×R×T/100" → "SI = P×___×T/100", blank "R".
  const addFromFormula = (src: string): void => {
    if (items.length >= MAX) return;
    const f = collapse(src);
    if (f.length < 4) return;
    const eq = f.indexOf('=');
    const rhs = eq >= 0 ? f.slice(eq + 1) : f;
    const tokens = dedupeStrings(rhs.match(/[a-zA-Z]+|\d+(?:\.\d+)?/g) || []);
    if (tokens.length === 0) return;
    const blank = tokens.length >= 2 ? tokens[1] : tokens[0]; // 2nd RHS token → "R" in P×R×T
    const tokenRe = new RegExp(`\\b${escapeRegExp(blank)}\\b`);
    if (!tokenRe.test(rhs)) return;
    const text = clampAroundMask((eq >= 0 ? f.slice(0, eq + 1) : '') + rhs.replace(tokenRe, '___'), 140);
    if (usedTexts.has(text.toLowerCase())) return;
    // Options: the blanked token + 3 other tokens / plausible symbols.
    const options: string[] = [blank];
    for (const t of tokens) {
      if (options.length >= 4) break;
      if (t !== blank && !options.includes(t)) options.push(t);
    }
    for (const sym of FORMULA_SYMBOL_POOL) {
      if (options.length >= 4) break;
      if (sym !== blank && !options.includes(sym)) options.push(sym);
    }
    if (options.length !== 4) return;
    usedTexts.add(text.toLowerCase());
    items.push({ text, blank, options: shuffle(options) });
  };

  for (const kp of theory.keyPoints) addFromSentence(kp);
  for (const f of theory.formulas) addFromFormula(f);
  // Pad from rawTheory sentences when sources run dry.
  if (items.length < 4) {
    for (const s of extractSentences(theory.rawTheory)) {
      if (items.length >= MAX) break;
      addFromSentence(s);
    }
  }

  if (items.length < 4) {
    throw new Error(`Insufficient theory content for FILL_BLANK: only ${items.length} sentence(s) available`);
  }
  return { sentences: items };
}

// ── CONCEPT_CANNON ──

// Stem pairs — matching a stem also flips inflected forms (adds/added/adding…).
const FLIP_PAIRS: [string, string][] = [
  ['increas', 'decreas'],
  ['always', 'never'],
  ['maximum', 'minimum'],
  ['greater', 'smaller'],
  ['add', 'subtract'],
  ['before', 'after'],
];

function preserveCase(original: string, replacement: string): string {
  if (original.charAt(0) === original.charAt(0).toUpperCase()) {
    return replacement.charAt(0).toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/** (a) swap first number n → n*2+1. Returns null if no number present. */
function perturbNumber(text: string): string | null {
  const m = text.match(/\d+(?:\.\d+)?/);
  if (!m || m.index === undefined) return null;
  const val = parseFloat(m[0]);
  if (!isFinite(val)) return null;
  const next = String(val * 2 + 1);
  return text.slice(0, m.index) + next + text.slice(m.index + m[0].length);
}

/** (b) flip the first direction word found. Returns null if none present. */
function flipDirectionWords(text: string): string | null {
  for (const [a, b] of FLIP_PAIRS) {
    for (const [from, to] of [[a, b], [b, a]] as [string, string][]) {
      // \b before stem; stem may continue with suffix letters (increase/increased…),
      // except pure words (always, before…) which usually appear bare — either way
      // replacing just the stem keeps the suffix intact (added → subtracted).
      const re = new RegExp(`\\b${from}`, 'i');
      const m = text.match(re);
      if (m && m.index !== undefined) {
        return text.slice(0, m.index) + preserveCase(m[0], to) + text.slice(m.index + m[0].length);
      }
    }
  }
  return null;
}

/** (c) swap this sentence's key term with a high-ranked term NOT in the sentence. */
function swapKeyTerm(text: string, termPool: string[]): string | null {
  const wordsIn = dedupeStrings(
    text.split(/[^a-zA-Z]+/).filter((w) => w.length >= 4 && !isStopOrFiller(w.toLowerCase()))
  ).sort((a, b) => b.length - a.length || a.localeCompare(b));
  if (wordsIn.length === 0) return null;
  const target = wordsIn[0];
  const lowerText = text.toLowerCase();
  const replacement = termPool.find(
    (t) => t !== target.toLowerCase() && !new RegExp(`\\b${escapeRegExp(t)}\\b`).test(lowerText)
  );
  if (!replacement) return null;
  const re = new RegExp(`\\b${escapeRegExp(target)}\\b`, 'i');
  return text.replace(re, preserveCase(target, replacement));
}

function genConceptCannon(theory: TheoryInput): ConceptCannonContent {
  const MAX_PER_SIDE = 6; // ~12 items total, roughly half true / half false
  const categories = ['TRUE', 'FALSE'];

  let source = dedupeStrings(theory.keyPoints.map(collapse).filter((s) => s.length >= 12));
  if (source.length < 6) {
    source = dedupeStrings([...source, ...extractSentences(theory.rawTheory)]);
  }

  const trueSrc: string[] = [];
  const falseSrc: string[] = [];
  source.forEach((s, i) => {
    if (i % 2 === 0 && trueSrc.length < MAX_PER_SIDE) trueSrc.push(s);
    else falseSrc.push(s);
  });

  const trueItems: { concept: string; category: string }[] = [];
  const trueSet = new Set<string>();
  for (const s of trueSrc) {
    const concept = clampText(s, 70);
    if (trueSet.has(concept.toLowerCase())) continue;
    trueSet.add(concept.toLowerCase());
    trueItems.push({ concept, category: 'TRUE' });
  }

  // FALSE items: deterministic perturbations of OTHER keyPoints. Perturb the
  // already-clamped statement so the change is always visible. If no
  // perturbation applies (a→b→c), skip — never emit an unchanged "false".
  const termPool = mineTerms(theory, 4, 12);
  const falseItems: { concept: string; category: string }[] = [];
  const falseSet = new Set<string>();
  for (const s of falseSrc) {
    if (falseItems.length >= MAX_PER_SIDE) break;
    const base = clampText(s, 70);
    const perturbed = perturbNumber(base) ?? flipDirectionWords(base) ?? swapKeyTerm(base, termPool);
    if (!perturbed || perturbed === base) continue;
    const concept = clampText(perturbed, 70);
    const key = concept.toLowerCase();
    if (trueSet.has(key) || falseSet.has(key)) continue;
    falseSet.add(key);
    falseItems.push({ concept, category: 'FALSE' });
  }

  // Interleave for a balanced feel; engines may reshuffle anyway.
  const items: { concept: string; category: string }[] = [];
  const rounds = Math.max(trueItems.length, falseItems.length);
  for (let i = 0; i < rounds && items.length < MAX_PER_SIDE * 2; i++) {
    if (i < trueItems.length) items.push(trueItems[i]);
    if (i < falseItems.length && items.length < MAX_PER_SIDE * 2) items.push(falseItems[i]);
  }

  if (items.length < 4 || falseItems.length === 0) {
    throw new Error(
      `Insufficient theory content for CONCEPT_CANNON: ${trueItems.length} true / ${falseItems.length} false statement(s) available`
    );
  }
  return { categories, items };
}

// ── Public API ──

const GAME_TYPES = [
  'MEMORY_MATCH',
  'WORD_SCRAMBLE',
  'CROSSWORD',
  'HANGMAN',
  'FILL_BLANK',
  'CONCEPT_CANNON',
] as const;

export function getInterviewGameContent(gameType: string, theory: TheoryInput): GameContent {
  const t = normalizeTheory(theory);
  switch (gameType) {
    case 'MEMORY_MATCH':
      return genMemoryMatch(t);
    case 'WORD_SCRAMBLE':
      return genWordScramble(t);
    case 'CROSSWORD':
      return genCrossword(t);
    case 'HANGMAN':
      return genHangman(t);
    case 'FILL_BLANK':
      return genFillBlank(t);
    case 'CONCEPT_CANNON':
      return genConceptCannon(t);
    default:
      throw new Error(`Unknown game type: ${gameType}`);
  }
}

function itemCount(content: GameContent): number {
  if ('pairs' in content) return content.pairs.length;
  if ('clues' in content) return content.clues.length;
  if ('sentences' in content) return content.sentences.length;
  if ('items' in content) return content.items.length;
  if ('words' in content) return content.words.length;
  return 0;
}

/**
 * True per game type when its generator produces ≥4 items for this theory.
 * Generators throw when they cannot reach 4 items, so a try/catch suffices.
 */
export function contentAvailability(theory: TheoryInput): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const gameType of GAME_TYPES) {
    try {
      out[gameType] = itemCount(getInterviewGameContent(gameType, theory)) >= 4;
    } catch {
      out[gameType] = false;
    }
  }
  return out;
}
