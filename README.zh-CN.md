# Tramito 流程图助手 · 公开技能 / 插件

[![build](https://github.com/LcpMarvel/tramito-skill/actions/workflows/build.yml/badge.svg)](https://github.com/LcpMarvel/tramito-skill/actions/workflows/build.yml)

[English](README.md) · 简体中文

现成的技能 zip 下载：**[Releases](https://github.com/LcpMarvel/tramito-skill/releases)**

把业务描述变成**标准 BPMN 2.0 文件（.bpmn）**的可公开安装技能，**全程本地、完全离线**。宿主 Agent 负责理解、建模、修复与交付；排版内核是开源的 [tramito-layout](https://www.npmjs.com/package/tramito-layout)，负责校验、排版与 XML 生成。无账号、无 API Key、无额度、无网络；**流程数据不出本机**。排版内核**直接打包进技能 zip**——在禁止运行时安装依赖的沙箱宿主（如 ChatGPT 技能）里也能跑。

## 它能做什么

装好后直接对 Agent 说：

- 「员工提交报销，经理审批，超过 5000 元要总经理审，财务发现材料不齐可以退回补材料」→ 得到 `expense.bpmn`——带完整排版的标准 BPMN 2.0 文件
- 「把经理改成部门负责人」→ 基于当前流程修改后交付 v2，旧文件保留
- 「这个流程是什么意思？」→ 直接解释，不做转换

产物用任何标准 BPMN 编辑器打开：[Camunda Modeler](https://camunda.com/download/modeler/)（可导出 PNG/SVG）、[demo.bpmn.io](https://demo.bpmn.io)（把文件拖进页面）、或 VS Code 的 BPMN 预览插件。

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
# 用户级（所有项目可用）
cp -R skill ~/.claude/skills/tramito-bpmn-assistant
# 或项目级：cp -R skill <project>/.claude/skills/tramito-bpmn-assistant
```

### WorkBuddy（已实测）

从 [Releases](https://github.com/LcpMarvel/tramito-skill/releases) 下载 `tramito-bpmn-assistant.zip`（或自己跑 `./package.sh` 打包）→ 技能市场 → 添加技能 → 上传。已在 WorkBuddy 宿主内完成安装与使用实测，详见 [`docs/workbuddy.md`](docs/workbuddy.md)。

### 运行前提

- **Node.js ≥ 20 或 Bun ≥ 1.3**——仅此而已。不需要 npm、不需要联网、不要求目录可写：排版内核已打包在技能内（`scripts/engine.mjs`），完全沙箱环境也能用。
- 无账号、无凭证、无配置文件。

## 工作原理

- Agent 把流程建模成**扁平 ELK-BPMN JSON**（pools / lanes / nodes / edges——无坐标、不嵌套），然后跑自带 CLI：`validate` → 按 issue 提示修正 → `render`。
- [tramito-layout](https://github.com/LcpMarvel/tramito-layout) 是一个编译器：`validateFlat()` 是前端（清晰可改的诊断信息），ELK 摆位 + 自研边路由 + 序列化是后端。输出字节级确定性——同一份图永远编译出同一份 XML。
- `render` 写出 `<name>.bpmn` + `<name>.graph.json`（可修改源）。已存在的文件绝不覆盖（自动加 `-v2`/`-v3`）。
- 内核**随技能发布打包并锁定版本**（`tools/build-engine.mjs` 重新生成）。tramito-layout 出新版时重打 bundle、发新技能版本即可；CI 会重建 bundle 与提交文件 diff 防漂移，并在 npm 有更新版本时给出提示。

## 文档

- 技能定义与工作流：[`skill/SKILL.md`](skill/SKILL.md)
- 输入规范（扁平 ELK-BPMN JSON）：[`skill/references/graph-spec.md`](skill/references/graph-spec.md)
- 可直接复制的场景输入：[`skill/references/scenarios.md`](skill/references/scenarios.md)
- CLI（`validate / render / doctor`）：[`skill/scripts/tramito.mjs`](skill/scripts/tramito.mjs)
- 排版内核：[tramito-layout（npm）](https://www.npmjs.com/package/tramito-layout) · [GitHub](https://github.com/LcpMarvel/tramito-layout)
- WorkBuddy 安装细节：[`docs/workbuddy.md`](docs/workbuddy.md)

## 许可

MIT——见 [LICENSE](LICENSE)。
