// pdf-parse v2 broke the v1 default-export API. v1 was `pdfParse(buffer) → {text}`;
// v2 is class-based: `new PDFParse({ data: buffer }).getText() → { text }`. Using
// the wrong API silently threw and the UI showed "Could not extract text from PDF".
import { PDFParse } from 'pdf-parse';
import { chat, extractJson } from './llmService';

export interface ParsedResume {
  name?: string;
  skills: string[];
  projects: { title: string; tech?: string[]; description?: string }[];
  internships: { company: string; role?: string; highlights?: string[] }[];
  education?: { degree?: string; branch?: string; college?: string };
  certifications?: string[];
  achievements?: string[];
}

export async function parseResumePdf(buffer: Buffer): Promise<ParsedResume> {
  let rawText = '';
  let parser: PDFParse | null = null;
  try {
    // Constructor auto-converts Node's Buffer → Uint8Array (see v2 JSDoc).
    parser = new PDFParse({ data: buffer });
    const parsed = await parser.getText();
    rawText = (parsed.text || '').trim();
  } catch (err: any) {
    console.warn('pdf-parse error:', err?.message || err);
  } finally {
    // Release the underlying pdfjs worker/document
    try { await parser?.destroy(); } catch { /* swallow */ }
  }

  if (!rawText || rawText.length < 30) {
    throw new Error('Could not extract readable text from the uploaded PDF resume.');
  }

  const prompt = `
Extract structured developer profile data from this resume text:

${rawText.slice(0, 8000)}

Respond ONLY with a JSON object:
{
  "name": "<Candidate Name or Unknown>",
  "skills": ["<Skill 1>", "<Skill 2>"],
  "projects": [
    { "title": "<Project Name>", "tech": ["<Tech used>"], "description": "<Brief summary>" }
  ],
  "internships": [
    { "company": "<Company Name>", "role": "<Role>", "highlights": ["<Achievement/Highlight>"] }
  ],
  "education": { "degree": "<Degree>", "branch": "<Branch/Major>", "college": "<College/University>" },
  "certifications": ["<Certification 1>"],
  "achievements": ["<Achievement 1>"]
}
`;

  try {
    const raw = await chat([{ role: 'user', content: prompt }], { json: true, maxTokens: 1500 });
    const parsedJson = extractJson<ParsedResume>(raw);
    if (parsedJson && Array.isArray(parsedJson.skills)) {
      return {
        name: parsedJson.name || 'Candidate',
        skills: Array.isArray(parsedJson.skills) ? parsedJson.skills.slice(0, 20) : [],
        projects: Array.isArray(parsedJson.projects) ? parsedJson.projects.slice(0, 5) : [],
        internships: Array.isArray(parsedJson.internships) ? parsedJson.internships.slice(0, 5) : [],
        education: parsedJson.education || {},
        certifications: Array.isArray(parsedJson.certifications) ? parsedJson.certifications.slice(0, 5) : [],
        achievements: Array.isArray(parsedJson.achievements) ? parsedJson.achievements.slice(0, 5) : [],
      };
    }
  } catch (e: any) {
    console.warn('Resume LLM extraction warning:', e?.message || e);
  }

  return {
    name: 'Candidate',
    skills: ['Software Engineering', 'Problem Solving'],
    projects: [],
    internships: [],
  };
}
