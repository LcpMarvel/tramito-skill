#!/usr/bin/env node
/**
 * tramito.js — Tramito JSON→BPMN 转换 CLI（Skill 配套工具）
 *
 * 零依赖、单文件：Node.js ≥18 或 Bun 均可运行（只用 fetch / node:crypto / node:fs）。
 * 凭证从环境变量 TRAMITO_API_KEY / TRAMITO_BASE_URL 读取，缺省回落 ~/.tramito/config.json。
 * 密钥只发往配置的服务地址（默认 https://tramito.ai），绝不写进流程文件或日志。
 *
 * 用法：
 *   node tramito.js spec [--out spec.md]          拉取输入规范（公开）
 *   node tramito.js validate <graph.json>         结构校验（不消耗额度）
 *   node tramito.js render <graph.json> [--out DIR] [--name NAME]
 *                                                 转换：产出 NAME.bpmn + NAME.graph.json + 查看器链接
 *   node tramito.js usage                         查询本月额度 / 并发
 *   node tramito.js download <renderId> bpmn [--out FILE]
 *                                                 重新下载仍有效的 .bpmn（不再次计次）
 *   node tramito.js link <renderId>               重新签发查看器链接（产物仍有效时不扣次）
 *
 * 幂等语义：idempotencyKey 由 graph 内容哈希确定性生成——同一份内容在本组织
 * 24h 内重复 render（含进程重启后重试、网络失败后重跑）回放同一结果、只计 1 次；
 * 改动了内容自然就是新键、新转换。
 */

'use strict';
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/* ────────────── 配置 ────────────── */

function asString(v) {
  if (typeof v === 'string') return v.trim();
  if (v == null) return '';
  return String(v).trim();
}

function loadConfig() {
  const configPath = path.join(os.homedir(), '.tramito', 'config.json');
  let fileCfg = {};
  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (parsed && typeof parsed === 'object') fileCfg = parsed;
      else throw new Error('顶层不是 JSON 对象');
    } catch (e) {
      fail(`配置文件无法解析（${e.message}）：${configPath}。请修正为 {"apiKey": "tmt_live_...", "baseUrl": "https://tramito.ai"}`);
    }
  }
  const apiKey = (process.env.TRAMITO_API_KEY || asString(fileCfg.apiKey)).trim();
  const baseUrl = (process.env.TRAMITO_BASE_URL || asString(fileCfg.baseUrl) || 'https://tramito.ai').trim().replace(/\/+$/, '');
  return { apiKey, baseUrl, configPath };
}

function requireAuth(cfg) {
  if (!cfg.apiKey) {
    console.error(JSON.stringify({
      ok: false,
      error: {
        code: 'missing_api_key',
        message: [
          '缺少 Tramito API Key。请按以下步骤配置：',
          '1. 注册并验证邮箱后，打开 Settings → API Keys（https://tramito.ai/settings/api-keys）创建 Key；',
          `2. 写入 ${cfg.configPath}：{"apiKey": "tmt_live_...", "baseUrl": "${cfg.baseUrl}"}`,
          '   或设置环境变量 TRAMITO_API_KEY（TRAMITO_BASE_URL 可选，默认官方地址）。',
          '不要把 Key 发到聊天里；也不要把它写进流程文件或仓库。',
        ].join('\n'),
      },
    }, null, 2));
    process.exit(2);
  }
}

/* ────────────── 参数解析 ────────────── */

const VALUE_OPTS = new Set(['--out', '--name']);

/** 解析 argv：返回 { positionals: string[], opts: Map<string,string> }。选项值缺失报错。 */
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
      if (!VALUE_OPTS.has(a)) fail(`未知选项：${a}（可用：${[...VALUE_OPTS].join(' ')}）`);
      const v = args[i + 1];
      if (v === undefined || v.startsWith('--')) fail(`选项 ${a} 需要一个值`);
      opts.set(a, v);
      i++;
    } else {
      positionals.push(a);
    }
  }
  return { positionals, opts };
}

