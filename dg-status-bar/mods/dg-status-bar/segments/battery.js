import { readBattery, batteryLevel } from "../battery.js";
import { pad2 } from "../sysstats.js";

export default {
  id: "battery",
  key: "showBattery",
  group: "system",
  order: 60,
  title: "Battery",
  about: "Battery % with a charging icon; amber at 30% and red at 15% while discharging. Hidden when the machine has no battery.",
  defaultOn: true,

  sample: async (env) => ({ battery: await readBattery(env) }),

  pill(s, t, { div, svg, h_flex }) {
    const b = s.battery;
    if (!b) return null;
    const lv = batteryLevel(b);
    const color = lv === "critical" ? t.ansi1 : lv === "warn" ? t.blocked : t.dim;
    return h_flex().gap(5).items_center()
      .child(svg(`mods/dg-status-bar/icons/${b.status === "charging" ? "battery-charging" : "battery"}.svg`).size(13).flex_none().text_color(color))
      .child(div().w(30).flex_none().text_right().text_color(lv === "ok" ? t.muted : color).child(`${pad2(b.pct)}%`));
  },
};
