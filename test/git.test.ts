import { describe, expect, test } from 'claude-code/testing';

import { parseGitStatus } from '../hooks/git';

const CLEAN = [
  '# branch.oid 9afb6ed0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6',
  '# branch.head main',
  '# branch.upstream origin/main',
  '# branch.ab +0 -0',
  '',
].join('\n');

describe('git status', () => {
  test('a clean checkout names its branch', () => {
    expect(parseGitStatus(CLEAN)).toEqual({ branch: 'main', isDirty: false });
  });

  test('a changed file marks the checkout dirty', () => {
    const changed = `${CLEAN}1 .M N... 100644 100644 100644 aaaa bbbb hooks/register.tsx\n`;
    expect(parseGitStatus(changed)).toEqual({ branch: 'main', isDirty: true });
  });

  test('an untracked file marks the checkout dirty', () => {
    expect(parseGitStatus(`${CLEAN}? notes.md\n`)).toEqual({ branch: 'main', isDirty: true });
  });

  test('a detached HEAD is named as git names it', () => {
    expect(parseGitStatus('# branch.head (detached)\n')).toEqual({ branch: '(detached)', isDirty: false });
  });

  test('no output means no checkout', () => {
    expect(parseGitStatus('')).toEqual({ branch: null, isDirty: false });
  });
});
