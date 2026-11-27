import { test, expect } from "bun:test";
import { SEGMENTS, REGISTRY, keys, defaults, describe } from "../mods/dg-status-bar/segments/index.js";
import usage, { pillItems } from "../mods/dg-status-bar/segments/usage.js";
import { cfg, applySettings } from "../mods/dg-status-bar/usage-settings.js";
import gpu from "../mods/dg-status-bar/segments/gpu.js";
import battery from "../mods/dg-status-bar/segments/battery.js";
import cpu from "../mods/dg-status-bar/segments/cpu.js";
import { readStats } from "../mods/dg-status-bar/sysstats.js";

test("registry: unique id and key, sorted by order, system order unchanged", () => {
  expect(new Set(REGISTRY.map((s) => s.id)).size).toBe(REGISTRY.length);
  expect(new Set(keys()).size).toBe(REGISTRY.length);
  expect(REGISTRY.map((s) => [s.id, s.order])).toEqual([["usage", 5], ["cpu", 10], ["mem", 20], ["gpu", 50], ["battery", 60]]);
  for (const s of REGISTRY) expect(["system", "item"]).toContain(s.group);
  // SEGMENTS (what the System monitor pill/card/sampler loop over) is the "system" group only.
  expect(SEGMENTS.map((s) => s.id)).toEqual(["cpu", "mem", "gpu", "battery"]);
  expect(usage.group).toBe("item");
});

test("registry: every key is in defaults()", () => {
  const d = defaults();
  for (const k of keys()) expect(d).toHaveProperty(k);
  expect(d).toEqual({ showUsage: true, showCpu: true, showMem: true, showGpu: true, showBattery: true });
});

test("describe() is serializable metadata only (survives a JSON round-trip)", () => {
  const d = describe();
  expect(JSON.parse(JSON.stringify(d))).toEqual(d);
  expect(d.map((s) => s.key)).toEqual(keys());
  const hasFn = (v) => typeof v === "function" || (v && typeof v === "object" && Object.values(v).some(hasFn));
  expect(hasFn(d)).toBe(false);
});

test("gpu sample: missing nvidia-smi sets the stop flag, then no more spawns", async () => {
  let calls = 0;
  const exec = async () => { calls += 1; throw new Error("ENOENT"); };
  const s1 = await gpu.sample({ mac: false, exec }, null);
  expect(s1).toEqual({ gpu: null, gpuMissing: true });
  const s2 = await gpu.sample({ mac: false, exec }, s1);
  expect(s2).toEqual({ gpu: null, gpuMissing: true });
  expect(calls).toBe(1);
});

test("gpu sample: parses the first GPU", async () => {
  const exec = async () => ({ code: 0, stdout: "42, 1024, 8192, 61\n" });
  const s = await gpu.sample({ mac: false, exec }, null);
  expect(s.gpuMissing).toBe(false);
  expect(s.gpu).toEqual({ util: 42, memUsed: 1024 * 2 ** 20, memTotal: 8192 * 2 ** 20, temp: 61 });
});

test("battery sample: no battery -> null", async () => {
  expect(await battery.sample({ mac: false, readTextFile: async () => null })).toEqual({ battery: null });
  expect(await battery.sample({ mac: true, exec: async () => ({ code: 0, stdout: "Now drawing from 'AC Power'" }) })).toEqual({ battery: null });
});

test("cpu sample: delta needs the previous cpuRaw", async () => {
  const stat = (idle, total) => async () => `cpu  ${total - idle} 0 0 ${idle} 0 0 0 0\n`;
  const a = await cpu.sample({ mac: false, readTextFile: stat(50, 100) }, null);
  expect(a.cpu).toBeNull();
  const b = await cpu.sample({ mac: false, readTextFile: stat(80, 200) }, a);
  expect(b.cpu).toBe(70);
});

test("readStats merges enabled segment slices and keeps the snapshot shape", async () => {
  const files = { "/proc/stat": "cpu  10 0 0 90 0 0 0 0\n", "/proc/meminfo": "MemTotal: 1000 kB\nMemAvailable: 250 kB\n" };
  const env = { mac: false, herdr: false, segments: SEGMENTS, exec: async () => { throw new Error("x"); }, readTextFile: async (p) => files[p] ?? null };
  const s = await readStats(env, null);
  for (const k of ["at", "net", "disk", "down", "up", "herdr", "cpu", "cpuRaw", "mem", "gpu", "gpuMissing", "battery"]) expect(s).toHaveProperty(k);
  expect(s.mem).toBe(75);
  expect(s.gpuMissing).toBe(true);
  expect(s.battery).toBeNull();
  const off = await readStats({ ...env, segments: SEGMENTS.filter((x) => x.id !== "battery") }, s);
  expect(off).not.toHaveProperty("battery");
});

