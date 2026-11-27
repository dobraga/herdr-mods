// Segment registry. A segment is one file exporting
//   { id, key, group, order, title, about, defaultOn, sample?(env, prev), pill?(s, t, ui), card?(s, t, hist, detail, ui), settings? }
// - key: the saved settings key (only an explicit `false` turns it off).
// - group: "system" (inside the System monitor pill) or "item" (top-level bar item).
// - sample: returns this segment's slice of the stats snapshot `s` (state it needs next time lives in the slice).
// - pill / card: return an element or null. `ui` is the render kit from sys-card.js (gpui builders, cfg, shared
//   helpers), passed in so segment files never import gpui-kit and stay loadable by usage-settings.js and tests.
//   An "item" segment's pill gets its own `s` from the host (see segments/usage.js).
// - settings: optional sub-setting descriptors, { key, kind: "toggle"|"choice"|"stepper", title, about, default,
//   options?: [{ value, label }], step?, min?, max?, unit?, after?: otherKey (>= other+5), before?: otherKey (<= other-5) }.
// Inline (not pluggable yet) system items keep their slots: herdr 30, disk 40, net 70.
import usage from "./usage.js";
import cpu from "./cpu.js";
import mem from "./mem.js";
import gpu from "./gpu.js";
import battery from "./battery.js";

/** Every segment, in `order`: settings keys, defaults and describe() cover all of them. */
export const REGISTRY = [usage, cpu, mem, gpu, battery].sort((a, b) => a.order - b.order);

/** The "system" group: what the System monitor pill, card and sampler loop over. */
export const SEGMENTS = REGISTRY.filter((s) => s.group === "system");

export const keys = () => REGISTRY.map((s) => s.key);

export const defaults = () => Object.fromEntries(REGISTRY.map((s) => [s.key, s.defaultOn]));

/** Serializable metadata only (no functions), for setShared("status.segments"). */
export const describe = () => REGISTRY.map(({ id, key, group, order, title, about, defaultOn, settings }) =>
  ({ id, key, group, order, title, about, defaultOn, ...(settings ? { settings } : {}) }));
