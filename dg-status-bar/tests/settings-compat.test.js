import { test, expect } from "bun:test";
import { cfg, applySettings } from "../mods/dg-status-bar/usage-settings.js";

// Characterization tests pinning the CURRENT behavior of applySettings/cfg.
// applySettings parses raw with JSON.parse(raw || "{}") and keeps defaults on any parse error.

const DEFAULTS = {
  style: "ring",
  warn: 60,
  critical: 90,
  showReset: false,
  showPace: true,
  colorMode: "threshold",
  showPercent: true,
  ctxWarn: 60,
  ctxCritical: 90,
  showComputer: true,
  showBranch: true,
  showAgents: true,
  showPrs: true,
  showSystem: true,
  showCpu: true,
  showMem: true,
  showHerdr: true,
  showDisk: true,
  showGpu: true,
  showNet: true,
  showBattery: true,
  showUsage: true,
  showMedia: true,
  showProcs: true,
  showSpark: true,
  sysInterval: 3,
  diskInterval: 10,
  diskTop: 3,
};

const FULL_FILE = {
  style: "bar",
  warn: 70,
  critical: 95,
  showReset: true,
  showPace: false,
  colorMode: "pace",
  showPercent: false,
  ctxWarn: 50,
  ctxCritical: 80,
  showComputer: false,
  showBranch: false,
  showAgents: false,
  showPrs: false,
  showSystem: false,
  showCpu: false,
  showMem: false,
  showHerdr: false,
  showDisk: false,
  showGpu: false,
  showNet: false,
  showBattery: false,
  showUsage: false,
  showMedia: false,
  showProcs: false,
  showSpark: false,
  sysInterval: 5,
  diskInterval: 60,
  diskTop: 10,
};

const SHOW_KEYS = [
  "showReset", "showPace", "showPercent", "showComputer", "showBranch", "showAgents", "showPrs",
  "showSystem", "showCpu", "showMem", "showHerdr", "showDisk", "showGpu", "showNet", "showBattery",
  "showUsage", "showMedia", "showProcs", "showSpark",
];

const FULL_EXPECTED = {
  style: "bar",
  warn: 70,
  critical: 95,
  showReset: true,
  showPace: false,
  colorMode: "pace",
  showPercent: false,
  ctxWarn: 50,
  ctxCritical: 80,
  showComputer: false,
  showBranch: false,
  showAgents: false,
  showPrs: false,
  showSystem: false,
  showCpu: false,
  showMem: false,
  showHerdr: false,
  showDisk: false,
  showGpu: false,
  showNet: false,
  showBattery: false,
  showUsage: false,
  showMedia: false,
  showProcs: false,
  showSpark: false,
  sysInterval: 5,
  diskInterval: 60,
  diskTop: 10,
};

test("empty string and {} give all defaults", () => {
  applySettings("");
  expect(cfg).toEqual(DEFAULTS);
  applySettings("{}");
  expect(cfg).toEqual(DEFAULTS);
});

test("malformed JSON gives all defaults", () => {
  applySettings("{not json");
  expect(cfg).toEqual(DEFAULTS);
});

test("full valid file: every key applied", () => {
  applySettings(JSON.stringify(FULL_FILE));
  expect(cfg).toEqual(FULL_EXPECTED);
});

test("file missing showBattery: showBattery defaults to true, rest applied", () => {
  const { showBattery, ...rest } = FULL_FILE;
  applySettings(JSON.stringify(rest));
  expect(cfg).toEqual({ ...FULL_EXPECTED, showBattery: true });
});

test("file missing showUsage and showMedia: both default to true, rest applied", () => {
  const { showUsage, showMedia, ...rest } = FULL_FILE;
  applySettings(JSON.stringify(rest));
  expect(cfg).toEqual({ ...FULL_EXPECTED, showUsage: true, showMedia: true });
});

test("every show* key false: each becomes false, others default", () => {
  const allFalse = Object.fromEntries(SHOW_KEYS.map((k) => [k, false]));
  applySettings(JSON.stringify(allFalse));
  expect(cfg).toEqual({
    ...DEFAULTS,
    showReset: false,
    showPace: false,
    showPercent: false,
    showComputer: false,
    showBranch: false,
    showAgents: false,
    showPrs: false,
    showSystem: false,
    showCpu: false,
    showMem: false,
    showHerdr: false,
    showDisk: false,
    showGpu: false,
    showNet: false,
    showBattery: false,
    showUsage: false,
    showMedia: false,
    showProcs: false,
    showSpark: false,
  });
});

test("non-string raw input is not JSON-parseable: defaults", () => {
  applySettings({ showBattery: false, style: "text", warn: 10 });
  expect(cfg).toEqual(DEFAULTS);
});

test("junk values for show* keys stay true (only boolean false disables)", () => {
  for (const junk of ["false", 0, null]) {
    applySettings(JSON.stringify(Object.fromEntries(SHOW_KEYS.filter((k) => k !== "showReset" && k !== "showPace" && k !== "showPercent").map((k) => [k, junk]))));
    expect(cfg.showComputer).toBe(true);
    expect(cfg.showBattery).toBe(true);
    expect(cfg.showSpark).toBe(true);
  }
  applySettings(JSON.stringify({ showPace: "false", showPercent: 0 }));
  expect(cfg.showPace).toBe(true);
  expect(cfg.showPercent).toBe(true);
});

test("showReset is true only when the value is exactly true", () => {
  for (const junk of ["true", 1, "yes", {}]) {
    applySettings(JSON.stringify({ showReset: junk }));
    expect(cfg.showReset).toBe(false);
  }
  applySettings(JSON.stringify({ showReset: true }));
  expect(cfg.showReset).toBe(true);
});

test("invalid style/colorMode/sysInterval/diskInterval/diskTop fall back to defaults", () => {
  applySettings(JSON.stringify({ style: "pie", colorMode: "rainbow", sysInterval: 7, diskInterval: 15, diskTop: 4 }));
  expect(cfg).toEqual(DEFAULTS);
});

test("non-numeric warn/critical/ctxWarn/ctxCritical fall back to 60/90", () => {
  applySettings(JSON.stringify({ warn: "abc", critical: "xyz", ctxWarn: {}, ctxCritical: "nope" }));
  expect(cfg).toEqual(DEFAULTS);
});

test("set of show* keys in cfg is exactly the current list", () => {
  applySettings("{}");
  const showKeys = Object.keys(cfg).filter((k) => k.startsWith("show")).sort();
  expect(showKeys).toEqual([...SHOW_KEYS].sort());
  expect(showKeys.length).toBe(19);
});
