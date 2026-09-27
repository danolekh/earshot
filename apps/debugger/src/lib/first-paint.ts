/* The script in <head> that runs before the first paint. The page is prerendered with the defaults
 * (dark, inspector open, default panel sizes), so what this browser remembers is put on <html>
 * before anything shows:
 * - `.dark` from the stored theme, or the OS (followed while the theme is "system");
 * - `data-inspector="closed"` / `data-transcript="closed"` for a closed panel;
 * - `--layout-inspector` / `--layout-transcript` for the panel sizes.
 * Unlayered CSS in app.css sizes the panels from these (falling back to DEFAULT_LAYOUT's sizes)
 * until the page has hydrated and motion-panels has measured itself (`data-hydrated`). */
import { LIMITS } from "./layout";
import { KEYS } from "./stored";

const k = JSON.stringify;

export const FIRST_PAINT_SCRIPT = `(() => {
  const root = document.documentElement;
  const get = (key) => { try { return localStorage.getItem(key); } catch { return null; } };
  const light = matchMedia("(prefers-color-scheme: light)");
  const apply = () => {
    const t = get(${k(KEYS.theme)});
    root.classList.toggle("dark", t === "dark" || (t !== "light" && !light.matches));
  };
  apply();
  light.addEventListener("change", apply);
  addEventListener("storage", apply);
  if (get(${k(KEYS.inspector)}) === "off") root.dataset.inspector = "closed";
  let l = null;
  try { l = JSON.parse(get(${k(KEYS.layout)}) || "null"); } catch {}
  if (!l || typeof l !== "object") return;
  const i = l.inspector;
  if (typeof i === "number" && i >= ${LIMITS.inspector.min} && i <= ${LIMITS.inspector.max})
    root.style.setProperty("--layout-inspector", i + "px");
  const t = typeof l.transcript === "string" ? /^(\\d{1,3}(?:\\.\\d+)?)%$/.exec(l.transcript) : null;
  if (t && +t[1] >= ${LIMITS.transcript.minShare} && +t[1] <= ${LIMITS.transcript.maxShare})
    root.style.setProperty("--layout-transcript", t[1] + "%");
  if (l.transcriptOpen === false) root.dataset.transcript = "closed";
})()`;
