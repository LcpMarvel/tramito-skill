# 四个开箱即用的业务场景

以下 JSON 可直接复制为 `*.graph.json` 交给 `node scripts/tramito.js render` 使用（数据均为虚构）。
每个场景同时是**建模语义**的范例：边界条件、互斥分支、并行等待、跨组织消息、退回路径。

仓库根目录 `examples/` 内有这些场景的真实产物（`.graph.json` / `.bpmn`；`.png` 为离线用 bpmn-js 生成的文档素材——线上转换在查看器页面中查看与导出 PNG）。

## 场景 A — 报销审批（边界条件 + 退回）

员工提交报销，经理审批；**超过 5000 元**需总经理审批，否则直接到财务；财务发现材料不齐可退回员工补材料。

要点：`amount > 5000` 本身走"超过"分支（边界值归普通路径还是超限路径要按业务问清，本例按"超过"= 严格大于）；退回路径 `flow_23` 从"通知补材料"接回"填写报销单"。

```json
{
  "pools": [{ "id": "pool_1", "name": "公司" }],
  "lanes": [
    { "id": "lane_2", "name": "申请人", "pool": "pool_1" },
    { "id": "lane_3", "name": "审批人", "pool": "pool_1" },
    { "id": "lane_4", "name": "财务", "pool": "pool_1" }
  ],
  "nodes": [
    { "id": "start_5", "type": "startEvent", "name": "提交报销", "lane": "lane_2" },
    { "id": "task_6", "type": "userTask", "name": "填写报销单", "lane": "lane_2" },
    { "id": "task_7", "type": "userTask", "name": "经理审批", "lane": "lane_3" },
    { "id": "gateway_8", "type": "exclusiveGateway", "name": "金额是否超过5000元", "lane": "lane_3", "default": "flow_18" },
    { "id": "task_9", "type": "userTask", "name": "总经理审批", "lane": "lane_3" },
    { "id": "gateway_11", "type": "exclusiveGateway", "name": "材料是否齐全", "lane": "lane_4", "default": "flow_22" },
    { "id": "task_10", "type": "serviceTask", "name": "财务打款", "lane": "lane_4" },
    { "id": "task_12", "type": "sendTask", "name": "通知补材料", "lane": "lane_4" },
    { "id": "end_13", "type": "endEvent", "name": "报销完成", "lane": "lane_4" }
  ],
  "edges": [
    { "id": "flow_14", "source": "start_5", "target": "task_6" },
    { "id": "flow_15", "source": "task_6", "target": "task_7" },
    { "id": "flow_16", "source": "task_7", "target": "gateway_8" },
    { "id": "flow_17", "source": "gateway_8", "target": "task_9", "name": "超过5000元", "condition": "${amount > 5000}" },
    { "id": "flow_18", "source": "gateway_8", "target": "gateway_11", "name": "不超过5000元", "isDefault": true },
    { "id": "flow_19", "source": "task_9", "target": "gateway_11" },
    { "id": "flow_20", "source": "gateway_11", "target": "task_10", "name": "材料齐全", "condition": "${docsComplete}" },
    { "id": "flow_21", "source": "task_10", "target": "end_13" },
    { "id": "flow_22", "source": "gateway_11", "target": "task_12", "name": "缺材料", "isDefault": true },
    { "id": "flow_23", "source": "task_12", "target": "task_6" }
  ]
}
```

## 场景 B — 采购（互斥分支 + 各路径有去向）

库存充足直接领用；不足则采购，验收不合格走退货。

```json
{
  "nodes": [
    { "id": "start_1", "type": "startEvent", "name": "提出物料需求" },
    { "id": "gate_2", "type": "exclusiveGateway", "name": "库存是否充足", "default": "flow_8" },
    { "id": "task_3", "type": "userTask", "name": "仓库领用" },
    { "id": "task_4", "type": "userTask", "name": "创建采购单" },
    { "id": "task_5", "type": "userTask", "name": "到货验收" },
    { "id": "gate_6", "type": "exclusiveGateway", "name": "验收是否合格", "default": "flow_12" },
    { "id": "task_7", "type": "sendTask", "name": "办理退货" },
    { "id": "end_8", "type": "endEvent", "name": "需求满足" }
  ],
  "edges": [
    { "id": "flow_9", "source": "start_1", "target": "gate_2" },
    { "id": "flow_10", "source": "gate_2", "target": "task_3", "name": "充足", "condition": "${stockEnough}" },
    { "id": "flow_8", "source": "gate_2", "target": "task_4", "name": "不足", "isDefault": true },
    { "id": "flow_11", "source": "task_3", "target": "end_8" },
    { "id": "flow_13", "source": "task_4", "target": "task_5" },
    { "id": "flow_14", "source": "task_5", "target": "gate_6" },
    { "id": "flow_15", "source": "gate_6", "target": "end_8", "name": "合格", "condition": "${passed}" },
    { "id": "flow_12", "source": "gate_6", "target": "task_7", "name": "不合格", "isDefault": true },
    { "id": "flow_16", "source": "task_7", "target": "task_4" }
  ]
}
```

## 场景 C — 员工入职（并行等待）

HR 审核通过后，IT 开账号与行政配工位**同时进行**，两项都完成后通知员工报到。

要点：`parallelGateway` fork+join 成对表达"都完成再继续"，不能画成串行或任选其一。

