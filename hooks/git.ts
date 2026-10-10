import type { Repo } from '../types';

/** The branch, and whether anything differs from HEAD, in one call from the session's directory. */
export const STATUS_COMMAND = ['git', '--no-optional-locks', 'status', '--porcelain=v2', '--branch'];
export const NO_GIT: Repo = { branch: null, isDirty: false };
const BRANCH_LINE = '# branch.head ';

/** The `# branch.head` line, then one line per changed or untracked path. */
export function parseGitStatus(stdout: string): Repo {
  let branch: string | null = null;
  let isDirty = false;
  for (const line of stdout.split('\n')) {
    if (line.startsWith(BRANCH_LINE)) branch = line.slice(BRANCH_LINE.length);
    else if (line !== '' && !line.startsWith('#')) isDirty = true;
  }
  return { branch, isDirty };
}
