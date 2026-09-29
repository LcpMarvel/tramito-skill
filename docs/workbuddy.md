# WorkBuddy 安装指引（v1 已实测平台）

## 打包

**用仓库自带的打包脚本**（保证与 release 产物一致：SKILL.md 位于 zip 根目录）：

```bash
cd tramito-skill
./package.sh          # 产出 dist/tramito-bpmn-assistant.zip，并做凭证泄漏守卫检查
```

若上传后解析失败，可尝试改为把 `skill/` 整个目录作为 zip 内的一层（即 zip 根下是 `skill/SKILL.md`）再传一次。上传前请复核 [WorkBuddy Skill 文档](https://open.workbuddy.cn/docs/skill) 的最新要求。

zip 内结构（`package.sh` 产出的根布局；SKILL.md 是 WorkBuddy 唯一必须文件）：

```
（zip 根）
├── SKILL.md            # 必须：frontmatter（name/version/description/description_zh/description_en/author…）+ 工作流指令
├── package.json        # 运行依赖声明（tramito-layout）；首次运行时 CLI 自动安装 @latest
├── references/         # SKILL.md 里用 @references/xxx.md 引用的知识文件
│   ├── graph-spec.md
│   └── scenarios.md
└── scripts/
    └── tramito.mjs     # Agent 用 Bash 执行的本地转换 CLI（Node ≥20 / Bun）
```

注意：**node_modules / lock / 更新时间戳都不进包**——用户侧首次运行时由 CLI 自动安装（见下）。

## 安装

1. WorkBuddy 左侧菜单 →【专家·技能·连接器】→【技能】→【技能市场】。
2. 【添加技能】上传 zip（正式市场连接器属后续独立动作，需另行提交审核，不随本仓库自动发生）。
3. 安装后在对话中直接使用，触发词见 SKILL.md 的 `description`。

## 运行前提（v2：本地编译，无凭证）

- 运行脚本的宿主需要 **Node.js ≥ 20 或 Bun ≥ 1.3**。
- **首次运行需联网**：CLI 检测到技能目录缺 node_modules 时自动安装 tramito-layout@latest（几秒钟）。
- 之后每天至多一次静默检查并自动跟随 tramito-layout 最新版（离线自动跳过）——layout 发版不需要重发技能。立即同步：`node scripts/tramito.mjs update`；关闭后台检查：`TRAMITO_NO_AUTO_UPDATE=1`；镜像：`TRAMITO_REGISTRY=<地址>`。环境自检：`node scripts/tramito.mjs doctor`。
- 无账号、无 API Key、无额度、无配置文件；流程数据不出本机。
- 自动安装失败（离线/代理/目录只读）时，按 CLI stderr 里的手动命令处理：`cd <技能目录> && npm install tramito-layout@latest --omit=dev`。

## 实测状态

- **v1（服务端方案）**：WorkBuddy 宿主与 Claude Code 宿主均实测通过（安装、新建、连续修改、解释不转换的完整闭环）。
- **v2（本地方案，2026-09 重构）**：CLI 层全链路验证（冷启动自动装 @latest / validate / render / doctor / Bun 兼容 / 真实 2.7.1→2.7.2 升级路径 / 打包结构）。**Claude Code 宿主已端到端复测**（2026-09-29，项目级安装 `.claude/skills/`，真实对话完成建模→校验→转换→交付，四泳道十二节点产物验收通过）。WorkBuddy 宿主复测待做，提交市场前先跑一轮。
- 排障备注：headless（`claude -p`）测试技能时，`--allowedTools` 必须包含 `Skill`，否则技能调用被静默拒绝、模型会退回手写 BPMN。
- 平台规则可能变化；提交市场前请复核 [WorkBuddy Skill 文档](https://open.workbuddy.cn/docs/skill)。
