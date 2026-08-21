import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import crypto from 'crypto';

// Runs pipeline-internal Python (reference solutions, case generators) in a
// local subprocess. This is trusted-ish code we generated ourselves for the
// build pipeline — student submissions still go through the Piston sandbox.

export interface LocalRunResult {
  ok: boolean;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

const PYTHON = process.env.PIPELINE_PYTHON || 'python';

export function runPython(code: string, stdin: string, timeoutMs = 10_000): LocalRunResult {
  const dir = path.join(os.tmpdir(), 'capstone-pipeline');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `run-${crypto.randomBytes(6).toString('hex')}.py`);
  fs.writeFileSync(file, code);
  try {
    const res = spawnSync(PYTHON, [file], {
      input: stdin,
      encoding: 'utf8',
      timeout: timeoutMs,
      maxBuffer: 16 * 1024 * 1024,
      windowsHide: true,
    });
    const timedOut = res.error != null && (res.error as any).code === 'ETIMEDOUT';
    return {
      ok: !timedOut && res.status === 0,
      stdout: res.stdout || '',
      stderr: timedOut ? 'TIMEOUT' : res.stderr || (res.error ? String(res.error) : ''),
      timedOut,
    };
  } finally {
    fs.rmSync(file, { force: true });
  }
}

// async variant — used with mapPool to run many test cases across CPU cores
// while the (GPU-bound) LLM lane keeps working
export function runPythonAsync(
  code: string,
  stdin: string,
  timeoutMs = 10_000
): Promise<LocalRunResult> {
  const dir = path.join(os.tmpdir(), 'capstone-pipeline');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `run-${crypto.randomBytes(6).toString('hex')}.py`);
  fs.writeFileSync(file, code);
  return new Promise((resolve) => {
    const child = spawn(PYTHON, [file], { windowsHide: true });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);
    child.stdout.on('data', (d) => (stdout += d));
    child.stderr.on('data', (d) => (stderr += d));
    child.on('error', (e) => {
      clearTimeout(timer);
      fs.rmSync(file, { force: true });
      resolve({ ok: false, stdout, stderr: String(e), timedOut: false });
    });
    child.on('close', (codeNum) => {
      clearTimeout(timer);
      fs.rmSync(file, { force: true });
      resolve({
        ok: !timedOut && codeNum === 0,
        stdout,
        stderr: timedOut ? 'TIMEOUT' : stderr,
        timedOut,
      });
    });
    child.stdin.write(stdin);
    child.stdin.end();
  });
}

// bounded-concurrency map preserving input order
export async function mapPool<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(concurrency, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      results[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return results;
}

export const CASE_CONCURRENCY = Math.max(2, Math.min(4, os.cpus().length - 2));

// same normalization the grader uses: cosmetic whitespace never fails a case
export function normalizeOutput(s: string): string {
  return s
    .split('\n')
    .map((line) => line.replace(/\s+$/, ''))
    .join('\n')
    .replace(/\n+$/, '')
    .trim();
}

// extracts a python code block from an LLM reply (fenced, or bare code)
export function extractPython(text: string): string | null {
  const cleaned = text.replace(/<think>[\s\S]*?<\/think>/g, '');
  const fence = cleaned.match(/```(?:python|py)?\s*\n([\s\S]*?)```/);
  if (fence) return fence[1].trim();
  // bare code heuristic: starts with a typical python opener
  const trimmed = cleaned.trim();
  if (/^(import |from |def |#|sys\.)/m.test(trimmed) && !/^[A-Z][a-z]+ /.test(trimmed)) {
    return trimmed;
  }
  return null;
}
