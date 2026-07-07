import 'dotenv/config';
import { prisma } from '../src/lib/prisma';

// Coding-track seed — two jobs:
//
//  JOB 1: assign `track` + `level` to the 22 existing coding problems (by slug).
//         track defaults to the problem's topic slug unless explicitly overridden.
//
//  JOB 2: author 14 NEW original problems to fill thin tracks (linked-list, trees,
//         graphs, dynamic-programming, binary-search, two-pointers, sliding-window,
//         stacks-queues, strings, heaps). Each has a full statement, constraints,
//         sample I/O, 4-language starter code, a Python reference solution, and
//         5-7 test cases (first 2 samples). All land verified=false — run the
//         Piston sandbox + scripts/verify-dsa.ts afterwards to flip them.
//
// Idempotent: JOB 1 re-applies the same values; JOB 2 upserts by slug and
// refreshes each problem's test cases (delete + recreate).

// ===== JOB 1 — track/level assignments for existing problems =====

const TRACK_ASSIGNMENTS: Record<string, { level: number; track?: string }> = {
  // Level 1 — warmups (track = topic slug)
  'fizzbuzz-n': { level: 1 },
  'reverse-words': { level: 1 },
  'second-largest': { level: 1 },
  'power-of-two': { level: 1 },
  'single-number': { level: 1 },
  'valid-anagram': { level: 1 },
  'anagram-check': { level: 1 },
  'two-sum-indices': { level: 1 },
  // Level 2
  'pair-with-target-sum': { level: 2, track: 'two-pointers' },
  'max-profit-stock': { level: 2 },
  'valid-parentheses': { level: 2 },
  'first-last-position': { level: 2, track: 'binary-search' },
  'max-subarray-sum': { level: 2 },
  'kth-largest': { level: 2, track: 'heaps' },
  'max-meetings': { level: 2, track: 'greedy' },
  'longest-unique-substring': { level: 2, track: 'sliding-window' },
  // Level 3
  'merge-intervals': { level: 3, track: 'greedy' },
  'longest-increasing-subsequence': { level: 3, track: 'dynamic-programming' },
  'bst-lowest-common-ancestor': { level: 3, track: 'bst' },
  'reverse-k-group': { level: 3, track: 'linked-list' },
  'number-of-islands': { level: 3, track: 'graphs' },
  // Level 4
  'n-queens-count': { level: 4, track: 'recursion-backtracking' },
};

// ===== JOB 2 — new original problems =====

