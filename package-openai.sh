#!/usr/bin/env bash
# 打包 OpenAI Skills-only Plugin（.codex-plugin/ + skills/ 布局）。
# 产物：dist/tramito-bpmn-assistant-openai.zip —— 运行时零 npm / 零网络 / 零 node_modules。
# 约束（见 docs：OpenAI 插件发布指南）：Skills-only，不添加 MCP，不依赖远程服务。
set -euo pipefail
cd "$(dirname "$0")"

STAGE=build/openai-plugin
OUT=dist/tramito-bpmn-assistant-openai.zip
SKILL_DIR=skills/tramito-bpmn-assistant

# SKILL.md frontmatter 守卫：未加引号的值含 ": " 会让宿主 YAML 解析失败（v2.3.0 曾中招）
node tools/check-frontmatter.mjs

rm -rf "$STAGE" "$OUT"
mkdir -p "$STAGE/.codex-plugin" "$STAGE/$SKILL_DIR"

# 1) 版本一致性：plugin.json 与 skill/package.json 必须同版（防半升级发布）
PLUGIN_VER=$(node -p "require('./.codex-plugin/plugin.json').version")
SKILL_VER=$(node -p "require('./skill/package.json').version")
if [ "$PLUGIN_VER" != "$SKILL_VER" ]; then
  echo "✗ 版本不一致：plugin.json=$PLUGIN_VER skill/package.json=$SKILL_VER" >&2
  exit 1
fi

# 2) engine.mjs 必须存在（自包含内核；重建用 tools/build-engine.mjs）
if [ ! -f skill/scripts/engine.mjs ]; then
  echo "✗ 缺 skill/scripts/engine.mjs——先运行 node tools/build-engine.mjs" >&2
  exit 1
fi

# 3) 组装 staging：manifest + skill 运行时文件（排除开发残留）
cp .codex-plugin/plugin.json "$STAGE/.codex-plugin/plugin.json"
(cd skill && tar -cf - --exclude node_modules --exclude .install-lock --exclude .update-check.json --exclude package-lock.json .) | (cd "$STAGE/$SKILL_DIR" && tar -xf -)

# 4) 安全检查（fail-closed）：凭证 / .env / 本机绝对路径不得进包
set +e
leaks=$(grep -rEn 'tmt_live_[A-Za-z0-9_-]{20,}' "$STAGE" ; grep -rEn '/Users/[a-z]+|/Volumes/[a-z]+|/home/[a-z]+' "$STAGE" --include='*.json' --include='*.md' --include='*.mjs' | grep -v 'engine.mjs' ; true)
env_files=$(find "$STAGE" -name '.env*' -not -type d)
set -e
if [ -n "$leaks" ] || [ -n "$env_files" ]; then
  echo "✗ 安全检查失败（凭证/本机路径/.env）：" >&2
  echo "$leaks" >&2; echo "$env_files" >&2
  exit 1
fi
# engine.mjs 单独查本机路径（base64 大文件，只查真实泄漏形态）
if grep -qE '/Users/lcp|/Volumes/lcp|/home/lcp' "$STAGE/$SKILL_DIR/scripts/engine.mjs"; then
  echo "✗ engine.mjs 内发现本机绝对路径" >&2
  exit 1
fi

# 5) staging 冒烟：doctor 必须跑通完整编译管线
node "$STAGE/$SKILL_DIR/scripts/tramito.mjs" doctor | grep -q '"ok": true'

# 6) 打包（zip 根直接是 .codex-plugin/ + skills/，不多包一层）
mkdir -p dist
(cd "$STAGE" && zip -qr "$OLDPWD/$OUT" .codex-plugin skills -x '*.DS_Store' -x '__MACOSX/*')
echo "✓ $OUT"

# 7) 解压回验：结构 + 无 node_modules + 解压环境再跑一次 doctor
VRF=$(mktemp -d)
trap 'rm -rf "$VRF"' EXIT
unzip -q "$OUT" -d "$VRF"
[ -f "$VRF/.codex-plugin/plugin.json" ] || { echo "✗ zip 根缺 .codex-plugin/plugin.json" >&2; exit 1; }
[ -f "$VRF/$SKILL_DIR/SKILL.md" ] || { echo "✗ zip 根布局错误（SKILL.md 不在 skills/ 下）" >&2; exit 1; }
[ -f "$VRF/$SKILL_DIR/scripts/engine.mjs" ] || { echo "✗ zip 缺 engine.mjs" >&2; exit 1; }
if unzip -l "$OUT" | grep -q 'node_modules'; then echo "✗ zip 混入 node_modules" >&2; exit 1; fi
node "$VRF/$SKILL_DIR/scripts/tramito.mjs" doctor | grep -q '"ok": true'
echo "✓ 解压回验通过（结构与 doctor）"
unzip -l "$OUT" | tail -3
