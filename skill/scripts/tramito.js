#!/usr/bin/env node
/**
 * tramito.js — Tramito JSON→BPMN 转换 CLI（Skill 配套工具）
 *
 * 零依赖、单文件：Node.js ≥18 或 Bun 均可运行（只用 fetch / node:crypto / node:fs）。
 * 凭证从环境变量 TRAMITO_API_KEY / TRAMITO_BASE_URL 读取，缺省回落 ~/.tramito/config.json。
 * 密钥只发往配置的服务地址（默认 https://tramito.ai），绝不写进流程文件或日志。
 *
 * 用法：
 *   node tramito.js spec [--out spec.md]          拉取输入规范（公开，不读凭证）
 *   node tramito.js validate <graph.json>         结构校验（不消耗额度）
 *   node tramito.js render <graph.json> [--out DIR] [--name NAME]
 *                                                 转换：产出 NAME.bpmn + NAME.graph.json + NAME.viewer.url.txt
 *   node tramito.js usage                         查询本月额度 / 并发
 *   node tramito.js download <renderId> bpmn [--out FILE]
 *                                                 重新下载仍有效的 .bpmn（不再次计次）
 *   node tramito.js link <renderId>               重新获取当前有效的查看器链接（不扣次）
 *   node tramito.js login [--start | --wait | --paste] [--force]
 *                                                 登录并把 Key 自动写入 ~/.tramito/config.json：
 *                                                   默认=浏览器配对（打开链接点授权，零复制粘贴）；
 *                                                   --start/--wait 拆分两步供宿主 Agent 使用；
 *                                                   --paste 从 stdin 读取 Key（无浏览器环境）
 *   node tramito.js logout                        删除本机配置
 *
 * 幂等语义：idempotencyKey = graph 规范化内容（键排序稳定序列化）的哈希——同一份
 * 内容在 24h 窗口内跨进程/跨重试回放同一结果、只计 1 次；窗口过期服务端拒绝时，
 * CLI 自动加盐重试一次（此时即为一次新转换）。
 *
 * 退出码：0 成功；1 请求失败（服务端/网络错误）；2 用法或本地配置错误。
 */

'use strict';
const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

/* ────────────── 配置 ────────────── */

function asString(v) {
  if (typeof v === 'string') return v.trim();
  if (v == null) return '';
  return String(v).trim();
}

/**
 * 读取配置。解析失败不直接退出：返回 configError 由调用方决定——spec 不需要
 * 凭证可以带病运行（baseUrl 回落默认），其余命令在用到时再报结构化错误。
 */
function loadConfig() {
  const configPath = path.join(os.homedir(), '.tramito', 'config.json');
  let fileCfg = {};
  let configError = null;
  if (fs.existsSync(configPath)) {
    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) fileCfg = parsed;
      else configError = '顶层不是 JSON 对象';
    } catch (e) {
      configError = e.message;
    }
  }
  // 空白字符串必须回落（先 trim 再判断，避免 ' ' 这种真值干扰 || 链）
  const apiKey = asString(process.env.TRAMITO_API_KEY) || asString(fileCfg.apiKey);
  const baseUrl = (asString(process.env.TRAMITO_BASE_URL) || asString(fileCfg.baseUrl) || 'https://tramito.ai')
    .replace(/\/+$/, '');
  if (!/^https?:\/\//.test(baseUrl)) {
    return {
      apiKey: '',
      baseUrl: 'https://tramito.ai',
      configPath,
      configError: `TRAMITO_BASE_URL / baseUrl 缺少 http(s):// 前缀（收到：${JSON.stringify(baseUrl)}）`,
    };
  }
  return { apiKey, baseUrl, configPath, configError };
}

function requireAuth(cfg) {
  if (cfg.configError) {
    fail(`配置文件无法使用（${cfg.configError}）：${cfg.configPath}。请修正为 {"apiKey": "tmt_live_...", "baseUrl": "https://tramito.ai"}`);
  }
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
const BOOLEAN_OPTS = new Set(['--start', '--wait', '--paste', '--force']);

/** 解析 argv：返回 { positionals: string[], opts: Map<string,string>, flags: Set<string> }。 */
function parseArgs(args) {
  const positionals = [];
  const opts = new Map();
  const flags = new Set();
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    if (a === '--') {
      positionals.push(...args.slice(i + 1));
      break;
    }
    if (a.startsWith('--')) {
      if (BOOLEAN_OPTS.has(a)) {
        flags.add(a);
        continue;
      }
      if (!VALUE_OPTS.has(a)) {
        fail(`未知选项：${a}（可用：${[...VALUE_OPTS, ...BOOLEAN_OPTS].join(' ')}）`);
      }
      const v = args[i + 1];
      if (v === undefined || v.startsWith('--')) fail(`选项 ${a} 需要一个值`);
      opts.set(a, v);
      i++;
    } else {
      positionals.push(a);
    }
  }
  return { positionals, opts, flags };
}

