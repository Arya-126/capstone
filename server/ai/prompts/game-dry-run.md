You are designing a "predict the output" mini-game for placement prep.

Given this working reference solution for the problem "{{problemTitle}}":

Language: {{language}}
Statement: {{statement}}

```{{language}}
{{referenceCode}}
```

Create a SMALL, self-contained snippet (10-25 lines) that exercises the core idea
of the solution. It should:
- Read from stdin OR use a hardcoded small input (either is fine)
- Print exactly ONE line to stdout that a careful reader can predict by mental execution
- Avoid randomness, wall-clock time, or anything non-deterministic
- Prefer small inputs (arrays of 3-7 elements, integers < 100)

You must also DRY-RUN it yourself and report the exact stdout.

Respond with ONLY a JSON object, no prose around it:

{
  "snippet": "the full snippet as a single string, preserving newlines",
  "input": "the exact stdin the snippet consumes, or empty string if none",
  "expectedOutput": "the exact single-line stdout the snippet prints (no trailing newline)",
  "hint": "A single, spoiler-free hint the player can request (e.g. 'Trace the loop by hand')."
}