```json
{
  "pools": [{ "id": "pool_1", "name": "公司" }],
  "lanes": [
    { "id": "lane_2", "name": "HR", "pool": "pool_1" },
    { "id": "lane_3", "name": "IT", "pool": "pool_1" },
    { "id": "lane_4", "name": "行政", "pool": "pool_1" }
  ],
  "nodes": [
    { "id": "start_5", "type": "startEvent", "name": "发出入职通知", "lane": "lane_2" },
    { "id": "task_6", "type": "userTask", "name": "HR审核入职材料", "lane": "lane_2" },
    { "id": "gate_7", "type": "parallelGateway", "name": "并行准备", "lane": "lane_2" },
    { "id": "task_8", "type": "serviceTask", "name": "IT开通账号", "lane": "lane_3" },
    { "id": "task_9", "type": "userTask", "name": "行政配置工位", "lane": "lane_4" },
    { "id": "gate_10", "type": "parallelGateway", "name": "等待全部完成", "lane": "lane_2" },
    { "id": "task_11", "type": "sendTask", "name": "通知员工报到", "lane": "lane_2" },
    { "id": "end_12", "type": "endEvent", "name": "入职完成", "lane": "lane_2" }
  ],
  "edges": [
    { "id": "flow_13", "source": "start_5", "target": "task_6" },
    { "id": "flow_14", "source": "task_6", "target": "gate_7" },
    { "id": "flow_15", "source": "gate_7", "target": "task_8" },
    { "id": "flow_16", "source": "gate_7", "target": "task_9" },
    { "id": "flow_17", "source": "task_8", "target": "gate_10" },
    { "id": "flow_18", "source": "task_9", "target": "gate_10" },
    { "id": "flow_19", "source": "gate_10", "target": "task_11" },
    { "id": "flow_20", "source": "task_11", "target": "end_12" }
  ]
}
```

## 场景 D — 跨组织订单（多池 + 消息流）

客户下单支付，商家收到消息开始确认/备货/发货，委托第三方物流配送（不展示内部 → 黑盒池），物流送达后客户签收。

要点：跨池通信自动成为 messageFlow（虚线，起点空心圆），**不是**池间顺序流；商家的开始事件由消息触发（`eventDefinitionType: "message"`）；物流是黑盒池，messageFlow 可直接连到池本身。

```json
{
  "pools": [
    {
      "id": "pool_1",
      "name": "客户"
    },
    {
      "id": "pool_2",
      "name": "商家"
    },
    {
      "id": "pool_3",
      "name": "第三方物流",
      "isBlackBox": true
    }
  ],
  "nodes": [
    {
      "id": "start_4",
      "type": "startEvent",
      "name": "需要购买商品",
      "pool": "pool_1"
    },
    {
      "id": "task_5",
      "type": "userTask",
      "name": "浏览并下单",
      "pool": "pool_1"
    },
    {
      "id": "task_6",
      "type": "sendTask",
      "name": "支付订单",
      "pool": "pool_1"
    },
    {
      "id": "start_12",
      "type": "startEvent",
      "name": "收到新订单",
      "pool": "pool_2",
      "eventDefinitionType": "message"
    },
    {
      "id": "task_7",
      "type": "receiveTask",
      "name": "确认订单",
      "pool": "pool_2"
    },
    {
      "id": "task_8",
      "type": "userTask",
      "name": "备货",
      "pool": "pool_2"
    },
    {
      "id": "task_9",
      "type": "sendTask",
      "name": "发货",
      "pool": "pool_2"
    },
    {
      "id": "end_11",
      "type": "endEvent",
      "name": "订单完成",
      "pool": "pool_2"
    },
    {
      "id": "task_20",
      "type": "receiveTask",
      "name": "签收商品",
      "pool": "pool_1"
    },
    {
      "id": "end_10",
      "type": "endEvent",
      "name": "收到商品",
      "pool": "pool_1"
    }
  ],
  "edges": [
    {
      "id": "flow_13",
      "source": "start_4",
      "target": "task_5"
    },
    {
      "id": "flow_14",
      "source": "task_5",
      "target": "task_6"
    },
    {
      "id": "flow_15",
      "source": "task_6",
      "target": "start_12",
      "type": "messageFlow"
    },
    {
      "id": "flow_16",
      "source": "start_12",
      "target": "task_7"
    },
    {
      "id": "flow_17",
      "source": "task_7",
      "target": "task_8"
    },
    {
      "id": "flow_18",
      "source": "task_8",
      "target": "task_9"
    },
    {
      "id": "flow_19",
      "source": "task_9",
      "target": "end_11"
    },
    {
      "id": "flow_21",
      "source": "task_9",
      "target": "pool_3",
      "name": "委托配送",
      "type": "messageFlow"
    },
    {
      "id": "flow_22",
      "source": "pool_3",
      "target": "task_20",
      "type": "messageFlow"
    },
    {
      "id": "flow_23",
      "source": "task_20",
      "target": "end_10"
    }
  ]
}
```

## 连续修改示例（基于场景 A）

用户："把经理改成部门负责人"——只改 `task_7` 的 `name`（"经理审批" → "部门负责人审批"），其余节点、边、泳道、id 全部原样保留，校验后重新转换、产出 `expense-approval-v2.*`，不覆盖旧文件。随后问"这个流程是什么意思" → 直接解释，**不再转换、不扣次数**。