/* ────────────── 规范化与文件工具 ────────────── */

/** 键排序的稳定序列化：同一语义内容的 key 顺序不同也得到同一字符串（幂等键/请求哈希的根基）。 */
function canonicalJson(value) {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`;
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort();
    return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value);
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

/** 由输入文件名推导默认输出名：foo.graph.json → foo（而不是 foo.graph）。 */
function defaultNameFor(file) {
  return sanitizeName(path.basename(file, path.extname(file)).replace(/\.graph$/i, ''));
}

/**
 * B18 不静默覆盖：对一组 (dir, name, exts) 统一分配同一个版本后缀——
 * 三件套必须同 stem，绝不能出现 foo.bpmn 配 foo-v2.graph.json 的错配。
 */
function nonClobberingFamily(dir, name, exts) {
  for (let v = 1; ; v++) {
    const stem = v === 1 ? name : `${name}-v${v}`;
    const paths = exts.map((ext) => path.join(dir, `${stem}.${ext}`));
    if (paths.every((p) => !fs.existsSync(p))) return paths;
  }
}

/** 单文件写出：建父目录 + 不覆盖已有文件（自动 -v2）。 */
function writeOut(file, data) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true });
  const ext = path.extname(file);
  const stem = path.basename(file, ext);
  let target = file;
  for (let v = 2; fs.existsSync(target); v++) target = path.join(dir, `${stem}-v${v}${ext}`);
  fs.writeFileSync(target, data);
  return target;
}

/* ────────────── HTTP ────────────── */

const CLIENT_TIMEOUT_MS = 45_000; // 服务端转换上限 30s，客户端略长（覆盖到响应体读完）

/** 网络层错误统一映射成 network_error（含 body 读取阶段的 abort）。 */
function mapNetworkError(url, e) {
  let origin = '';
  try {
    origin = new URL(url).origin;
  } catch {
    origin = url.slice(0, 60);
  }
  const err = new Error(`网络错误：无法连接 ${origin}（${e && e.name === 'AbortError' ? '请求超时' : (e && e.message) || e}）`);
  err.code = 'network_error';
  return err;
}

/** 带整体超时（含响应体读取）的 fetch。 */
async function fetchWithTimeout(url, init = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CLIENT_TIMEOUT_MS);
  let res;
  try {
    res = await fetch(url, { ...init, signal: controller.signal });
  } catch (e) {
    clearTimeout(timer);
    throw mapNetworkError(url, e);
  }
  return {
    ok: res.ok,
    status: res.status,
    statusText: res.statusText,
    headers: res.headers,
    text: async () => {
      try {
        return await res.text();
      } catch (e) {
        throw mapNetworkError(url, e);
      } finally {
        clearTimeout(timer);
      }
    },
  };
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
    // 服务端结构化 code 永远优先（504 render_timeout / 500 render_failed 等都要保住）
    const serverCode = payload.error && typeof payload.error.code === 'string' ? payload.error.code : null;
    const err = new Error((payload.error && payload.error.message) || `${res.status} ${res.statusText}`);
    err.code = serverCode || (res.status >= 500 ? 'http_5xx' : `http_${res.status}`);
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

async function cmdSpec(cfg, opts) {
  const payload = await api(cfg, 'GET', '/api/v1/bpmn/spec');
  const out = opts.get('--out');
  if (out) {
    const written = writeOut(out, payload.spec);
    console.log(JSON.stringify({ ok: true, version: payload.version, limits: payload.limits, written }));
  } else {
    console.log(JSON.stringify({ ok: true, version: payload.version, limits: payload.limits, spec: payload.spec }));
  }
}

async function cmdValidate(cfg, positionals) {
  const graphFile = positionals[0];
  if (!graphFile) fail('用法：tramito.js validate <graph.json>');
  const graph = readGraphFile(graphFile);
  const r = await api(cfg, 'POST', '/api/v1/bpmn/validate', { body: { graph } });
  console.log(JSON.stringify({ ok: r.valid, ...r }, null, 2));
  process.exitCode = r.valid ? 0 : 1;
}

/** 幂等键：规范化内容哈希（同语义内容跨进程/跨重试同键 → 不重复扣次）。 */
function idempotencyKeyFor(canon) {
  return `cli-${createHash('sha256').update(canon).digest('hex').slice(0, 32)}`;
}

const POLL_DEADLINE_MS = 5 * 60_000; // 服务端 30s 上限；轮询总预算 5 分钟兜底
const TRANSIENT_POLL_ERRORS = new Set(['network_error', 'http_5xx', 'rate_limited', 'invalid_response']);

/**
 * 轮询处理中的转换：瞬时错误（限速/网络/5xx/非 JSON）不中断——转换仍在服务端进行，
 * 中断会让用户丢掉一次可能已计数的转换。预算 = 总时长 5 分钟（而非仅次数），
 * 每轮等待尊重服务端最新指示的 retryAfterMs（钳制在 [1s, 10s]）。
 */
async function pollUntilTerminal(cfg, id, retryAfterMs) {
  const warnings = [];
  const deadline = Date.now() + POLL_DEADLINE_MS;
  let waitMs = Math.min(Math.max(retryAfterMs || 2000, 1000), 10_000);
  let polls = 0;
  while (Date.now() < deadline && polls < 20) {
    await new Promise((res) => setTimeout(res, waitMs));
    polls++;
    let r;
    try {
      r = await api(cfg, 'GET', `/api/v1/bpmn/renders/${id}`);
    } catch (e) {
      if (TRANSIENT_POLL_ERRORS.has(String(e.code))) {
        const hinted = e.details && typeof e.details.retryAfterMs === 'number' ? e.details.retryAfterMs : null;
        if (hinted) waitMs = Math.min(Math.max(hinted, 1000), 10_000);
        warnings.push(`第 ${polls} 次查询失败（${e.code}），已继续等待`);
        continue;
      }
      throw e;
    }
    if (r.status !== 'processing') return { r, warnings };
  }
  return { r: null, warnings };
}

async function cmdRender(cfg, positionals, opts) {
  const graphFile = positionals[0];
  if (!graphFile) fail('用法：tramito.js render <graph.json> [--out DIR] [--name NAME]');
  const graph = readGraphFile(graphFile);
  const outDir = opts.get('--out') || '.';
  const name = sanitizeName(opts.get('--name') || defaultNameFor(graphFile));

  // 规范化后再发送 + 哈希：键顺序重排的同一份图既是同一幂等键、也是同一请求哈希。
  const canon = canonicalJson(graph);
  const graphToSend = JSON.parse(canon);
  const key = idempotencyKeyFor(canon);

  let r;
  try {
    r = await api(cfg, 'POST', '/api/v1/bpmn/render', { body: { graph: graphToSend, idempotencyKey: key } });
  } catch (e) {
    if (e.code === 'network_error' || e.code === 'http_5xx' || e.code === 'invalid_response') {
      // 瞬时失败原键重试一次（不会重复扣次）
      r = await api(cfg, 'POST', '/api/v1/bpmn/render', { body: { graph: graphToSend, idempotencyKey: key } });
    } else if (e.code === 'idempotency_window_expired') {
      // 24h 窗口已过：加盐换新键重试一次（此刻即为一次新转换）
      r = await api(cfg, 'POST', '/api/v1/bpmn/render', {
        body: { graph: graphToSend, idempotencyKey: `${key}-r${randomUUID().slice(0, 8)}` },
      });
    } else {
      throw e;
    }
  }

  let pollWarnings = [];
  if (r.status === 'processing') {
    const polled = await pollUntilTerminal(cfg, r.id, r.retryAfterMs);
    pollWarnings = polled.warnings;
    r = polled.r ?? { id: r.id, status: 'processing' };
  }
  if (r.status === 'failed') {
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
    // 结构异常或仍在处理：把 id 带出去，用户可用 download/link 恢复（不再扣次）。
    console.error(JSON.stringify({
      ok: false,
      error: {
        code: r.status === 'processing' ? 'processing_timeout' : 'invalid_response',
        message:
          r.status === 'processing'
            ? `转换仍在处理中（已轮询至 ${POLL_DEADLINE_MS / 60000} 分钟预算上限）。失败/超时不消耗额度；请稍后用 "tramito.js download ${r.id} bpmn" 或 "tramito.js link ${r.id}" 恢复，不要立即重新 render。`
            : `服务返回了不完整的转换结果。可用 "tramito.js download ${r.id} bpmn" 尝试恢复。`,
        id: r.id,
        status: r.status,
      },
    }, null, 2));
    process.exit(1);
  }

  fs.mkdirSync(outDir, { recursive: true });
  const [bpmnPath, graphPath, linkPath] = nonClobberingFamily(outDir, name, ['bpmn', 'graph.json', 'viewer.url.txt']);
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
    warnings: [...(Array.isArray(r.warnings) ? r.warnings : []), ...pollWarnings],
    usage: r.usage,
  }, null, 2));
}

async function cmdUsage(cfg) {
  const r = await api(cfg, 'GET', '/api/v1/usage');
  console.log(JSON.stringify({ ok: true, ...r }, null, 2));
}

/* ────────────── login / logout ────────────── */

const PENDING_FILE = () => path.join(os.homedir(), '.tramito', 'login.pending.json');

/** 写配置：目录 0700、文件 0600；已有配置时需 --force 才覆盖。 */
function saveConfig(configPath, apiKey, baseUrl, force) {
  if (fs.existsSync(configPath) && !force) {
    fail(`配置已存在：${configPath}。确认要换账号/换 Key 请加 --force，或先运行 "tramito.js logout"。`);
  }
  fs.mkdirSync(path.dirname(configPath), { recursive: true, mode: 0o700 });
  fs.writeFileSync(configPath, JSON.stringify({ apiKey, baseUrl }, null, 2) + '\n', { mode: 0o600 });
}

async function verifyLogin(baseUrl, apiKey) {
  const probe = { apiKey, baseUrl, configPath: '' };
  return api(probe, 'GET', '/api/v1/usage');
}

function printLoginOk(cfg, usage) {
  console.log(JSON.stringify({
    ok: true,
    configWritten: cfg.configPath,
    baseUrl: cfg.baseUrl,
    plan: usage.plan,
    used: usage.used,
    limit: usage.limit,
    remaining: usage.limit === null ? null : Math.max(0, usage.limit - usage.used),
    message: '登录完成，可以直接使用了。',
  }, null, 2));
}

/** --start：创建配对并把待领取状态存到 pending 文件（供 --wait 续用）。 */
async function loginStart(cfg) {
  const r = await api(cfg, 'POST', '/api/v1/pair', { body: {} });
  fs.mkdirSync(path.dirname(PENDING_FILE()), { recursive: true, mode: 0o700 });
  fs.writeFileSync(PENDING_FILE(), JSON.stringify({
    code: r.code, deviceSecret: r.deviceSecret, baseUrl: cfg.baseUrl, expiresAt: r.expiresAt,
  }), { mode: 0o600 });
  console.log(JSON.stringify({
    ok: true,
    status: 'pairing_started',
    code: r.code,
    verificationUrl: r.verificationUrl,
    expiresAt: r.expiresAt,
    next: `请把这个链接交给用户在浏览器里打开并点「授权此设备」，然后运行 "tramito.js login --wait" 等待完成。`,
  }, null, 2));
}

function readPending() {
  if (!fs.existsSync(PENDING_FILE())) {
    fail('没有进行中的配对。先运行 "tramito.js login --start"。');
  }
  try {
    const p = JSON.parse(fs.readFileSync(PENDING_FILE(), 'utf-8'));
    if (!p.code || !p.deviceSecret) throw new Error('bad pending file');
    return p;
  } catch (e) {
    fail(`配对状态文件损坏（${e.message}）：${PENDING_FILE()}。请重新运行 "tramito.js login --start"。`);
  }
}

/** 轮询一次配对；成功→写配置+验证，未完成→抛 login_pending（exit 3）。 */
async function loginPollOnce(cfg, pending) {
  let r;
  try {
    r = await api(cfg, 'POST', '/api/v1/pair/poll', {
      body: { code: pending.code, deviceSecret: pending.deviceSecret },
    });
  } catch (e) {
    if (e.code === 'pair_expired') {
      fs.rmSync(PENDING_FILE(), { force: true });
      fail('配对已过期。请重新运行 "tramito.js login --start" 并把新链接给用户。');
    }
    throw e;
  }
  if (r.status === 'pending') return false;
  // authorized：写配置 + 验证
  saveConfig(cfg.configPath, r.apiKey, cfg.baseUrl, currentFlags.has('--force'));
  fs.rmSync(PENDING_FILE(), { force: true });
  const usage = await verifyLogin(cfg.baseUrl, r.apiKey);
  printLoginOk({ ...cfg, apiKey: r.apiKey }, usage);
  return true;
}

async function loginWait(cfg, budgetMs) {
  const pending = readPending();
  if (pending.baseUrl && pending.baseUrl !== cfg.baseUrl) {
    console.error(JSON.stringify({ ok: false, error: { code: 'cli_error', message: `当前 TRAMITO_BASE_URL 与发起配对时不一致（${pending.baseUrl} → ${cfg.baseUrl}）。请改回后重试。` } }, null, 2));
    process.exit(2);
  }
  const deadline = Date.now() + budgetMs;
  while (Date.now() < deadline) {
    if (await loginPollOnce(cfg, pending)) return;
    await new Promise((res) => setTimeout(res, 2000));
  }
  console.error(JSON.stringify({
    ok: false,
    error: {
      code: 'login_pending',
      message: '用户还没有在浏览器里完成授权。提醒用户打开链接点「授权此设备」后，再运行一次 "tramito.js login --wait"。',
      verificationUrl: pending.verificationUrl ?? null,
    },
  }, null, 2));
  process.exit(3);
}

/** --paste：从 stdin 读 Key（TTY 时隐藏输入），写配置并验证。 */
async function loginPaste(cfg) {
  const key = await readStdinSecret('请粘贴你的 API Key（tmt_live_…，输入不回显）：');
  if (!/^tmt_live_\S{10,}$/.test(key)) {
    fail('格式不对：Key 应以 tmt_live_ 开头。请到 Settings → API Keys 复制完整 Key。');
  }
  saveConfig(cfg.configPath, key, cfg.baseUrl, currentFlags.has('--force'));
  const usage = await verifyLogin(cfg.baseUrl, key);
  printLoginOk({ ...cfg, apiKey: key }, usage);
}

function readStdinSecret(prompt) {
  return new Promise((resolve, reject) => {
    if (process.stdin.isTTY) {
      process.stderr.write(prompt);
      process.stdin.setRawMode(true);
      process.stdin.resume();
      process.stdin.setEncoding('utf-8');
      let buf = '';
      const onData = (ch) => {
        if (ch === '\r' || ch === '\n') {
          process.stdin.setRawMode(false);
          process.stdin.pause();
          process.stderr.write('\n');
          resolve(buf.trim());
        } else if (ch === '\u0003') {
          process.stdin.setRawMode(false);
          process.exit(130);
        } else if (ch === '\u007f') {
          buf = buf.slice(0, -1);
        } else {
          buf += ch;
        }
      };
      process.stdin.on('data', onData);
    } else {
      // 管道/重定向：直接读全文
      let buf = '';
      process.stdin.setEncoding('utf-8');
      process.stdin.on('data', (d) => { buf += d; });
      process.stdin.on('end', () => resolve(buf.trim()));
      process.stdin.on('error', reject);
      process.stdin.resume();
    }
  });
}

const WAIT_ONCE_MS = 90_000;   // --wait 单次预算（宿主 Agent 有界重跑）
const LOGIN_TOTAL_MS = 600_000; // 交互式 login 总预算 10 分钟

// main() 在调用前把 flags 存下来供 login 系列使用
let currentFlags = new Set();

async function cmdLogin(cfg, flags) {
  currentFlags = flags;
  if (flags.has('--paste')) return loginPaste(cfg);
  if (flags.has('--start')) return loginStart(cfg);
  if (flags.has('--wait')) return loginWait(cfg, WAIT_ONCE_MS);
  // 默认（交互式）：start + 持续等待
  await loginStart(cfg);
  console.error('请在浏览器里打开上面的链接并点「授权此设备」——我会在这里等你完成（最多 10 分钟）…');
  const pending = readPending();
  const deadline = Date.now() + LOGIN_TOTAL_MS;
  while (Date.now() < deadline) {
    if (await loginPollOnce(cfg, pending)) return;
    await new Promise((res) => setTimeout(res, 2000));
  }
  fail('等待超时。可以重新运行 "tramito.js login --wait" 继续等（配对 10 分钟内有效）。');
}

async function cmdLogout(cfg) {
  if (fs.existsSync(cfg.configPath)) {
    fs.rmSync(cfg.configPath, { force: true });
    console.log(JSON.stringify({ ok: true, removed: cfg.configPath, message: '本机配置已删除（服务端 Key 不受影响；要吊销请到 Settings → API Keys）。' }));
  } else {
    console.log(JSON.stringify({ ok: true, removed: null, message: '没有本机配置文件，无需操作。' }));
  }
  fs.rmSync(PENDING_FILE(), { force: true });
}

async function cmdLink(cfg, positionals) {
  const id = positionals[0];
  if (!id) fail('用法：tramito.js link <renderId>');
  const r = await api(cfg, 'GET', `/api/v1/bpmn/renders/${id}`);
  if (r.status !== 'succeeded' || !r.viewer) {
    fail(`该转换当前没有可用的查看器链接（status=${r.status ?? 'unknown'}${r.status === 'failed' ? `，${r.errorCode ?? ''}` : ''}；产物过期需重新转换会计次）`);
  }
  console.log(JSON.stringify({ ok: true, id: r.id, viewerUrl: r.viewer.url, expiresAt: r.viewer.expiresAt }));
}

async function cmdDownload(cfg, positionals, opts) {
  const [id, kind] = positionals;
  if (kind === 'png') fail('PNG 不由服务端提供；请在查看器链接（viewerUrl）中一键导出 PNG（浏览器端完成）。');
  if (!id || kind !== 'bpmn') fail('用法：tramito.js download <renderId> bpmn [--out FILE]');
  const r = await api(cfg, 'GET', `/api/v1/bpmn/renders/${id}`);
  if (r.status !== 'succeeded' || !r.artifacts || !r.artifacts.bpmn) {
    fail(`该转换当前不可下载（status=${r.status ?? 'unknown'}${r.status === 'failed' ? `，${r.errorCode ?? ''}；失败不计次，修正后可重新 render` : ''}）`);
  }
  const res = await fetchWithTimeout(r.artifacts.bpmn.url);
  if (!res.ok) {
    // 读服务端结构化错误（artifact_unavailable / invalid_download_token 等），不要塌缩成 download_failed
    const text = await res.text().catch(() => '');
    let serverCode = null;
    let serverMsg = null;
    try {
      const p = JSON.parse(text);
      serverCode = p.error && p.error.code;
      serverMsg = p.error && p.error.message;
    } catch { /* 非 JSON 体 */ }
    const err = new Error(serverMsg || `产物下载失败（HTTP ${res.status}）`);
    err.code = serverCode || (res.status === 410 ? 'artifact_expired' : 'download_failed');
    throw err;
  }
  const out = opts.get('--out') || `tramito-${id.slice(0, 8)}.bpmn`;
  const written = writeOut(out, await res.text());
  console.log(JSON.stringify({ ok: true, written }));
}

/* ────────────── 入口 ────────────── */

function fail(message) {
  console.error(JSON.stringify({ ok: false, error: { code: 'cli_error', message } }, null, 2));
  process.exit(2);
}

const COMMANDS = new Set(['spec', 'validate', 'render', 'usage', 'download', 'link', 'login', 'logout']);

async function main() {
  const [cmd, ...rest] = process.argv.slice(2);
  // 未知命令的报错优先于本地配置问题（用户第一个要改的是命令本身）
  if (!cmd || !COMMANDS.has(cmd)) {
    fail(`未知命令：${cmd || '(空)'}。可用：${[...COMMANDS].join(' | ')}`);
  }
  const { positionals, opts, flags } = parseArgs(rest);
  try {
    const cfg = loadConfig();
    // spec / login / logout 不读已有凭证：配置坏了也能跑（configError 时 baseUrl 已回落默认值）
    if (cmd === 'spec') return await cmdSpec(cfg, opts);
    if (cmd === 'login') return await cmdLogin(cfg, flags);
    if (cmd === 'logout') return await cmdLogout(cfg);
    requireAuth(cfg);
    switch (cmd) {
      case 'validate': return await cmdValidate(cfg, positionals);
      case 'render': return await cmdRender(cfg, positionals, opts);
      case 'usage': return await cmdUsage(cfg);
      case 'download': return await cmdDownload(cfg, positionals, opts);
      case 'link': return await cmdLink(cfg, positionals);
    }
  } catch (e) {
    console.error(JSON.stringify({
      ok: false,
      error: {
        code: String(e.code || 'request_failed'),
        message: e.message,
        ...(e.details && Object.keys(e.details).length > 1 ? { server: e.details } : {}),
      },
    }, null, 2));
    process.exit(1);
  }
}

main();
