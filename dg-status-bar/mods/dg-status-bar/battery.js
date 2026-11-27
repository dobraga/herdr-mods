/** Battery level for the system pill: Linux sysfs (BAT0/BAT1) or macOS `pmset -g batt`. `null` = no battery. */

const SYSFS = "/sys/class/power_supply";
const clampPct = (v) => Math.max(0, Math.min(100, Math.round(v)));

/** Normalizes a status word to "charging" | "discharging" | "full" | "idle". */
function statusOf(word) {
  const w = (word ?? "").trim().toLowerCase();
  if (w === "full" || w === "charged") return "full";
  if (w.startsWith("discharg")) return "discharging";
  if (w.startsWith("charg") || w === "finishing charge") return "charging";
  return "idle";
}

/** `entries` = [{ capacity: "87\n", status: "Discharging\n" }, ...] read from each BAT*; averages the levels. */
export function parseSysfsBattery(entries) {
  const found = (entries ?? []).map((e) => ({ cap: (e?.capacity ?? "").trim(), pct: Number((e?.capacity ?? "").trim()), status: statusOf(e?.status) })).filter((e) => (e.cap !== "") && Number.isFinite(e.pct));
  if (!found.length) return null;
  const pct = clampPct(found.reduce((a, b) => a + b.pct, 0) / found.length);
  const status = found.some((e) => e.status === "charging") ? "charging" : found.some((e) => e.status === "discharging") ? "discharging" : found[0].status;
  return { pct, status };
}

/** `pmset -g batt`: "... InternalBattery-0 (id=...)\t87%; discharging; 4:12 remaining ...". */
export function parsePmsetBatt(text) {
  const m = /(\d{1,3})%;\s*([^;]+);/.exec(text ?? "");
  return m ? { pct: clampPct(Number(m[1])), status: statusOf(m[2]) } : null;
}

/** Warn at or below 30%, critical at or below 15%, only while not charging. */
export function batteryLevel(b) {
  if (!b || b.status === "charging" || b.status === "full") return "ok";
  return b.pct <= 15 ? "critical" : b.pct <= 30 ? "warn" : "ok";
}

/** Returns `{ pct, status }`, or null when there is no battery. */
export async function readBattery({ mac, exec, readTextFile }) {
  if (mac) {
    try {
      const r = await exec("pmset", ["-g", "batt"], { timeout: 4000 });
      return r.code === 0 ? parsePmsetBatt(r.stdout) : null;
    } catch {
      return null;
    }
  }
  const entries = await Promise.all(["BAT0", "BAT1"].map(async (n) => ({
    capacity: (await readTextFile(`${SYSFS}/${n}/capacity`)) ?? "",
    status: (await readTextFile(`${SYSFS}/${n}/status`)) ?? "",
  })));
  return parseSysfsBattery(entries);
}
