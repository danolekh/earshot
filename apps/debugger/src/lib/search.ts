/* What a call's URL holds, so a moment can be shared: earshot's moment (the time, the zoom, and
 * what's picked) and the lanes hidden here. Anything that doesn't parse is dropped rather than
 * trusted. */
import { type Moment, parseMoment } from "@danolekh/earshot/review";

export interface DebugSearch extends Moment {
  /** Hidden lanes, by id, comma-separated (`heard,said`). */
  hide?: string;
}

export function parseDebugSearch(raw: Record<string, unknown>): DebugSearch {
  const out: DebugSearch = parseMoment(raw);
  if (typeof raw.hide === "string") {
    const hide = raw.hide
      .split(",")
      .filter((v) => /^[a-z-]{1,24}$/.test(v))
      .slice(0, 20);
    if (hide.length) out.hide = hide.join(",");
  }
  return out;
}
