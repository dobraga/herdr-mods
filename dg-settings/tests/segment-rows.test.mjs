import { test } from "node:test";
import assert from "node:assert/strict";
import { normalizeSegments, segmentDefaults, applySaved, stepValue, formatValue } from "../mods/dg-settings/segment-rows.js";

const USAGE = {
  id: "usage", key: "showUsage", group: "item", order: 5, title: "Usage gauges", about: "x", defaultOn: true,
  settings: [
    { key: "style", kind: "choice", title: "Gauge style", about: "", default: "ring", options: [{ value: "ring", label: "Ring" }, { value: "bar", label: "Bar" }] },
    { key: "showPace", kind: "toggle", title: "Pace", about: "", default: true },
    { key: "warn", kind: "stepper", title: "Warn", about: "", default: 60, step: 5, min: 0, max: 100, unit: "%", before: "critical" },
    { key: "critical", kind: "stepper", title: "Crit", about: "", default: 90, step: 5, min: 0, max: 100, unit: "%", after: "warn" },
  ],
};
const CPU = { id: "cpu", key: "showCpu", group: "system", order: 10, title: "CPU", about: "", defaultOn: true };
const GPU = { id: "gpu", key: "showGpu", group: "system", order: 50, title: "GPU", about: "", defaultOn: true };

test("normalize sorts by order and drops junk; absent gives null", () => {
  assert.deepEqual(normalizeSegments([GPU, CPU, null, { id: 1 }, USAGE]).map((s) => s.id), ["usage", "cpu", "gpu"]);
  assert.equal(normalizeSegments(undefined), null);
  assert.equal(normalizeSegments([]), null);
  assert.deepEqual(normalizeSegments([CPU])[0].settings, []);
});

test("defaults include segment keys and setting defaults", () => {
  assert.deepEqual(segmentDefaults(normalizeSegments([CPU, USAGE])), { showCpu: true, showUsage: true, style: "ring", showPace: true, warn: 60, critical: 90 });
  assert.deepEqual(segmentDefaults(null), {});
});

test("applySaved: only explicit false disables; bad values fall back; unknown keys kept", () => {
  const segs = normalizeSegments([CPU, GPU, USAGE]);
  const base = { ...segmentDefaults(segs), sysInterval: 3 };
  const { next, extra } = applySaved({ showCpu: false, showGpu: "false", style: "bar", showPace: 0, warn: "40", critical: null, sysInterval: 5, mystery: 1, showBattery: false }, segs, base);
  assert.equal(next.showCpu, false);
  assert.equal(next.showGpu, true);
  assert.equal(next.style, "bar");
  assert.equal(next.showPace, true);
  assert.equal(next.warn, 40);
  assert.equal(next.critical, 90);
  assert.deepEqual(extra, { mystery: 1, showBattery: false });
  assert.deepEqual(applySaved(null, segs, base).extra, {});
  assert.deepEqual(applySaved([1], segs, base).next, base);
});

test("stepper honors min/max and the 5 point gaps", () => {
  const [, , warn, crit] = USAGE.settings;
  const st = { warn: 60, critical: 65 };
  assert.equal(stepValue(warn, st, 1), 60);
  assert.equal(stepValue(crit, st, -1), 65);
  assert.equal(stepValue(crit, { warn: 60, critical: 100 }, 1), 100);
  assert.equal(stepValue(warn, { warn: 0, critical: 90 }, -1), 0);
  assert.equal(stepValue(crit, { warn: 60, critical: 90 }, -1), 85);
  assert.equal(stepValue({ key: "n", step: 2 }, { n: 4 }, 1), 6);
  assert.equal(formatValue(warn, 60), "60%");
  assert.equal(formatValue({}, 3), "3");
});
