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
├── package.json        # 技能元数据（无运行时依赖）
├── references/         # SKILL.md 里用 @references/xxx.md 引用的知识文件
│   ├── graph-spec.md
│   └── scenarios.md
└── scripts/
    ├── tramito.mjs     # Agent 用 Bash 执行的本地转换 CLI（Node ≥20 / Bun）
    └── engine.mjs      # 打包好的排版内核（tramito-layout + elkjs + bpmn-moddle，~5MB，构建产物）
```

注意：**自包含分发**——内核随 zip 打包，运行时不 npm、不联网、不需要 node_modules（沙箱宿主如 ChatGPT 技能同样可用）。

## 安装

1. WorkBuddy 左侧菜单 →【专家·技能·连接器】→【技能】→【技能市场】。
2. 【添加技能】上传 zip（正式市场连接器属后续独立动作，需另行提交审核，不随本仓库自动发生）。
3. 安装后在对话中直接使用，触发词见 SKILL.md 的 `description`。

## 运行前提（v2.1 起自包含，无凭证）

- 运行脚本的宿主只需要 **Node.js ≥ 20 或 Bun ≥ 1.3**。不 npm、不联网、不要求目录可写——排版内核已随技能打包（`scripts/engine.mjs`）。
- 无账号、无 API Key、无额度、无配置文件；流程数据不出本机。
- 环境自检：`node scripts/tramito.mjs doctor`（报告运行时与打包内核版本并编译冒烟图）。
- 升级内核 = 仓库里重跑 `node tools/build-engine.mjs [版本号]`、按需重生成示例基线、发新技能版本。

## 实测状态

- **v1（服务端方案）**：WorkBuddy 宿主与 Claude Code 宿主均实测通过（安装、新建、连续修改、解释不转换的完整闭环）。
- **v2（本地方案，2026-09 重构）**：CLI 层全链路验证（validate / render / doctor / Bun 兼容 / 打包结构）。**Claude Code 宿主已端到端复测**（2026-09-29，项目级安装 `.claude/skills/`，真实对话完成建模→校验→转换→交付，四泳道十二节点产物验收通过）。WorkBuddy 宿主复测待做，提交市场前先跑一轮。
- **v2.1（自包含 bundle，2026-09-29）**：为兼容禁止运行时安装的沙箱宿主（如 ChatGPT 技能），去掉 npm bootstrap，内核打包进 zip；无 node_modules 环境裸跑验证通过。
- 排障备注：headless（`claude -p`）测试技能时，`--allowedTools` 必须包含 `Skill`，否则技能调用被静默拒绝、模型会退回手写 BPMN。
- 平台规则可能变化；提交市场前请复核 [WorkBuddy Skill 文档](https://open.workbuddy.cn/docs/skill)。
