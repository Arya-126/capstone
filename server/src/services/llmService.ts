import Anthropic from '@anthropic-ai/sdk';
import Groq from 'groq-sdk';

// Provider-abstracted chat completion. Anthropic (claude-opus-4-8) when
// ANTHROPIC_API_KEY is set; otherwise Groq (llama-3.3-70b).

const ANTHROPIC_MODEL = 'claude-opus-4-8';
const GROQ_MODEL = process.env.GROQ_MODEL || 'groq/compound';
const GROQ_FALLBACK_MODEL = process.env.GROQ_FALLBACK_MODEL || 'groq/compound-mini';

const useAnthropic = !!process.env.ANTHROPIC_API_KEY;
const anthropic = useAnthropic ? new Anthropic() : null;
const groq = process.env.GROQ_API_KEY
  ? new Groq({ apiKey: process.env.GROQ_API_KEY, timeout: 60_000, maxRetries: 2 })
  : null;

export const llmProvider = useAnthropic ? `anthropic:${ANTHROPIC_MODEL}` : `groq:${GROQ_MODEL}`;

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function chat(
  messages: ChatMessage[],
  opts: { json?: boolean; maxTokens?: number } = {}
): Promise<string> {
  const maxTokens = opts.maxTokens ?? 1024;

  if (anthropic) {
    try {
      const system = messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
      const turns = messages
        .filter((m) => m.role !== 'system')
        .map((m) => ({ role: m.role as 'user' | 'assistant', content: m.content }));
      const response = await anthropic.messages.create({
        model: ANTHROPIC_MODEL,
        max_tokens: maxTokens,
        thinking: { type: 'adaptive' },
        ...(system ? { system } : {}),
        messages: turns.length > 0 ? turns : [{ role: 'user', content: 'Begin.' }],
      } as any);
      return (response as any).content
        .filter((b: any) => b.type === 'text')
        .map((b: any) => b.text)
        .join('');
    } catch (anthropicErr: any) {
      console.warn(`llmService: Anthropic API error (${anthropicErr?.message || anthropicErr}), falling back to Groq`);
      if (!groq) {
        throw anthropicErr;
      }
    }
  }

  const groqCall = async (model: string) => {
    if (!groq) throw new Error('No valid LLM provider configured (Anthropic failed and GROQ_API_KEY is missing)');
    const response = await groq.chat.completions.create({
      model,
      temperature: 0.4,
      max_tokens: maxTokens,
      ...(opts.json ? { response_format: { type: 'json_object' as const } } : {}),
      messages,
    });
    return response.choices[0]?.message?.content || '';
  };

  const candidates = [GROQ_MODEL, GROQ_FALLBACK_MODEL, 'openai/gpt-oss-20b', 'llama-3.1-8b-instant'];
  const tried = new Set<string>();

  for (const model of candidates) {
    if (tried.has(model)) continue;
    tried.add(model);
    try {
      return await groqCall(model);
    } catch (e: any) {
      const msg = String(e?.message || '');
      console.warn(`llmService: Groq model ${model} failed (${msg}), trying next candidate...`);
    }
  }
  throw new Error('All configured Groq models failed. Please verify your GROQ_API_KEY.');
}

// Defensive JSON extraction — tolerates code fences and surrounding prose.
export function extractJson<T = any>(text: string): T | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null;
    return JSON.parse(match[0]) as T;
  } catch {
    return null;
  }
}
