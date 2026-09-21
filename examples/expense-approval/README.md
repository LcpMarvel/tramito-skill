# 报销审批（边界条件 + 退回路径）

员工提交报销 → 经理审批 → 超过 5000 元加总经理审批 → 财务打款；材料不齐时财务退回员工补材料。

- `expense-approval.graph.json` — 可修改源（扁平 ELK-BPMN JSON）
- `expense-approval.bpmn` — 标准 BPMN 2.0（含排版，可在 bpmn.io / Camunda 打开）
- `expense-approval.png` — 图片（离线用 bpmn-js 生成的文档素材；线上产物以查看器页面为准，PNG 在查看器内导出）

数据虚构。重新生成：`node ../../skill/scripts/tramito.js render expense-approval.graph.json`。
