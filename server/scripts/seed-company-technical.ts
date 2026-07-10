import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

// Seeds CompanyQuestion — TECHNICAL (concept-based) prompts an interviewer
// might open a technical round with. Self-authored, not scraped: the JD-level
// prompts are common CS-fundamentals asks, and answer hints are our own
// summaries. Idempotent: (companyId + question) is deduped by delete-then-seed.

type Q = {
  question: string;
  subject: 'OS' | 'DBMS' | 'OOPS' | 'CN' | 'DSA' | 'SYSTEM_DESIGN';
  category?: 'TECHNICAL' | 'SYSTEM_DESIGN';
  difficulty?: 'easy' | 'medium' | 'hard';
  tags?: string[];
  answerHint: string;
};

// Shared question pools — companies pick subsets.
const OOPS: Q[] = [
  {
    question: 'What are the four pillars of Object-Oriented Programming?',
    subject: 'OOPS',
    difficulty: 'easy',
    tags: ['fundamentals'],
    answerHint:
      '**Encapsulation** — bundle state + behavior, expose via methods.  \n**Inheritance** — reuse a base type\'s contract in a child.  \n**Polymorphism** — same call, different behavior at runtime (dynamic dispatch) or compile-time (overloads).  \n**Abstraction** — hide implementation, expose intent (interfaces, abstract classes).',
  },
  {
    question: 'Difference between an abstract class and an interface.',
    subject: 'OOPS',
    difficulty: 'medium',
    tags: ['inheritance'],
    answerHint:
      'Abstract class can hold state + concrete methods; a class extends one. Interface declares a contract; a class implements many. Use abstract for a common base with shared code, interface for a capability that unrelated types can carry.',
  },
  {
    question: 'What is the diamond problem and how do modern languages handle it?',
    subject: 'OOPS',
    difficulty: 'medium',
    tags: ['multiple-inheritance'],
    answerHint:
      'When D inherits from B and C, both of which inherit from A, D sees A twice — which `A::foo()` wins? C++ uses virtual inheritance; Java/C# avoid it by allowing multiple interface inheritance only; Python uses C3 linearization (MRO).',
  },
  {
    question: 'Explain SOLID with one concrete example per letter.',
    subject: 'OOPS',
    difficulty: 'hard',
    tags: ['design-principles'],
    answerHint:
      '**S**ingle responsibility (a report class shouldn\'t also print PDFs).  \n**O**pen-closed (add a new payment method by subclassing, not editing the switch).  \n**L**iskov (a `Square extends Rectangle` breaks `setWidth`).  \n**I**nterface segregation (splitting `Printer` into `Printable + Scannable`).  \n**D**ependency inversion (service depends on a `Repo` interface, not `MySQLRepo`).',
  },
  {
    question: 'What is method overloading vs overriding? When is each resolved?',
    subject: 'OOPS',
    difficulty: 'easy',
    tags: ['polymorphism'],
    answerHint:
      'Overloading = same name, different signatures in one class → resolved at compile time. Overriding = child redefines a virtual method of the parent → resolved at runtime via the vtable / dynamic dispatch.',
  },
];

const OS: Q[] = [
  {
    question: 'What is a process vs a thread? What do they share?',
    subject: 'OS',
    difficulty: 'easy',
    tags: ['fundamentals'],
    answerHint:
      'Process = an OS-scheduled execution unit with its own address space, file descriptors, PID. Thread = an execution flow inside a process. Threads share heap, code, globals, FDs; each has its own stack, registers, PC.',
  },
  {
    question: 'Explain deadlock and the four Coffman conditions.',
    subject: 'OS',
    difficulty: 'medium',
    tags: ['concurrency'],
    answerHint:
      'Deadlock: threads block waiting for resources that will never release. Requires **mutual exclusion**, **hold-and-wait**, **no preemption**, and a **circular wait**. Break any one to avoid it — e.g. total resource ordering (breaks circular wait).',
  },
  {
    question: 'What is virtual memory? How does paging work?',
    subject: 'OS',
    difficulty: 'medium',
    tags: ['memory'],
    answerHint:
      'The illusion each process has its own contiguous address space, larger than physical RAM. The MMU translates virtual → physical via a page table; missing pages trigger a page fault and the OS loads from swap. Benefits: isolation, sharing (COW), overcommit.',
  },
  {
    question: 'Compare mutex, semaphore, and spinlock.',
    subject: 'OS',
    difficulty: 'medium',
    tags: ['concurrency'],
    answerHint:
      '**Mutex** — binary lock with an owner; sleep-blocks. **Semaphore** — counting; N threads can pass at once; no owner. **Spinlock** — busy-waits; only sensible when hold time < context-switch cost (kernel, interrupts).',
  },
  {
    question: 'How does an OS handle a context switch?',
    subject: 'OS',
    difficulty: 'hard',
    tags: ['scheduling'],
    answerHint:
      'Save current registers/PC into the PCB, update process state → READY/BLOCKED, run the scheduler, load the next PCB\'s registers, flush TLB if address space changes, switch to user mode. Cost: ~1-10μs plus cache/TLB misses that follow.',
  },
];

