// Creates supabase/signing_keys.json (git-ignored) holding one local ES256 key,
// in the array format the Supabase CLI expects. Local development and CI only.
import { execSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const target = resolve("supabase/signing_keys.json");
if (existsSync(target) && !process.argv.includes("--force")) {
  console.log("supabase/signing_keys.json already exists (use --force to replace).");
  process.exit(0);
}
// Run from an empty folder so the CLI does not load this project's config.
const cli = resolve("node_modules/.bin/supabase");
const work = mkdtempSync(join(tmpdir(), "sb-key-"));
try {
  const out = execSync(`"${cli}" gen signing-key --algorithm ES256`, {
    cwd: work,
    stdio: ["ignore", "pipe", "ignore"],
  }).toString();
  const key = JSON.parse(out);
  writeFileSync(target, JSON.stringify(Array.isArray(key) ? key : [key], null, 2));
  console.log("Wrote supabase/signing_keys.json");
} finally {
  rmSync(work, { recursive: true, force: true });
}
