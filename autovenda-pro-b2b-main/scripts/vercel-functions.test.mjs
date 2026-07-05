import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, relative } from "node:path";
import test from "node:test";

const projectRoot = process.cwd();
const apiRoot = join(projectRoot, "api");

function listTypeScriptFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const absolutePath = join(directory, entry.name);
    return entry.isDirectory()
      ? listTypeScriptFiles(absolutePath)
      : entry.name.endsWith(".ts")
        ? [relative(projectRoot, absolutePath).replaceAll("\\", "/")]
        : [];
  });
}

test("deploys the backend through a single Vercel catch-all function", () => {
  assert.deepEqual(listTypeScriptFiles(apiRoot), ["api/[...path].ts"]);
});

test("does not rewrite API URLs away from the catch-all function", () => {
  const config = JSON.parse(readFileSync(join(projectRoot, "vercel.json"), "utf8"));
  const apiRewrites = config.rewrites.filter(({ source }) => source.startsWith("/api/"));

  assert.deepEqual(apiRewrites, []);
});
