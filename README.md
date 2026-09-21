# Tramito BPMN Assistant · Public Skill / Plugin

English · [简体中文](README.zh-CN.md)

Official site: **<https://tramito.ai>**

A publicly installable skill that turns business descriptions into **standard BPMN 2.0 files (.bpmn) plus an online viewer link**. The host agent handles understanding, modeling, fixing and delivery; the Tramito server handles validation, layout and file generation; diagrams render in the browser via bpmn-js with one-click PNG export — no JSON/XML/layout knowledge required.

## What it does

Try saying to your agent:

- *"Expense report: employee submits, manager approves, amounts over 5000 need the GM, finance can return it for missing documents"* → you get `expense.bpmn` plus a link that opens the diagram in your browser (with a one-click PNG export).
- *"Rename manager to department head"* → a v2 based on the current source; the previous files are kept.
- *"What does this flow do?"* → a plain answer, consuming nothing.

Four ready-to-use scenarios (with real artifacts and sample images):

| Scenario | Modeling capabilities shown | Example |
| --- | --- | --- |
| Expense approval | threshold branch + return path | [`examples/expense-approval/`](examples/expense-approval/) |
| Procurement | exclusive branches, every path resolves | [`examples/procurement/`](examples/procurement/) |
| Employee onboarding | parallel fork + join | [`examples/employee-onboarding/`](examples/employee-onboarding/) |
| Cross-org order | pools + message flows + black-box pool | [`examples/order-fulfillment/`](examples/order-fulfillment/) |

## Install

### Claude Code (tested)

```bash
# user-level (available in all projects)
cp -R skill ~/.claude/skills/tramito-bpmn-assistant
# or project-level: cp -R skill <project>/.claude/skills/tramito-bpmn-assistant
```

Requires **Node.js ≥ 18 or Bun** and outbound HTTPS (default `https://tramito.ai`).

### WorkBuddy (tested)

Package and upload: `./package.sh` produces `dist/tramito-bpmn-assistant.zip` → Skills marketplace → Add skill → upload. Install and usage verified in the WorkBuddy host (2026-09). Details in [`docs/workbuddy.md`](docs/workbuddy.md).

### Configure your own credentials (required — no shared key is bundled)

1. Register at [tramito.ai](https://tramito.ai) and verify your email.
2. Create a key at Settings → API Keys (`tmt_live_` prefix).
3. Configure (env vars recommended; never paste keys into chat, files or repos):

```bash
export TRAMITO_API_KEY=tmt_live_yourkey
export TRAMITO_BASE_URL=https://tramito.ai   # only for self-hosted deployments
```

or write `~/.tramito/config.json`: `{"apiKey": "tmt_live_...", "baseUrl": "https://tramito.ai"}`.

## Quota (per account/org, shared across all keys & devices)

- Free: **200 successful conversions per month** (UTC calendar month, no rollover) — independent from the web editor's AI quota.
- Pro/Max: unlimited conversions, no hidden caps. Concurrency: 1 (free) / 3 (paid).
- A conversion counts only when it succeeds and the .bpmn (plus viewer link) is deliverable; failures, timeouts and validation errors never count.
- Artifacts are private, retained 24 h, re-openable within that window at no extra charge; PNG export happens in the viewer (browser-side).
- Limits per request: ≤100 nodes / ≤200 edges, ≤1 MiB body, 30 s server timeout.

Data boundary: only the process structure and node texts are sent to Tramito — never chat history, unrelated files or other credentials. All example data is fictional.

## Documentation

- Skill definition & workflow: [`skill/SKILL.md`](skill/SKILL.md)
- Input spec (flat ELK-BPMN JSON): [`skill/references/graph-spec.md`](skill/references/graph-spec.md)
- API contract & error codes: [`skill/references/api.md`](skill/references/api.md)
- Copy-paste scenario inputs: [`skill/references/scenarios.md`](skill/references/scenarios.md)
- CLI (`render / validate / usage / download / link / spec`): [`skill/scripts/tramito.js`](skill/scripts/tramito.js)
- WorkBuddy install details: [`docs/workbuddy.md`](docs/workbuddy.md)

## License

MIT — see [LICENSE](LICENSE).
