/* Films a take of the call debugger (takes.ts) and lays the call's sound under it.
 *
 *   pnpm --filter debugger build:stage                  # the build it films, once per change
 *   pnpm --filter promo record <take> [--theme dark|light] [--fast]
 *                                                       # → out/<take>[-<theme>].mp4
 *
 * Takes: `debugger` (the main film, dark and light) and `for-<company>` (companies.ts). The final
 * is shot 3840 wide at 120 fps and blended to 1080p60; `--fast` shoots 1920 wide at 60 fps. The
 * orb teaser has its own recorder: `pnpm --filter promo record:teaser`. */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { Film } from "./film.ts";
import { mux } from "./mux.ts";
import { takes } from "./takes.ts";

const args = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i < 0 ? undefined : args[i + 1];
};
const name = args.find((a, i) => !a.startsWith("--") && !args[i - 1]?.startsWith("--")) ?? "debugger";
const take = takes[name];
if (!take) throw new Error(`no take "${name}"; there are: ${Object.keys(takes).join(", ")}`);
const theme = (flag("theme") ?? take.themes[0]) as "dark" | "light";
if (!take.themes.includes(theme)) throw new Error(`the ${name} take has no ${theme} cut`);
const fast = args.includes("--fast");

const OUT = new URL("../out/", import.meta.url).pathname;
mkdirSync(OUT, { recursive: true });
const file = join(OUT, `${name}${take.themes.length > 1 ? `-${theme}` : ""}.mp4`);
const silent = file.replace(/\.mp4$/, ".silent.mp4");

const started = Date.now();
const film = await Film.open({ theme, fast });
try {
  await take.open(film);
  await film.begin(silent);
  await take.film(film);
} catch (e) {
  await film.abort();
  throw e;
}
const filmed = await film.end();
const segs = mux(filmed, file);
rmSync(silent);
// What was played where, to check the sound against the picture.
writeFileSync(file.replace(/\.mp4$/, ".audio.json"), `${JSON.stringify(segs, null, 1)}\n`);
console.log(
  `${filmed.duration.toFixed(1)} s, ${segs.length} stretches of sound, in ${((Date.now() - started) / 1000).toFixed(0)} s → ${file}`,
);
