#!/usr/bin/env bash
# 打包 WorkBuddy 技能 zip（上传技能市场用）。产物：dist/tramito-bpmn-assistant.zip
set -euo pipefail
cd "$(dirname "$0")"

OUT=dist/tramito-bpmn-assistant.zip
rm -rf dist "$OUT"
mkdir -p dist

# 安全检查：安装包不得包含任何真实凭证（文档里的前缀说明/占位符不算）
if grep -rEn 'tmt_live_[A-Za-z0-9_-]{20,}' skill/ 2>/dev/null | grep -v '在这里填'; then
  echo "✗ skill/ 内发现疑似真实 API Key（长随机串），中止打包" >&2
  exit 1
fi

(cd skill && zip -r "../$OUT" . -x '*.DS_Store' -x '__MACOSX/*')
echo "✓ $OUT"
unzip -l "$OUT" | tail -3
