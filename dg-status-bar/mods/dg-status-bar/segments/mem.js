import { sh, parseMeminfo, parseVmStat, fmtBytes } from "../sysstats.js";

export default {
  id: "mem",
  key: "showMem",
  group: "system",
  order: 20,
  title: "Memory",
  about: "Memory in use %.",
  defaultOn: true,

  async sample({ mac, exec, readTextFile }) {
    if (!mac) return { mem: parseMeminfo(await readTextFile("/proc/meminfo")) };
    const [vm, memsize] = await Promise.all([sh(exec, "vm_stat", []), sh(exec, "sysctl", ["-n", "hw.memsize"])]);
    return { mem: parseVmStat(vm, Number(memsize)) };
  },

  pill: (s, t, ui) => ui.pillPct("memory", s.mem, t),

  card(s, t, hist, detail, { div, cfg, section, head, spark, bar, procs, pctColor }) {
    const memPct = s.mem;
    return section(t)
      .child(head("memory", "Memory", detail?.mem ? `${fmtBytes(detail.mem.used)} / ${fmtBytes(detail.mem.total)}` : `${memPct ?? "–"}%`, t, memPct == null ? t.dim : pctColor(memPct, t)))
      .child(cfg.showSpark ? spark(hist?.mem ?? [], t, memPct == null ? t.dim : pctColor(memPct, t), 100) : bar(memPct, t))
      .when(Boolean(detail?.swap?.total), (el) => el.child(div().text_size(10.5).text_color(t.dim).child(`Swap ${fmtBytes(detail.swap.used)} / ${fmtBytes(detail.swap.total)}`)))
      .when(cfg.showProcs && Boolean(detail?.procs), (el) => el.child(procs(detail.procs.mem, "mem", t)));
  },
};
