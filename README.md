# pi-statusline

A one-line session status bar for [pi](https://pi.dev), rendered in place of the built-in footer.

<img width="2758" height="180" alt="image" src="https://github.com/user-attachments/assets/bbb96d94-5998-49ff-b6e3-af984ba7116c" />

It shows where you are, what the session has spent, and how much context is left:

```text
~/src/pi/pi-statusline  ⎇ main*  Claude Sonnet 4.5 anthropic  ▰▰▰▱▱▱▱▱▱▱ 68k  $0.25 ⚡5.0M ↑502k ↓600 TTL 02:14  ⏱ 1h 12m  Started 09:30
```

| Field | Meaning |
| --- | --- |
| `~/src/...` | Working directory, `$HOME` collapsed to `~`. |
| `⎇ main*` | Current branch from pi's own git provider. The `*` means the working tree is dirty, refreshed every 5s and after each tool result. `no-git` outside a repository. |
| model / provider | Selected model display name and provider. |
| `▰▰▱ 68k` | Context window fill, green through amber to red, plus the tokens it holds. The count reads `?` before the first assistant response. |
| `$0.25` | Session cost. |
| `⚡5.0M` | Cache-read tokens; the largest share of spend on a long session, and invisible in pi's default footer. |
| `↑502k ↓600` | Input and output tokens across the current session branch. |
| `TTL 02:14` | Time since the last cache refresh. Turns amber past 5 minutes. |
| `⏱ 1h 12m` | Elapsed time in the session. |
| `Started 09:30` | Session start, or `yesterday` / `Sep 2` once it is older. |

Extension status lines (`ctx.ui.setStatus`) render below on their own lines, so replacing the footer does not hide other extensions' indicators.

## Install

```bash
ln -s "$SRC/pi/pi-statusline" "$PI/extensions/pi-statusline"
```

Or add it to `packages` in `~/.pi/agent/settings.json`:

```json
{ "packages": ["git:github.com/your-name/pi-statusline"] }
```

The status line is on as soon as it is installed. Reload pi to pick it up.

## Command

`/statusline` reports the current state. Changes are persisted and then trigger a reload, so they apply to the running session.

| Command | Effect |
| --- | --- |
| `/statusline` | Show whether the line is on and which statuses are hidden. |
| `/statusline on` \| `off` | Enable or disable the custom footer, restoring pi's built-in one. |
| `/statusline hide <key>` | Stop drawing that extension's status line. |
| `/statusline unhide <key>` | Draw it again. |
| `/statusline reset-hidden` | Restore the default hide list. |

Keys are the identifiers extensions pass to `ctx.ui.setStatus`, visible in the footer itself. By default `goosedump` and `venice` are hidden because their indicators restate what this line already shows; an explicitly empty `hiddenStatuses` draws everything.

## Settings

Stored atomically at `$PI_CODING_AGENT_DIR/pi-statusline.json`, falling back to `~/.pi/agent/pi-statusline.json`:

```json
{
  "version": 1,
  "enabled": true,
  "hiddenStatuses": ["goosedump", "venice"]
}
```

An unreadable or malformed file degrades to defaults with a notification rather than taking the footer down.

## Relationship to pi-git

This line came out of [pi-git](../pi-git), which rendered it behind a `customFooter` setting. It has no dependency on pi-git: the branch label uses pi's own git provider, the dirty flag is a plain `git status --porcelain`, and the token formatter is a local copy so a status line does not depend on a git workflow package.

pi-git's commit notices reuse the `$0.42 ⚡19.0M ↑264k ↓86k` shape on purpose. If you change it, change `src/token-format.ts` here and `src/usage-format.ts` there together.

`setFooter` replaces the built-in footer wholesale, and the last extension to claim it wins. Installing another footer extension alongside this one gives you whichever loads last.

## Development

```bash
pnpm install --ignore-scripts
pnpm typecheck
pnpm test
```

Tests cover config parsing and defaults, atomic writes with no leftover temp files, file modes, footer rendering including the context-bar colour ramp and TTL colouring, the hide list, and the periodic dirty-state render.

## Structure

```text
index.ts           registration, /statusline command
src/
  statusline.ts    footer factory, timers, session usage totals
  config.ts        load, parse, atomic write
  token-format.ts  compact token counts
test/
```
