#!/usr/bin/env node
/**
 * run-tests.mjs — compile-test suite for the bundled engine (zero dependencies).
 *
 * For every fixture: `validate` must pass, `render` must produce XML satisfying the
 * case's assertions (substring presence / minimum occurrence counts). Also runs
 * `doctor` (full pipeline smoke) first. Exits non-zero on the first summary failure;
 * stdout stays terse, failures print details.
 *
 * Run: node test/run-tests.mjs
 */

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI = path.join(REPO, 'skill', 'scripts', 'tramito.mjs');

const CASES = [
  {
    file: 'basic.graph.json',
    desc: 'start → task → end',
    expectIncludes: ['<bpmn:startEvent', '<bpmn:userTask', '<bpmn:endEvent'],
  },
  {
    file: 'exclusive-approval.graph.json',
    desc: 'amount > 5000 → GM approval, otherwise finance',
    expectIncludes: ['<bpmn:exclusiveGateway', '${amount &gt; 5000}'],
  },
  {
    file: 'parallel-onboarding.graph.json',
    desc: 'account / laptop / badge fork-join',
    expectIncludes: ['<bpmn:parallelGateway'],
    countAtLeast: [{ pattern: '<bpmn:parallelGateway', n: 2 }],
  },
  {
    file: 'order-2pools.graph.json',
    desc: 'two pools, cross-pool edges must serialize as message flows',
    expectIncludes: ['<bpmn:messageFlow', '<bpmn:participant'],
    countAtLeast: [{ pattern: '<bpmn:messageFlow', n: 2 }],
  },
  {
    // 此 fixture 曾暴露 tramito-layout 2.8.0 的 pools+association 语义丢失 bug（2.8.1 修复），
    // 留作回归：dataObject + association 边必须在语义层与 DI 层同时存在。
    file: 'fried-rice.graph.json',
    desc: '蛋炒饭：双泳道 + 并行备菜 + 两个互斥判断 + 返工回环 + 数据对象连线',
    expectIncludes: ['<bpmn:parallelGateway', '<bpmn:exclusiveGateway', '备菜员', '主厨', '<bpmn:association', '<bpmn:dataObject'],
    countAtLeast: [
      { pattern: '<bpmn:exclusiveGateway', n: 3 },
      { pattern: '<bpmn:parallelGateway', n: 2 },
      { pattern: '<bpmn:association', n: 2 },
    ],
  },
];

function run(args, { expectExit = 0 } = {}) {
  try {
    const stdout = execFileSync('node', [CLI, ...args], { encoding: 'utf-8', stderr: 'pipe' });
    return { stdout, exit: 0 };
  } catch (e) {
    if (e.status === expectExit) return { stdout: e.stdout ?? '', stderr: e.stderr ?? '', exit: e.status };
    throw e;
  }
}

let failed = 0;
const work = mkdtempSync(path.join(tmpdir(), 'tramito-tests-'));
try {
  // 1) doctor — full pipeline smoke from the bundled engine
  const doc = JSON.parse(run(['doctor']).stdout);
  if (doc.ok) console.log(`✓ doctor (engine ${doc.engine.version}, smoke ${doc.engine.smokeMs}ms)`);
  else { console.error('✗ doctor failed'); failed++; }

  // 2) fixtures
  for (const c of CASES) {
    const file = path.join(REPO, 'test', 'fixtures', c.file);
    const v = JSON.parse(run(['validate', file]).stdout);
    if (!v.valid) {
      console.error(`✗ ${c.file}: invalid — ${JSON.stringify(v.issues.slice(0, 3))}`);
      failed++;
      continue;
    }
    const outDir = path.join(work, c.file.replace(/\.graph\.json$/, ''));
    const r = JSON.parse(run(['render', file, '--out', outDir, '--name', 't']).stdout);
    const xml = readFileSync(r.files.bpmn, 'utf-8');
    const missing = (c.expectIncludes ?? []).filter((s) => !xml.includes(s));
    const short = (c.countAtLeast ?? []).filter(({ pattern, n }) => xml.split(pattern).length - 1 < n);
    if (missing.length || short.length) {
      console.error(`✗ ${c.file} (${c.desc}): missing=[${missing}] short=[${JSON.stringify(short)}]`);
      failed++;
    } else {
      console.log(`✓ ${c.file} — ${c.desc} (${r.ms}ms, ${xml.length}B)`);
    }
  }
} finally {
  rmSync(work, { recursive: true, force: true });
}

console.log(failed === 0 ? `\nall ${CASES.length + 1} checks passed` : `\n${failed} check(s) FAILED`);
process.exit(failed === 0 ? 0 : 1);
