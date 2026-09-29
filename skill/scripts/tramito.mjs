#!/usr/bin/env node
/**
 * tramito.mjs — Tramito JSON→BPMN local conversion CLI (companion tool for the skill)
 *
 * Since v2 everything runs locally: validation and layout are powered by the npm
 * package tramito-layout (ELK placement + custom EdgeRouter). No account, no API key,
 * no quota. Process data never leaves the machine.
 *
 * Dependency bootstrap: on first run, if the skill directory has no node_modules,
 * this CLI installs tramito-layout@latest automatically (requires network once).
 *
 * Engine updates follow tramito-layout@latest automatically: at most once per day a
 * detached background check contacts the npm registry and, if a newer version exists,
 * installs it — so layout releases reach installed skills without re-publishing the
 * skill. Offline machines simply skip the check. `update` runs the same flow
 * synchronously with visible output.
 *
 * Environment switches:
 *   TRAMITO_NO_AUTO_UPDATE=1   disable the background update check (manual `update` still works)
 *   TRAMITO_REGISTRY=<url>     npm registry used for both the check and the install (mirror-friendly)
 *
 * Usage:
 *   node tramito.mjs validate <graph.json>              structural validation (local, unlimited, writes nothing)
 *   node tramito.mjs render <graph.json> [--out DIR] [--name NAME]
 *                                                        convert: writes NAME.bpmn + NAME.graph.json
 *   node tramito.mjs update                              update the tramito-layout engine to the latest release
 *   node tramito.mjs doctor                              environment self-check (runtime / deps / compile smoke)
 *   node tramito.mjs --version | --help
 *
 * Error layering (mirrors the tramito-layout compiler contract):
 *   - Validation errors (issues / AggregateError) → problems with the input graph;
 *     fix them per the hints and retry.
 *   - InternalCompilerError (code=internal_compiler_error) → a bug in the compiler itself.
 *     Do NOT keep tweaking the graph; report it upstream with the stage and the graph.
 *
 * Exit codes: 0 success; 1 conversion/update failed (validation error, compiler bug, update error);
 * 2 usage or local-environment error. stdout carries result JSON; errors go to stderr.
 */

import { spawn, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SKILL_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEPS_MARKER = path.join(SKILL_ROOT, 'node_modules', 'tramito-layout', 'package.json');
const LOCK_DIR = path.join(SKILL_ROOT, '.install-lock');
const CHECK_FILE = path.join(SKILL_ROOT, '.update-check.json');
const LOCK_STALE_MS = 5 * 60_000; // stale-lock takeover threshold: installs normally finish in seconds
const CHECK_INTERVAL_MS = 24 * 60 * 60_000; // background update check runs at most once a day
const CHECK_TIMEOUT_MS = 8_000;
const ISSUE_REPO = 'https://github.com/LcpMarvel/tramito-layout/issues';
const REGISTRY = (process.env.TRAMITO_REGISTRY || 'https://registry.npmjs.org').replace(/\/+$/, '');

/* ────────────── Args & file helpers (semantics carried over from the v1 CLI) ────────────── */

const VALUE_OPTS = new Set(['--out', '--name']);

/** Parse argv: returns { positionals: string[], opts: Map<string,string> }. */
function parseArgs(args) {
  const positionals = [];
  const opts = new Map();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      if (!VALUE_OPTS.has(a)) fail(`Unknown option: ${a} (available: ${[...VALUE_OPTS].join(' ')})`);
      const v = args[i + 1];
      if (v === undefined || v.startsWith('--')) fail(`Option ${a} requires a value`);
      opts.set(a, v);
      i++;
    } else {
      positionals.push(a);
    }
  }
  return { positionals, opts };
}

/** Sanitize output file names: strip control chars / path separators / collapse whitespace. */
function sanitizeName(raw) {
  const cleaned = String(raw)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'diagram';
}

/** Derive the default output name from the input file: foo.graph.json → foo (not foo.graph). */
function defaultNameFor(file) {
  return sanitizeName(path.basename(file, path.extname(file)).replace(/\.graph$/i, ''));
}

/** Never silently overwrite: allocate one shared version suffix for a (dir, name, exts) family — both files keep the same stem. */
function nonClobberingFamily(dir, name, exts) {
  for (let v = 1; ; v++) {
    const stem = v === 1 ? name : `${name}-v${v}`;
    const paths = exts.map((ext) => path.join(dir, `${stem}.${ext}`));
    if (paths.every((p) => !fs.existsSync(p))) return paths;
  }
}

