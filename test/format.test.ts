import { describe, expect, test } from 'claude-code/testing';

import {
  addUsage,
  buildBar,
  compactTokens,
  contextBar,
  contextPercent,
  formatElapsed,
  formatStarted,
  formatTtl,
  limitTone,
  shortenHome,
  usesCache,
} from '../hooks/format';
import type { BarInput, Segment } from '../hooks/format';

const NOW = new Date(2026, 9, 8, 14, 0).getTime();

const BAR: BarInput = {
  now: NOW,
  cwd: '/home/soleone/src/claude-mods/claude-statusbar',
  home: '/home/soleone',
  model: 'claude-opus-5-5',
  repo: { branch: 'main', isDirty: true },
  context: { tokens: 68_000, percent: 68, window: 100_000 },
  cost: 0.25,
  totals: { input: 502_000, output: 600, cacheRead: 5_000_000 },
  lastCacheRefreshAt: NOW - 134_000,
  startedAt: NOW - 72 * 60_000,
  limits: [
    { kind: 'seven_day', percentUsed: 41 },
    { kind: 'five_hour', percentUsed: 23.4 },
  ],
};

const text = (segments: Segment[]): string => segments.map(one => one.text).join('');

describe('the readout formats', () => {
  test('token counts keep a decimal where whole numbers would hide spend', () => {
    expect(compactTokens(600)).toBe('600');
    expect(compactTokens(1_500)).toBe('1.5k');
    expect(compactTokens(12_345)).toBe('12k');
    expect(compactTokens(502_000)).toBe('502k');
    expect(compactTokens(5_000_000)).toBe('5.0M');
  });

  test('the TTL counts minutes and seconds since the last refresh', () => {
    expect(formatTtl(134_000)).toBe('02:14');
    expect(formatTtl(0)).toBe('00:00');
    expect(formatTtl(-5_000)).toBe('00:00');
  });

  test('elapsed time shows minutes, then hours and minutes', () => {
    expect(formatElapsed(0)).toBe('0m');
    expect(formatElapsed(5 * 60_000)).toBe('5m');
    expect(formatElapsed(72 * 60_000)).toBe('1h 12m');
  });

  test('the start time says yesterday, then gives a date once it is older', () => {
    const at = (day: number, hour: number, minute: number) => new Date(2026, 9, day, hour, minute).getTime();
    expect(formatStarted(at(8, 9, 30), NOW)).toBe('09:30');
    expect(formatStarted(at(7, 9, 30), NOW)).toBe('09:30 yesterday');
    expect(formatStarted(new Date(2026, 8, 2, 9, 30).getTime(), NOW)).toBe('Sep 2');
  });

  test('the home folder is written as ~ only on a path boundary', () => {
    expect(shortenHome('/home/soleone/src', '/home/soleone')).toBe('~/src');
    expect(shortenHome('/home/soleone', '/home/soleone')).toBe('~');
    expect(shortenHome('/home/soleonex/src', '/home/soleone')).toBe('/home/soleonex/src');
    expect(shortenHome('/srv/app', undefined)).toBe('/srv/app');
  });

  test('the context bar has ten cells and fills by tenths', () => {
    expect(contextBar(68)).toBe('▰▰▰▰▰▰▱▱▱▱');
    expect(contextBar(0)).toBe('▱▱▱▱▱▱▱▱▱▱');
    expect(contextBar(100)).toBe('▰▰▰▰▰▰▰▰▰▰');
  });

  test('the context percentage is worked out from tokens when the engine leaves it out', () => {
    expect(contextPercent({ tokens: 50_000, window: 100_000 })).toBe(50);
    expect(contextPercent({ percent: 42.4, window: 1 })).toBe(42);
    expect(contextPercent({ window: 200_000 })).toBe(0);
  });

  test('a limit turns amber at 70 percent and red at 90', () => {
    expect(limitTone(23)).toBe('plain');
    expect(limitTone(70)).toBe('warning');
    expect(limitTone(95)).toBe('error');
  });
});

describe('the token totals', () => {
  test('a turn adds its uncached input, output and cache reads', () => {
    const turn = { input_tokens: 2_000, output_tokens: 300, cache_read_input_tokens: 40_000, cache_creation_input_tokens: 0 };
    expect(addUsage({ input: 1_000, output: 100, cacheRead: 0 }, turn)).toEqual({
      input: 3_000,
      output: 400,
      cacheRead: 40_000,
    });
  });

  test('only a turn that read or wrote the cache refreshes its TTL', () => {
    const base = { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
    expect(usesCache(base)).toBe(false);
    expect(usesCache({ ...base, cache_read_input_tokens: 1 })).toBe(true);
    expect(usesCache({ ...base, cache_creation_input_tokens: 1 })).toBe(true);
  });
});

describe('the bar', () => {
  test('the left side reads in pi-statusline order and the limits sit at the right', () => {
    const bar = buildBar(BAR);
    expect(text(bar.left)).toBe(
      '~/src/claude-mods/claude-statusbar  ⎇ main*  claude-opus-5-5  ▰▰▰▰▰▰▱▱▱▱ 68k  $0.25  ⚡5.0M ↑502k ↓600  TTL 02:14  ⏱ 1h 12m  Started 12:48',
    );
    expect(text(bar.right)).toBe('5h 23%  wk 41%');
  });

  test('the branch is left out until the checkout is read, and named no-git outside one', () => {
    expect(text(buildBar({ ...BAR, repo: null }).left)).not.toContain('⎇');
    expect(text(buildBar({ ...BAR, repo: { branch: null, isDirty: false } }).left)).toContain('no-git');
  });

  test('cost and TTL wait for the engine to report them', () => {
    const left = text(buildBar({ ...BAR, cost: undefined, lastCacheRefreshAt: null }).left);
    expect(left).not.toContain('$');
    expect(left).not.toContain('TTL');
  });

  test('the context reads ? before the first response', () => {
    expect(text(buildBar({ ...BAR, context: { window: 200_000 } }).left)).toContain('▱▱▱▱▱▱▱▱▱▱ ?');
  });

  test('the TTL turns amber once the cache is past its five minutes', () => {
    const ttl = buildBar({ ...BAR, lastCacheRefreshAt: NOW - 6 * 60_000 }).left.find(one => one.text.startsWith('TTL'));
    expect(ttl?.tone).toBe('warning');
  });

  test('the right side is empty without a rate-limit reading', () => {
    expect(buildBar({ ...BAR, limits: [] }).right).toEqual([]);
  });
});

test('the branch is green when clean and red when dirty', () => {
  const branchOf = (repo: BarInput['repo']) => buildBar({ ...BAR, repo }).left.find(one => one.text.startsWith('⎇'));
  expect(branchOf({ branch: 'main', isDirty: false })?.tone).toBe('success');
  expect(branchOf({ branch: 'main', isDirty: true })?.tone).toBe('error');
});
