import { sh, parseNvidiaSmi, fmtBytes, pad2 } from "../sysstats.js";

export default {
  id: "gpu",
  key: "showGpu",
  group: "system",
  order: 50,
  title: "GPU",
  about: "NVIDIA usage % and VRAM (needs nvidia-smi).",
  defaultOn: true,

  // `gpuMissing` (no NVIDIA driver/binary) stops spawning nvidia-smi for the rest of the session.
  async sample({ mac, exec }, prev) {
    const gpuMissing = prev?.gpuMissing ?? false;
    if (mac || gpuMissing) return { gpu: null, gpuMissing };
    const out = await sh(exec, "nvidia-smi", ["--query-gpu=utilization.gpu,memory.used,memory.total,temperature.gpu", "--format=csv,noheader,nounits"]);
    return { gpu: parseNvidiaSmi(out), gpuMissing: out == null };
  },

  pill: (s, t, ui) => (s.gpu ? ui.pillPct("gpu", s.gpu.util, t) : null),

  card(s, t, hist, detail, { div, cfg, section, head, spark, pctColor }) {
    const g = s.gpu;
    if (!g) return null;
    return section(t)
      .child(head("gpu", "GPU", `${pad2(g.util)}%`, t, pctColor(g.util, t)))
      .when(cfg.showSpark, (el) => el.child(spark(hist?.gpu ?? [], t, pctColor(g.util, t), 100)))
      .child(div().text_size(10.5).text_color(t.dim)
        .child(`VRAM ${fmtBytes(g.memUsed)} / ${fmtBytes(g.memTotal)}${g.temp != null ? ` · ${g.temp}°C` : ""}`));
  },
};