function readGraphFile(file) {
  if (!fs.existsSync(file)) fail(`File not found: ${file}`);
  try {
    return JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    fail(`Graph file is not valid JSON: ${e.message}`);
  }
}

function skillVersion() {
  try {
    return JSON.parse(fs.readFileSync(path.join(SKILL_ROOT, 'package.json'), 'utf-8')).version;
  } catch {
    return 'unknown';
  }
}

/* ────────────── Install lock (shared by bootstrap, update, background check) ────────────── */

const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
const isBunRuntime = () => Boolean(process.versions.bun);

function tryAcquireLock() {
  try {
    fs.mkdirSync(LOCK_DIR);
    return true;
  } catch (e) {
    if (e.code === 'EEXIST') return false;
    throw e;
  }
}

function releaseLock() {
  fs.rmSync(LOCK_DIR, { recursive: true, force: true });
}

/**
 * Run `fn` while holding the install lock. Others waiting on the lock poll for it to
 * clear; after LOCK_STALE_MS a lock is considered stale and taken over. fn receives
 * nothing and returns a value propagated to the caller.
 */
async function withInstallLock(fn) {
  const started = Date.now();
  for (;;) {
    if (tryAcquireLock()) {
      try {
        return await fn();
      } finally {
        releaseLock();
      }
    }
    if (Date.now() - started > LOCK_STALE_MS) {
      console.error('Waited over 5 minutes for the install lock; treating it as stale and taking over.');
      releaseLock();
      continue;
    }
    await sleep(1000);
  }
}

/* ────────────── Installer ────────────── */

function hasBin(cmd) {
  return spawnSync(cmd, ['--version'], { stdio: 'ignore' }).status === 0;
}

/** npm --registry flag when TRAMITO_REGISTRY is set, so check and install use the same source. */
function registryArgs() {
  return process.env.TRAMITO_REGISTRY ? ['--registry', REGISTRY] : [];
}

function isModuleNotFound(e) {
  return Boolean(e && (e.code === 'ERR_MODULE_NOT_FOUND' || e.code === 'MODULE_NOT_FOUND'));
}

/** Fail fast if the skill dir is unwritable — node_modules must land there, don't let npm run for nothing. */
function assertWritable(dir) {
  const probe = path.join(dir, `.write-probe-${process.pid}`);
  try {
    fs.writeFileSync(probe, '');
    fs.rmSync(probe, { force: true });
  } catch (e) {
    fail(`Skill directory is not writable (${dir}): cannot install dependencies. Run this manually: cd "${dir}" && npm install tramito-layout@latest --omit=dev — or move the skill to a writable location and retry. (${e.message})`);
  }
}

/**
 * Install a specific tramito-layout version spec via npm (or bun). The install lock is
 * held by the caller. `spec` is an npm version spec, normally 'latest' or an exact
 * version seen by the update check (avoids racing an even newer publish mid-install).
 * Returns true on success; on failure prints a manual command and exits 2.
 */
function runInstaller(spec, { quiet = false } = {}) {
  const npmBin = process.platform === 'win32' ? 'npm.cmd' : 'npm';
  const manual = `cd "${SKILL_ROOT}" && npm install tramito-layout@${spec} --omit=dev`;
  const npmArgs = ['install', `tramito-layout@${spec}`, '--omit=dev', '--no-audit', '--no-fund', ...registryArgs()];
  if (hasBin(npmBin)) {
    const r = spawnSync(npmBin, npmArgs, { cwd: SKILL_ROOT, stdio: quiet ? 'ignore' : 'inherit' });
    if (r.status !== 0) {
      fail(`Dependency install failed (npm install exited with ${r.status}). Manual command: ${manual}. For offline/proxied environments, make sure npm works first.`);
    }
    return true;
  }
  if (hasBin('bun')) {
    const r = spawnSync('bun', ['add', `tramito-layout@${spec}`, ...registryArgs()], { cwd: SKILL_ROOT, stdio: quiet ? 'ignore' : 'inherit' });
    if (r.status !== 0) {
      fail(`Dependency install failed (bun add exited with ${r.status}). Manual command: cd "${SKILL_ROOT}" && bun add tramito-layout@${spec}`);
    }
    return true;
  }
  fail(`Neither npm nor bun found on this machine. Install dependencies manually: ${manual} (or install Node.js ≥ 20 first).`);
}

