# 采购（互斥分支）

提出物料需求 → 库存充足直接领用；不足则创建采购单 → 到货验收 → 不合格办理退货（退回重新采购）。

- `procurement.graph.json` / `procurement.bpmn` / `procurement.png`（PNG 为离线生成的文档素材；线上在查看器内导出）

数据虚构。重新生成：`node ../../skill/scripts/tramito.js render procurement.graph.json`。
