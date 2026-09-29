#!/usr/bin/env node
/**
 * check-frontmatter.mjs — SKILL.md frontmatter sanity guard (zero dependencies).
 *
 * Catches the class of bug that broke v2.3.0 on WorkBuddy: an UNQUOTED plain YAML
 * scalar value containing ": " (colon+space) — hosts' YAML parsers reject it with
 * "mapping values are not allowed in this context". (Full-width "：" is fine; ASCII
 * ": " is not.) Rule: any value containing ": " must be quoted (single or double).
 *
 * Also checks: frontmatter delimiters, `key: value` shape, and quote pairing.
 *
 * Usage: node tools/check-frontmatter.mjs [file]   (default: skill/SKILL.md)
 * Exit 0 = OK; 1 = problems found (printed to stderr).
 */

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const FILE = process.argv[2] ?? path.join(REPO, 'skill', 'SKILL.md');

const lines = readFileSync(FILE, 'utf-8').split(/\r?\n/);
const problems = [];

if (lines[0] !== '---') problems.push('file must start with "---"');
const end = lines.indexOf('---', 1);
if (end === -1) problems.push('frontmatter is not closed with "---"');

const body = lines.slice(1, end === -1 ? undefined : end);
for (let i = 0; i < body.length; i++) {
  const line = body[i];
  const lineNo = i + 2; // 1-based file line number
  const m = /^([A-Za-z_][\w-]*):(?:\s(.*))?$/.exec(line);
  if (!m) {
    if (line.trim() !== '') problems.push(`line ${lineNo}: not a "key: value" entry -> ${line}`);
    continue;
  }
  const value = (m[2] ?? '').trim();
  if (value === '') continue; // key with no value (allowed: e.g. null frontmatter keys)
  const q = value[0];
  if (q === '"' || q === "'") {
    if (!value.endsWith(q) || value.length < 2) {
      problems.push(`line ${lineNo}: unbalanced ${q} quote -> ${line}`);
    }
    continue; // quoted values may contain anything (colons included)
  }
  if (value.includes(': ') || /:\s*$/.test(value)) {
    problems.push(`line ${lineNo}: unquoted value contains ": " — YAML parsers reject this; wrap the value in double quotes -> ${line}`);
  }
}

if (problems.length > 0) {
  console.error(`✗ ${path.relative(REPO, FILE)} frontmatter problems:`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`✓ ${path.relative(REPO, FILE)} frontmatter OK`);
