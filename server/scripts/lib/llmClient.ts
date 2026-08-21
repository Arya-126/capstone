import fs from 'fs';
import path from 'path';

// Shared LLM client for the content pipeline (docs/content-pipeline-plan.md).
//
// Providers: ollama (local, unlimited), gemini + groq (free cloud tiers),
// anthropic (used automatically if ANTHROPIC_API_KEY appears in .env).
//
// Routing is LOCAL-FIRST: stages call chatJSON with a `route` describing the
// local model and its cloud fallback; the caller decides when to escalate
// (typically after 2 local failures) via `tier: 'cloud'`.
//
// Rate limits:
//  - per-minute 429s → sleep the server-suggested delay and retry in place
//  - daily-quota exhaustion → QuotaExhaustedError; the daemon parks the
//    provider in prisma/data/quota-state.json and moves on to work that
//    doesn't need it. Parked providers resume automatically after resumeAt.

export type Provider = 'ollama' | 'gemini' | 'groq' | 'anthropic';

export const OLLAMA_URL = process.env.OLLAMA_URL || 'http://localhost:11434';
// NOTE: this key's project has zero free-tier quota for gemini-2.0-flash
// (limit: 0) — 2.5-flash is the free-tier workhorse now
export const GEMINI_MODEL = process.env.PIPELINE_GEMINI_MODEL || 'gemini-2.5-flash';
export const GROQ_MODEL = process.env.PIPELINE_GROQ_MODEL || 'llama-3.3-70b-versatile';
export const ANTHROPIC_MODEL = process.env.PIPELINE_ANTHROPIC_MODEL || 'claude-haiku-4-5-20251001';

// Local models per role (pull with `ollama pull <model>`)
export const OLLAMA_CODER = process.env.OLLAMA_CODER_MODEL || 'qwen2.5-coder:7b';
export const OLLAMA_GENERAL = process.env.OLLAMA_GENERAL_MODEL || 'qwen3:8b';
export const OLLAMA_ALT = process.env.OLLAMA_ALT_MODEL || 'llama3.1:8b';

const QUOTA_STATE_PATH = path.join(__dirname, '..', '..', 'prisma', 'data', 'quota-state.json');

export class QuotaExhaustedError extends Error {
  provider: Provider;
  resumeAt: Date;
  constructor(provider: Provider, resumeAt: Date, detail: string) {
    super(`${provider} daily quota exhausted (resume ${resumeAt.toISOString()}): ${detail}`);
    this.provider = provider;
    this.resumeAt = resumeAt;
  }
}

// ---------- quota state (survives restarts; read by the daemon) ----------

type QuotaState = Record<string, { exhaustedAt: string; resumeAt: string }>;

function readQuotaState(): QuotaState {
  try {
    return JSON.parse(fs.readFileSync(QUOTA_STATE_PATH, 'utf8'));
  } catch {
    return {};
  }
}

export function parkProvider(provider: Provider, resumeAt: Date) {
  const state = readQuotaState();
  state[provider] = { exhaustedAt: new Date().toISOString(), resumeAt: resumeAt.toISOString() };
  fs.mkdirSync(path.dirname(QUOTA_STATE_PATH), { recursive: true });
  fs.writeFileSync(QUOTA_STATE_PATH, JSON.stringify(state, null, 2));
}

export function isParked(provider: Provider): boolean {
  const entry = readQuotaState()[provider];
  return !!entry && new Date(entry.resumeAt).getTime() > Date.now();
}

