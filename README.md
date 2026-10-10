# claude-statusbar

A Claude Code mod that draws one status line on the hint row under the prompt: where you are, what the session has spent, how full the context is, and the 5-hour and weekly limits at its right.

```text
~/src/claude-mods/claude-statusbar  ⎇ main*  claude-opus-5-5  ▰▰▰▰▰▰▱▱▱▱ 68k  $0.25  ⚡5.0M ↑502k ↓600  TTL 02:14      5h 23%  wk 41%
```

It is a port of [pi-statusline](https://github.com/Soleone/pi-statusline) to Claude Code's mod API. The left side keeps its fields and order:

| Field | Meaning |
| --- | --- |
| `~/src/...` | Working directory, home written as `~`. |
| `⎇ main*` | Current branch. `*` means the working tree differs from HEAD, untracked files included. `no-git` outside a repository. |
| model | The main loop's model, as `$.session.model()` gives it. |
| `▰▰▱ 68k` | Context window fill, and the tokens the last response was answered over. `?` before the first response. |
| `$0.25` | Session cost, as the engine totals it. |
| `⚡5.0M ↑502k ↓600` | Cache-read, input and output tokens of the turns finished since the mod loaded. |
| `TTL 02:14` | Time since the last finished turn that read or wrote the prompt cache. Amber past five minutes. |

The right side shows the rate-limit windows the engine reports for a Claude subscription: `5h` for the five-hour window and `wk` for the seven-day one. Each turns amber at 70% and red at 90%. Off a subscription, or before the first reading, the right side is empty.

## Load it

The mods folder, `~/src/claude-mods`, is a marketplace: its `.claude-plugin/marketplace.json` lists each mod. Register it once, then install the mod from it:

```bash
claude plugin marketplace add ~/src/claude-mods
claude plugin install statusbar@soleone-mods
```

`claude plugin disable statusbar@soleone-mods` turns the mod off, and `enable` turns it back on. The mod is read from its folder in this repo, so edits take effect after `/reload-plugins`.

## Command

| Command | Effect |
| --- | --- |
| `/statusbar` or `/statusbar status` | Show whether the bar is on. |
| `/statusbar on` / `off` | Show or hide the bar. The choice is kept in the host's store across sessions. |

While the bar is on, it replaces the engine's hint line with the same text, so that line's pills are plain text, not live.

## Differences from pi-statusline

- **On the hint line, not the footer.** The bar shares the row under the prompt, with the engine's hint on the left and the bar right-aligned. A mod cannot replace Claude Code's footer, so the hint's pills become plain text.
- **Totals start when the mod loads.** Tokens are summed from each finished turn's usage, so a resumed session starts its ⚡ ↑ ↓ from zero, where pi-statusline counts the whole session branch.
- **Theme colors.** Colors are the theme's `success`, `warning`, `error`, `subtle` and `claude` rather than pi's truecolor gradient.
- **No hide list.** pi-statusline hides other extensions' footer statuses. Claude Code mods have no such footer, so there is nothing to hide.

## Development

The manifest names the plugin `statusbar`: the engine reserves names that begin with `claude-` for Anthropic's own plugins. The folder keeps the name `claude-statusbar`.

```bash
claude plugin validate ~/src/claude-mods/claude-statusbar
claude plugin test ~/src/claude-mods/claude-statusbar
```

Once the engine has loaded the mod from a folder it can write to, `.claude-plugin/types/` holds the API declarations and a `tsconfig.json`, so `tsc -p ~/src/claude-mods/claude-statusbar` type-checks it. That folder is generated and git-ignored.

## Structure

```text
.claude-plugin/plugin.json  manifest; names the state contract
hooks/hooks.json            names the hooks module
hooks/register.tsx          hooks: session, turns, tool calls, /statusbar, the band; the git read
hooks/format.ts             pure formatting and bar layout
hooks/git.ts                the git status command and its parser
types/index.d.ts            the $.state contract
test/                       claude plugin test: formats, git parsing, the band
```
