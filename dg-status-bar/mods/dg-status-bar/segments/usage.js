// Usage gauges: Claude / Antigravity subscription windows (and the focused agent's context) as a top-level bar item.
// Pure: no gpui-kit and no usage-settings.js import (usage-settings.js imports this registry). The host passes `ui`
// ({ div, svg, h_flex, cfg, usageColor }). The host keeps the hover/click handlers and the popup (usage-card.js).

const H = 3600000;
export const WINDOW_MS = { "5h": 5 * H, "7d": 168 * H, weekly: 168 * H };

export function formatReset(iso) {
  if (!iso) return "";
  const ms = Date.parse(iso) - Date.now();
  if (!Number.isFinite(ms) || ms <= 0) return "soon";
  const mins = Math.floor(ms / 60000);
  const hours = Math.floor(mins / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${days}d ${hours % 24}h`;
  if (hours > 0) return `${hours}h ${mins % 60}m`;
  return `${Math.max(1, mins)}m`;
}

// Single-unit variant for the status pill: "6d", "2h", "45m".
export function formatResetShort(iso) {
  const full = formatReset(iso);
  return full.split(" ")[0];
}

// Percent of the window already elapsed, or null when unknown.
export function paceOf(resetIso, windowMs) {
  const ms = Date.parse(resetIso ?? "") - Date.now();
  if (!windowMs || !Number.isFinite(ms) || ms <= 0 || ms > windowMs) return null;
  return Math.round((100 * (windowMs - ms)) / windowMs);
}

export function bucketUsed(b) {
  if (!b) return null;
  return Math.max(0, Math.min(100, Math.round(b.usedPct ?? 100 - (b.remainingPct ?? 100))));
}

export function matchAgyGroup(groups, modelName) {
  if (!groups?.length) return null;
  const m = (modelName ?? "").toLowerCase();
  if (m.includes("claude") || m.includes("gpt") || m.includes("oss")) {
    return groups.find((g) => /claude|gpt/i.test(g.name)) ?? groups[0];
  }
  if (m.includes("argon")) {
    return groups.find((g) => /argon/i.test(g.name)) ?? groups[0];
  }
  return groups.find((g) => /gemini models/i.test(g.name)) ?? groups[0];
}

const ctxColor = (pct, t, cfg) => (pct >= cfg.ctxCritical ? t.ansi1 : pct >= cfg.ctxWarn ? t.blocked : t.muted);

/** Pill content: the focused Claude/AGY agent's Ctx + windows, or the worst windows of both when none is focused.
 *  `s` = { data (shared "usage.data"), agent ({ kind, term } | null), ctx (that terminal's statusline json) }. */
export function pillItems({ data, agent, ctx }, t, { cfg, usageColor }) {
  if (agent?.kind === "claude") {
    const items = [];
    if (ctx?.agent === "claude" && typeof ctx.ctx_pct === "number") {
      const p = Math.round(ctx.ctx_pct);
      items.push({ label: `Ctx ${p}%`, pct: p, color: ctxColor(p, t, cfg) });
    }
    const cl = data?.claude;
    if (cl?.fiveHour) {
      const p = Math.round(cl.fiveHour.utilization ?? 0);
      items.push({ label: `5h ${p}%`, pct: p, reset: cl.fiveHour.resets_at, pace: paceOf(cl.fiveHour.resets_at, WINDOW_MS["5h"]), color: usageColor(p, paceOf(cl.fiveHour.resets_at, WINDOW_MS["5h"]), t, t.muted) });
    }
    if (cl?.sevenDay) {
      const p = Math.round(cl.sevenDay.utilization ?? 0);
      items.push({ label: `7d ${p}%`, pct: p, reset: cl.sevenDay.resets_at, pace: paceOf(cl.sevenDay.resets_at, WINDOW_MS["7d"]), color: usageColor(p, paceOf(cl.sevenDay.resets_at, WINDOW_MS["7d"]), t, t.muted) });
    }
    return { icon: "claude", items };
  }

  if (agent?.kind === "agy") {
    const items = [];
    if (ctx?.agent === "agy" && typeof ctx.ctx_pct === "number") {
      const p = Math.round(ctx.ctx_pct);
      items.push({ label: `Ctx ${p}%`, pct: p, color: ctxColor(p, t, cfg) });
    }
    const group = matchAgyGroup(data?.agy?.groups, ctx?.model);
    if (group) {
      const b5h = group.buckets.find((b) => b.window === "5h");
      const bw = group.buckets.find((b) => b.window === "weekly");
      const p5h = bucketUsed(b5h);
      const pw = bucketUsed(bw);
      if (p5h !== null) items.push({ label: `5h ${p5h}%`, pct: p5h, reset: b5h.resetTime, pace: paceOf(b5h.resetTime, WINDOW_MS["5h"]), color: usageColor(p5h, paceOf(b5h.resetTime, WINDOW_MS["5h"]), t, t.muted) });
      if (pw !== null) items.push({ label: `W ${pw}%`, pct: pw, reset: bw.resetTime, pace: paceOf(bw.resetTime, WINDOW_MS.weekly), color: usageColor(pw, paceOf(bw.resetTime, WINDOW_MS.weekly), t, t.muted) });
    }
    return { icon: "agy", items };
  }

  const items = [];
  const add = (icon, wins) => {
    wins.filter(Boolean).forEach((w, i) => {
      const pace = paceOf(w.reset, w.ms);
      items.push({ icon: i === 0 ? icon : null, noSep: i > 0, label: `${w.label} ${w.p}%`, pct: w.p, pace, color: usageColor(w.p, pace, t, t.muted) });
    });
  };
  const cl = data?.claude;
  add("claude", [
    cl?.fiveHour && { label: "5h", p: Math.round(cl.fiveHour.utilization ?? 0), reset: cl.fiveHour.resets_at, ms: WINDOW_MS["5h"] },
    cl?.sevenDay && { label: "7d", p: Math.round(cl.sevenDay.utilization ?? 0), reset: cl.sevenDay.resets_at, ms: WINDOW_MS["7d"] },
  ]);
  const buckets = (data?.agy?.groups ?? []).flatMap((g) => g.buckets);
  const worst = (window, label, ms) => {
    const bs = buckets.filter((b) => b.window === window && bucketUsed(b) !== null);
    if (!bs.length) return null;
    const b = bs.reduce((m, x) => (bucketUsed(x) > bucketUsed(m) ? x : m));
    return { label, p: bucketUsed(b), reset: b.resetTime, ms };
  };
  add("agy", [worst("5h", "5h", WINDOW_MS["5h"]), worst("weekly", "W", WINDOW_MS.weekly)]);
  return { items };
}

function gauge(pct, color, t, pace, { div, svg, cfg }) {
  if (cfg.style === "text") return null;
  if (cfg.style === "bar") {
    return div().w(26).h(4).flex_none().rounded(2).bg(t.raised).overflow_hidden().relative()
      .child(div().h_full().w(Math.round((26 * Math.max(0, Math.min(100, pct))) / 100)).bg(color).rounded(2))
      .when(pace != null && cfg.showPace, (el) => el.child(div().absolute().top(0).h_full().w(1).left(Math.round((25 * pace) / 100)).bg(t.foreground).opacity(0.8)));
  }
  const step = Math.max(0, Math.min(100, Math.round(pct / 5) * 5));
  return div()
    .size(12)
    .flex_none()
    .relative()
    .child(svg("mods/dg-status-bar/rings/track.svg").size(12).absolute().top(0).left(0).text_color(t.raised))
    .when(step > 0, (el) => el.child(svg(`mods/dg-status-bar/rings/arc-${step}.svg`).size(12).absolute().top(0).left(0).text_color(color)));
}

const brandIcon = (name, t, loading, svg) =>
  svg(`mods/dg-status-bar/icons/${name}.svg`).size(name === "agy" ? 10 : 13).flex_none().text_color(loading ? t.working : t.muted);

const pct = { kind: "stepper", step: 5, min: 0, max: 100, unit: "%" };

export default {
  id: "usage",
  key: "showUsage",
  group: "item",
  order: 5,
  title: "Usage gauges",
  about: "Claude / Antigravity subscription gauges and their popup.",
  defaultOn: true,

  // Sub-settings (rendered by dg-settings from describe()). Defaults equal the cfg defaults in usage-settings.js;
  // parsing of the saved file stays bespoke in applySettings.
  settings: [
    { key: "style", kind: "choice", title: "Gauge style", about: "How Ctx, 5h and 7d usage is drawn in the status bar pill, next to the percentage.", default: "ring",
      options: [{ value: "ring", label: "Ring" }, { value: "bar", label: "Bar" }, { value: "text", label: "Text only" }] },
    { key: "showPercent", kind: "toggle", title: "Show percentage", about: "Off keeps only the gauge and its label (Ctx, 5h, 7d). Ignored for Text only.", default: true },
    { key: "showPace", kind: "toggle", title: "Show pace marker", about: "A tick on the bar marking how much of the 5h/7d window has elapsed. Fill past the tick means you are burning faster than the window.", default: true },
    { key: "showReset", kind: "toggle", title: "Show reset time", about: "Append the time until the 5h and 7d limits reset, e.g. ↻2h 10m.", default: false },
    { key: "colorMode", kind: "choice", title: "Color mode", about: "Threshold: fixed warning/critical percentages. Pace: green at or below the tick, amber above it, red 15+ points above it or at 90%+.", default: "threshold",
      options: [{ value: "threshold", label: "Threshold" }, { value: "pace", label: "Pace" }] },
    { key: "warn", ...pct, title: "Warning color from", about: "Usage percentage where the gauge turns to the warning color. Used in Threshold mode, and in Pace mode when the window position is unknown.", default: 60, before: "critical" },
    { key: "critical", ...pct, title: "Critical color from", about: "Usage percentage where the gauge turns red.", default: 90, after: "warn" },
    { key: "ctxWarn", ...pct, title: "Ctx warning color from", about: "Context usage percentage where the Ctx gauge turns to the warning color.", default: 60, before: "ctxCritical" },
    { key: "ctxCritical", ...pct, title: "Ctx critical color from", about: "Context usage percentage where the Ctx gauge turns red.", default: 90, after: "ctxWarn" },
  ],

  /** The pill trigger (styled, no handlers): the host chains hover/click and wraps it in the usage Popup.
   *  `s` = { data, agent, ctx, loading, open }. */
  pill(s, t, ui) {
    const { div, h_flex, svg, cfg } = ui;
    const pill = pillItems(s, t, ui);
    return h_flex()
      .id("status-usage")
      .px(7)
      .py(2)
      .gap(6)
      .items_center()
      .rounded(5)
      .cursor_pointer()
      .when(Boolean(s.open), (el) => el.bg(t.selected))
      .hover((x) => x.bg(t.hover).text_color(t.foreground))
      .when(Boolean(pill.icon), (el) => el.child(brandIcon(pill.icon, t, s.loading, svg)))
      .when(pill.items.length > 0, (el) =>
        el.children(
          pill.items.map((item, i) =>
            h_flex()
              .gap(4)
              .items_center()
              .when((i > 0 || Boolean(pill.icon)) && !item.noSep, (el) => el.child(div().text_color(t.dim).child("·")))
              .when(Boolean(item.icon), (el) => el.child(brandIcon(item.icon, t, s.loading, svg)))
              .child(div().text_color(item.color).child(cfg.showPercent || cfg.style === "text" ? item.label : item.label.replace(/ ?\d+%$/, "")))
              .when(cfg.style !== "text", (el) => el.child(gauge(item.pct, item.color, t, item.pace, ui)))
              .when(cfg.showReset && Boolean(item.reset), (el) => el.child(div().text_size(10.5).text_color(t.dim).child(`↻${formatResetShort(item.reset)}`))),
          ),
        ),
      );
  },
};