// Next local midnight-Pacific ≈ Gemini's daily reset; a safe default for
// providers that don't tell us when the day rolls over.
function nextDailyReset(): Date {
  const now = new Date();
  const reset = new Date(now);
  // midnight America/Los_Angeles expressed in UTC (07:00 or 08:00 UTC); use 08:30 as safe margin
  reset.setUTCHours(8, 30, 0, 0);
  if (reset <= now) reset.setUTCDate(reset.getUTCDate() + 1);
  return reset;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ---------- JSON extraction (tolerates fences / <think> blocks / prose) ----------

export function extractJSON(text: string): any | null {
  // strip qwen3-style thinking blocks before hunting for the object
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  const match = cleaned.match(/\{[\s\S]*\}/);
  if (!match) return null;
  try {
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// ---------- providers ----------

async function callOllama(model: string, system: string, user: string, opts: { json?: boolean; think?: boolean } = {}): Promise<string> {
  // model (re)loads under memory pressure drop connections — retry transient
  // network failures twice before giving up on the local tier
  let lastError: any;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await callOllamaOnce(model, system, user, opts);
    } catch (e: any) {
      lastError = e;
      const msg = String(e?.message || e?.cause?.message || '');
      const transient = /fetch failed|ECONNREFUSED|ECONNRESET|socket|UND_ERR/i.test(msg);
      if (!transient) throw e;
      await new Promise((r) => setTimeout(r, 15_000 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function callOllamaOnce(model: string, system: string, user: string, opts: { json?: boolean; think?: boolean } = {}): Promise<string> {
  // qwen3 hybrid thinking: append /no_think to disable for classification-style calls
  const suffix = model.startsWith('qwen3') && opts.think === false ? ' /no_think' : '';
  const res = await fetch(`${OLLAMA_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      // json format constrains decoding — skip it for thinking models (it would
      // suppress the reasoning tokens that make them worth using)
      ...(opts.json && opts.think === false ? { format: 'json' } : {}),
      options: { temperature: 0.2, num_ctx: 8192, num_predict: 4096 },
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user + suffix },
      ],
    }),
    signal: AbortSignal.timeout(600_000), // CPU-offloaded 8B models are slow — be generous
  });
  if (!res.ok) throw new Error(`Ollama ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  return data.message?.content || '';
}

async function callGemini(system: string, user: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`,
      {
        method: 'POST',
        headers: {
          'x-goog-api-key': process.env.GEMINI_API_KEY!,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: system }] },
          contents: [{ parts: [{ text: user }] }],
          generationConfig: { temperature: 0.2 },
        }),
        signal: AbortSignal.timeout(120_000),
      }
    );
    if (res.status === 429 || res.status === 503) {
      const body = await res.text();
      // daily-quota markers: PerDay quota id, or a retryDelay measured in hours
      const m = body.match(/"retryDelay":\s*"(\d+)s"/);
      const delaySec = m ? parseInt(m[1], 10) : 30;
      if (/PerDay|per day|RequestsPerDay/i.test(body) || delaySec > 600) {
        throw new QuotaExhaustedError('gemini', nextDailyReset(), body.slice(0, 150));
      }
      await sleep((delaySec + 2) * 1000);
      continue;
    }
    if (!res.ok) throw new Error(`Gemini ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data: any = await res.json();
    return data.candidates?.[0]?.content?.parts?.map((p: any) => p.text).join('') || '';
  }
  throw new Error('Gemini: retries exhausted on per-minute limits');
}

async function callGroq(system: string, user: string): Promise<string> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        temperature: 0.2,
        max_tokens: 4096,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: user },
        ],
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (res.status === 429) {
      const body = await res.text();
      // daily token/request budget exhausted → park until reset
      if (/per day|TPD|RPD|daily/i.test(body)) {
        const h = body.match(/try again in (\d+)h/);
        const resumeAt = h
          ? new Date(Date.now() + (parseInt(h[1], 10) + 1) * 3600_000)
          : nextDailyReset();
        throw new QuotaExhaustedError('groq', resumeAt, body.slice(0, 150));
      }
      const m = body.match(/try again in ([\d.]+)s/);
      await sleep(m ? Math.ceil(parseFloat(m[1]) * 1000) + 500 : 15_000);
      continue;
    }
    if (!res.ok) throw new Error(`Groq ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const data: any = await res.json();
    return data.choices?.[0]?.message?.content || '';
  }
  throw new Error('Groq: retries exhausted on per-minute limits');
}

async function callAnthropic(system: string, user: string): Promise<string> {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY!,
      'anthropic-version': '2023-06-01',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: ANTHROPIC_MODEL,
      max_tokens: 4096,
      system,
      messages: [{ role: 'user', content: user }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (res.status === 429) throw new QuotaExhaustedError('anthropic', new Date(Date.now() + 3600_000), 'rate limited');
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data: any = await res.json();
  return (data.content || [])
    .filter((b: any) => b.type === 'text')
    .map((b: any) => b.text)
    .join('');
}

// ---------- routed call ----------

export interface Route {
  localModel: string; // ollama model for tier 'local'
  cloud: 'gemini' | 'groq' | 'anthropic'; // fallback provider for tier 'cloud'
  think?: boolean; // ollama-only: enable qwen3 thinking (default true)
}

export interface ChatResult {
  text: string;
  provider: Provider;
  model: string;
}

export async function ollamaAvailable(): Promise<boolean> {
  try {
    const res = await fetch(`${OLLAMA_URL}/api/tags`, { signal: AbortSignal.timeout(3000) });
    return res.ok;
  } catch {
    return false;
  }
}

export function cloudAvailable(provider: 'gemini' | 'groq' | 'anthropic'): boolean {
  const key =
    provider === 'gemini'
      ? process.env.GEMINI_API_KEY
      : provider === 'groq'
        ? process.env.GROQ_API_KEY
        : process.env.ANTHROPIC_API_KEY;
  return !!key && !isParked(provider);
}

// One routed chat call. tier 'local' uses route.localModel via Ollama;
// tier 'cloud' uses route.cloud. QuotaExhaustedError propagates to the daemon,
// which parks the provider and reschedules the item.
export async function chat(
  tier: 'local' | 'cloud',
  route: Route,
  system: string,
  user: string,
  opts: { json?: boolean } = {}
): Promise<ChatResult> {
  if (tier === 'local') {
    const text = await callOllama(route.localModel, system, user, {
      json: opts.json,
      think: route.think,
    });
    return { text, provider: 'ollama', model: route.localModel };
  }
  try {
    if (route.cloud === 'gemini') return { text: await callGemini(system, user), provider: 'gemini', model: GEMINI_MODEL };
    if (route.cloud === 'anthropic') return { text: await callAnthropic(system, user), provider: 'anthropic', model: ANTHROPIC_MODEL };
    return { text: await callGroq(system, user), provider: 'groq', model: GROQ_MODEL };
  } catch (e) {
    if (e instanceof QuotaExhaustedError) parkProvider(e.provider, e.resumeAt);
    throw e;
  }
}

// chat + strict-JSON parse with one same-tier retry on unparseable output
export async function chatJSON(
  tier: 'local' | 'cloud',
  route: Route,
  system: string,
  user: string
): Promise<{ data: any; provider: Provider; model: string }> {
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await chat(tier, route, system, user, { json: true });
    const data = extractJSON(res.text);
    if (data) return { data, provider: res.provider, model: res.model };
  }
  throw new Error(`${tier}:${tier === 'local' ? route.localModel : route.cloud} returned unparseable JSON twice`);
}
