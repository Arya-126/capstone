import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

// Extends the coding bank started by seed-tracks.ts with 20+ original problems
// covering topics that were thin: tries, bit-manipulation, 2D dynamic
// programming, shortest-path graphs, prefix sums, hashing, matrices.
//
// Same shape and constraints as seed-tracks.ts. Problems land verified=false;
// run scripts/verify-dsa.ts (needs Piston / docker) to flip them to true.
//
// Idempotent: upserts by slug, refreshes test cases each run.

function starters() {
  return {
    python: 'import sys\n\ndata = sys.stdin.read()\n# TODO: parse input from `data` and print your answer\n',
    javascript:
      "const input = require('fs').readFileSync(0, 'utf8');\n// TODO: parse input and console.log your answer\n",
    cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // TODO: read from stdin, print your answer\n    return 0;\n}\n',
    java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        // TODO: read from stdin, print your answer\n    }\n}\n',
  };
}

function titleCase(slug: string): string {
  return slug
    .split('-')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

interface CaseDef {
  input: string;
  expectedOutput: string;
  isSample: boolean;
}
interface ProblemDef {
  topicSlug: string;
  track: string;
  level: number;
  title: string;
  slug: string;
  difficulty: 'EASY' | 'MEDIUM' | 'HARD';
  statement: string;
  constraints: string;
  reference: string; // python
  cases: CaseDef[];
}

export const PROBLEMS: ProblemDef[] = [
  // ============ tries ============
  {
    topicSlug: 'tries',
    track: 'tries',
    level: 1,
    title: 'Common Prefix Length',
    slug: 'common-prefix-length',
    difficulty: 'EASY',
    statement:
      'Given a list of `n` lowercase strings, print the length of their longest common prefix (the maximum k such that every string starts with the same first k characters).\n\n**Input**: line 1 = `n`; the next `n` lines each contain one non-empty lowercase string.\n**Output**: a single integer — the length of the longest common prefix (may be 0).',
    constraints: '1 <= n <= 1000. Each string has length 1..200. Only lowercase a-z.',
    reference:
      'import sys\nlines = sys.stdin.read().split()\nn = int(lines[0])\nws = lines[1:1+n]\nk = 0\nwhile all(len(w) > k and w[k] == ws[0][k] for w in ws):\n    k += 1\nprint(k)\n',
    cases: [
      { input: '3\nflower\nflow\nflight', expectedOutput: '2', isSample: true },
      { input: '3\ndog\nracecar\ncar', expectedOutput: '0', isSample: true },
      { input: '1\nalone', expectedOutput: '5', isSample: false },
      { input: '2\ntest\ntesting', expectedOutput: '4', isSample: false },
      { input: '4\nabc\nabcd\nabce\nabcf', expectedOutput: '3', isSample: false },
      { input: '2\na\nb', expectedOutput: '0', isSample: false },
    ],
  },
  {
    topicSlug: 'tries',
    track: 'tries',
    level: 2,
    title: 'Prefix Count',
    slug: 'prefix-count',
    difficulty: 'MEDIUM',
    statement:
      'You are given `n` lowercase words to store, followed by `q` prefix queries. For each query print how many of the stored words start with the given prefix.\n\n**Input**: line 1 = `n q`; the next `n` lines each contain a stored word; the next `q` lines each contain a prefix to query.\n**Output**: `q` lines — the count for each query in order.',
    constraints: '1 <= n, q <= 5000. Each string has length 1..30. Only lowercase a-z. Words may repeat.',
    reference:
      'import sys\nd = sys.stdin.read().splitlines()\nn, q = map(int, d[0].split())\nwords = d[1:1+n]\nqueries = d[1+n:1+n+q]\nout = []\nfor pref in queries:\n    c = 0\n    for w in words:\n        if w.startswith(pref):\n            c += 1\n    out.append(str(c))\nprint("\\n".join(out))\n',
    cases: [
      { input: '3 2\napple\napp\nape\napp\nap', expectedOutput: '2\n3', isSample: true },
      { input: '4 1\ncat\ncar\ncart\ncoat\nca', expectedOutput: '3', isSample: true },
      { input: '2 2\nfoo\nbar\nz\nf', expectedOutput: '0\n1', isSample: false },
      { input: '5 3\nabc\nabcd\nabcde\nabxy\nab\na\nabc\nabcd', expectedOutput: '5\n3\n2', isSample: false },
      { input: '1 1\nhello\nhello', expectedOutput: '1', isSample: false },
      { input: '3 1\nsame\nsame\nsame\nsa', expectedOutput: '3', isSample: false },
    ],
  },
  {
    topicSlug: 'tries',
    track: 'tries',
    level: 3,
    title: 'Auto Complete Rank',
    slug: 'auto-complete-rank',
    difficulty: 'MEDIUM',
    statement:
      'You maintain a dictionary of `n` lowercase words, each with a positive integer frequency. Given a query prefix, list up to the 3 words that (a) start with the prefix and (b) have the highest frequency. Ties break lexicographically (smaller word first).\n\n**Input**: line 1 = `n`; the next `n` lines each contain `word freq` separated by a space; the next line contains the prefix.\n**Output**: up to 3 words, space-separated, in ranked order. If no word matches, print "NONE".',
    constraints: '1 <= n <= 2000, 1 <= freq <= 10^6, 1 <= |word|, |prefix| <= 20. Only lowercase a-z.',
    reference:
      'import sys\nd = sys.stdin.read().splitlines()\nn = int(d[0])\nentries = []\nfor i in range(n):\n    w, f = d[1 + i].split()\n    entries.append((w, int(f)))\npref = d[1 + n]\ncand = [(w, f) for (w, f) in entries if w.startswith(pref)]\ncand.sort(key=lambda x: (-x[1], x[0]))\ntop = [w for (w, _) in cand[:3]]\nprint(" ".join(top) if top else "NONE")\n',
    cases: [
      { input: '4\napple 5\napp 10\napex 3\nbanana 7\nap', expectedOutput: 'app apple apex', isSample: true },
      { input: '3\ncat 1\ncar 1\ncab 1\nca', expectedOutput: 'cab car cat', isSample: true },
      { input: '2\nhello 5\nworld 2\nz', expectedOutput: 'NONE', isSample: false },
      { input: '3\nfoo 3\nfor 3\nfoot 2\nfo', expectedOutput: 'foo for foot', isSample: false },
      { input: '4\ndog 10\ndot 10\ndoll 10\ndown 10\ndo', expectedOutput: 'dog doll dot', isSample: false },
      { input: '1\nsolo 42\nso', expectedOutput: 'solo', isSample: false },
    ],
  },

  // ============ bit-manipulation ============
  {
    topicSlug: 'bit-manipulation',
    track: 'bit-manipulation',
    level: 1,
    title: 'Count Set Bits',
    slug: 'count-set-bits',
    difficulty: 'EASY',
    statement:
      'Given a non-negative integer `n`, print the number of 1-bits in its 32-bit binary representation.\n\n**Input**: a single integer `n`.\n**Output**: the number of set bits.',
    constraints: '0 <= n <= 2^31 - 1.',
    reference: 'import sys\nn = int(sys.stdin.read().split()[0])\nprint(bin(n).count("1"))\n',
    cases: [
      { input: '11', expectedOutput: '3', isSample: true },
      { input: '128', expectedOutput: '1', isSample: true },
      { input: '0', expectedOutput: '0', isSample: false },
      { input: '15', expectedOutput: '4', isSample: false },
      { input: '2147483647', expectedOutput: '31', isSample: false },
      { input: '1', expectedOutput: '1', isSample: false },
    ],
  },
  {
    topicSlug: 'bit-manipulation',
    track: 'bit-manipulation',
    level: 2,
    title: 'XOR of Range',
    slug: 'xor-of-range',
    difficulty: 'MEDIUM',
    statement:
      'Given two non-negative integers `l` and `r` with `l <= r`, print `l XOR (l+1) XOR ... XOR r`.\n\n**Input**: two integers `l r` separated by a space.\n**Output**: a single integer — the XOR of every integer in the inclusive range `[l, r]`.',
    constraints: '0 <= l <= r <= 10^9.',
    reference:
      'import sys\ndef pref(n):\n    # XOR from 0..n inclusive\n    m = n % 4\n    if m == 0: return n\n    if m == 1: return 1\n    if m == 2: return n + 1\n    return 0\nl, r = map(int, sys.stdin.read().split())\nprint(pref(r) ^ pref(l - 1))\n',
    cases: [
      { input: '3 5', expectedOutput: '2', isSample: true },
      { input: '1 4', expectedOutput: '4', isSample: true },
      { input: '0 0', expectedOutput: '0', isSample: false },
      { input: '5 5', expectedOutput: '5', isSample: false },
      { input: '1 1000000000', expectedOutput: '1000000000', isSample: false },
      { input: '7 12', expectedOutput: '11', isSample: false },
    ],
  },
  {
    topicSlug: 'bit-manipulation',
    track: 'bit-manipulation',
    level: 2,
    title: 'Single Missing Number',
    slug: 'single-missing-number',
    difficulty: 'EASY',
    statement:
      'You have an array of `n-1` distinct integers drawn without repetition from `[1, n]`. Exactly one value in `[1, n]` is missing — find it using O(1) extra memory.\n\n**Input**: line 1 = `n`; line 2 = `n-1` space-separated integers, each in `[1, n]`, all distinct.\n**Output**: the missing integer.',
    constraints: '2 <= n <= 10^6.',
    reference:
      'import sys\nd = sys.stdin.read().split()\nn = int(d[0])\nvals = list(map(int, d[1:n]))\nx = 0\nfor i in range(1, n + 1):\n    x ^= i\nfor v in vals:\n    x ^= v\nprint(x)\n',
    cases: [
      { input: '5\n1 2 4 5', expectedOutput: '3', isSample: true },
      { input: '3\n1 3', expectedOutput: '2', isSample: true },
      { input: '2\n1', expectedOutput: '2', isSample: false },
      { input: '2\n2', expectedOutput: '1', isSample: false },
      { input: '6\n6 5 4 3 2', expectedOutput: '1', isSample: false },
      { input: '10\n1 2 3 4 5 6 7 8 10', expectedOutput: '9', isSample: false },
    ],
  },
  {
    topicSlug: 'bit-manipulation',
    track: 'bit-manipulation',
    level: 3,
    title: 'Power Set Order',
    slug: 'power-set-order',
    difficulty: 'MEDIUM',
    statement:
      'Given a set of `n` distinct positive integers, print every subset in ascending order of the subset-mask (0..2^n - 1). The empty subset is represented by an empty line.\n\nFor a subset, print its elements in the same order they appeared in the input, space-separated. Each subset goes on its own line, all 2^n subsets in mask order.\n\n**Input**: line 1 = `n`; line 2 = `n` space-separated distinct positive integers.\n**Output**: `2^n` lines. The empty subset is a blank line.',
    constraints: '1 <= n <= 12. Each element in [1, 100].',
    reference:
      'import sys\nd = sys.stdin.read().split()\nn = int(d[0])\na = list(map(int, d[1:1+n]))\nout = []\nfor mask in range(1 << n):\n    sub = [str(a[i]) for i in range(n) if (mask >> i) & 1]\n    out.append(" ".join(sub))\nprint("\\n".join(out))\n',
    cases: [
      { input: '2\n1 2', expectedOutput: '\n1\n2\n1 2', isSample: true },
      { input: '1\n5', expectedOutput: '\n5', isSample: true },
      { input: '3\n1 2 3', expectedOutput: '\n1\n2\n1 2\n3\n1 3\n2 3\n1 2 3', isSample: false },
      { input: '2\n7 9', expectedOutput: '\n7\n9\n7 9', isSample: false },
      { input: '1\n1', expectedOutput: '\n1', isSample: false },
    ],
  },

  // ============ dynamic-programming (more) ============
  {
    topicSlug: 'dynamic-programming',
    track: 'dynamic-programming',
    level: 3,
    title: 'House Robber Line',
    slug: 'house-robber-line',
    difficulty: 'MEDIUM',
    statement:
      'A row of `n` houses have positive money amounts. You cannot rob two adjacent houses on the same night. Print the maximum total you can rob.\n\n**Input**: line 1 = `n`; line 2 = `n` space-separated non-negative integers (the money in each house).\n**Output**: the maximum total money.',
    constraints: '1 <= n <= 10^5, 0 <= money <= 10^4.',
    reference:
      'import sys\nd = sys.stdin.read().split()\nn = int(d[0])\na = list(map(int, d[1:1+n]))\nprev = curr = 0\nfor x in a:\n    prev, curr = curr, max(curr, prev + x)\nprint(curr)\n',
    cases: [
      { input: '4\n1 2 3 1', expectedOutput: '4', isSample: true },
      { input: '5\n2 7 9 3 1', expectedOutput: '12', isSample: true },
      { input: '1\n50', expectedOutput: '50', isSample: false },
      { input: '2\n5 4', expectedOutput: '5', isSample: false },
      { input: '3\n0 0 0', expectedOutput: '0', isSample: false },
      { input: '6\n5 3 4 11 2 8', expectedOutput: '24', isSample: false },
    ],
  },
  {
    topicSlug: 'dynamic-programming',
    track: 'dynamic-programming',
    level: 3,
    title: 'Grid Paths Sum',
    slug: 'grid-paths-sum',
    difficulty: 'MEDIUM',
    statement:
      'A grid has `r` rows and `c` columns of non-negative integers. Starting at the top-left cell you may move only right or down at each step. Print the minimum sum of values on any path from `(0,0)` to `(r-1, c-1)`, including both endpoints.\n\n**Input**: line 1 = `r c`; the next `r` lines each contain `c` space-separated non-negative integers.\n**Output**: the minimum path sum.',
    constraints: '1 <= r, c <= 200, 0 <= value <= 10^4.',
    reference:
      'import sys\nd = sys.stdin.read().split()\nr, c = int(d[0]), int(d[1])\nvals = list(map(int, d[2:2 + r * c]))\ng = [vals[i * c:(i + 1) * c] for i in range(r)]\ndp = [[0] * c for _ in range(r)]\ndp[0][0] = g[0][0]\nfor j in range(1, c):\n    dp[0][j] = dp[0][j - 1] + g[0][j]\nfor i in range(1, r):\n    dp[i][0] = dp[i - 1][0] + g[i][0]\nfor i in range(1, r):\n    for j in range(1, c):\n        dp[i][j] = g[i][j] + min(dp[i - 1][j], dp[i][j - 1])\nprint(dp[r - 1][c - 1])\n',
    cases: [
      { input: '2 3\n1 3 1\n1 5 1', expectedOutput: '6', isSample: true },
      { input: '1 1\n42', expectedOutput: '42', isSample: true },
      { input: '3 3\n1 3 1\n1 5 1\n4 2 1', expectedOutput: '7', isSample: false },
      { input: '2 2\n1 2\n3 4', expectedOutput: '7', isSample: false },
      { input: '3 1\n5\n6\n7', expectedOutput: '18', isSample: false },
      { input: '1 4\n2 3 4 5', expectedOutput: '14', isSample: false },
    ],
  },
  {
    topicSlug: 'dynamic-programming',
    track: 'dynamic-programming',
    level: 4,
    title: 'Edit Distance',
    slug: 'edit-distance',
    difficulty: 'HARD',
    statement:
      'Given two lowercase strings `a` and `b`, print the minimum number of single-character insertions, deletions, or substitutions needed to convert `a` into `b`.\n\n**Input**: line 1 = `a`; line 2 = `b`.\n**Output**: the edit distance.',
    constraints: '0 <= |a|, |b| <= 500. Only lowercase a-z; either may be empty (represented as a blank line).',
    reference:
      'import sys\ndata = sys.stdin.read().split("\\n")\na = data[0] if len(data) > 0 else ""\nb = data[1] if len(data) > 1 else ""\nm, n = len(a), len(b)\ndp = [[0] * (n + 1) for _ in range(m + 1)]\nfor i in range(m + 1):\n    dp[i][0] = i\nfor j in range(n + 1):\n    dp[0][j] = j\nfor i in range(1, m + 1):\n    for j in range(1, n + 1):\n        if a[i - 1] == b[j - 1]:\n            dp[i][j] = dp[i - 1][j - 1]\n        else:\n            dp[i][j] = 1 + min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1])\nprint(dp[m][n])\n',
    cases: [
      { input: 'horse\nros', expectedOutput: '3', isSample: true },
      { input: 'intention\nexecution', expectedOutput: '5', isSample: true },
      { input: 'a\nb', expectedOutput: '1', isSample: false },
      { input: 'same\nsame', expectedOutput: '0', isSample: false },
      { input: 'kitten\nsitting', expectedOutput: '3', isSample: false },
      { input: 'abc\n', expectedOutput: '3', isSample: false },
    ],
  },

  // ============ graphs (more) ============
  {
    topicSlug: 'graphs',
    track: 'graphs',
    level: 2,
    title: 'BFS Shortest Path',
    slug: 'bfs-shortest-path',
    difficulty: 'MEDIUM',
    statement:
      'An undirected unweighted graph has `n` nodes numbered `0..n-1` and `m` edges. Starting from node `s`, print the shortest-path distance (number of edges) to node `t`. If `t` is unreachable, print -1.\n\n**Input**: line 1 = `n m s t`; the next `m` lines each contain two integers `u v` describing an edge.\n**Output**: the shortest-path distance, or -1.',
    constraints: '1 <= n <= 10^4, 0 <= m <= 10^5, 0 <= s, t, u, v < n. No self-loops or duplicate edges.',
    reference:
      'import sys\nfrom collections import deque\nd = sys.stdin.read().split()\nidx = 0\nn, m, s, t = int(d[0]), int(d[1]), int(d[2]), int(d[3]); idx = 4\nadj = [[] for _ in range(n)]\nfor _ in range(m):\n    u, v = int(d[idx]), int(d[idx + 1]); idx += 2\n    adj[u].append(v)\n    adj[v].append(u)\nif s == t:\n    print(0)\nelse:\n    dist = [-1] * n\n    dist[s] = 0\n    q = deque([s])\n    while q:\n        u = q.popleft()\n        for v in adj[u]:\n            if dist[v] == -1:\n                dist[v] = dist[u] + 1\n                q.append(v)\n    print(dist[t])\n',
    cases: [
      { input: '4 3 0 3\n0 1\n1 2\n2 3', expectedOutput: '3', isSample: true },
      { input: '3 1 0 2\n0 1', expectedOutput: '-1', isSample: true },
      { input: '1 0 0 0', expectedOutput: '0', isSample: false },
      { input: '5 5 0 4\n0 1\n0 2\n1 3\n2 3\n3 4', expectedOutput: '3', isSample: false },
      { input: '6 6 0 5\n0 1\n1 2\n2 3\n3 4\n4 5\n0 5', expectedOutput: '1', isSample: false },
      { input: '4 2 1 3\n0 1\n2 3', expectedOutput: '-1', isSample: false },
    ],
  },
  {
    topicSlug: 'graphs',
    track: 'graphs',
    level: 3,
    title: 'Connected Components Count',
    slug: 'connected-components-count',
    difficulty: 'MEDIUM',
    statement:
      'An undirected graph has `n` nodes numbered `0..n-1` and `m` edges. Print the number of connected components (including isolated nodes).\n\n**Input**: line 1 = `n m`; the next `m` lines each contain two integers `u v` describing an edge.\n**Output**: the number of connected components.',
    constraints: '1 <= n <= 10^4, 0 <= m <= 10^5, 0 <= u, v < n. No self-loops.',
    reference:
      'import sys\nfrom collections import deque\nd = sys.stdin.read().split()\nn, m = int(d[0]), int(d[1])\nidx = 2\nadj = [[] for _ in range(n)]\nfor _ in range(m):\n    u, v = int(d[idx]), int(d[idx + 1]); idx += 2\n    adj[u].append(v)\n    adj[v].append(u)\nseen = [False] * n\nc = 0\nfor start in range(n):\n    if seen[start]:\n        continue\n    c += 1\n    seen[start] = True\n    q = deque([start])\n    while q:\n        u = q.popleft()\n        for v in adj[u]:\n            if not seen[v]:\n                seen[v] = True\n                q.append(v)\nprint(c)\n',
    cases: [
      { input: '5 3\n0 1\n1 2\n3 4', expectedOutput: '2', isSample: true },
      { input: '4 0', expectedOutput: '4', isSample: true },
      { input: '1 0', expectedOutput: '1', isSample: false },
      { input: '6 4\n0 1\n2 3\n3 4\n4 5', expectedOutput: '2', isSample: false },
      { input: '3 3\n0 1\n1 2\n0 2', expectedOutput: '1', isSample: false },
      { input: '5 0', expectedOutput: '5', isSample: false },
    ],
  },
  {
    topicSlug: 'graphs',
    track: 'graphs',
    level: 4,
    title: 'Dijkstra Shortest Path',
    slug: 'dijkstra-shortest-path',
    difficulty: 'HARD',
    statement:
      'A weighted directed graph has `n` nodes numbered `0..n-1` and `m` edges. Every edge weight is a positive integer. From node `s`, print the shortest-path distance to node `t`. If `t` is unreachable, print -1.\n\n**Input**: line 1 = `n m s t`; the next `m` lines each contain three integers `u v w` (edge from u to v with weight w).\n**Output**: the shortest-path distance, or -1.',
    constraints: '1 <= n <= 5000, 0 <= m <= 20000, 1 <= w <= 10^4, 0 <= s, t, u, v < n.',
    reference:
      'import sys\nimport heapq\nd = sys.stdin.read().split()\nn, m, s, t = int(d[0]), int(d[1]), int(d[2]), int(d[3])\nidx = 4\nadj = [[] for _ in range(n)]\nfor _ in range(m):\n    u, v, w = int(d[idx]), int(d[idx + 1]), int(d[idx + 2]); idx += 3\n    adj[u].append((v, w))\nINF = float("inf")\ndist = [INF] * n\ndist[s] = 0\nq = [(0, s)]\nwhile q:\n    du, u = heapq.heappop(q)\n    if du > dist[u]:\n        continue\n    for v, w in adj[u]:\n        nd = du + w\n        if nd < dist[v]:\n            dist[v] = nd\n            heapq.heappush(q, (nd, v))\nprint(dist[t] if dist[t] != INF else -1)\n',
    cases: [
      { input: '4 4 0 3\n0 1 1\n1 2 1\n0 2 4\n2 3 2', expectedOutput: '4', isSample: true },
      { input: '3 1 0 2\n0 1 5', expectedOutput: '-1', isSample: true },
      { input: '1 0 0 0', expectedOutput: '0', isSample: false },
      { input: '2 1 0 1\n0 1 7', expectedOutput: '7', isSample: false },
      { input: '5 6 0 4\n0 1 2\n1 2 2\n0 3 10\n3 4 1\n2 4 3\n1 3 4', expectedOutput: '7', isSample: false },
      { input: '3 3 0 2\n0 1 1\n1 2 1\n0 2 5', expectedOutput: '2', isSample: false },
    ],
  },

  // ============ prefix-sum (new topic — thin/absent) ============
  {
    topicSlug: 'prefix-sum',
    track: 'prefix-sum',
    level: 1,
    title: 'Range Sum Queries',
    slug: 'range-sum-queries',
    difficulty: 'EASY',
    statement:
      'Given an array of `n` integers and `q` queries of the form `l r` (0-indexed, inclusive), print the sum of `a[l..r]` for each query.\n\n**Input**: line 1 = `n q`; line 2 = `n` space-separated integers; the next `q` lines each contain `l r`.\n**Output**: `q` lines — one sum per query.',
    constraints: '1 <= n, q <= 10^5, -10^4 <= a[i] <= 10^4, 0 <= l <= r < n.',
    reference:
      'import sys\nd = sys.stdin.read().split()\nn, q = int(d[0]), int(d[1])\na = list(map(int, d[2:2 + n]))\npre = [0] * (n + 1)\nfor i in range(n):\n    pre[i + 1] = pre[i] + a[i]\nidx = 2 + n\nout = []\nfor _ in range(q):\n    l, r = int(d[idx]), int(d[idx + 1]); idx += 2\n    out.append(str(pre[r + 1] - pre[l]))\nprint("\\n".join(out))\n',
    cases: [
      { input: '5 2\n1 2 3 4 5\n0 2\n1 4', expectedOutput: '6\n14', isSample: true },
      { input: '3 1\n-1 -2 -3\n0 2', expectedOutput: '-6', isSample: true },
      { input: '1 1\n7\n0 0', expectedOutput: '7', isSample: false },
      { input: '4 3\n1 1 1 1\n0 3\n1 2\n2 2', expectedOutput: '4\n2\n1', isSample: false },
      { input: '6 2\n5 -3 2 4 -1 6\n0 5\n2 4', expectedOutput: '13\n5', isSample: false },
      { input: '2 1\n100 200\n0 1', expectedOutput: '300', isSample: false },
    ],
  },
  {
    topicSlug: 'prefix-sum',
    track: 'prefix-sum',
    level: 2,
    title: 'Subarray Sum Equals K',
    slug: 'subarray-sum-equals-k',
    difficulty: 'MEDIUM',
    statement:
      'Given an integer array of length `n` and a target integer `k`, print the number of non-empty contiguous subarrays whose elements sum to exactly `k`.\n\n**Input**: line 1 = `n k`; line 2 = `n` space-separated integers (positive, negative or zero).\n**Output**: the number of such subarrays.',
    constraints: '1 <= n <= 2*10^4, -10^4 <= a[i] <= 10^4, -10^9 <= k <= 10^9.',
    reference:
      'import sys\nfrom collections import defaultdict\nd = sys.stdin.read().split()\nn, k = int(d[0]), int(d[1])\na = list(map(int, d[2:2 + n]))\ncnt = defaultdict(int)\ncnt[0] = 1\ns = 0\nans = 0\nfor x in a:\n    s += x\n    ans += cnt[s - k]\n    cnt[s] += 1\nprint(ans)\n',
    cases: [
      { input: '4 2\n1 1 1 1', expectedOutput: '3', isSample: true },
      { input: '3 3\n1 2 3', expectedOutput: '2', isSample: true },
      { input: '1 5\n5', expectedOutput: '1', isSample: false },
      { input: '1 5\n4', expectedOutput: '0', isSample: false },
      { input: '5 0\n1 -1 1 -1 1', expectedOutput: '6', isSample: false },
      { input: '5 3\n1 2 1 2 1', expectedOutput: '4', isSample: false },
    ],
  },

  // ============ hashing (level 1 filler) ============
  {
    topicSlug: 'hashing',
    track: 'hashing',
    level: 1,
    title: 'Majority Element',
    slug: 'majority-element',
    difficulty: 'EASY',
    statement:
      'You are given `n` integers. Print the value that appears strictly more than `n/2` times. It is guaranteed such a value exists.\n\n**Input**: line 1 = `n`; line 2 = `n` space-separated integers.\n**Output**: the majority element.',
    constraints: '1 <= n <= 10^5, -10^9 <= a[i] <= 10^9.',
    reference:
      'import sys\nd = sys.stdin.read().split()\nn = int(d[0])\na = list(map(int, d[1:1 + n]))\n# Boyer-Moore\ncand = None; cnt = 0\nfor x in a:\n    if cnt == 0:\n        cand = x\n    cnt += 1 if x == cand else -1\nprint(cand)\n',
    cases: [
      { input: '7\n3 3 4 2 3 3 5', expectedOutput: '3', isSample: true },
      { input: '3\n1 1 2', expectedOutput: '1', isSample: true },
      { input: '1\n7', expectedOutput: '7', isSample: false },
      { input: '5\n2 2 2 1 3', expectedOutput: '2', isSample: false },
      { input: '4\n5 5 5 5', expectedOutput: '5', isSample: false },
      { input: '9\n-1 -1 -1 -1 -1 2 3 4 5', expectedOutput: '-1', isSample: false },
    ],
  },
  {
    topicSlug: 'hashing',
    track: 'hashing',
    level: 2,
    title: 'Group Anagrams Count',
    slug: 'group-anagrams-count',
    difficulty: 'MEDIUM',
    statement:
      'Given `n` lowercase strings, group them so two strings are in the same group iff they are anagrams (same multiset of letters). Print how many distinct groups there are.\n\n**Input**: line 1 = `n`; the next `n` lines each contain one non-empty lowercase string.\n**Output**: the number of distinct anagram groups.',
    constraints: '1 <= n <= 10^4. Each string has length 1..50. Only lowercase a-z.',
    reference:
      'import sys\nlines = sys.stdin.read().splitlines()\nn = int(lines[0])\ngroups = set()\nfor w in lines[1:1 + n]:\n    groups.add("".join(sorted(w)))\nprint(len(groups))\n',
    cases: [
      { input: '6\neat\ntea\ntan\nate\nnat\nbat', expectedOutput: '3', isSample: true },
      { input: '3\nabc\nbca\ncab', expectedOutput: '1', isSample: true },
      { input: '1\nhello', expectedOutput: '1', isSample: false },
      { input: '4\nab\nba\ncd\ndc', expectedOutput: '2', isSample: false },
      { input: '5\nrat\ntar\nart\ncat\nact', expectedOutput: '2', isSample: false },
      { input: '2\na\nb', expectedOutput: '2', isSample: false },
    ],
  },

  // ============ matrix (new topic) ============
  {
    topicSlug: 'matrix',
    track: 'matrix',
    level: 2,
    title: 'Rotate Matrix 90',
    slug: 'rotate-matrix-90',
    difficulty: 'MEDIUM',
    statement:
      'Given an `n x n` matrix of integers, print the matrix rotated 90 degrees clockwise.\n\n**Input**: line 1 = `n`; the next `n` lines each contain `n` space-separated integers.\n**Output**: `n` lines describing the rotated matrix, each with `n` space-separated integers.',
    constraints: '1 <= n <= 200, -10^4 <= value <= 10^4.',
    reference:
      'import sys\nd = sys.stdin.read().split()\nn = int(d[0])\nvals = list(map(int, d[1:1 + n * n]))\ng = [vals[i * n:(i + 1) * n] for i in range(n)]\nrot = [[g[n - 1 - j][i] for j in range(n)] for i in range(n)]\nout = []\nfor row in rot:\n    out.append(" ".join(map(str, row)))\nprint("\\n".join(out))\n',
    cases: [
      { input: '2\n1 2\n3 4', expectedOutput: '3 1\n4 2', isSample: true },
      { input: '3\n1 2 3\n4 5 6\n7 8 9', expectedOutput: '7 4 1\n8 5 2\n9 6 3', isSample: true },
      { input: '1\n42', expectedOutput: '42', isSample: false },
      { input: '2\n0 0\n0 0', expectedOutput: '0 0\n0 0', isSample: false },
      { input: '3\n1 0 0\n0 1 0\n0 0 1', expectedOutput: '0 0 1\n0 1 0\n1 0 0', isSample: false },
    ],
  },
  {
    topicSlug: 'matrix',
    track: 'matrix',
    level: 3,
    title: 'Spiral Traversal',
    slug: 'spiral-traversal',
    difficulty: 'MEDIUM',
    statement:
      'Given an `r x c` matrix, print its elements in clockwise spiral order (starting at the top-left, going right across the top row, then down the right column, etc.) on a single line, space-separated.\n\n**Input**: line 1 = `r c`; the next `r` lines each contain `c` space-separated integers.\n**Output**: the spiral traversal on a single line.',
    constraints: '1 <= r, c <= 100, -10^4 <= value <= 10^4.',
    reference:
      'import sys\nd = sys.stdin.read().split()\nr, c = int(d[0]), int(d[1])\nvals = list(map(int, d[2:2 + r * c]))\ng = [vals[i * c:(i + 1) * c] for i in range(r)]\ntop, bot, left, right = 0, r - 1, 0, c - 1\nout = []\nwhile top <= bot and left <= right:\n    for j in range(left, right + 1):\n        out.append(g[top][j])\n    top += 1\n    for i in range(top, bot + 1):\n        out.append(g[i][right])\n    right -= 1\n    if top <= bot:\n        for j in range(right, left - 1, -1):\n            out.append(g[bot][j])\n        bot -= 1\n    if left <= right:\n        for i in range(bot, top - 1, -1):\n            out.append(g[i][left])\n        left += 1\nprint(" ".join(map(str, out)))\n',
    cases: [
      { input: '3 3\n1 2 3\n4 5 6\n7 8 9', expectedOutput: '1 2 3 6 9 8 7 4 5', isSample: true },
      { input: '2 3\n1 2 3\n4 5 6', expectedOutput: '1 2 3 6 5 4', isSample: true },
      { input: '1 1\n7', expectedOutput: '7', isSample: false },
      { input: '1 4\n1 2 3 4', expectedOutput: '1 2 3 4', isSample: false },
      { input: '4 1\n1\n2\n3\n4', expectedOutput: '1 2 3 4', isSample: false },
      { input: '3 4\n1 2 3 4\n5 6 7 8\n9 10 11 12', expectedOutput: '1 2 3 4 8 12 11 10 9 5 6 7', isSample: false },
    ],
  },

  // ============ strings (level 3 heavy) ============
  {
    topicSlug: 'strings',
    track: 'strings',
    level: 3,
    title: 'Longest Palindrome Substring',
    slug: 'longest-palindrome-substring',
    difficulty: 'MEDIUM',
    statement:
      'Given a lowercase string `s`, print the length of the longest contiguous substring that reads the same forwards and backwards.\n\n**Input**: a single line — the string `s`.\n**Output**: the length of the longest palindromic substring.',
    constraints: '1 <= |s| <= 1000. Only lowercase a-z.',
    reference:
      'import sys\ns = sys.stdin.readline().rstrip("\\n")\nn = len(s)\nbest = 1 if n > 0 else 0\nfor i in range(n):\n    for span in (0, 1):\n        l, r = i, i + span\n        while l >= 0 and r < n and s[l] == s[r]:\n            if r - l + 1 > best:\n                best = r - l + 1\n            l -= 1\n            r += 1\nprint(best)\n',
    cases: [
      { input: 'babad', expectedOutput: '3', isSample: true },
      { input: 'cbbd', expectedOutput: '2', isSample: true },
      { input: 'a', expectedOutput: '1', isSample: false },
      { input: 'aa', expectedOutput: '2', isSample: false },
      { input: 'racecar', expectedOutput: '7', isSample: false },
      { input: 'forgeeksskeegfor', expectedOutput: '10', isSample: false },
    ],
  },
];

async function main() {
  const topicSlugs = [...new Set(PROBLEMS.map((p) => p.topicSlug))];
  for (const slug of topicSlugs) {
    await prisma.assessmentTopic.upsert({
      where: { slug },
      update: {},
      create: { name: titleCase(slug), slug, category: 'CODING' },
    });
  }
  const topics = await prisma.assessmentTopic.findMany({
    where: { slug: { in: topicSlugs } },
    select: { id: true, slug: true },
  });
  const topicId = Object.fromEntries(topics.map((t) => [t.slug, t.id]));

  const starter = starters();
  let created = 0;
  let updated = 0;
  let totalCases = 0;

  for (const p of PROBLEMS) {
    const sampleIo = p.cases
      .filter((c) => c.isSample)
      .map((c) => ({ input: c.input, output: c.expectedOutput }));
    const common = {
      topicId: topicId[p.topicSlug],
      title: p.title,
      statement: p.statement,
      difficulty: p.difficulty as any,
      constraints: p.constraints,
      sampleIo: sampleIo as any,
      starterCode: starter as any,
      referenceSolution: { python: p.reference } as any,
      track: p.track,
      level: p.level,
      source: 'LearnHub track set (extra)',
      verified: false,
    };
    const caseCreate = p.cases.map((c) => ({
      input: c.input,
      expectedOutput: c.expectedOutput,
      isSample: c.isSample,
      weight: 1,
    }));

    const existing = await prisma.codingProblem.findUnique({
      where: { slug: p.slug },
      select: { id: true },
    });
    if (existing) {
      await prisma.testCase.deleteMany({ where: { codingProblemId: existing.id } });
      await prisma.codingProblem.update({
        where: { id: existing.id },
        data: { ...common, testCases: { create: caseCreate } },
      });
      updated++;
    } else {
      await prisma.codingProblem.create({
        data: { ...common, slug: p.slug, testCases: { create: caseCreate } },
      });
      created++;
    }
    totalCases += p.cases.length;
  }

  console.log(
    `Extra track problems: ${created} created, ${updated} updated, ${totalCases} test cases (verified=false).`
  );
  console.log('Next: docker compose up -d (start Piston), then: npx ts-node scripts/verify-dsa.ts');
  await prisma.$disconnect();
}

main().catch(async (e) => {
  console.error('seed-tracks-extra failed:', e);
  await prisma.$disconnect();
  process.exit(1);
});
