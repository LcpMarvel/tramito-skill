# Tramito 流程图助手 · 公开技能 / 插件

[English](README.md) · 简体中文

官网：**<https://tramito.ai>**

把业务描述变成**标准 BPMN 2.0 文件（.bpmn）+ 在线查看器链接**的可公开安装技能。宿主 Agent 负责理解、建模、修复与交付；Tramito 服务器负责校验、排版与文件生成；图在浏览器里用 bpmn-js 真实渲染，可一键导出 PNG——你不需要懂 JSON、XML 或布局参数。

## 它能做什么

装好后直接对 Agent 说：

- 「员工提交报销，经理审批，超过 5000 元要总经理审，财务发现材料不齐可以退回补材料」→ 得到 `报销流程.bpmn` + 一个打开即见图的查看器链接（页面上一键导出 PNG）
- 「把经理改成部门负责人」→ 基于当前流程修改后交付 v2，旧文件保留
- 「这个流程是什么意思？」→ 直接解释，不消耗转换次数

四个开箱即用的场景（含真实产物与示例图）：

| 场景 | 演示的建模能力 | 示例 |
| --- | --- | --- |
| 报销审批 | 金额边界分支 + 退回路径 | [`examples/expense-approval/`](examples/expense-approval/) |
| 采购 | 互斥分支，每条路径有明确去向 | [`examples/procurement/`](examples/procurement/) |
| 员工入职 | 并行等待（fork + join） | [`examples/employee-onboarding/`](examples/employee-onboarding/) |
| 跨组织订单 | 多池 + 跨池消息流 + 黑盒池 | [`examples/order-fulfillment/`](examples/order-fulfillment/) |

## 安装

### Claude Code（已实测）

```bash
# 用户级安装（所有项目可用）
cp -R skill ~/.claude/skills/tramito-bpmn-assistant
# 或项目级：cp -R skill <project>/.claude/skills/tramito-bpmn-assistant
```

运行环境需要 **Node.js ≥ 18 或 Bun**，以及出站 HTTPS（默认 `https://tramito.ai`）。

### WorkBuddy（已实测）

打包并上传：`./package.sh` 产出 `dist/tramito-bpmn-assistant.zip` → 技能市场 →【添加技能】上传。安装与使用已在 WorkBuddy 宿主内实测通过（2026-09）。细节见 [`docs/workbuddy.md`](docs/workbuddy.md)。

### 配置凭证（必做，技能不内置任何共享 Key）

一条命令完成登录（**不用复制粘贴 Key**）：

```bash
node skill/scripts/tramito.js login
```

- 终端会打印一个链接——在浏览器打开（登录 tramito.ai，没账号就先注册并验证邮箱），确认配对码后点「授权此设备」；配对页自动创建 Key，CLI 自动写入 `~/.tramito/config.json` 并验证。
- 无浏览器的环境（纯 SSH/CI）：`node skill/scripts/tramito.js login --paste` 粘贴 Key（输入不回显，自动写配置）；Key 在 tramito.ai 的 Settings → API Keys 创建。
- 高级用户也可手动配置：环境变量 `TRAMITO_API_KEY`（`TRAMITO_BASE_URL` 可选，自建才改），或直接写 `~/.tramito/config.json`。
- **不要把 Key 发到聊天里、不要写进流程文件或仓库**；泄漏过的 Key 到 Settings → API Keys 撤销。`tramito.js logout` 删除本机配置（服务端 Key 不受影响）。

## 额度与规则（注册即用）

| 事项 | 规则 |
| --- | --- |
| 身份 | 必须注册并使用自己的 API Key；同一账号（组织）所有 Key、所有设备共用额度 |
| 免费额度 | 每月 **200 次**成功转换（UTC 自然月，不结转）；与网页版 AI 生成/修改额度相互独立 |
| 付费 | 已有 Pro / Max 订阅直接用，**转换次数不限**（无隐藏月度上限） |
| 并发 | 免费同时 1 个转换，付费同时 3 个 |
| 计次口径 | 转换成功且 .bpmn 可领取（查看器可用）算 1 次；失败、超时、校验不通过不计次 |
| 产物 | `.bpmn` + 查看器链接；私有、保留 24 小时，期间反复打开/下载不重复计次；PNG 在查看器内由浏览器导出 |
| 单次边界 | 单图 ≤100 节点 / ≤200 连线；请求体 ≤1 MiB；转换超时 30s |

数据边界：流程结构和节点文字会发送到 Tramito 完成转换；不上传聊天记录、无关文件或其它凭证。示例中的公司、人名、金额均为虚构。

## 文档

- 技能定义与工作流：[`skill/SKILL.md`](skill/SKILL.md)
- 输入规范（扁平 ELK-BPMN JSON）：[`skill/references/graph-spec.md`](skill/references/graph-spec.md)
- API 契约与错误码：[`skill/references/api.md`](skill/references/api.md)
- 四场景可复制输入：[`skill/references/scenarios.md`](skill/references/scenarios.md)
- CLI 工具（`render / validate / usage / download / link / spec`）：[`skill/scripts/tramito.js`](skill/scripts/tramito.js)
- WorkBuddy 安装细节：[`docs/workbuddy.md`](docs/workbuddy.md)

## 许可证

MIT — 见 [LICENSE](LICENSE)。
