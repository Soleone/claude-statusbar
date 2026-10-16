import { atom, read, update } from 'claude-code';
import type { EngineInterface, Register, Timer } from 'claude-code';

import type { Repo, Totals } from '../types';
import { addUsage, buildBar, usesCache } from './format';
import type { BarInput, Segment, Tone } from './format';
import { NO_GIT, STATUS_COMMAND, parseGitStatus } from './git';

const EMPTY_TOTALS: Totals = { input: 0, output: 0, cacheRead: 0 };

const isOn = atom({ plugin: 'statusbar', key: 'isOn' } as const, true);
const totals = atom({ plugin: 'statusbar', key: 'totals' } as const, EMPTY_TOTALS);
const lastCacheRefreshAt = atom({ plugin: 'statusbar', key: 'lastCacheRefreshAt' } as const, null);
const repo = atom({ plugin: 'statusbar', key: 'repo' } as const, null);

let isRefreshing = false;

export const register: Register = on => {
  let timers: Timer[] = [];

  on('session.start', async ($, e, next) => {
    for (const timer of timers) timer.cancel();
    // The one-second tick redraws the TTL and the elapsed time; the five-second
    // poll keeps the branch and its dirty flag current, as pi-statusline does.
    timers = [
      $.clock.every(1_000, () => $.ui.invalidate('ui.render')),
      $.clock.every(5_000, () => void refreshRepo($)),
    ];

    const saved = await $.store.get('enabled');
    await update($, isOn, () => saved !== false);
    await $.command.register({
      name: 'statusbar',
      description: 'Show or hide the status bar on the hint line under the prompt',
      argumentHint: 'on|off|status',
    });
    await refreshRepo($);

    return next(e);
  });

  on('turn.complete', async ($, e, next) => {
    const usage = e.usage;
    if (usage !== undefined) {
      await update($, totals, sum => addUsage(sum, usage));
      // Only the main conversation's responses refresh the cache the TTL counts.
      if (e.agentId === undefined && usesCache(usage)) {
        const now = await $.clock.now();
        await update($, lastCacheRefreshAt, () => now);
      }
    }

    return next(e);
  });

  on('tool.call', async ($, e, next) => {
    const ran = await next(e);
    void refreshRepo($);

    return ran;
  });

  on('command.run', { command: 'statusbar' }, async ($, e) => {
    const word = e.args.trim().toLowerCase();
    if (word === 'on' || word === 'off') {
      const isEnabled = word === 'on';
      await $.store.set('enabled', isEnabled);
      await update($, isOn, () => isEnabled);
      void $.ui.invalidate('ui.render');
      return { text: `statusbar is ${word}` };
    }
    if (word === '' || word === 'status') {
      return { text: `statusbar is ${(await read($, isOn)) ? 'on' : 'off'}` };
    }

    return { text: 'usage: /statusbar [on|off|status]' };
  });

  // The hint line under the prompt: the engine's hint text, then the bar in colour
  // on the same line. The shift+tab cycle hint and "← for agents" are dropped.
  on('ui.render', { component: 'PromptHint' }, async ($, e, next) => {
    if (!(await read($, isOn))) return next(e);

    const { Text } = $.ui.resolve(e);
    const { left, right } = buildBar(await gather($));
    const draw = (segment: Segment) => <Text {...styleOf(segment.tone)}>{segment.text}</Text>;

    const hint = cleanHint(e.props.hint);

    return (
      <Text wrap="truncate-end">
        {hint !== '' && <Text dimColor>{` ${hint}  `}</Text>}
        {left.map(draw)}
        {right.length > 0 && '  '}
        {right.map(draw)}
      </Text>
    );
  });
};

async function refreshRepo($: EngineInterface): Promise<void> {
  if (isRefreshing) return;
  isRefreshing = true;
  try {
    const checkout = await readRepo($);
    await update($, repo, () => checkout);
  } finally {
    isRefreshing = false;
  }
}

async function readRepo($: EngineInterface): Promise<Repo> {
  try {
    const result = await $.process.run(STATUS_COMMAND, { timeoutMs: 5_000 });
    return result.exitCode === 0 ? parseGitStatus(result.stdout) : NO_GIT;
  } catch {
    return NO_GIT;
  }
}

async function gather($: EngineInterface): Promise<BarInput> {
  const usage = await $.session.usage();

  return {
    now: await $.clock.now(),
    cwd: await $.session.cwd(),
    home: await $.env.get('HOME'),
    model: await $.session.model(),
    repo: await read($, repo),
    context: usage.context,
    cost: usage.cost?.usd,
    totals: await read($, totals),
    lastCacheRefreshAt: await read($, lastCacheRefreshAt),
    limits: usage.rateLimits,
  };
}

/**
 * The hint text without the shift+tab cycle hint, "← for agents" or "esc to interrupt", with
 * "ctrl+t to hide tasks" cut to "ctrl+t", and without dividers at either end.
 */
function cleanHint(hint: string): string {
  return hint
    .replace(/\(?shift\W*tab\s+to\s+cycle\)?/i, '')
    .replace(/\s*[·•∙⋅]?\s*←\s*for\s+agents?/i, '')
    .replace(/\besc\s+to\s+interrupt\b/i, '')
    .replace(/\bctrl\+t\s+to\s+(hide|show)\s+tasks\b/i, 'ctrl+t')
    .replace(/^[\s​-‏⁠﻿·•∙⋅]+|[\s​-‏⁠﻿·•∙⋅]+$/g, '');
}

function styleOf(tone: Tone): { color?: string; dimColor?: boolean } {
  switch (tone) {
    case 'plain':
    case 'dim':
      return { dimColor: true };
    case 'muted':
      return { color: 'subtle' };
    case 'text':
      return {};
    case 'success':
      return { color: 'success' };
    case 'warning':
      return { color: 'warning' };
    case 'error':
      return { color: 'error' };
  }
}