// Generic per-language starter skeletons (candidate fills in the logic).
function starters() {
  return {
    python: 'import sys\n\ndata = sys.stdin.read()\n# TODO: parse input from `data` and print your answer\n',
    javascript:
      "const input = require('fs').readFileSync(0, 'utf8');\n// TODO: parse input and console.log your answer\n",
    cpp: '#include <bits/stdc++.h>\nusing namespace std;\n\nint main() {\n    // TODO: read from stdin, print your answer\n    return 0;\n}\n',
    java: 'import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static void main(String[] args) throws IOException {\n        // TODO: read from stdin, print your answer\n    }\n}\n',
  };
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
  // ---------- linked-list ----------
  {
    topicSlug: 'linked-list',
    track: 'linked-list',
    level: 1,
    title: 'Middle of the List',
    slug: 'middle-of-the-list',
    difficulty: 'EASY',
    statement:
      'A singly linked list is given as a sequence of node values in order from head to tail. Print the value stored in the middle node. If the list has an even number of nodes, print the SECOND of the two middle nodes.\n\n**Input**: line 1 = `n` (number of nodes); line 2 = `n` space-separated integers (the node values, head to tail).\n**Output**: a single integer — the value of the middle node.',
    constraints: '1 <= n <= 10^4, -10^9 <= value <= 10^9.',
    reference:
      'import sys\nd = sys.stdin.read().split()\nn = int(d[0]); a = list(map(int, d[1:1+n]))\nprint(a[n // 2])\n',
    cases: [
      { input: '5\n1 2 3 4 5', expectedOutput: '3', isSample: true },
      { input: '4\n10 20 30 40', expectedOutput: '30', isSample: true },
      { input: '1\n7', expectedOutput: '7', isSample: false },
      { input: '2\n5 9', expectedOutput: '9', isSample: false },
      { input: '6\n2 4 6 8 10 12', expectedOutput: '8', isSample: false },
      { input: '3\n-1 0 1', expectedOutput: '0', isSample: false },
    ],
  },
  {
    topicSlug: 'linked-list',
    track: 'linked-list',
    level: 2,
    title: 'Detect Duplicate Jump Cycle',
    slug: 'detect-jump-cycle',
    difficulty: 'MEDIUM',
    statement:
      'A linked structure is encoded in an array: node `i` stores `next[i]`, the index of the node that follows it (or `-1` if node `i` is the last one). Starting from node `s`, follow the `next` pointers. If you ever land on a node you have already visited, the structure contains a cycle.\n\nPrint "YES" if the walk from `s` revisits any node, or "NO" if it terminates at a `-1` pointer.\n\n**Input**: line 1 = `n s` (number of nodes and 0-based start index); line 2 = `n` space-separated integers `next[0] ... next[n-1]` where each is a valid index in `[0, n-1]` or `-1`.\n**Output**: "YES" or "NO".',
    constraints: '1 <= n <= 10^4, 0 <= s < n. Each next[i] is -1 or an index in [0, n-1].',
    reference:
      'import sys\nd = sys.stdin.read().split()\nn = int(d[0]); s = int(d[1])\nnxt = list(map(int, d[2:2+n]))\nseen = set()\ncur = s\nans = "NO"\nwhile cur != -1:\n    if cur in seen:\n        ans = "YES"; break\n    seen.add(cur)\n    cur = nxt[cur]\nprint(ans)\n',
    cases: [
      { input: '4 0\n1 2 0 -1', expectedOutput: 'YES', isSample: true },
      { input: '3 0\n1 2 -1', expectedOutput: 'NO', isSample: true },
      { input: '1 0\n0', expectedOutput: 'YES', isSample: false },
      { input: '5 2\n1 -1 3 4 1', expectedOutput: 'NO', isSample: false },
      { input: '5 0\n1 2 3 4 2', expectedOutput: 'YES', isSample: false },
      { input: '2 1\n-1 0', expectedOutput: 'NO', isSample: false },
    ],
  },
  // ---------- trees ----------
  {
    topicSlug: 'trees',
    track: 'trees',
    level: 2,
    title: 'Level Order Sum',
    slug: 'level-order-sum',
    difficulty: 'MEDIUM',
    statement:
      'A binary tree is given in level-order array form: the value at position `i` has its left child at position `2i+1` and right child at position `2i+2`. A value of `-1` marks a missing node; any entry whose parent is missing is also considered missing (even if its value is not -1). Position 0 (the root) is always present.\n\nFor every level that contains at least one node, print the sum of the node values on that level.\n\n**Input**: line 1 = `n` (length of the array); line 2 = `n` space-separated integers (`-1` = missing).\n**Output**: one line — the per-level sums from the root level downward, space-separated.',
    constraints: '1 <= n <= 1000. Real node values are between 0 and 10^4; -1 marks a missing node. The root is never -1.',
    reference:
      "import sys\nd = sys.stdin.read().split()\nn = int(d[0]); a = list(map(int, d[1:1+n]))\nexists = [False] * n\nsums = []\nfor i in range(n):\n    if a[i] == -1:\n        continue\n    if i == 0 or exists[(i - 1) // 2]:\n        exists[i] = True\n        lvl = (i + 1).bit_length() - 1\n        while len(sums) <= lvl:\n            sums.append(0)\n        sums[lvl] += a[i]\nprint(' '.join(map(str, sums)))\n",
    cases: [
      { input: '7\n1 2 3 4 5 6 7', expectedOutput: '1 5 22', isSample: true },
      { input: '3\n5 -1 8', expectedOutput: '5 8', isSample: true },
      { input: '1\n10', expectedOutput: '10', isSample: false },
      { input: '7\n1 2 3 -1 -1 4 5', expectedOutput: '1 5 9', isSample: false },
      { input: '7\n1 -1 2 5 -1 -1 3', expectedOutput: '1 2 3', isSample: false },
      { input: '6\n2 7 -1 3 4 -1', expectedOutput: '2 7 7', isSample: false },
    ],
  },
  {
    topicSlug: 'trees',
    track: 'trees',
    level: 3,
    title: 'Max Path Down',
    slug: 'max-path-down',
    difficulty: 'MEDIUM',
    statement:
      'A binary tree is given in level-order array form: the value at position `i` has its left child at position `2i+1` and right child at position `2i+2`. A value of `-1` marks a missing node; any entry whose parent is missing is also missing. Position 0 (the root) is always present.\n\nA downward path starts at the root and ends at a leaf (a node with no children), moving parent-to-child. Print the maximum possible sum of node values along such a path.\n\n**Input**: line 1 = `n` (length of the array); line 2 = `n` space-separated integers (`-1` = missing).\n**Output**: a single integer — the maximum root-to-leaf path sum.',
    constraints: '1 <= n <= 1000. Real node values are between 0 and 10^4; -1 marks a missing node. The root is never -1.',
    reference:
      'import sys\nsys.setrecursionlimit(100000)\nd = sys.stdin.read().split()\nn = int(d[0]); a = list(map(int, d[1:1+n]))\nexists = [False] * n\nfor i in range(n):\n    if a[i] != -1 and (i == 0 or exists[(i - 1) // 2]):\n        exists[i] = True\ndef best(i):\n    kids = [c for c in (2 * i + 1, 2 * i + 2) if c < n and exists[c]]\n    if not kids:\n        return a[i]\n    return a[i] + max(best(c) for c in kids)\nprint(best(0))\n',
    cases: [
      { input: '7\n1 2 3 4 5 6 7', expectedOutput: '11', isSample: true },
      { input: '3\n10 4 -1', expectedOutput: '14', isSample: true },
      { input: '1\n5', expectedOutput: '5', isSample: false },
      { input: '7\n5 4 8 11 -1 13 4', expectedOutput: '26', isSample: false },
      { input: '6\n1 2 3 4 5 6', expectedOutput: '10', isSample: false },
      { input: '7\n3 9 20 -1 -1 15 7', expectedOutput: '38', isSample: false },
    ],
  },
  // ---------- graphs ----------
  {
    topicSlug: 'graphs',
    track: 'graphs',
    level: 2,
    title: 'Course Order Possible',
    slug: 'course-order-possible',
    difficulty: 'MEDIUM',
    statement:
      'There are `n` courses numbered `0` to `n-1` and `m` prerequisite rules. Each rule `a b` means: course `b` must be completed before course `a` can be taken. Decide whether it is possible to finish ALL courses in some order (i.e. the prerequisite graph has no cycle).\n\n**Input**: line 1 = `n m`; the next `m` lines each contain two integers `a b`.\n**Output**: "YES" if all courses can be completed, otherwise "NO".',
    constraints: '1 <= n <= 10^4, 0 <= m <= 10^5, 0 <= a, b < n, a != b. Rules are distinct.',
    reference:
      'import sys\nfrom collections import deque\nd = sys.stdin.read().split()\nidx = 0\nn = int(d[idx]); m = int(d[idx + 1]); idx += 2\nadj = [[] for _ in range(n)]\nindeg = [0] * n\nfor _ in range(m):\n    a = int(d[idx]); b = int(d[idx + 1]); idx += 2\n    adj[b].append(a)\n    indeg[a] += 1\nq = deque(i for i in range(n) if indeg[i] == 0)\ndone = 0\nwhile q:\n    u = q.popleft(); done += 1\n    for v in adj[u]:\n        indeg[v] -= 1\n        if indeg[v] == 0:\n            q.append(v)\nprint("YES" if done == n else "NO")\n',
    cases: [
      { input: '2 1\n1 0', expectedOutput: 'YES', isSample: true },
      { input: '2 2\n1 0\n0 1', expectedOutput: 'NO', isSample: true },
      { input: '4 3\n1 0\n2 1\n3 2', expectedOutput: 'YES', isSample: false },
      { input: '3 3\n0 1\n1 2\n2 0', expectedOutput: 'NO', isSample: false },
      { input: '5 4\n1 0\n2 0\n3 1\n3 2', expectedOutput: 'YES', isSample: false },
      { input: '1 0\n', expectedOutput: 'YES', isSample: false },
    ],
  },
  // ---------- dynamic-programming ----------
  {
    topicSlug: 'dynamic-programming',
    track: 'dynamic-programming',
    level: 2,
    title: 'Climb Ways',
    slug: 'climb-ways',
    difficulty: 'MEDIUM',
    statement:
      'You are climbing a staircase with `n` steps. From any position you may move up by exactly 1 step or exactly 2 steps. Count how many distinct sequences of moves reach the top, and print the count modulo 1000000007.\n\n**Input**: a single integer `n`.\n**Output**: the number of distinct ways, modulo 10^9 + 7.',
    constraints: '1 <= n <= 10^6.',
    reference:
      'import sys\nn = int(sys.stdin.read().split()[0])\nMOD = 10**9 + 7\na, b = 1, 1\nfor _ in range(n):\n    a, b = b, (a + b) % MOD\nprint(a)\n',
    cases: [
      { input: '3', expectedOutput: '3', isSample: true },
      { input: '5', expectedOutput: '8', isSample: true },
      { input: '1', expectedOutput: '1', isSample: false },
      { input: '2', expectedOutput: '2', isSample: false },
      { input: '10', expectedOutput: '89', isSample: false },
      { input: '45', expectedOutput: '836311896', isSample: false },
    ],
  },
  {
    topicSlug: 'dynamic-programming',
    track: 'dynamic-programming',
    level: 3,
    title: 'Coin Minimum',
    slug: 'coin-minimum',
    difficulty: 'MEDIUM',
    statement:
      'You have `n` coin denominations, each available in unlimited supply. Find the minimum number of coins whose values sum to exactly `amount`. If the amount cannot be formed, print -1.\n\n**Input**: line 1 = `n amount`; line 2 = `n` space-separated coin denominations.\n**Output**: the minimum number of coins, or -1 if impossible.',
    constraints: '1 <= n <= 12, 1 <= coin <= 10^4, 0 <= amount <= 10^4.',
    reference:
      "import sys\nd = sys.stdin.read().split()\nn = int(d[0]); amount = int(d[1])\ncoins = list(map(int, d[2:2+n]))\nINF = float('inf')\ndp = [0] + [INF] * amount\nfor x in range(1, amount + 1):\n    for c in coins:\n        if c <= x and dp[x - c] + 1 < dp[x]:\n            dp[x] = dp[x - c] + 1\nprint(dp[amount] if dp[amount] != INF else -1)\n",
    cases: [
      { input: '3 11\n1 2 5', expectedOutput: '3', isSample: true },
      { input: '1 3\n2', expectedOutput: '-1', isSample: true },
      { input: '1 0\n1', expectedOutput: '0', isSample: false },
      { input: '3 6\n1 3 4', expectedOutput: '2', isSample: false },
      { input: '4 27\n2 5 10 1', expectedOutput: '4', isSample: false },
      { input: '2 11\n5 7', expectedOutput: '-1', isSample: false },
      { input: '2 12\n3 7', expectedOutput: '4', isSample: false },
    ],
  },
  // ---------- binary-search ----------
  {
    topicSlug: 'binary-search',
    track: 'binary-search',
    level: 1,
    title: 'First True Index',
    slug: 'first-true-index',
    difficulty: 'EASY',
    statement:
      'You are given a sorted array containing only 0s and 1s: every 0 comes before every 1. Print the index (0-based) of the FIRST 1 in the array. If the array contains no 1 at all, print -1.\n\n**Input**: line 1 = `n`; line 2 = `n` space-separated values (each 0 or 1, all 0s before all 1s).\n**Output**: the 0-based index of the first 1, or -1.',
    constraints: '1 <= n <= 10^5.',
    reference:
      'import sys\nd = sys.stdin.read().split()\nn = int(d[0]); a = list(map(int, d[1:1+n]))\nlo, hi, ans = 0, n - 1, -1\nwhile lo <= hi:\n    mid = (lo + hi) // 2\n    if a[mid] == 1:\n        ans = mid; hi = mid - 1\n    else:\n        lo = mid + 1\nprint(ans)\n',
    cases: [
      { input: '5\n0 0 1 1 1', expectedOutput: '2', isSample: true },
      { input: '4\n0 0 0 0', expectedOutput: '-1', isSample: true },
      { input: '3\n1 1 1', expectedOutput: '0', isSample: false },
      { input: '1\n0', expectedOutput: '-1', isSample: false },
      { input: '1\n1', expectedOutput: '0', isSample: false },
      { input: '6\n0 0 0 0 0 1', expectedOutput: '5', isSample: false },
    ],
  },
  {
    topicSlug: 'binary-search',
    track: 'binary-search',
    level: 3,
    title: 'Peak Element Index',
    slug: 'peak-element-index',
    difficulty: 'MEDIUM',
    statement:
      'An array is bitonic: it strictly increases up to a single peak and then strictly decreases (either part may be empty, so a fully increasing or fully decreasing array is allowed). Print the index (0-based) of the peak — the unique maximum element. An O(log n) solution is expected.\n\n**Input**: line 1 = `n`; line 2 = `n` space-separated integers forming a bitonic sequence.\n**Output**: the 0-based index of the peak element.',
    constraints: '1 <= n <= 10^5, -10^9 <= a[i] <= 10^9. Adjacent elements are distinct; exactly one peak exists.',
    reference:
      'import sys\nd = sys.stdin.read().split()\nn = int(d[0]); a = list(map(int, d[1:1+n]))\nlo, hi = 0, n - 1\nwhile lo < hi:\n    mid = (lo + hi) // 2\n    if a[mid] < a[mid + 1]:\n        lo = mid + 1\n    else:\n        hi = mid\nprint(lo)\n',
    cases: [
      { input: '7\n1 3 5 7 6 4 2', expectedOutput: '3', isSample: true },
      { input: '4\n1 2 3 4', expectedOutput: '3', isSample: true },
      { input: '4\n9 7 5 1', expectedOutput: '0', isSample: false },
      { input: '1\n42', expectedOutput: '0', isSample: false },
      { input: '5\n2 4 6 5 3', expectedOutput: '2', isSample: false },
      { input: '6\n1 5 10 20 15 2', expectedOutput: '3', isSample: false },
    ],
  },
  // ---------- two-pointers ----------
  {
    topicSlug: 'two-pointers',
    track: 'two-pointers',
    level: 1,
    title: 'Sorted Pair Exists',
    slug: 'sorted-pair-exists',
    difficulty: 'EASY',
    statement:
      'Given an array sorted in non-decreasing order and a target value, decide whether two elements at DIFFERENT positions sum exactly to the target.\n\n**Input**: line 1 = `n target`; line 2 = `n` space-separated integers in non-decreasing order.\n**Output**: "YES" if such a pair exists, otherwise "NO".',
    constraints: '2 <= n <= 10^5, -10^9 <= a[i], target <= 10^9.',
    reference:
      'import sys\nd = sys.stdin.read().split()\nn = int(d[0]); t = int(d[1])\na = list(map(int, d[2:2+n]))\ni, j = 0, n - 1\nans = "NO"\nwhile i < j:\n    s = a[i] + a[j]\n    if s == t:\n        ans = "YES"; break\n    if s < t:\n        i += 1\n    else:\n        j -= 1\nprint(ans)\n',
    cases: [
      { input: '5 9\n1 2 4 5 7', expectedOutput: 'YES', isSample: true },
      { input: '4 10\n1 2 3 4', expectedOutput: 'NO', isSample: true },
      { input: '2 8\n3 5', expectedOutput: 'YES', isSample: false },
      { input: '2 7\n3 5', expectedOutput: 'NO', isSample: false },
      { input: '6 6\n-3 -1 0 2 5 9', expectedOutput: 'YES', isSample: false },
      { input: '5 1\n-2 0 1 3 6', expectedOutput: 'YES', isSample: false },
    ],
  },
  // ---------- sliding-window ----------
  {
    topicSlug: 'sliding-window',
    track: 'sliding-window',
    level: 2,
    title: 'Best K-Window Average',
    slug: 'best-k-window-average',
    difficulty: 'MEDIUM',
    statement:
      'Given an array of integers and a window size `k`, find the contiguous subarray of length exactly `k` with the maximum average. Print that average rounded to exactly 2 decimal places.\n\n**Input**: line 1 = `n k`; line 2 = `n` space-separated integers.\n**Output**: the maximum average formatted with 2 digits after the decimal point (e.g. `12.75`).',
    constraints: '1 <= k <= n <= 10^5, -10^4 <= a[i] <= 10^4.',
    reference:
      'import sys\nd = sys.stdin.read().split()\nn = int(d[0]); k = int(d[1])\na = list(map(int, d[2:2+n]))\ncur = sum(a[:k]); best = cur\nfor i in range(k, n):\n    cur += a[i] - a[i - k]\n    if cur > best:\n        best = cur\nprint(f"{best / k:.2f}")\n',
    cases: [
      { input: '6 4\n1 12 -5 -6 50 3', expectedOutput: '12.75', isSample: true },
      { input: '3 2\n4 2 6', expectedOutput: '4.00', isSample: true },
      { input: '1 1\n5', expectedOutput: '5.00', isSample: false },
      { input: '5 5\n1 2 3 4 5', expectedOutput: '3.00', isSample: false },
      { input: '4 2\n-1 -2 -3 -4', expectedOutput: '-1.50', isSample: false },
      { input: '5 3\n7 7 7 1 1', expectedOutput: '7.00', isSample: false },
    ],
  },
  // ---------- stacks-queues ----------
  {
    topicSlug: 'stacks-queues',
    track: 'stacks-queues',
    level: 2,
    title: 'Next Greater Element',
    slug: 'next-greater-element',
    difficulty: 'MEDIUM',
    statement:
      'For every element of the array, find the first element strictly greater than it that appears to its RIGHT. If no such element exists, use -1. Print the answers in the original order, space-separated on one line. An O(n) stack-based solution is expected.\n\n**Input**: line 1 = `n`; line 2 = `n` space-separated integers.\n**Output**: `n` space-separated integers — the next greater element for each position (-1 if none).',
    constraints: '1 <= n <= 10^5, -10^9 <= a[i] <= 10^9.',
    reference:
      "import sys\nd = sys.stdin.read().split()\nn = int(d[0]); a = list(map(int, d[1:1+n]))\nres = [-1] * n\nst = []\nfor i in range(n):\n    while st and a[st[-1]] < a[i]:\n        res[st.pop()] = a[i]\n    st.append(i)\nprint(' '.join(map(str, res)))\n",
    cases: [
      { input: '4\n4 5 2 25', expectedOutput: '5 25 25 -1', isSample: true },
      { input: '4\n13 7 6 12', expectedOutput: '-1 12 12 -1', isSample: true },
      { input: '1\n10', expectedOutput: '-1', isSample: false },
      { input: '5\n1 2 3 4 5', expectedOutput: '2 3 4 5 -1', isSample: false },
      { input: '5\n5 4 3 2 1', expectedOutput: '-1 -1 -1 -1 -1', isSample: false },
      { input: '6\n6 8 0 1 3 2', expectedOutput: '8 -1 1 3 -1 -1', isSample: false },
    ],
  },
  // ---------- strings ----------
  {
    topicSlug: 'strings',
    track: 'strings',
    level: 2,
    title: 'Longest Common Prefix',
    slug: 'longest-common-prefix',
    difficulty: 'MEDIUM',
    statement:
      'Given `n` lowercase words, find the longest string that is a prefix of every one of them. If the words share no common prefix, print -1.\n\n**Input**: line 1 = `n`; each of the next `n` lines contains one word.\n**Output**: the longest common prefix, or -1 if it is empty.',
    constraints: '1 <= n <= 200, 1 <= word length <= 200. Words contain only lowercase letters a-z.',
    reference:
      'import sys\nd = sys.stdin.read().split()\nn = int(d[0])\nwords = d[1:1+n]\np = words[0]\nfor w in words[1:]:\n    while p and not w.startswith(p):\n        p = p[:-1]\n    if not p:\n        break\nprint(p if p else -1)\n',
    cases: [
      { input: '3\nflower\nflow\nflight', expectedOutput: 'fl', isSample: true },
      { input: '3\ndog\nracecar\ncar', expectedOutput: '-1', isSample: true },
      { input: '1\nalone', expectedOutput: 'alone', isSample: false },
      { input: '2\ninterstellar\ninterstate', expectedOutput: 'interst', isSample: false },
      { input: '3\napple\napple\napple', expectedOutput: 'apple', isSample: false },
      { input: '2\nabc\nabd', expectedOutput: 'ab', isSample: false },
    ],
  },
  // ---------- heaps ----------
  {
    topicSlug: 'heaps',
    track: 'heaps',
    level: 3,
    title: 'Running Median',
    slug: 'running-median',
    difficulty: 'HARD',
    statement:
      'Integers arrive one at a time. After EACH arrival, print the median of all values seen so far, formatted with exactly 1 digit after the decimal point. When the count is even, the median is the average of the two middle values. A two-heap O(n log n) solution is expected.\n\n**Input**: line 1 = `n`; line 2 = `n` space-separated integers in arrival order.\n**Output**: `n` lines — the running median after each arrival, formatted like `4.0` or `7.5`.',
    constraints: '1 <= n <= 10^5, -10^6 <= a[i] <= 10^6.',
    reference:
      'import sys, heapq\nd = sys.stdin.read().split()\nn = int(d[0]); a = list(map(int, d[1:1+n]))\nlo, hi = [], []\nout = []\nfor x in a:\n    if not lo or x <= -lo[0]:\n        heapq.heappush(lo, -x)\n    else:\n        heapq.heappush(hi, x)\n    if len(lo) > len(hi) + 1:\n        heapq.heappush(hi, -heapq.heappop(lo))\n    elif len(hi) > len(lo):\n        heapq.heappush(lo, -heapq.heappop(hi))\n    if len(lo) == len(hi):\n        m = (-lo[0] + hi[0]) / 2\n    else:\n        m = float(-lo[0])\n    out.append(f"{m:.1f}")\nprint("\\n".join(out))\n',
    cases: [
      { input: '4\n5 15 1 3', expectedOutput: '5.0\n10.0\n5.0\n4.0', isSample: true },
      { input: '3\n2 4 6', expectedOutput: '2.0\n3.0\n4.0', isSample: true },
      { input: '1\n7', expectedOutput: '7.0', isSample: false },
      { input: '5\n1 2 3 4 5', expectedOutput: '1.0\n1.5\n2.0\n2.5\n3.0', isSample: false },
      { input: '4\n10 10 10 10', expectedOutput: '10.0\n10.0\n10.0\n10.0', isSample: false },
      { input: '6\n9 8 7 6 5 4', expectedOutput: '9.0\n8.5\n8.0\n7.5\n7.0\n6.5', isSample: false },
    ],
  },
];

