# Tramito BPMN Assistant · Public Skill / Plugin

[![build](https://github.com/LcpMarvel/tramito-skill/actions/workflows/build.yml/badge.svg)](https://github.com/LcpMarvel/tramito-skill/actions/workflows/build.yml)

English · [简体中文](README.zh-CN.md)

Download the ready-made skill zip: **[Releases](https://github.com/LcpMarvel/tramito-skill/releases)**

A publicly installable skill that turns business descriptions into **standard BPMN 2.0 files (.bpmn)** — **fully local**. The host agent handles understanding, modeling, fixing and delivery; the layout engine ([tramito-layout](https://www.npmjs.com/package/tramito-layout), open source) handles validation, layout and XML generation. No account, no API key, no quota; process data never leaves the machine. The engine **follows tramito-layout@latest** — layout releases reach installed skills automatically, no skill re-publishing needed.

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

Download `tramito-bpmn-assistant.zip` from [Releases](https://github.com/LcpMarvel/tramito-skill/releases) (or build it yourself with `./package.sh`) → Skills marketplace → Add skill → upload. Install and usage verified in the WorkBuddy host. Details in [`docs/workbuddy.md`](docs/workbuddy.md).

### Requirements

- **Node.js ≥ 20 or Bun ≥ 1.3**, plus **npm network access on first run** — the CLI installs tramito-layout@latest automatically (a few seconds).
- Afterwards a silent update check contacts the npm registry at most once a day and installs newer tramito-layout releases; offline machines simply skip it. Opt out with `TRAMITO_NO_AUTO_UPDATE=1`; point `TRAMITO_REGISTRY=<url>` at a mirror so check and install use the same source. Sync immediately with `node scripts/tramito.mjs update`.
- The skill directory must be writable (that's where `node_modules` lands). No writable directory? Run it manually: `cd <skill dir> && npm install tramito-layout@latest --omit=dev`.
- No account, no credentials, no configuration files.

## How it works

- The agent models the process as **flat ELK-BPMN JSON** (pools / lanes / nodes / edges — no coordinates, no nesting), then runs the bundled CLI: `validate` → fix per issue hints → `render`.
- [tramito-layout](https://github.com/LcpMarvel/tramito-layout) is a compiler: `validateFlat()` is the front end (clear, fixable diagnostics), ELK placement + a custom edge router + serializer are the back end. Output is byte-for-byte deterministic — the same graph always compiles to the same XML.
- `render` writes `<name>.bpmn` + `<name>.graph.json` (the editable source). Existing files are never overwritten (`-v2`/`-v3` suffixes).
- **Engine updates are decoupled from skill releases**: the skill always follows tramito-layout@latest (daily background check; see Requirements). CI re-renders the examples against @latest on every run, so layout changes that alter output surface there first.

## Documentation

- Skill definition & workflow: [`skill/SKILL.md`](skill/SKILL.md)
- Input spec (flat ELK-BPMN JSON): [`skill/references/graph-spec.md`](skill/references/graph-spec.md)
- Copy-paste scenario inputs: [`skill/references/scenarios.md`](skill/references/scenarios.md)
- CLI (`validate / render / update / doctor`): [`skill/scripts/tramito.mjs`](skill/scripts/tramito.mjs)
- Layout engine: [tramito-layout on npm](https://www.npmjs.com/package/tramito-layout) · [GitHub](https://github.com/LcpMarvel/tramito-layout)
- WorkBuddy install details: [`docs/workbuddy.md`](docs/workbuddy.md)

## License

MIT — see [LICENSE](LICENSE).
