/* Smoke test for interviewGameContentService â€” run with ts-node */
import {
  getInterviewGameContent,
  contentAvailability,
  TheoryInput,
} from './src/services/interviewGameContentService';

const rich: TheoryInput = {
  topicName: 'Simple and Compound Interest',
  rawTheory: `SIMPLE INTEREST. Interest is the money paid by the borrower to the lender for the use of money lent. The principal is the sum of money lent. Simple interest is calculated only on the principal amount. The amount is the sum of the principal and the interest. Compound interest is calculated on the principal plus accumulated interest. The rate of interest is always expressed per annum. When interest is compounded annually, the amount grows faster than simple interest. The difference between compound and simple interest for 2 years equals P(R/100)^2. Interest rates increase when compounding frequency increases. Always convert the rate before applying the formula.`,
  keyPoints: [
    'Principal: the original sum of money lent or invested',
    'Simple Interest - interest computed only on the original principal',
    'Compound interest is computed on principal plus accumulated interest',
    'Amount = Principal + Interest earned over the period',
    'The rate of interest is always expressed per annum unless stated',
    'For 2 years the difference between compound and simple interest is P(R/100)^2',
    'Compounding more frequently makes the amount increase faster',
    'Convert the annual rate to the period rate before compounding',
  ],
  formulas: [
    'SI = P x R x T / 100',
    'Amount = P + SI',
    'CI: P(1 + R/100)^n - P',
    'A = P(1 + R/100)^n',
    'Effective Rate = (1 + R/n)^n - 1',
  ],
};

const sparse: TheoryInput = {
  topicName: 'Calendars',
  rawTheory: 'An ordinary year has 365 days. A leap year has 366 days. Odd days decide the weekday.',
  keyPoints: [],
  formulas: [],
};

const empty: TheoryInput = { topicName: '', rawTheory: '', keyPoints: [], formulas: [] };

const types = ['MEMORY_MATCH', 'WORD_SCRAMBLE', 'CROSSWORD', 'HANGMAN', 'FILL_BLANK', 'CONCEPT_CANNON'];

function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error('FAIL: ' + msg);
    process.exitCode = 1;
  }
}

for (const gt of types) {
  const c = getInterviewGameContent(gt, rich) as any;
  const n = (c.pairs || c.clues || c.sentences || c.items || c.words).length;
  console.log(`\n=== ${gt} (${n} items) ===`);
  console.log(JSON.stringify(c, null, 1).slice(0, 1600));
  assert(n >= 4, `${gt} returned fewer than 4 items`);
  if (gt === 'FILL_BLANK') {
    for (const s of c.sentences) {
      assert(s.options.length === 4, `FILL_BLANK options length !== 4: ${JSON.stringify(s.options)}`);
      assert(s.options.filter((o: string) => o === s.blank).length === 1, `blank not exactly once in options: ${JSON.stringify(s)}`);
      assert(s.text.includes('___'), `no ___ in text: ${s.text}`);
      assert((s.text.match(/___/g) || []).length === 1, `more than one ___: ${s.text}`);
    }
  }
  if (gt === 'CROSSWORD') {
    for (const cl of c.clues) {
      assert(/^[A-Z]{4,10}$/.test(cl.answer), `bad crossword answer: ${cl.answer}`);
      assert(cl.clue.length <= 80, `clue too long: ${cl.clue}`);
    }
  }
  if (gt === 'WORD_SCRAMBLE') {
    for (const w of c.words) {
      assert(/^[a-z]{4,12}$/.test(w.original), `bad scramble word: ${w.original}`);
      assert(w.hint.length <= 90, `hint too long (${w.hint.length}): ${w.hint}`);
    }
  }
  if (gt === 'CONCEPT_CANNON') {
    assert(JSON.stringify(c.categories) === '["TRUE","FALSE"]', 'bad categories');
    const trues = c.items.filter((i: any) => i.category === 'TRUE').length;
    const falses = c.items.filter((i: any) => i.category === 'FALSE').length;
    console.log(`TRUE=${trues} FALSE=${falses}`);
    assert(falses >= 1 && trues >= 1, 'need both categories');
    for (const i of c.items) assert(i.concept.length <= 70, `concept too long: ${i.concept}`);
  }
}

// determinism (apart from shuffle): run twice, compare non-shuffled games
for (const gt of ['MEMORY_MATCH', 'WORD_SCRAMBLE', 'CROSSWORD', 'HANGMAN', 'CONCEPT_CANNON']) {
  const a = JSON.stringify(getInterviewGameContent(gt, rich));
  const b = JSON.stringify(getInterviewGameContent(gt, rich));
  assert(a === b, `${gt} not deterministic`);
}

// unknown game type
try {
  getInterviewGameContent('BOGUS', rich);
  assert(false, 'BOGUS did not throw');
} catch (e: any) {
  assert(e.message.startsWith('Unknown game type:'), `wrong error: ${e.message}`);
}

console.log('\n=== availability (rich) ===', contentAvailability(rich));
console.log('=== availability (sparse) ===', contentAvailability(sparse));
console.log('=== availability (empty) ===', contentAvailability(empty));
const emptyAvail = contentAvailability(empty);
assert(Object.values(emptyAvail).every((v) => v === false), 'empty theory should have no availability');

console.log('\nSMOKE TEST ' + (process.exitCode ? 'FAILED' : 'PASSED'));

