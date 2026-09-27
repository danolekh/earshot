/* Films every company cut (or the ones named), a few at a time, in the fast mode.
 *
 *   pnpm --filter promo batch [slug…] [--jobs 3]        # → out/for-<slug>.mp4 */
import { spawn } from "node:child_process";

import { COMPANIES } from "./companies.ts";

const args = process.argv.slice(2);
const i = args.indexOf("--jobs");
const jobs = i < 0 ? 3 : Number(args[i + 1]);
const named = args.filter((a, k) => !a.startsWith("--") && args[k - 1] !== "--jobs");
const queue = COMPANIES.filter((c) => !named.length || named.includes(c.slug)).map((c) => c.slug);
const record = new URL("record.ts", import.meta.url).pathname;
const failed: string[] = [];

async function worker() {
  for (let slug = queue.shift(); slug; slug = queue.shift()) {
    const code = await new Promise<number | null>((resolve) =>
      spawn("node", [record, `for-${slug}`, "--fast"], { stdio: ["ignore", "ignore", "inherit"] }).on(
        "exit",
        resolve,
      ),
    );
    console.log(`${code === 0 ? "done" : "FAILED"}  for-${slug}`);
    if (code !== 0) failed.push(slug);
  }
}
await Promise.all(Array.from({ length: jobs }, worker));
if (failed.length) {
  console.error(`failed: ${failed.join(", ")}`);
  process.exit(1);
}
