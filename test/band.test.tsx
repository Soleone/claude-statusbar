import { expect, mock, test } from 'claude-code/testing';
import type { On, SessionUsage } from 'claude-code';

const NOW = new Date(2026, 9, 8, 14, 0).getTime();

/** The hint the engine sends when idle: its mode label is drawn beside it, not in it. */
const IDLE = { isDraft: false, isWorking: false, hint: '(shift+tab to cycle) · ← for agents' };

const USAGE: SessionUsage = {
  startedAt: NOW - 72 * 60_000,
  context: { tokens: 68_000, percent: 68, window: 100_000 },
  rateLimits: [
    { kind: 'five_hour', percentUsed: 23.4, resetsAt: new Date(NOW + 4 * 3_600_000 + 23 * 60_000).toISOString() },
    { kind: 'seven_day', percentUsed: 41, resetsAt: '2026-10-14T00:00:00Z' },
  ],
  cost: { usd: 0.25 },
};

/**
 * The engine's answers the bar reads, beneath the plugin: one fixed session.
 * Op answers come as `{ value }`. The hint line and the turn's end have no
 * default beneath a plugin in a test, so each gets one here: the hint line
 * draws the hint text it is handed, as the engine's own line would.
 */
function aSession(on: On, usage: SessionUsage = USAGE): void {
  mock.clock(on, { now: NOW });
  mock.env(on, { HOME: '/home/soleone' });
  mock.store(on);
  on('session.cwd', () => ({ value: '/home/soleone/src/claude-mods/claude-statusbar' }));
  on('session.model', () => ({ value: 'claude-opus-5-5' }));
  on('session.usage', () => ({ value: usage }));
  on('turn.complete', (_$, e) => ({ text: e.answer, usage: e.usage }));
  on('ui.render', { component: 'PromptHint' }, ($, e) => {
    const { Text } = $.ui.resolve(e);
    return <Text dimColor>{e.props.hint}</Text>;
  });
}

for (const surface of ['terminal', 'desktop'] as const) {
  test(`the idle hint is dropped and the bar follows on one line, limits at its end, on ${surface}`, async ($, on) => {
    aSession(on);

    const ui = await $.ui.mount({ plugin: 'statusbar', surface, component: 'PromptHint', props: IDLE });

    expect(await ui.find({ type: 'Text', text: /~\/src\/claude-mods\/claude-statusbar/ })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: /shift|agents/ })).toBeUndefined();
    expect(await ui.find({ type: 'Text', text: /5h 4h23m 23%  wk 41%$/ })).toBeDefined();
    expect(await ui.find({ type: 'Text', text: /⏱|Started/ })).toBeUndefined();
  });
}

test('a working hint drops its esc to interrupt cue, and the bar follows at the start', async ($, on) => {
  aSession(on);

  const ui = await $.ui.mount({
    plugin: 'statusbar',
    surface: 'terminal',
    component: 'PromptHint',
    props: { isDraft: false, isWorking: true, hint: '· esc to interrupt' },
  });

  expect(await ui.find({ type: 'Text', text: /^~\/src\/claude-mods\/claude-statusbar  / })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: /esc|interrupt/ })).toBeUndefined();
});

test('the task toggle is cut to its key, ctrl+t, beside the bar', async ($, on) => {
  aSession(on);

  const ui = await $.ui.mount({
    plugin: 'statusbar',
    surface: 'terminal',
    component: 'PromptHint',
    props: { isDraft: false, isWorking: false, hint: 'ctrl+t to hide tasks' },
  });

  expect(await ui.find({ type: 'Text', text: /ctrl\+t/ })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: /hide|tasks/ })).toBeUndefined();
});

test('the limits are left out without a rate-limit reading', async ($, on) => {
  aSession(on, { ...USAGE, rateLimits: [] });

  const ui = await $.ui.mount({ plugin: 'statusbar', surface: 'terminal', component: 'PromptHint', props: IDLE });

  expect(await ui.find({ type: 'Text', text: /5h|wk/ })).toBeUndefined();
});

test('a finished turn adds its tokens and restarts the cache TTL', async ($, on) => {
  aSession(on);

  await $.turn.complete({
    answer: 'done',
    durationMs: 1_200,
    isAborted: false,
    turnId: 'turn-1',
    reason: 'answer',
    usage: {
      input_tokens: 502_000,
      output_tokens: 600,
      cache_read_input_tokens: 5_000_000,
      cache_creation_input_tokens: 0,
      model: 'claude-opus-5-5',
    },
  });
  const ui = await $.ui.mount({ plugin: 'statusbar', surface: 'terminal', component: 'PromptHint', props: IDLE });

  expect(await ui.find({ type: 'Text', text: /⚡5\.0M ↑502k ↓600/ })).toBeDefined();
  expect(await ui.find({ type: 'Text', text: /TTL 00:00/ })).toBeDefined();
});

test('/statusbar off answers, and the hint goes back to the engine', async ($, on) => {
  aSession(on);

  const reply = await $.command.run({
    command: 'statusbar',
    args: 'off',
    origin: { kind: 'composer' },
    presentation: { isFullscreen: false, columns: 120 },
  });
  expect(reply.text).toBe('statusbar is off');

  const ui = await $.ui.mount({ plugin: 'statusbar', surface: 'terminal', component: 'PromptHint', props: IDLE });
  expect(await ui.find({ type: 'Text', text: /claude-statusbar/ })).toBeUndefined();
  expect(await ui.find({ type: 'Text', text: /shift\+tab to cycle/ })).toBeDefined();
});
