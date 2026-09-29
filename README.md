# Tramito BPMN Assistant · Public Skill / Plugin

[![build](https://github.com/LcpMarvel/tramito-skill/actions/workflows/build.yml/badge.svg)](https://github.com/LcpMarvel/tramito-skill/actions/workflows/build.yml)

English · [简体中文](README.zh-CN.md)

Download the ready-made skill zip: **[Releases](https://github.com/LcpMarvel/tramito-skill/releases)**

A publicly installable skill that turns business descriptions into **standard BPMN 2.0 files (.bpmn)** — **fully local and offline**. The host agent handles understanding, modeling, fixing and delivery; the layout engine ([tramito-layout](https://www.npmjs.com/package/tramito-layout), open source) handles validation, layout and XML generation. No account, no API key, no quota, no network; process data never leaves the machine. The engine is **bundled into the skill zip**, so it runs in sandboxed hosts that forbid runtime installs (e.g. ChatGPT skills).

## What it does

Try saying to your agent:

- *"Expense report: employee submits, manager approves, amounts over 5000 need the GM, finance can return it for missing documents"* → you get `expense.bpmn` — a standard BPMN 2.0 file with full layout.
- *"Rename manager to department head"* → a v2 based on the current source; the previous files are kept.
- *"What does this flow do?"* → a plain answer, converting nothing.

Open the result in any standard BPMN editor — [Camunda Modeler](https://camunda.com/download/modeler/) (exports PNG/SVG), [demo.bpmn.io](https://demo.bpmn.io) (drag the file onto the page), or a VS Code BPMN preview extension.

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

### WorkBuddy (tested)

Download `tramito-bpmn-assistant.zip` from [Releases](https://github.com/LcpMarvel/tramito-skill/releases) (or build it yourself with `./package.sh`) → Skills marketplace → Add skill → upload. This is the **slim flavor** (KB-sized, within WorkBuddy's 1.5 MB limit): the layout engine is **not** in the zip — on the first run the CLI installs it automatically via npm (per `package.json`, one-time network access). Install and usage verified in the WorkBuddy host. Details in [`docs/workbuddy.md`](docs/workbuddy.md).

### OpenAI (ChatGPT / Codex) — Skills-only plugin

The same skill ships as an OpenAI plugin: download **`tramito-bpmn-assistant-openai.zip`** from [Releases](https://github.com/LcpMarvel/tramito-skill/releases) (or build it with `./package-openai.sh`). The zip root contains:

```
.codex-plugin/plugin.json    # plugin manifest (no MCP servers — Skills only)
skills/tramito-bpmn-assistant/  # the skill itself (bundled engine included)
```

This is the **bundled flavor** (≈1.3 MB zip, engine inside): no runtime `npm install`, no network access, no account — exactly what sandboxed plugin hosts require. Submit it in the OpenAI Plugin Submission Portal as **Create plugin → Skills only** (do not choose an MCP variant). Building the zip yourself: `./package-openai.sh` (includes version-sync, credential/local-path guards, a staging smoke test, and a post-zip verification that runs `doctor` from the unzipped environment).

### Requirements

- **Node.js ≥ 20 or Bun ≥ 1.3**.
- **Bundled flavor** (OpenAI zip): nothing else — no npm, no network, no writable requirements; works in fully sandboxed environments.
- **Slim flavor** (WorkBuddy zip): npm network access on first run — the CLI installs the layout engine automatically (one time, a few seconds), then runs offline. Manual fallback: `cd <skill dir> && npm install --omit=dev`.
- No account, no credentials, no configuration files.

## How it works

- The agent models the process as **flat ELK-BPMN JSON** (pools / lanes / nodes / edges — no coordinates, no nesting), then runs the bundled CLI: `validate` → fix per issue hints → `render`.
- [tramito-layout](https://github.com/LcpMarvel/tramito-layout) is a compiler: `validateFlat()` is the front end (clear, fixable diagnostics), ELK placement + a custom edge router + serializer are the back end. Output is byte-for-byte deterministic — the same graph always compiles to the same XML.
- `render` writes `<name>.bpmn` + `<name>.graph.json` (the editable source). Existing files are never overwritten (`-v2`/`-v3` suffixes).
- **Two distribution flavors, one CLI**: the OpenAI zip carries the engine bundled (`scripts/engine.mjs`, pinned per release via `tools/build-engine.mjs`); the WorkBuddy zip stays KB-sized and installs the engine from npm on first run (spec pinned in `package.json`, e.g. `~2.8.1`). The CLI auto-detects which flavor it is running.

## Documentation

- Skill definition & workflow: [`skill/SKILL.md`](skill/SKILL.md)
- Input spec (flat ELK-BPMN JSON): [`skill/references/graph-spec.md`](skill/references/graph-spec.md)
- Copy-paste scenario inputs: [`skill/references/scenarios.md`](skill/references/scenarios.md)
- CLI (`validate / render / doctor`): [`skill/scripts/tramito.mjs`](skill/scripts/tramito.mjs)
- Layout engine: [tramito-layout on npm](https://www.npmjs.com/package/tramito-layout) · [GitHub](https://github.com/LcpMarvel/tramito-layout)
- WorkBuddy install details: [`docs/workbuddy.md`](docs/workbuddy.md)

## License

MIT — see [LICENSE](LICENSE).
