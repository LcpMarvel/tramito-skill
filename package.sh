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

# WorkBuddy 瘦身版：不带 engine.mjs（zip 保持 KB 级，宿主限制 ≤1.5MB）——
# 用户侧首次运行时 CLI 按 package.json 自动 npm install（见 scripts/tramito.mjs 双路径加载）。
# OpenAI 沙箱需要自包含内核，走另一个产物：./package-openai.sh。
(cd skill && zip -r "../$OUT" . -x '*.DS_Store' -x '__MACOSX/*' -x 'node_modules/*' -x '.install-lock/*' -x '.update-check.json' -x 'package-lock.json' -x 'scripts/engine.mjs')
echo "✓ $OUT"

# 体积守卫：WorkBuddy 上限 1.5MB——瘦身版应在 KB 量级，超限必是误把 bundle 打进来了
SIZE=$(stat -f%z "$OUT" 2>/dev/null || stat -c%s "$OUT")
if [ "$SIZE" -gt 1500000 ]; then
  echo "✗ zip 体积 ${SIZE}B 超过 WorkBuddy 1.5MB 上限（engine.mjs 误入包？）" >&2
  exit 1
fi
unzip -l "$OUT" | tail -3
