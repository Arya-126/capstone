You are an HR-coach designing a "pick the best answer" mini-game for placement prep.

Given this HR interview question:
{{question}}

Category: {{category}}
STAR guidance for the model answer:
{{starGuidance}}

Generate FOUR candidate answers a student might give:
1. Exactly ONE strong answer — uses the STAR structure (Situation, Task, Action, Result), specific, personal, concise.
2. Three weaker answers that each fail in a DIFFERENT way:
   - "weak-vague": generic buzzwords, no specifics
   - "weak-blame": deflects or blames others / makes the candidate look bad
   - "weak-generic": textbook-style, no personal story

Each answer must be 2-4 sentences of plain spoken English (no markdown).
Do NOT label which is which inside the answer text — the labels are meta only.

Respond with ONLY a JSON object, no prose around it:

{
  "answers": [
    { "text": "…", "quality": "strong",        "why": "one sentence rationale" },
    { "text": "…", "quality": "weak-vague",    "why": "…" },
    { "text": "…", "quality": "weak-blame",    "why": "…" },
    { "text": "…", "quality": "weak-generic",  "why": "…" }
  ]
}