/* ────────────── HTTP ────────────── */

const CLIENT_TIMEOUT_MS = 45_000; // 服务端转换上限 30s，客户端略长（覆盖到响应体读完）

/** 带整体超时（含响应体读取）的 fetch。 */
async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    // 把超时覆盖到 body 读完：返回包装过的 text()
    return {
      ok: res.ok,
      status: res.status,
      statusText: res.statusText,
      headers: res.headers,
      text: async () => {
        try {
          return await res.text();
        } finally {
          clearTimeout(timer);
        }
      },
    };
  } catch (e) {
    clearTimeout(timer);
    const err = new Error(`网络错误：无法连接 ${new URL(url).origin}（${e.name === 'AbortError' ? '请求超时' : e.message}）`);
    err.code = 'network_error';
    throw err;
  }
}

async function api(cfg, method, urlPath, { body } = {}) {
  const headers = {};
  if (cfg.apiKey) headers.authorization = `Bearer ${cfg.apiKey}`;
  if (body !== undefined) headers['content-type'] = 'application/json';
  const res = await fetchWithTimeout(`${cfg.baseUrl}${urlPath}`, {
    method,
    headers,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let payload = {};
  try {
    payload = text ? JSON.parse(text) : {};
  } catch {
    const err = new Error(`服务返回了非 JSON 响应（HTTP ${res.status}）：${text.slice(0, 200)}`);
    err.code = 'invalid_response';
    throw err;
  }
  if (!res.ok) {
    const err = new Error((payload.error && payload.error.message) || `${res.status} ${res.statusText}`);
    err.code = res.status >= 500 ? 'http_5xx' : (payload.error && payload.error.code) || `http_${res.status}`;
    err.details = payload.error || {};
    err.status = res.status;
    throw err;
  }
  return payload;
}

/* ────────────── 命令 ────────────── */

function readGraphFile(file) {
  if (!fs.existsSync(file)) fail(`文件不存在：${file}`);
  let parsed;
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf-8'));
  } catch (e) {
    fail(`graph 文件不是合法 JSON：${e.message}`);
  }
  return parsed;
}

/** 幂等键：graph 内容确定性哈希（同内容跨进程/跨重试同键 → 不重复扣次）。 */
function idempotencyKeyFor(graph) {
  return `cli-${createHash('sha256').update(JSON.stringify(graph)).digest('hex').slice(0, 32)}`;
}

/** 输出文件名净化：去控制字符/路径分隔符/空白折叠。 */
function sanitizeName(raw) {
  const cleaned = String(raw)
    // eslint-disable-next-line no-control-regex
    .replace(/[\x00-\x1f\x7f]/g, '')
    .replace(/[\\/:*?"<>|]/g, '_')
    .replace(/\s+/g, ' ')
    .trim();
  return cleaned || 'diagram';
}

/** B18：不静默覆盖。目标已存在时自动加 -v2/-v3… 后缀，返回实际可用路径。 */
function nonClobberingPath(dir, name, ext) {
  let candidate = path.join(dir, `${name}.${ext}`);
  for (let v = 2; ; v++) {
    if (!fs.existsSync(candidate)) return candidate;
    candidate = path.join(dir, `${name}-v${v}.${ext}`);
  }
}

async function cmdSpec(cfg, opts) {
  const payload = await api(cfg, 'GET', '/api/v1/bpmn/spec');
  const out = opts.get('--out');
  if (out) {
    fs.writeFileSync(out, payload.spec, 'utf-8');
    console.log(JSON.stringify({ ok: true, version: payload.version, limits: payload.limits, written: out }));
  } else {
    console.log(JSON.stringify({ ok: true, version: payload.version, limits: payload.limits, spec: payload.spec }));
  }
}

async function cmdValidate(cfg, positionals) {
  requireAuth(cfg);
  const graphFile = positionals[0];
  if (!graphFile) fail('用法：tramito.js validate <graph.json>');
  const graph = readGraphFile(graphFile);
  const r = await api(cfg, 'POST', '/api/v1/bpmn/validate', { body: { graph } });
  console.log(JSON.stringify({ ok: r.valid, ...r }, null, 2));
  process.exitCode = r.valid ? 0 : 1;
}

const MAX_POLLS = 20;
const TRANSIENT_POLL_ERRORS = new Set(['network_error', 'http_5xx', 'rate_limited', 'invalid_response']);

/**
 * 轮询处理中的转换：瞬时错误（限速/网络/5xx）不中断——转换仍在服务端进行，
 * 中断会让用户丢掉一次已计数的转换。只记录并继续，轮询耗尽才失败。
 */
async function pollUntilTerminal(cfg, id, retryAfterMs) {
  const warnings = [];
  for (let i = 0; i < MAX_POLLS; i++) {
    await new Promise((res) => setTimeout(res, Math.min(retryAfterMs || 2000, 10_000)));
    let r;
    try {
      r = await api(cfg, 'GET', `/api/v1/bpmn/renders/${id}`);
    } catch (e) {
      if (TRANSIENT_POLL_ERRORS.has(e.code)) {
        warnings.push(`第 ${i + 1} 次查询失败（${e.code}），已继续等待`);
        continue;
      }
      throw e;
    }
    if (r.status !== 'processing') return { r, warnings };
  }
  return { r: null, warnings };
}

async function cmdRender(cfg, positionals, opts) {
  requireAuth(cfg);
  const graphFile = positionals[0];
  if (!graphFile) fail('用法：tramito.js render <graph.json> [--out DIR] [--name NAME]');
  const graph = readGraphFile(graphFile);
  const outDir = opts.get('--out') || '.';
  const name = sanitizeName(opts.get('--name') || path.basename(graphFile, path.extname(graphFile)));

  const idempotencyKey = idempotencyKeyFor(graph);
  let r = await api(cfg, 'POST', '/api/v1/bpmn/render', { body: { graph, idempotencyKey } });

  let warnings = [];
  if (r.status === 'processing') {
    const polled = await pollUntilTerminal(cfg, r.id, r.retryAfterMs);
    warnings = polled.warnings;
    r = polled.r ?? { id: r.id, status: 'processing' };
  }
  if (r.status === 'failed') {
    // 服务端终态失败：不计次，重试需要修正输入或稍后再试。
    console.error(JSON.stringify({
      ok: false,
      error: {
        code: 'render_failed',
        message: `转换失败（${r.errorCode ?? '原因未知'}），本次不消耗额度。可检查 graph 后重试；内容未变的话重试会命中同一幂等键。`,
        id: r.id,
        status: r.status,
      },
    }, null, 2));
    process.exit(1);
  }
  if (r.status !== 'succeeded' || !r.bpmn || !r.viewer || !r.artifacts) {
    // 结构异常或仍在处理：把 id 带出去，用户可用 download 恢复（不再扣次）。
    console.error(JSON.stringify({
      ok: false,
      error: {
        code: r.status === 'processing' ? 'processing_timeout' : 'invalid_response',
        message:
          r.status === 'processing'
            ? `转换仍在处理中（已轮询 ${MAX_POLLS} 次）。失败/超时不消耗额度；请稍后用 "tramito.js download ${r.id} bpmn" 恢复结果，不要立即重新 render。`
            : `服务返回了不完整的转换结果。可用 "tramito.js download ${r.id} bpmn" 尝试恢复。`,
        id: r.id,
        status: r.status,
      },
    }, null, 2));
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const bpmnPath = nonClobberingPath(outDir, name, 'bpmn');
  const graphPath = nonClobberingPath(outDir, name, 'graph.json');
  const linkPath = nonClobberingPath(outDir, name, 'viewer.url.txt');
  fs.writeFileSync(bpmnPath, r.bpmn, 'utf-8');
  fs.writeFileSync(graphPath, JSON.stringify(graph, null, 2), 'utf-8');
  // 链接落盘：长随机 token 让 Agent「凭记忆转述」极易抄错一个字符——交付时引用本文件原文。
  fs.writeFileSync(linkPath, r.viewer.url + '\n', 'utf-8');

  console.log(JSON.stringify({
    ok: true,
    id: r.id,
    files: { bpmn: bpmnPath, graph: graphPath, viewerUrl: linkPath },
    viewerUrl: r.viewer.url, // 浏览器打开即可看图并导出 PNG（&embed=1 为无界面嵌入版）
    viewerExpiresAt: r.viewer.expiresAt,
    expiresAt: r.expiresAt,
    warnings,
    usage: r.usage,
  }, null, 2));
}

async function cmdLink(cfg, positionals) {
  requireAuth(cfg);
  const id = positionals[0];
  if (!id) fail('用法：tramito.js link <renderId>');
  const r = await api(cfg, 'GET', `/api/v1/bpmn/renders/${id}`);
  if (r.status !== 'succeeded' || !r.viewer) {
    fail(`该转换当前没有可用的查看器链接（status=${r.status ?? 'unknown'}；产物过期需重新转换会计次）`);
  }
  console.log(JSON.stringify({ ok: true, id: r.id, viewerUrl: r.viewer.url, expiresAt: r.viewer.expiresAt }));
}

async function cmdUsage(cfg) {
  requireAuth(cfg);
  const r = await api(cfg, 'GET', '/api/v1/usage');
  console.log(JSON.stringify({ ok: true, ...r }, null, 2));
}

async function cmdDownload(cfg, positionals, opts) {
  requireAuth(cfg);
  const [id, kind] = positionals;
  if (kind === 'png') fail('PNG 不由服务端提供；请在查看器链接（viewerUrl）中一键导出 PNG（浏览器端完成）。');
  if (!id || kind !== 'bpmn') fail('用法：tramito.js download <renderId> bpmn [--out FILE]');
  const r = await api(cfg, 'GET', `/api/v1/bpmn/renders/${id}`);
  if (r.status !== 'succeeded' || !r.artifacts || !r.artifacts.bpmn) {
    fail(`该转换当前不可下载（status=${r.status ?? 'unknown'}）`);
  }
  const res = await fetchWithTimeout(r.artifacts.bpmn.url);
  if (!res.ok) {
    const err = new Error(`产物下载失败（HTTP ${res.status}）`);
    err.code = res.status === 410 ? 'artifact_expired' : 'download_failed';
    throw err;
  }
  const out = opts.get('--out') || `tramito-${id.slice(0, 8)}.bpmn`;
  fs.writeFileSync(out, await res.text(), 'utf-8');
  console.log(JSON.stringify({ ok: true, written: out }));
}

/* ────────────── 入口 ────────────── */

function fail(message) {
  console.error(JSON.stringify({ ok: false, error: { code: 'cli_error', message } }, null, 2));
  process.exit(2);
}

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  try {
    const cfg = loadConfig(); // 任何配置问题在这里已被 fail() 结构化处理
    const { positionals, opts } = parseArgs(rest);
    switch (cmd) {
      case 'spec': return await cmdSpec(cfg, opts);
      case 'validate': return await cmdValidate(cfg, positionals);
      case 'render': return await cmdRender(cfg, positionals, opts);
      case 'usage': return await cmdUsage(cfg);
      case 'download': return await cmdDownload(cfg, positionals, opts);
      case 'link': return await cmdLink(cfg, positionals);
      default:
        fail(`未知命令：${cmd || '(空)'}。可用：spec | validate | render | usage | download | link`);
    }
  } catch (e) {
    console.error(JSON.stringify({
      ok: false,
      error: {
        code: e.code || 'request_failed',
        message: e.message,
        ...(e.details && Object.keys(e.details).length > 1 ? { server: e.details } : {}),
      },
    }, null, 2));
    process.exit(1);
  }
}

main();