function titleCase(slug: string): string {
  return slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function main() {
  // ===== JOB 1 — assign track + level to existing problems =====
  const assignSlugs = Object.keys(TRACK_ASSIGNMENTS);
  const existingProblems = await prisma.codingProblem.findMany({
    where: { slug: { in: assignSlugs } },
    select: { id: true, slug: true, topic: { select: { slug: true } } },
  });
  const foundSlugs = new Set(existingProblems.map((p) => p.slug));
  let assigned = 0;
  for (const p of existingProblems) {
    const a = TRACK_ASSIGNMENTS[p.slug];
    await prisma.codingProblem.update({
      where: { id: p.id },
      data: { track: a.track ?? p.topic.slug, level: a.level },
    });
    assigned++;
  }
  for (const slug of assignSlugs) {
    if (!foundSlugs.has(slug)) {
      console.warn(`  [warn] track assignment skipped — problem not found: ${slug}`);
    }
  }
  console.log(`Track assignment: ${assigned}/${assignSlugs.length} existing problems updated.`);

  // ===== JOB 2 — seed new track problems =====

  // ensure coding topics exist
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
      source: 'LearnHub track set',
      verified: false,
    };
    const caseCreate = p.cases.map((c) => ({
      input: c.input,
      expectedOutput: c.expectedOutput,
      isSample: c.isSample,
      weight: 1,
    }));

    const existing = await prisma.codingProblem.findUnique({ where: { slug: p.slug }, select: { id: true } });
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
    `Track problem bank: ${created} created, ${updated} updated, ${totalCases} test cases (verified=false).`
  );
  console.log('Next: docker compose up -d  (start Piston), then: npx ts-node scripts/verify-dsa.ts');
  await prisma.$disconnect();
}

if (require.main === module) {
  main().catch(async (e) => {
    console.error('seed-tracks failed:', e);
    await prisma.$disconnect();
    process.exit(1);
  });
}
