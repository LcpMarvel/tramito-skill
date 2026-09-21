# Tramito JSON 转换 API v1 契约

Base URL：用户配置的 `TRAMITO_BASE_URL`（默认 `https://tramito.ai`）。所有需鉴权的请求带 `Authorization: Bearer tmt_live_...`。
数据边界：只发送流程 JSON（结构 + 节点文字）；不上传聊天记录、无关文件或其它凭证。

## 端点

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| GET | `/api/v1/bpmn/spec` | 公开 | 输入规范版本 + 全文 + 容量边界 |
| POST | `/api/v1/bpmn/validate` | Bearer | 结构校验，**不计转换次数**（限速 60 次/分/组织） |
| POST | `/api/v1/bpmn/render` | Bearer + 邮箱已验证 | JSON → .bpmn + 查看器链接，成功计 1 次 |
| GET | `/api/v1/bpmn/renders/:id` | Bearer | 查询/恢复某次转换结果（不再扣次） |
| GET | `/api/v1/bpmn/renders/:id/artifacts/bpmn` | Bearer（org 匹配）或 `?token=` 凭证 | 下载 .bpmn（响应带 `x-expires-at`）；保留期内下载不扣次 |
| GET | `/api/v1/usage` | Bearer | 本月转换额度、并发、重置时间（与网页 AI 额度独立） |

## POST /api/v1/bpmn/render

请求体：

```json
{
  "graph": { "nodes": [ ... ], "edges": [ ... ], "pools": [ ... ], "lanes": [ ... ] },
  "idempotencyKey": "客户端生成的唯一键（8–200 字符，可选但强烈建议）"
}
```

- `idempotencyKey`：同一组织内 24 小时窗口，**相同键 + 相同内容** → 返回同一结果、只计 1 次；处理中重试不启动第二份转换；相同键 + 不同内容 → `409 idempotency_conflict`；窗口过期后 → `409 idempotency_window_expired`（换新键重新转换会计次）。

成功响应（200）：

```json
{
  "id": "dc6a9437-...",
  "status": "succeeded",
  "graphVersion": "elk-bpmn-flat@1",
  "bpmn": "<?xml version=\"1.0\"...",
  "artifacts": {
    "bpmn": { "url": "https://.../api/v1/bpmn/renders/.../artifacts/bpmn?token=...", "expiresAt": "...", "bytes": 9237 }
  },
  "viewer": {
    "url": "https://tramito.ai/view/dc6a9437-...?token=...",
    "expiresAt": "2026-09-22T17:13:54.560Z",
    "note": "在浏览器打开即可查看（bpmn-js 渲染）并导出 PNG；加 &embed=1 得到无界面版本。"
  },
  "expiresAt": "2026-09-22T17:13:54.560Z",
  "warnings": [],
  "usage": { "plan": "free", "unlimited": false, "limit": 200, "used": 1, "remaining": 199, "resetAt": "2026-10-01T00:00:00.000Z", "concurrencyLimit": 1, "concurrencyInFlight": 0 }
}
```

- `bpmn` 内联返回完整 XML；`artifacts.bpmn.url` 携带下载凭证。
- **查看器**：`viewer.url` 是前端公开路由 `/view/:id?token=`——无需登录，bpmn-js 只读渲染，
  页面自带「下载 .bpmn / 导出 PNG」（PNG 在用户浏览器端由 SVG 栅格化，服务端不做图像渲染）。
  凭证有效期与产物保留期对齐（≤24h）。`&embed=1` 返回无页头页脚版本，供宿主 iframe 嵌入。
- 服务端不提供 PNG 文件：请求 `artifacts/png` 返回 `404 artifact_not_provided`（指引去查看器导出）。
- 处理中命中幂等键 → `202 { "id", "status": "processing", "retryAfterMs": 2000 }`。

## 额度与并发（按组织计，所有 Key/设备共用）

| 套餐 | 每月成功转换 | 并发 |
| --- | --- | --- |
| Free | 200 次（UTC 自然月，不结转；第 200 次放行，第 201 次拒绝） | 同时 1 个 |
| Pro / Max | 不限（仍统计用量） | 同时 3 个 |

- 计次口径：**转换成功且 .bpmn 可领取（查看器链接可用）**才算 1 次；鉴权失败、校验失败、超时、转换失败、并发拒绝都不计次。
- 失败/超时的在途占位自动释放，不会永久占住额度或并发名额。
- 降级到 Free 后按本月全部成功转换计算 200 次余额；升级后下次请求即用新权益，无需换 Key。

## 错误码（`error.code`，全部形如 `{ "error": { "code", "message", ... } }`）

| code | HTTP | 含义 / 附加字段 |
| --- | --- | --- |
| `unauthenticated` | 401 | 未带凭证 |
| `invalid_api_key` | 401 | Key 无效或已撤销 |
| `email_not_verified` | 403 | 需先完成邮箱验证 |
| `invalid_json` / `validation_error` | 400 | 请求体不合法 |
| `graph_invalid` | 400 | 结构校验失败；附 `issues[]`（severity/code/message/elementId/hint） |
| `graph_too_large` | 413 | 超 100 节点 / 200 边；附 nodes/edges/max 值 |
| `request_too_large` | 413 | 请求体超 1 MiB |
| `quota_exceeded` | 402 | 本月免费额度用完；附 `usage`、`upgradeUrl` |
| `concurrency_limit` | 429 | 并发满；附 `retryAfterMs`、`concurrencyLimit` |
| `rate_limited` | 429 | 校验/查询限速；附 `retryAfterMs` |
| `idempotency_conflict` | 409 | 同键不同内容 |
| `idempotency_window_expired` | 409 | 幂等窗口（=产物保留期）已过 |
| `render_timeout` | 504 | 服务端转换超时（上限 30s，客户端超时建议 ≥45s） |
| `render_failed` | 500 | 转换失败（不计次） |
| `invalid_download_token` | 401 | 下载/查看凭证无效/过期 |
| `artifact_expired` | 410 | 产物已过 24h 保留期 |
| `artifact_unavailable` | 404 | 无产物或已清理 |
| `artifact_not_provided` | 404 | 请求了服务端 PNG——请在查看器中导出（2026-09-21 起服务端不出图像文件） |
| `not_found` | 404 | 转换记录不存在或不属于当前账号 |

## 产物生命周期

- 私有：仅账号本人（org 匹配）或持下载/查看凭证者可读；凭证 ≠ 公开分享。
- 保留 24 小时，期间可经 `GET /renders/:id` 恢复结果、反复打开查看器、反复下载 .bpmn，不扣次。
- 过期后只能重新转换（会计 1 次）；服务端不会自动重建。查看器对过期产物显示明确的过期说明。
