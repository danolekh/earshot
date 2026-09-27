// Every built module that came from a "use client" source must still start with the directive,
// or React Server Components will try to run hooks on the server.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const walk = (dir) =>
  readdirSync(dir).flatMap((f) =>
    statSync(join(dir, f)).isDirectory() ? walk(join(dir, f)) : [join(dir, f)],
  );

const missing = [];
for (const src of walk("src").filter((f) => /\.tsx?$/.test(f) && !/\.test\./.test(f))) {
  if (!readFileSync(src, "utf8").startsWith('"use client"')) continue;
  const out = join("dist", relative("src", src)).replace(/\.tsx?$/, ".js");
  let code;
  try {
    code = readFileSync(out, "utf8");
  } catch {
    missing.push(`${out} (not built)`);
    continue;
  }
  if (!/^\s*["']use client["']/.test(code)) missing.push(out);
}
if (missing.length) {
  console.error(`"use client" missing in:\n  ${missing.join("\n  ")}`);
  process.exit(1);
}
console.log('"use client" kept in every client module.');
