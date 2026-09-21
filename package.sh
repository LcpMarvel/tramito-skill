#!/usr/bin/env bash
# 打包 WorkBuddy 技能 zip（上传技能市场用）。产物：dist/tramito-bpmn-assistant.zip
set -euo pipefail
cd "$(dirname "$0")"

OUT=dist/tramito-bpmn-assistant.zip
rm -rf dist "$OUT"
mkdir -p dist

# 安全检查：安装包不得包含任何真实凭证。fail-closed：grep 报错（退出码≥2）也视为失败。
# 不做行过滤——占位符 tmt_live_在这里填… 本就匹配不到 20+ 连续 [A-Za-z0-9_-]，任何 -v 都只会误藏真 Key。
# set -e 下 grep 无匹配（退出码 1）是正常路径，必须临时关闭再取真实退出码
set +e
leaks=$(grep -rEn 'tmt_live_[A-Za-z0-9_-]{20,}' skill/)
status=$?
set -e
if [ $status -ge 2 ]; then
  echo "✗ 凭证检查无法执行（grep 退出码 $status），中止打包" >&2
  exit 1
fi
if [ -n "$leaks" ]; then
  echo "✗ skill/ 内发现疑似真实 API Key（长随机串），中止打包：" >&2
  echo "$leaks" >&2
  exit 1
fi

(cd skill && zip -r "../$OUT" . -x '*.DS_Store' -x '__MACOSX/*')
echo "✓ $OUT"
unzip -l "$OUT" | tail -3
