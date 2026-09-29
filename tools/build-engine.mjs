#!/usr/bin/env node
/**
 * build-engine.mjs — bundle tramito-layout (+ elkjs, bpmn-moddle) into a single
 * self-contained ESM file at skill/scripts/engine.mjs.
 *
 * WHY a bundle: sandboxed hosts (e.g. ChatGPT skills) forbid runtime `npm install`.
 * The skill therefore ships the whole engine inside the zip — no bootstrap, no network,
 * no node_modules anywhere at runtime.
 *
 * Build-time patch (the one non-trivial step): tramito-layout's elk-singleton loads
 * elkjs's worker at runtime via readFileSync(require.resolve('elkjs/lib/elk-worker.min.js')).
 * Inside a bundle there is no elkjs on disk, so we replace that read with the worker
 * source embedded as base64 (base64 — not a raw string literal — because the GWT minified
 * worker contains U+2028/U+2029 line separators that JSON.stringify leaves raw and that
 * terminate JS string literals). Everything else about the evaluation path (shadowed
 * self/document, in-process fake worker) is untouched.
 *
 * Usage:
 *   node tools/build-engine.mjs            bundle tramito-layout@latest
 *   node tools/build-engine.mjs 2.8.0      bundle an exact version
 *
 * Output is deterministic for a given version (esbuild + fixed inputs), so CI rebuilds
 * it and diffs against the committed file to catch drift.
 *
 * After a version bump: re-render examples (npm-free CLI works immediately), regenerate
 * examples/*.bpmn(+png) baselines if the diff shows layout changes, then release.
 */

import { execSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT_FILE = path.join(REPO_ROOT, 'skill', 'scripts', 'engine.mjs');
const SPEC = process.argv[2] || 'latest';
// esbuild 锁精确版本：不同 esbuild 的产物可能有差异，CI 的「重建零 diff」依赖确定性。
const ESBUILD_VERSION = '0.28.2';

// The exact runtime-read block in tramito-layout's dist/index.js that we replace.
const ANCHOR_RE = /const nodeRequire = createRequire\(import\.meta\.url\);\s*const workerPath = nodeRequire\.resolve\("elkjs\/lib\/elk-worker\.min\.js"\);\s*fakeWorkerClass = evaluateFakeWorkerClass\(readFileSync\(workerPath, "utf8"\), nodeRequire\);/;

const work = mkdtempSync(path.join(tmpdir(), 'tramito-engine-'));
try {
  console.log(`workspace: ${work}`);
  execSync('npm init -y', { cwd: work, stdio: 'ignore' });
  // --prefer-online：强制刷新 registry 元数据缓存——刚 publish 的版本否则可能解析到旧 latest。
  execSync(`npm install tramito-layout@${SPEC} esbuild@${ESBUILD_VERSION} --omit=dev --no-audit --no-fund --prefer-online`, { cwd: work, stdio: 'inherit' });

  const dist = readFileSync(path.join(work, 'node_modules/tramito-layout/dist/index.js'), 'utf-8');
  const version = JSON.parse(readFileSync(path.join(work, 'node_modules/tramito-layout/package.json'), 'utf-8')).version;
  const workerB64 = readFileSync(path.join(work, 'node_modules/elkjs/lib/elk-worker.min.js')).toString('base64');

  if (!ANCHOR_RE.test(dist)) {
    throw new Error('Patch anchor not found in tramito-layout dist — its elk-singleton changed; update ANCHOR_RE in tools/build-engine.mjs.');
  }
  const patched = dist.replace(
    ANCHOR_RE,
    `fakeWorkerClass = evaluateFakeWorkerClass(Buffer.from("${workerB64}", "base64").toString("utf8"), createRequire(import.meta.url));`,
  );
  writeFileSync(path.join(work, 'dist-patched.mjs'), patched);
  writeFileSync(path.join(work, 'entry.mjs'), `export * from "./dist-patched.mjs";\nexport const ENGINE_VERSION = ${JSON.stringify(version)};\n`);

  execSync('npx esbuild entry.mjs --bundle --platform=node --format=esm --outfile=engine.mjs', { cwd: work, stdio: 'inherit' });

  mkdirSync(path.dirname(OUT_FILE), { recursive: true });
  copyFileSync(path.join(work, 'engine.mjs'), OUT_FILE);
  console.log(`✓ bundled tramito-layout@${version} → ${path.relative(REPO_ROOT, OUT_FILE)}`);
} finally {
  rmSync(work, { recursive: true, force: true });
}
