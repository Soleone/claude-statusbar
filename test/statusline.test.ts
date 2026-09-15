import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { describe, expect, it, vi } from "vitest";
import type { StatuslineConfig } from "../src/config.js";
import { registerStatusline } from "../src/statusline.js";

const enabled: StatuslineConfig = { version: 1, enabled: true, hiddenStatuses: [] };
const disabled: StatuslineConfig = { ...enabled, enabled: false };

function fakePi() {
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const pi = {
    on: (event: string, handler: (...args: unknown[]) => unknown) => {
      handlers.set(event, handler);
    },
    exec: async () => ({ stdout: "", stderr: "", code: 0 }),
  } as unknown as ExtensionAPI;
  return { pi, handlers };
}

describe("registerStatusline", () => {
  it("does not register footer handlers when disabled", () => {
    const { pi, handlers } = fakePi();
    registerStatusline(pi, disabled);
    expect([...handlers.keys()]).toEqual([]);
  });

  it("registers footer handlers when enabled", () => {
    const { pi, handlers } = fakePi();
    registerStatusline(pi, enabled);
    expect([...handlers.keys()]).toContain("session_start");
    expect([...handlers.keys()]).toContain("session_shutdown");
  });

  it("renders extension status messages on their own footer line", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    type FooterFactory = (
      tui: { requestRender: () => void },
      theme: { fg: (color: string, text: string) => string },
      footerData: {
        getGitBranch: () => string | null;
        getExtensionStatuses: () => ReadonlyMap<string, string>;
        onBranchChange: (handler: () => void) => () => void;
      },
    ) => { render: (width: number) => string[] };

    const { pi, handlers } = fakePi();
    const themed: Array<{ color: string; text: string }> = [];
    let footerFactory: FooterFactory | undefined;

    registerStatusline(pi, enabled);
    await handlers.get("session_start")!({}, {
      cwd: "/workspace/project",
      model: { id: "test-model", name: "Friendly model", provider: "test-provider" },
      sessionManager: {
        getBranch: () => [{
          type: "message",
          message: {
            role: "assistant",
            timestamp: 866_000,
            usage: { input: 501_900, cacheRead: 4_587_500, output: 600, cost: { total: 0.25 } },
          },
        }],
      },
      getContextUsage: () => ({ percent: 34, contextWindow: 200_000, tokens: 68_000 }),
      ui: {
        setFooter: (factory: unknown) => {
          footerFactory = factory as FooterFactory;
        },
      },
    });

    if (!footerFactory) throw new Error("custom footer was not registered");
    const footer = footerFactory(
      { requestRender: () => undefined },
      { fg: (color, text) => {
        themed.push({ color, text });
        return text;
      } },
      {
        getGitBranch: () => "main",
        getExtensionStatuses: () => new Map([["pi-git-quick-commit", "Quick commit: visible"]]),
        onBranchChange: () => () => undefined,
      },
    );
    const rendered = footer.render(200).join("\n");
    const plainRendered = rendered.replace(/\x1b\[[0-9;]*m/g, "");

    expect(plainRendered).toContain("⎇ main");
    expect(plainRendered).toContain("Friendly model");
    expect(plainRendered).toContain("test-provider");
    expect(themed).toContainEqual({ color: "accent", text: "  Friendly model" });
    expect(themed).toContainEqual({ color: "dim", text: " test-provider" });
    expect(themed).toContainEqual({ color: "muted", text: "$" });
    expect(themed).toContainEqual({ color: "muted", text: "↑" });
    expect(themed).toContainEqual({ color: "muted", text: "⚡" });
    expect(themed).toContainEqual({ color: "muted", text: "TTL" });
    expect(themed).toContainEqual({ color: "muted", text: "↓" });
    expect(themed).toContainEqual({ color: "muted", text: "⏱" });
    expect(themed).toContainEqual({ color: "muted", text: "Started" });
    expect(plainRendered).toContain("$0.25 ⚡4.6M ↑502k ↓600 TTL 02:14  ⏱ 0m  Started ");
    expect(plainRendered).toMatch(/Started \d{2}:\d{2}$/m);
    vi.setSystemTime(1_166_000);
    footer.render(200);
    expect(themed).toContainEqual({ color: "warning", text: "05:00" });
    expect(plainRendered).toContain("▰▰▰▱▱▱▱▱▱▱ 68k");
    expect(plainRendered).not.toContain("34%");
    expect(rendered).toContain("\x1b[38;2;0;255;0m▰");
    expect(rendered).toContain("\x1b[38;2;102;255;0m▰");
    expect(rendered).toContain("\x1b[38;2;100;100;100m▱");
    expect(rendered).not.toContain("\x1b[38;2;255;0;0m▰");
    const statusLines = plainRendered.split("\n");
    expect(statusLines.length).toBeGreaterThan(1);
    expect(statusLines[1]).toContain("Quick commit: visible");
    expect(themed).toContainEqual({ color: "text", text: "Quick commit: visible" });

    await handlers.get("session_shutdown")!({});
    vi.useRealTimers();
  });

  it("hides the status keys listed in config", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(1_000_000);
    try {
      type FooterFactory = (
        tui: { requestRender: () => void },
        theme: { fg: (color: string, text: string) => string },
        footerData: {
          getGitBranch: () => string | null;
          getExtensionStatuses: () => ReadonlyMap<string, string>;
          onBranchChange: (handler: () => void) => () => void;
        },
      ) => { render: (width: number) => string[] };

      const { pi, handlers } = fakePi();
      let footerFactory: FooterFactory | undefined;
      registerStatusline(pi, { ...enabled, hiddenStatuses: ["venice"] });
      await handlers.get("session_start")!({}, {
        cwd: "/workspace/project",
        model: { id: "test-model" },
        sessionManager: { getBranch: () => [] },
        getContextUsage: () => undefined,
        ui: { setFooter: (factory: unknown) => { footerFactory = factory as FooterFactory; } },
      });

      const footer = footerFactory!(
        { requestRender: () => undefined },
        { fg: (_color, text) => text },
        {
          getGitBranch: () => null,
          getExtensionStatuses: () => new Map([
            ["venice", "Venice: noisy"],
            ["pi-git-quick-commit", "Quick commit: staged 4 files"],
          ]),
          onBranchChange: () => () => undefined,
        },
      );
      const rendered = footer.render(200).join("\n");
      const plainRendered = rendered.replace(/\x1b\[[0-9;]*m/g, "");
      expect(rendered).not.toContain("Venice: noisy");
      expect(rendered).toContain("Quick commit: staged 4 files");
      // No context usage yet: the bar is empty and the count has nothing to show.
      expect(plainRendered).toContain("▱▱▱▱▱▱▱▱▱▱ ?");

      await handlers.get("session_shutdown")!({});
    } finally {
      vi.useRealTimers();
    }
  });

  it("requests a render when periodic git status changes", async () => {
    vi.useFakeTimers();
    try {
      type FooterFactory = (
        tui: { requestRender: () => void },
        theme: { fg: (color: string, text: string) => string },
        footerData: {
          getGitBranch: () => string | null;
          getExtensionStatuses: () => ReadonlyMap<string, string>;
          onBranchChange: (handler: () => void) => () => void;
        },
      ) => { render: (width: number) => string[] };

      const { pi, handlers } = fakePi();
      let footerFactory: FooterFactory | undefined;
      let stdout = "";
      let renders = 0;
      (pi as unknown as { exec: (c: string, a: string[], o: unknown) => Promise<{ stdout: string }> }).exec =
        async () => ({ stdout });

      registerStatusline(pi, enabled);
      await handlers.get("session_start")!({}, {
        cwd: "/workspace/project",
        model: { id: "test-model" },
        sessionManager: { getBranch: () => [] },
        getContextUsage: () => undefined,
        ui: { setFooter: (factory: unknown) => { footerFactory = factory as FooterFactory; } },
      });

      footerFactory!(
        { requestRender: () => { renders += 1; } },
        { fg: (_color, text) => text },
        { getGitBranch: () => "main", getExtensionStatuses: () => new Map(), onBranchChange: () => () => undefined },
      );

      stdout = " M changed\0";
      await vi.advanceTimersByTimeAsync(5_000);
      expect(renders).toBe(1);

      await handlers.get("session_shutdown")!({});
    } finally {
      vi.useRealTimers();
    }
  });
});
