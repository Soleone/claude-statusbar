import type { Repo, Totals } from '../types';

/** How a segment is drawn: a theme color, dimmed, or in the plain text color. */
export type Tone = 'plain' | 'text' | 'dim' | 'muted' | 'success' | 'warning' | 'error';

export type Segment = { text: string; tone: Tone };

export type Bar = { left: Segment[]; right: Segment[] };

export type BarInput = {
  now: number;
  cwd: string;
  home: string | undefined;
  model: string | undefined;
  repo: Repo | null;
  context: { tokens?: number; percent?: number; window: number };
  cost: number | undefined;
  totals: Totals;
  lastCacheRefreshAt: number | null;
  limits: readonly { kind: string; percentUsed: number; resetsAt: string }[];
};

export type UsageCounts = {
  input_tokens: number;
  output_tokens: number;
  cache_read_input_tokens: number;
  cache_creation_input_tokens: number;
};

/** Past the prompt cache's five-minute TTL, the readout turns amber. */
const CACHE_TTL_WARNING_MS = 5 * 60_000;
/** The limits the bar shows, in the order it draws them. Only the 5h window names its time to reset. */
const LIMIT_WINDOWS = [
  { kind: 'five_hour', label: '5h', countdown: true },
  { kind: 'seven_day', label: 'wk', countdown: false },
] as const;

/**
 * The bar in pi-statusline's order. The left side is cut from its end when the
 * band is narrow, so the limits at the right are the last thing to go.
 */
export function buildBar(input: BarInput): Bar {
  const left: Segment[] = [{ text: shortenHome(input.cwd, input.home), tone: 'muted' }];
  if (input.repo !== null) left.push(gap(), branchSegment(input.repo));
  if (input.model) left.push(gap(), { text: input.model, tone: 'text' });

  const percent = contextPercent(input.context);
  const tokens = input.context.tokens === undefined ? '?' : compactTokens(input.context.tokens);
  left.push(gap(), { text: contextBar(percent), tone: contextTone(percent) }, { text: ` ${tokens}`, tone: 'dim' });

  if (input.cost !== undefined) left.push(gap(), { text: `$${input.cost.toFixed(2)}`, tone: 'dim' });
  const { input: uncached, output, cacheRead } = input.totals;
  const counts = `⚡${compactTokens(cacheRead)} ↑${compactTokens(uncached)} ↓${compactTokens(output)}`;
  left.push(gap(), { text: counts, tone: 'dim' });

  if (input.lastCacheRefreshAt !== null) {
    const age = input.now - input.lastCacheRefreshAt;
    left.push(gap(), { text: `TTL ${formatTtl(age)}`, tone: age >= CACHE_TTL_WARNING_MS ? 'warning' : 'dim' });
  }
  const right: Segment[] = [];
  for (const window of LIMIT_WINDOWS) {
    const limit = input.limits.find(one => one.kind === window.kind);
    if (limit === undefined) continue;
    if (right.length > 0) right.push(gap());
    const until = window.countdown ? ` ${formatUntil(limit.resetsAt, input.now)}` : '';
    right.push({ text: `${window.label}${until} ${Math.round(limit.percentUsed)}%`, tone: limitTone(limit.percentUsed) });
  }
  return { left, right };
}

export function addUsage(totals: Totals, usage: UsageCounts): Totals {
  return {
    input: totals.input + usage.input_tokens,
    output: totals.output + usage.output_tokens,
    cacheRead: totals.cacheRead + usage.cache_read_input_tokens,
  };
}

/** A response that read or wrote the prompt cache is one that refreshes its TTL. */
export function usesCache(usage: UsageCounts): boolean {
  return usage.cache_read_input_tokens > 0 || usage.cache_creation_input_tokens > 0;
}

export function contextPercent(context: BarInput['context']): number {
  const ratio = context.tokens === undefined || context.window <= 0 ? 0 : (context.tokens / context.window) * 100;
  return clampPercent(context.percent ?? ratio);
}

/** Ten cells; the bar carries the fraction, the number beside it the absolute size. */
export function contextBar(percent: number): string {
  const filled = Math.min(10, Math.floor(clampPercent(percent) / 10));
  return '▰'.repeat(filled) + '▱'.repeat(10 - filled);
}

export function contextTone(percent: number): Tone {
  if (percent >= 85) return 'error';
  if (percent >= 60) return 'warning';
  return 'success';
}

export function limitTone(percent: number): Tone {
  if (percent >= 90) return 'error';
  if (percent >= 70) return 'warning';
  return 'plain';
}

/** Token counts: `600`, `1.5k`, `12k`, `502k`, `5.0M`. */
export function compactTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  // One decimal below 10k, where whole thousands would hide a third of a small count.
  if (value >= 10_000) return `${Math.round(value / 1_000)}k`;
  if (value >= 1_000) return `${Math.round(value / 100) / 10}k`;
  return String(value);
}

/** `mm:ss` since the last cache refresh. */
export function formatTtl(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1_000));
  return `${pad2(Math.floor(seconds / 60))}:${pad2(seconds % 60)}`;
}

/** Time left until a reset, as `4h23m`, or `45m` inside the hour. A reset that has passed reads `0m`. */
export function formatUntil(resetsAt: string, now: number): string {
  const minutes = Math.max(0, Math.floor((Date.parse(resetsAt) - now) / 60_000));
  const hours = Math.floor(minutes / 60);
  return hours > 0 ? `${hours}h${pad2(minutes % 60)}m` : `${minutes}m`;
}

/** The directory with the home folder written as `~`. */
export function shortenHome(cwd: string, home: string | undefined): string {
  if (home === undefined || home === '') return cwd;
  if (cwd === home) return '~';
  return cwd.startsWith(`${home}/`) ? `~${cwd.slice(home.length)}` : cwd;
}

function branchSegment(repo: Repo): Segment {
  if (repo.branch === null) return { text: 'no-git', tone: 'muted' };
  return { text: `⎇ ${repo.branch}${repo.isDirty ? '*' : ''}`, tone: repo.isDirty ? 'error' : 'success' };
}

function gap(): Segment {
  return { text: '  ', tone: 'plain' };
}

function clampPercent(percent: number): number {
  return Math.min(100, Math.max(0, Math.round(percent)));
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
