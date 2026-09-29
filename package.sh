#!/usr/bin/env bash
# 打包 WorkBuddy 技能 zip（上传技能市场用）。产物：dist/tramito-bpmn-assistant.zip
set -euo pipefail
cd "$(dirname "$0")"

OUT=dist/tramito-bpmn-assistant.zip
rm -rf dist "$OUT"
mkdir -p dist

# 安全检查（防御性）：v2 起技能已无任何凭证概念，此守卫防止未来误把密钥类内容带进安装包。
# fail-closed：grep 报错（退出码≥2）也视为失败。
# 不做行过滤——占位符 tmt_live_在这里填… 本就匹配不到 20+ 连续 [A-Za-z0-9_-]，任何 -v 都只会误藏真 Key。
# set -e 下 grep 无匹配（退出码 1）是正常路径，必须临时关闭再取真实退出码
set +e
leaks=$(grep -rEn 'tmt_live_[A-Za-z0-9_-]{20,}' skill/ --exclude-dir=node_modules)
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

# 自包含分发：内核 bundle（scripts/engine.mjs）随包发布，运行时无 npm / 无网络。
# node_modules 等本地开发残留不进包（防御性排除）。
(cd skill && zip -r "../$OUT" . -x '*.DS_Store' -x '__MACOSX/*' -x 'node_modules/*' -x '.install-lock/*' -x '.update-check.json' -x 'package-lock.json')
echo "✓ $OUT"
unzip -l "$OUT" | tail -3