const DBMS: Q[] = [
  {
    question: 'What are the ACID properties?',
    subject: 'DBMS',
    difficulty: 'easy',
    tags: ['transactions'],
    answerHint:
      '**Atomicity** (all-or-nothing), **Consistency** (constraints hold before + after), **Isolation** (concurrent txns look serial), **Durability** (committed data survives crash — WAL / fsync).',
  },
  {
    question: 'When would you denormalize? What are the trade-offs?',
    subject: 'DBMS',
    difficulty: 'medium',
    tags: ['normalization'],
    answerHint:
      'Denormalize when read-heavy joins hurt latency or the app can\'t afford N-way JOINs at scale. Trade-off: faster reads vs. duplicate data → write amplification + risk of update anomalies. Compensate with triggers, materialized views, or event-sourced updates.',
  },
  {
    question: 'Explain B-tree vs hash indexes. When would you pick each?',
    subject: 'DBMS',
    difficulty: 'medium',
    tags: ['indexing'],
    answerHint:
      'B-tree — sorted, supports range queries and prefix scans, O(log n). Hash — O(1) equality only, no ranges, no ORDER BY. Pick B-tree by default; hash for pure equality on high-cardinality keys (some DBs use it for in-memory).',
  },
  {
    question: 'Difference between DELETE, TRUNCATE, and DROP.',
    subject: 'DBMS',
    difficulty: 'easy',
    tags: ['sql'],
    answerHint:
      'DELETE — DML, row-by-row, WHERE, transactional, fires triggers. TRUNCATE — DDL, resets the table + auto-increment, faster (no per-row log), can\'t be filtered. DROP — DDL, removes the table + schema + indexes.',
  },
  {
    question: 'What is an isolation level? What anomalies does each prevent?',
    subject: 'DBMS',
    difficulty: 'hard',
    tags: ['transactions'],
    answerHint:
      'Read Uncommitted → allows dirty reads. Read Committed → prevents dirty, allows non-repeatable. Repeatable Read → prevents non-repeatable, allows phantoms. Serializable → prevents all. Snapshot isolation gives repeatable-read semantics without locks but can suffer write skew.',
  },
];

const CN: Q[] = [
  {
    question: 'Walk through what happens when you type a URL and press Enter.',
    subject: 'CN',
    difficulty: 'medium',
    tags: ['fundamentals'],
    answerHint:
      'DNS resolve → TCP (or QUIC) handshake → TLS handshake → HTTP request → server route + DB → response → browser parses HTML → subresource fetches → paint. Add: caching (browser, CDN, DNS), Keep-Alive, HTTP/2 multiplexing, service worker if PWA.',
  },
  {
    question: 'Difference between TCP and UDP.',
    subject: 'CN',
    difficulty: 'easy',
    tags: ['transport'],
    answerHint:
      'TCP — connection-oriented, reliable, ordered, flow + congestion control, header ~20B. UDP — connectionless, unreliable, no ordering, header 8B. Use TCP for HTTP/SSH/DB; UDP for DNS/VoIP/game/QUIC (which rebuilds reliability on top).',
  },
  {
    question: 'What is a three-way handshake?',
    subject: 'CN',
    difficulty: 'easy',
    tags: ['tcp'],
    answerHint:
      'Client → SYN(seq=x) → server. Server → SYN-ACK(seq=y, ack=x+1) → client. Client → ACK(ack=y+1) → server. Both sides now agree on initial sequence numbers before data flows. Prevents half-open connections from stray SYNs.',
  },
  {
    question: 'How does HTTPS establish trust?',
    subject: 'CN',
    difficulty: 'hard',
    tags: ['security'],
    answerHint:
      'TLS handshake exchanges the server\'s cert. Client verifies the cert chain up to a root CA in its trust store, checks CN/SAN matches the host, checks expiry + revocation (OCSP). A shared symmetric key is derived (ECDHE) and used to encrypt the rest of the session.',
  },
];

