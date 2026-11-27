// Pure helpers for the Status bar tab: turn the `status.segments` metadata published by dg-status-bar into
// defaults, saved-file parsing and stepper arithmetic. No gpui here so bun/node can test it.

/** Valid segments from the published value, sorted by `order`; null when nothing usable was published. */
export function normalizeSegments(raw) {
  if (!Array.isArray(raw)) return null;
  const segs = raw
    .filter((s) => s && typeof s.id === "string" && typeof s.key === "string")
    .map((s) => ({
      ...s,
      order: Number.isFinite(Number(s.order)) ? Number(s.order) : 0,
      settings: Array.isArray(s.settings) ? s.settings.filter((d) => d && typeof d.key === "string" && ["toggle", "choice", "stepper"].includes(d.kind)) : [],
    }))
    .sort((a, b) => a.order - b.order);
  return segs.length ? segs : null;
}

/** Defaults of the pluggable parts: each segment key plus its settings descriptors. */
export function segmentDefaults(segs) {
  const out = {};
  for (const s of segs ?? []) {
    out[s.key] = s.defaultOn !== false;
    for (const d of s.settings ?? []) if (d.default !== undefined) out[d.key] = d.default;
  }
  return out;
}

/** Value of one descriptor from a saved file, or `undefined` when the saved value is unusable. */
export function readSetting(d, v) {
  if (d.kind === "toggle") return typeof v === "boolean" ? v : undefined;
  if (d.kind === "choice") return (d.options ?? []).some((o) => o.value === v) ? v : undefined;
  if (d.kind === "stepper") {
    if (v === null || v === "" || !Number.isFinite(Number(v))) return undefined;
    return Number(v);
  }
  return undefined;
}

/**
 * Overlay a saved settings object on `base` (the defaults). Segment keys only turn off on an explicit `false`.
 * Returns `{ next, extra }`; `extra` holds the saved keys neither `base` nor the segments know, so a save can keep them.
 */
export function applySaved(p, segs, base) {
  const obj = p && typeof p === "object" && !Array.isArray(p) ? p : {};
  const next = { ...base };
  for (const s of segs ?? []) {
    if (obj[s.key] === false) next[s.key] = false;
    for (const d of s.settings ?? []) {
      const v = readSetting(d, obj[d.key]);
      if (v !== undefined) next[d.key] = v;
    }
  }
  const extra = {};
  for (const k of Object.keys(obj)) if (!(k in next)) extra[k] = obj[k];
  return { next, extra };
}

/** Next value of a stepper after pressing minus (dir -1) or plus (+1), honoring min/max and the after/before gaps. */
export function stepValue(d, st, dir) {
  const cur = Number.isFinite(Number(st[d.key])) ? Number(st[d.key]) : Number(d.default) || 0;
  const step = d.step ?? 1;
  let v = cur + dir * step;
  const lo = [d.min, d.after != null && Number.isFinite(st[d.after]) ? st[d.after] + 5 : undefined].filter((x) => x !== undefined);
  const hi = [d.max, d.before != null && Number.isFinite(st[d.before]) ? st[d.before] - 5 : undefined].filter((x) => x !== undefined);
  if (lo.length) v = Math.max(v, ...lo);
  if (hi.length) v = Math.min(v, ...hi);
  return v;
}

export const formatValue = (d, v) => `${v}${d.unit ?? ""}`;
