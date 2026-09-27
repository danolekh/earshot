/* Serves earshot's JSON schemas at their `$id`s (https://earshot.danolekh.com/schema/<name>.v1.json):
 * copies them from the package into public/schema before each build. The copies are build output,
 * not committed. */
import { copyFileSync, mkdirSync, readdirSync } from "node:fs";

const from = new URL("../../../packages/earshot/schema/", import.meta.url).pathname;
const to = new URL("../public/schema/", import.meta.url).pathname;
mkdirSync(to, { recursive: true });
for (const f of readdirSync(from))
  if (f.endsWith(".schema.json")) copyFileSync(from + f, to + f.replace(".schema.json", ".json"));
