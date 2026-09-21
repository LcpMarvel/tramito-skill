# WorkBuddy 安装指引（目标平台，宿主实测待完成）

## 打包

**用仓库自带的打包脚本**（保证与 release 产物一致：SKILL.md 位于 zip 根目录）：

```bash
cd tramito-skill
./package.sh          # 产出 dist/tramito-bpmn-assistant.zip，并检查无真实凭证混入
```

若上传后解析失败，可尝试改为把 `skill/` 整个目录作为 zip 内的一层（即 zip 根下是 `skill/SKILL.md`）再传一次——WorkBuddy 导入器对两种布局的兼容性尚未在宿主内验证（B40 待办）。上传前请复核 [WorkBuddy Skill 文档](https://open.workbuddy.cn/docs/skill) 的最新要求。

zip 内结构（`package.sh` 产出的根布局；SKILL.md 是 WorkBuddy 唯一必须文件）：

```
（zip 根）
├── SKILL.md            # 必须：frontmatter（name/version/description/description_zh/description_en/author…）+ 工作流指令
├── references/         # SKILL.md 里用 @references/xxx.md 引用的知识文件
│   ├── graph-spec.md
│   ├── api.md
│   └── scenarios.md
├── scripts/
│   └── tramito.js      # Agent 用 Bash 执行的调用脚本（零依赖，Node ≥18 / Bun）
└── templates/
    └── config.example.json
```

## 安装

1. WorkBuddy 左侧菜单 →【专家·技能·连接器】→【技能】→【技能市场】。
2. 【添加技能】上传 zip（正式市场连接器属后续独立动作，需另行提交审核，不随本仓库自动发生）。
3. 安装后在对话中直接使用，触发词见 SKILL.md 的 `description`。

## 凭证配置（用户自填，技能不内置）

1. [tramito.ai](https://tramito.ai) 注册 → 验证邮箱 → Settings → **API Keys** 创建 Key（`tmt_live_` 开头）。
2. 二选一：
   - 环境变量：`TRAMITO_API_KEY`（必须）、`TRAMITO_BASE_URL`（可选，默认官方地址；仅自建/私有部署时改）。
   - 配置文件 `~/.tramito/config.json`：`{"apiKey": "tmt_live_...", "baseUrl": "https://tramito.ai"}`。
3. 不要把完整 Key 发到聊天里；泄漏过的 Key 到 API Keys 页撤销重建。

## 运行前提

- 运行脚本的宿主需要 **Node.js ≥ 18 或 Bun**（`node scripts/tramito.js usage` 自检）。
- 需要能访问 `TRAMITO_BASE_URL`（默认 `https://tramito.ai`）的出站 HTTPS。

## 实测状态

- **Claude Code 宿主**：已实测通过（技能装进 `.claude/skills/`，真实对话完成 新建 → 连续修改 → 解释不扣次 的完整闭环）。
- **WorkBuddy 宿主**：尚未实测——目前完成的是本地全链路验证（CLI 对真实 API 的 render/validate/usage/download，查看器页面浏览器实测），WorkBuddy 内的安装与运行待验证。平台规则可能变化；提交市场前请复核 [WorkBuddy Skill 文档](https://open.workbuddy.cn/docs/skill)。