const SYS_DESIGN: Q[] = [
  {
    question: 'Design a URL shortener.',
    subject: 'SYSTEM_DESIGN',
    category: 'SYSTEM_DESIGN',
    difficulty: 'medium',
    tags: ['design'],
    answerHint:
      'Ask about scale (writes/sec, read:write ratio) and expiry. Storage: KV `{short → long, ownerId, expiresAt}`. ID generation: base62 of a counter or hash-and-check. Redis cache in front. Redirect is 301/302 with cache headers. Analytics via async event log.',
  },
  {
    question: 'How would you design a rate limiter for an API?',
    subject: 'SYSTEM_DESIGN',
    category: 'SYSTEM_DESIGN',
    difficulty: 'hard',
    tags: ['design'],
    answerHint:
      'Token bucket or sliding window in Redis. Key by user + route. On request: `INCR` + `EXPIRE`, reject if count > N. Discuss burstiness (token bucket smooths), fairness (per-tenant), and distributed correctness (Redis cluster + Lua for atomicity).',
  },
];

const DSA: Q[] = [
  {
    question: 'When would you pick a hashmap over a balanced BST?',
    subject: 'DSA',
    difficulty: 'easy',
    tags: ['data-structures'],
    answerHint:
      'Hashmap: O(1) average lookups, no ordering, memory overhead. BST: O(log n) but keeps ordering — pick when you need range queries, in-order traversal, or predictable worst case (hash can degrade to O(n) on adversarial keys).',
  },
  {
    question: 'How does quicksort work? Why is it O(n log n) average but O(n²) worst?',
    subject: 'DSA',
    difficulty: 'medium',
    tags: ['sorting'],
    answerHint:
      'Pick a pivot, partition into `<pivot` and `>pivot`, recurse. Average: balanced partitions → log n levels × n work. Worst: already sorted with fixed pivot → one side always empty → n levels. Fix with randomized/median-of-three pivot; introsort falls back to heapsort.',
  },
];

// Company-question sets. Reuse pools; tag each entry with the company slug.
const COMPANY_QUESTIONS: Record<string, Q[]> = {
  amazon: [...OOPS.slice(0, 3), ...OS, ...DBMS.slice(0, 3), ...CN.slice(0, 2), ...SYS_DESIGN, ...DSA],
  microsoft: [...OOPS, ...OS.slice(0, 4), ...DBMS.slice(0, 3), ...CN.slice(0, 3), ...SYS_DESIGN, ...DSA],
  'goldman-sachs': [...OOPS.slice(0, 3), ...DBMS, ...OS.slice(0, 3), ...DSA],
  'jp-morgan': [...OOPS.slice(0, 3), ...DBMS.slice(0, 4), ...OS.slice(0, 3), ...DSA[0] ? [DSA[0]] : []],
  tcs: [...OOPS.slice(0, 3), ...DBMS.slice(0, 3), ...OS.slice(0, 2), ...CN.slice(0, 2)],
  infosys: [...OOPS.slice(0, 3), ...DBMS.slice(0, 3), ...OS.slice(0, 2), ...CN.slice(0, 2)],
  wipro: [...OOPS.slice(0, 3), ...DBMS.slice(0, 3), ...OS.slice(0, 2), ...CN.slice(0, 2)],
  accenture: [...OOPS.slice(0, 3), ...DBMS.slice(0, 3), ...OS.slice(0, 2), ...CN.slice(0, 2)],
  cognizant: [...OOPS.slice(0, 3), ...DBMS.slice(0, 3), ...OS.slice(0, 2), ...CN.slice(0, 2)],
  capgemini: [...OOPS.slice(0, 3), ...DBMS.slice(0, 3), ...OS.slice(0, 2), ...CN.slice(0, 2)],
};

async function main() {
  const companies = await prisma.company.findMany({ select: { id: true, slug: true, name: true } });
  const bySlug = new Map(companies.map((c) => [c.slug, c]));

  let created = 0;
  let cleaned = 0;

  for (const [slug, questions] of Object.entries(COMPANY_QUESTIONS)) {
    const company = bySlug.get(slug);
    if (!company) {
      console.log(`  skip ${slug} — company not in DB`);
      continue;
    }

    // Idempotency: clear this company's existing rows so re-runs don't dupe.
    const del = await prisma.companyQuestion.deleteMany({ where: { companyId: company.id } });
    cleaned += del.count;

    const rows = questions.map((q, i) => ({
      companyId: company.id,
      category: q.category || 'TECHNICAL',
      subject: q.subject,
      question: q.question,
      answerHint: q.answerHint,
      difficulty: q.difficulty || 'medium',
      tags: q.tags || [],
      sortOrder: i,
    }));
    await prisma.companyQuestion.createMany({ data: rows });
    created += rows.length;
    console.log(`  ${company.name}: seeded ${rows.length} technical questions`);
  }

  console.log(`\n=== company technical questions ===`);
  console.log(`cleared: ${cleaned}  created: ${created}`);
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
