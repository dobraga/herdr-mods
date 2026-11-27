import { sh, clampPct, parseProcStat, parseTopCpu, pad2 } from "../sysstats.js";

export default {
  id: "cpu",
  key: "showCpu",
  group: "system",
  order: 10,
  title: "CPU",
  about: "CPU usage %.",
  defaultOn: true,

  // Linux needs two /proc/stat readings: `cpuRaw` is kept in the slice for the next delta.
  async sample({ mac, exec, readTextFile }, prev) {
    if (mac) return { cpu: parseTopCpu(await sh(exec, "top", ["-l", "2", "-n", "0", "-s", "1"], 6000)), cpuRaw: null };
    const cpuRaw = parseProcStat(await readTextFile("/proc/stat"));
    const p = prev?.cpuRaw;
    const cpu = cpuRaw && p && cpuRaw.total > p.total ? clampPct((1 - (cpuRaw.idle - p.idle) / (cpuRaw.total - p.total)) * 100) : null;
    return { cpu, cpuRaw };
  },

  pill: (s, t, ui) => ui.pillPct("cpu", s.cpu, t),

  card(s, t, hist, detail, { div, cfg, section, head, spark, procs, pctColor }) {
    return section(t)
      .child(head("cpu", "CPU", s.cpu == null ? "–" : `${pad2(s.cpu)}%`, t, s.cpu == null ? t.dim : pctColor(s.cpu, t)))
      .when(cfg.showSpark, (el) => el.child(spark(hist?.cpu ?? [], t, pctColor(s.cpu ?? 0, t), 100)))
      .when(Boolean(detail?.cores), (el) => el.child(div().text_size(10.5).text_color(t.dim)
        .child(`${detail.cores} cores${detail.load ? ` · load ${detail.load.map((n) => n.toFixed(2)).join(" ")}` : ""}`)))
      .when(cfg.showProcs && Boolean(detail?.procs), (el) => el.child(procs(detail.procs.cpu, "cpu", t)));
  },
};