test("usage settings: descriptor order and defaults equal the cfg defaults", () => {
  applySettings("{}");
  const d = usage.settings;
  expect(d.map((x) => x.key)).toEqual(["style", "showPercent", "showPace", "showReset", "colorMode", "warn", "critical", "ctxWarn", "ctxCritical"]);
  for (const x of d) expect(x.default).toEqual(cfg[x.key]);
});

test("usage settings: descriptor shape is valid", () => {
  const d = usage.settings;
  const keySet = new Set(d.map((x) => x.key));
  expect(keySet.size).toBe(d.length);
  const allowed = new Set(["key", "kind", "title", "about", "default", "options", "step", "min", "max", "unit", "after", "before"]);
  for (const x of d) {
    for (const k of Object.keys(x)) expect(allowed.has(k)).toBe(true);
    expect(["toggle", "choice", "stepper"]).toContain(x.kind);
    expect(typeof x.title).toBe("string");
    expect(typeof x.about).toBe("string");
    if (x.kind === "toggle") expect(typeof x.default).toBe("boolean");
    if (x.kind === "choice") {
      expect(x.options.length).toBeGreaterThan(1);
      for (const o of x.options) expect(Object.keys(o).sort()).toEqual(["label", "value"]);
      expect(x.options.map((o) => o.value)).toContain(x.default);
    } else expect(x).not.toHaveProperty("options");
    if (x.kind === "stepper") {
      expect(typeof x.default).toBe("number");
      for (const k of ["step", "min", "max"]) if (k in x) expect(typeof x[k]).toBe("number");
    }
    for (const rel of ["after", "before"]) if (rel in x) {
      expect(keySet.has(x[rel])).toBe(true);
      expect(d.find((y) => y.key === x[rel]).kind).toBe("stepper");
    }
  }
  const by = Object.fromEntries(d.map((x) => [x.key, x]));
  expect(by.style.options.map((o) => o.value)).toEqual(["ring", "bar", "text"]);
  expect(by.colorMode.options.map((o) => o.value)).toEqual(["threshold", "pace"]);
  expect(by.warn).toMatchObject({ step: 5, min: 0, max: 100, unit: "%", before: "critical" });
  expect(by.critical).toMatchObject({ after: "warn", max: 100 });
  expect(by.ctxWarn.before).toBe("ctxCritical");
  expect(by.ctxCritical.after).toBe("ctxWarn");
  // Defaults respect the 5-point gaps.
  expect(by.warn.default).toBeLessThanOrEqual(by.critical.default - 5);
  expect(by.ctxWarn.default).toBeLessThanOrEqual(by.ctxCritical.default - 5);
});

test("usage: describe() carries the descriptors through a JSON round-trip", () => {
  const u = describe().find((s) => s.id === "usage");
  expect(u).toMatchObject({ key: "showUsage", group: "item", order: 5, defaultOn: true });
  expect(JSON.parse(JSON.stringify(u.settings))).toEqual(usage.settings);
});

test("usage pillItems: focused Claude shows Ctx + 5h + 7d; no agent shows both brands' worst windows", () => {
  applySettings("{}");
  const t = { muted: "m", blocked: "b", ansi1: "r" };
  const usageColor = (pct, _pace, th, ok) => (pct >= cfg.critical ? th.ansi1 : pct >= cfg.warn ? th.blocked : ok);
  const data = {
    claude: { fiveHour: { utilization: 42.4, resets_at: null }, sevenDay: { utilization: 91, resets_at: null } },
    agy: { groups: [{ name: "Gemini Models", buckets: [{ window: "5h", remainingPct: 30 }, { window: "weekly", remainingPct: 90 }] }] },
  };
  const cl = pillItems({ data, agent: { kind: "claude", term: "t1" }, ctx: { agent: "claude", ctx_pct: 65 } }, t, { cfg, usageColor });
  expect(cl.icon).toBe("claude");
  expect(cl.items.map((i) => [i.label, i.color])).toEqual([["Ctx 65%", "b"], ["5h 42%", "m"], ["7d 91%", "r"]]);
  const all = pillItems({ data, agent: null }, t, { cfg, usageColor });
  expect(all.icon).toBeUndefined();
  expect(all.items.map((i) => [i.icon, i.label])).toEqual([["claude", "5h 42%"], [null, "7d 91%"], ["agy", "5h 70%"], [null, "W 10%"]]);
});