function installedEngineVersion() {
  try {
    return JSON.parse(fs.readFileSync(DEPS_MARKER, 'utf-8')).version;
  } catch {
    return null;
  }
}

/* ────────────── Registry check ────────────── */

/** Latest tramito-layout version per the registry; null when unreachable (offline). */
async function fetchLatestVersion(timeoutMs = CHECK_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${REGISTRY}/tramito-layout/latest`, {
      signal: controller.signal,
      headers: { accept: 'application/json' },
    });
    if (!res.ok) return null;
    const pkg = await res.json();
    return typeof pkg?.version === 'string' ? pkg.version : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/* ────────────── Engine bootstrap & auto-update ────────────── */

/** First-run bootstrap: install tramito-layout@latest when node_modules is missing. */
async function ensureDeps() {
  if (!isBunRuntime() && Number(process.versions.node.split('.')[0]) < 20) {
    fail(`Runtime too old: Node.js ≥ 20 or Bun ≥ 1.3 required (currently ${isBunRuntime() ? 'bun' : 'node'} ${process.versions.bun || process.versions.node}).`);
  }
  assertWritable(SKILL_ROOT);
  console.error(`First run: installing dependencies (tramito-layout@latest; one time only, needs network)… Directory: ${SKILL_ROOT}`);
  await withInstallLock(async () => {
    if (fs.existsSync(DEPS_MARKER)) return; // double-check: someone finished while we waited
    runInstaller('latest');
    if (!fs.existsSync(DEPS_MARKER)) fail('The install command finished but tramito-layout is still missing — check the installer output above.');
    console.error('Dependencies installed.');
  });
}

let cachedEngine = null;

/** Load tramito-layout; bootstrap deps first if missing (a second failure is a real load error — let it throw). */
async function loadEngine() {
  if (cachedEngine) return cachedEngine;
  try {
    cachedEngine = await import('tramito-layout');
  } catch (e) {
    if (!isModuleNotFound(e)) throw e;
    await ensureDeps();
    cachedEngine = await import('tramito-layout');
  }
  return cachedEngine;
}

/* ────────────── Background update check (detached, best-effort, ≤1/day) ────────────── */

function readCheckStamp() {
  try {
    const parsed = JSON.parse(fs.readFileSync(CHECK_FILE, 'utf-8'));
    return typeof parsed?.checkedAt === 'number' ? parsed.checkedAt : 0;
  } catch {
    return 0;
  }
}

function writeCheckStamp() {
  try {
    fs.writeFileSync(CHECK_FILE, JSON.stringify({ checkedAt: Date.now() }) + '\n');
  } catch { /* unwritable dir: skip future checks gracefully */ }
}

/**
 * Fire-and-forget: when the last check is older than a day, stamp the file (prevents
 * spawn storms) and detach `__update` with all IO dropped. Zero latency for the
 * foreground command; offline machines simply fail silently inside the child.
 */
function maybeSpawnUpdateCheck() {
  if (process.env.TRAMITO_NO_AUTO_UPDATE) return;
  if (!fs.existsSync(DEPS_MARKER)) return; // nothing installed yet; bootstrap handles it
  if (Date.now() - readCheckStamp() < CHECK_INTERVAL_MS) return;
  writeCheckStamp();
  try {
    const child = spawn(process.execPath, [fileURLToPath(import.meta.url), '__update'], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
  } catch { /* spawning failed — the stamp keeps us from retrying for a day, fine */ }
}

/**
 * Internal `__update` body, shared by the detached background run and the public
 * `update` command. `verbose` prints progress; the background variant stays silent.
 * Returns { latest, updated } — latest is null when the registry was unreachable.
 */
async function performUpdate({ verbose = false } = {}) {
  const current = installedEngineVersion();
  const latest = await fetchLatestVersion();
  if (latest === null) {
    if (verbose) {
      console.error(JSON.stringify({
        ok: false,
        error: { code: 'update_check_failed', message: `Could not reach the npm registry (${REGISTRY}). Check the network, or point TRAMITO_REGISTRY at a mirror. The installed engine keeps working.` },
      }, null, 2));
      process.exit(1);
    }
    return { latest: null, updated: false };
  }
  if (latest === current) {
    if (verbose) console.log(JSON.stringify({ ok: true, upToDate: true, version: current, latest }, null, 2));
    return { latest, updated: false };
  }
  await withInstallLock(async () => {
    if (installedEngineVersion() === latest) return; // another process updated while we waited
    runInstaller(latest, { quiet: !verbose });
  });
  const now = installedEngineVersion();
  if (now !== latest) {
    if (verbose) {
      console.error(JSON.stringify({
        ok: false,
        error: { code: 'update_failed', message: `Installed tramito-layout@${now ?? 'none'} but expected @${latest}. Try again, install manually (cd "${SKILL_ROOT}" && npm install tramito-layout@${latest} --omit=dev), or — if node_modules was hand-edited — remove "${path.join(SKILL_ROOT, 'node_modules')}" and rerun.` },
      }, null, 2));
      process.exit(1);
    }
    return { latest, updated: false };
  }
  if (verbose) console.log(JSON.stringify({ ok: true, upToDate: false, from: current, version: now }, null, 2));
  return { latest, updated: true };
}

/* ────────────── Commands ────────────── */

async function cmdValidate(positionals) {
  const graphFile = positionals[0];
  if (!graphFile) fail('Usage: tramito.mjs validate <graph.json>');
  const graph = readGraphFile(graphFile);
  const { validateFlat, formatIssuesForFeedback } = await loadEngine();
  const issues = validateFlat(graph);
  const valid = !issues.some((i) => i.severity === 'error');
  const out = { ok: valid, valid, issueCount: issues.length, issues };
  if (issues.length > 0) out.feedback = formatIssuesForFeedback(issues);
  console.log(JSON.stringify(out, null, 2));
  process.exitCode = valid ? 0 : 1;
}

/** ICE exit path: a compiler bug is not the input's fault — point to reporting, not to graph edits. */
function reportIce(e) {
  console.error(JSON.stringify({
    ok: false,
    error: {
      code: 'internal_compiler_error',
      stage: e.stage ?? null,
      message: e.message,
      report: ISSUE_REPO,
      note: `This is a bug in tramito-layout (the input already passed validation). Do not keep retrying with graph edits; please report the stage, the graph file and the full error at ${ISSUE_REPO}.`,
    },
  }, null, 2));
  process.exit(1);
}

async function cmdRender(positionals, opts) {
  const graphFile = positionals[0];
  if (!graphFile) fail('Usage: tramito.mjs render <graph.json> [--out DIR] [--name NAME]');
  const graph = readGraphFile(graphFile);
  const outDir = opts.get('--out') || '.';
  const name = sanitizeName(opts.get('--name') || defaultNameFor(graphFile));

  const { validateFlat, formatIssuesForFeedback, layoutBpmnFlat, InternalCompilerError } = await loadEngine();
  const issues = validateFlat(graph);
  if (issues.some((i) => i.severity === 'error')) {
    console.error(JSON.stringify({
      ok: false,
      error: {
        code: 'graph_invalid',
        message: 'Structural validation failed; no files were written. Fix the graph per the issue hints and retry.',
        issueCount: issues.length,
        issues,
        feedback: formatIssuesForFeedback(issues),
      },
    }, null, 2));
    process.exit(1);
  }

  const t0 = Date.now();
  let xml;
  try {
    ({ xml } = await layoutBpmnFlat(graph, name));
  } catch (e) {
    if (e instanceof InternalCompilerError) reportIce(e);
    if (e instanceof AggregateError) {
      // Normally caught by validateFlat above; reaching here means validation and
      // conversion disagreed — surface every sub-error verbatim.
      console.error(JSON.stringify({
        ok: false,
        error: {
          code: 'graph_invalid',
          message: 'Structural problems found during conversion (these should have surfaced in validation — unexpected path):',
          issues: e.errors.map((x) => x.message),
        },
      }, null, 2));
      process.exit(1);
    }
    throw e;
  }

  fs.mkdirSync(outDir, { recursive: true });
  const [bpmnPath, graphPath] = nonClobberingFamily(outDir, name, ['bpmn', 'graph.json']);
  fs.writeFileSync(bpmnPath, xml, 'utf-8');
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), 'utf-8');

  const warnings = issues.filter((i) => i.severity !== 'error');
  console.log(JSON.stringify({
    ok: true,
    files: { bpmn: bpmnPath, graph: graphPath },
    ms: Date.now() - t0,
    ...(warnings.length > 0 ? { warnings } : {}),
  }, null, 2));
}

async function cmdDoctor() {
  const runtime = isBunRuntime() ? `bun ${process.versions.bun}` : `node ${process.versions.node}`;
  const { warmupLayoutEngine, layoutBpmnFlat, InternalCompilerError } = await loadEngine();
  const engineVersion = installedEngineVersion();
  const latest = await fetchLatestVersion(5_000);

  const t0 = Date.now();
  await warmupLayoutEngine();
  const warmupMs = Date.now() - t0;

  // Minimal viable graph smoke test: 3 nodes, 2 edges, runs the full layout+serialization pipeline
  const smoke = {
    nodes: [
      { id: 's', type: 'startEvent' },
      { id: 't', type: 'userTask', name: 'smoke' },
      { id: 'e', type: 'endEvent' },
    ],
    edges: [
      { id: 'f1', source: 's', target: 't' },
      { id: 'f2', source: 't', target: 'e' },
    ],
  };
  const t1 = Date.now();
  try {
    const { xml } = await layoutBpmnFlat(smoke, 'doctor');
    console.log(JSON.stringify({
      ok: true,
      runtime,
      skillVersion: skillVersion(),
      engine: {
        name: 'tramito-layout',
        version: engineVersion,
        latest: latest ?? 'unknown (registry unreachable)',
        updatePolicy: 'follows latest (background check ≤1/day; run "tramito.mjs update" to sync now)',
        warmupMs,
        smokeMs: Date.now() - t1,
        smokeBytes: xml.length,
      },
    }, null, 2));
  } catch (e) {
    if (e instanceof InternalCompilerError) reportIce(e);
    throw e;
  }
}

/* ────────────── Entry point ────────────── */

function fail(message) {
  console.error(JSON.stringify({ ok: false, error: { code: 'cli_error', message } }, null, 2));
  process.exit(2);
}

const HELP = `tramito.mjs — Tramito JSON→BPMN local conversion CLI (v${skillVersion()})

Usage:
  node tramito.mjs validate <graph.json>              structural validation (local, unlimited, writes nothing)
  node tramito.mjs render <graph.json> [--out DIR] [--name NAME]
                                                      convert: writes NAME.bpmn + NAME.graph.json
  node tramito.mjs update                             update the tramito-layout engine to the latest release
  node tramito.mjs doctor                             environment self-check (runtime / deps / compile smoke)
  node tramito.mjs --version

Notes: dependencies install automatically on first run (network needed once). The engine
follows tramito-layout@latest — a silent background check runs at most once a day and
skips itself when offline; TRAMITO_NO_AUTO_UPDATE=1 disables it, TRAMITO_REGISTRY=<url>
points both check and install at a mirror.
Exit codes: 0 success; 1 conversion/update failed (validation error, compiler bug, update
error); 2 usage or local-environment error.`;

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);

  // Internal detached worker for the background update check — not for humans.
  if (cmd === '__update') return await performUpdate({ verbose: false });

  if (cmd === '--help' || cmd === '-h') {
    console.log(HELP);
    return;
  }
  if (cmd === '--version') {
    console.log(skillVersion());
    return;
  }
  if (!cmd || !['validate', 'render', 'doctor', 'update'].includes(cmd)) {
    fail(`Unknown command: ${cmd || '(empty)'}. Available: validate | render | update | doctor (see --help for full usage)`);
  }

  if (cmd === 'update') {
    maybeSpawnUpdateCheck(); // stamp only; the real work happens synchronously below
    return await performUpdate({ verbose: true });
  }

  maybeSpawnUpdateCheck();
  const { positionals, opts } = parseArgs(rest);
  if (cmd === 'doctor') return await cmdDoctor();
  if (cmd === 'validate') return await cmdValidate(positionals);
  return await cmdRender(positionals, opts);
}

main().catch((e) => {
  console.error(JSON.stringify({
    ok: false,
    error: { code: String(e.code || 'unexpected_error'), message: e?.stack || String(e) },
  }, null, 2));
  process.exit(1);
});
