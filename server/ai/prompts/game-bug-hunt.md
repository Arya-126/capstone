You are designing a "spot the bug" mini-game for placement prep.

Given this working reference solution for the problem "{{problemTitle}}":

Language: {{language}}
Statement: {{statement}}

```{{language}}
{{referenceCode}}
```

Create a BUGGY variant of this code by introducing exactly {{bugCount}} intentional bug(s)
that a beginner might realistically make (off-by-one, wrong comparison, wrong variable,
missing return, incorrect loop bound, etc.). Keep the overall structure and length
similar to the original — do NOT rewrite the algorithm.

Number every line of the buggy code (1-indexed) so bug locations can be referenced.

Respond with ONLY a JSON object, no prose around it:

{
  "buggyCode": "the full buggy code as a single string, preserving newlines",
  "bugLines": [n1, n2],          // 1-indexed line numbers containing bugs
  "bugDescriptions": [            // one entry per bug, same order as bugLines
    "One-sentence description of what's wrong on this line."
  ],
  "hint": "A single, spoiler-free hint the player can request (e.g. 'Check your loop bound')."
}
