# 跨组织订单（多池 + 消息流）

客户下单/支付 → 商家确认/备货/发货 → 第三方物流配送（黑盒池，不展示内部）。跨池通信是消息流（虚线），不是顺序流。

- `order-fulfillment.graph.json` / `order-fulfillment.bpmn` / `order-fulfillment.png`（PNG 为离线生成的文档素材；线上在查看器内导出）

数据虚构。重新生成：`node ../../skill/scripts/tramito.js render order-fulfillment.graph.json`。
