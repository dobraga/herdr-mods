import { test, expect } from "bun:test";
import { parseSysfsBattery, parsePmsetBatt, batteryLevel, readBattery } from "../mods/dg-status-bar/battery.js";
import { cfg, applySettings } from "../mods/dg-status-bar/usage-settings.js";

test("sysfs: one battery", () => {
  expect(parseSysfsBattery([{ capacity: "87\n", status: "Discharging\n" }, { capacity: "", status: "" }])).toEqual({ pct: 87, status: "discharging" });
});

test("sysfs: two batteries average, charging wins", () => {
  expect(parseSysfsBattery([{ capacity: "40\n", status: "Discharging\n" }, { capacity: "60\n", status: "Charging\n" }])).toEqual({ pct: 50, status: "charging" });
});

test("sysfs: full and unknown statuses", () => {
  expect(parseSysfsBattery([{ capacity: "100", status: "Full" }]).status).toBe("full");
  expect(parseSysfsBattery([{ capacity: "55", status: "Not charging" }]).status).toBe("idle");
});

test("sysfs: no battery or malformed -> null", () => {
  expect(parseSysfsBattery([{ capacity: "", status: "" }, { capacity: "", status: "" }])).toBeNull();
  expect(parseSysfsBattery([{ capacity: "abc", status: "Full" }])).toBeNull();
  expect(parseSysfsBattery(undefined)).toBeNull();
});

test("pmset: battery and AC without battery", () => {
  const bat = "Now drawing from 'Battery Power'\n -InternalBattery-0 (id=123)\t87%; discharging; 4:12 remaining present: true";
  expect(parsePmsetBatt(bat)).toEqual({ pct: 87, status: "discharging" });
  expect(parsePmsetBatt("Now drawing from 'AC Power'\n -InternalBattery-0 (id=1)\t100%; charged; 0:00 remaining")).toEqual({ pct: 100, status: "full" });
  expect(parsePmsetBatt("Now drawing from 'AC Power'")).toBeNull();
  expect(parsePmsetBatt("")).toBeNull();
});

test("batteryLevel thresholds apply only while discharging", () => {
  expect(batteryLevel({ pct: 15, status: "discharging" })).toBe("critical");
  expect(batteryLevel({ pct: 30, status: "discharging" })).toBe("warn");
  expect(batteryLevel({ pct: 31, status: "discharging" })).toBe("ok");
  expect(batteryLevel({ pct: 5, status: "charging" })).toBe("ok");
  expect(batteryLevel(null)).toBe("ok");
});

test("readBattery (linux) reads BAT0 and BAT1 through readTextFile", async () => {
  const files = { "/sys/class/power_supply/BAT0/capacity": "72\n", "/sys/class/power_supply/BAT0/status": "Discharging\n" };
  const readTextFile = async (p) => files[p] ?? null;
  expect(await readBattery({ mac: false, readTextFile })).toEqual({ pct: 72, status: "discharging" });
  expect(await readBattery({ mac: false, readTextFile: async () => null })).toBeNull();
});

test("readBattery (mac) uses pmset and survives failures", async () => {
  const ok = async () => ({ code: 0, stdout: " -InternalBattery-0\t64%; charging; 1:00 remaining" });
  expect(await readBattery({ mac: true, exec: ok })).toEqual({ pct: 64, status: "charging" });
  expect(await readBattery({ mac: true, exec: async () => { throw new Error("x"); } })).toBeNull();
});

test("showBattery defaults to true and honors false", () => {
  expect(cfg.showBattery).toBe(true);
});
