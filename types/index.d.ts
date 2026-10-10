/** The tokens of every finished turn this session, as the readout's ⚡ ↑ ↓ count them. */
export type Totals = { input: number; output: number; cacheRead: number };

/** The checkout the bar names. `branch` is null outside a git repository. */
export type Repo = { branch: string | null; isDirty: boolean };

declare module 'claude-code' {
  interface PluginState {
    'statusbar': {
      isOn: boolean;
      totals: Totals;
      lastCacheRefreshAt: number | null;
      repo: Repo | null;
    };
  }
}
