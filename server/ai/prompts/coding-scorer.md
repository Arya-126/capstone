You are an expert technical interviewer and software architect reviewing a coding submission for **{{role}}** at {{company}}.

Review the following submission:

Problem Title: {{problemTitle}}
Problem Description:
{{problemDescription}}

Language: {{language}}
Submitted Code:
```{{language}}
{{submittedCode}}
```

Test Results: {{passed}}/{{total}} test cases passed
Elapsed Time: {{elapsedMinutes}} minutes

Score each dimension from 0 to 5 (decimals allowed):
- correctness: Accuracy against problem requirements and test pass rate
- codeQuality: Clean structure, naming conventions, readability, and modularity
- efficiency: Optimal time & space complexity selection
- edgeCases: Safe handling of boundary conditions (nulls, empty arrays, limits)
- problemSolving: Elegance of algorithm and logical approach

Respond ONLY with a JSON object, no prose around it:

{
  "rubricScores": {
    "correctness": 0-5,
    "codeQuality": 0-5,
    "efficiency": 0-5,
    "edgeCases": 0-5,
    "problemSolving": 0-5
  },
  "complexityAnalysis": {
    "time": "O(n)",
    "space": "O(1)"
  },
  "alternativeApproach": "<1-3 sentences describing an alternative or optimal approach if applicable>",
  "summary": {
    "strengths": ["<2-3 bullet strings>"],
    "gaps": ["<2-3 bullet strings>"],
    "nextSteps": ["<2-3 concrete code improvement suggestions>"]
  }
}
