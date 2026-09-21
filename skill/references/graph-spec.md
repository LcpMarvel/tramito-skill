# 扁平 ELK-BPMN JSON 输入规范

> 版本：`elk-bpmn-flat@1`（快照，与服务端 `/api/v1/bpmn/spec` 同源；可用 `node scripts/tramito.js spec` 拉取最新）。
> 容量边界：单图 ≤100 节点 / ≤200 边，请求体 ≤1 MiB，服务端转换超时 30s。
>
> **v1 API 只需要 `graph`**：规范正文里提到的 `summary` 参数（以及自检清单第 9 条）是网页端对话工具的约定，
> 不适用于 `/api/v1/bpmn/render`（请求体只有 `graph` 与可选 `idempotencyKey`）——建模时忽略 summary 相关要求即可。
>
> **关于 id 后缀字母**：规范示例里出现 `flow_9b` / `flow_13b` 这类带字母后缀的边 id——这是网关分支处
> 补充顺序流的惯用写法，**后缀字母不算「序号复用」**；「不复用」指不要把已删除元素的序号再分配给新元素。

以下是服务端返回的完整规范原文：

---

输入是**扁平** ELK-BPMN JSON，整个对象作为 graph 参数传入。
**工具有两个并列参数：graph（下面这个扁平对象）和 summary（一句业务语言说明，给用户看）。summary 是与 graph 平级的独立顶层参数，绝不能写进 graph 里。**

graph 的形状（只有这几个键，不要嵌套 children / 不要 boundaryEvents 数组 / 不要 partition 配置——这些由系统自动生成）：
{
  "id": "definitions_1",            // 可省
  "pools":  [ { "id", "name", "isBlackBox"? } ],   // 可省：没有角色/组织时省略 = 单流程
  "lanes":  [ { "id", "name", "pool"?, "parentLane"? } ],  // 可省：不分泳道时省略
  "nodes":  [ { "id", "type", "name", "pool"?, "lane"?, ... } ],   // 必填，平铺所有节点
  "edges":  [ { "id", "source", "target", "type"?, ... } ]         // 平铺所有连线
}

== 硬约束 ==
1. id 全局唯一、纯 ASCII（a-z A-Z 0-9 _ -），中文放 name；所有元素共享一个自增序号 N（从 1 起，不复用）。
2. nodes 按执行先后排（start→…→end）；edges 也按执行先后排。edge 的 source/target 必须是已声明的 node id（或黑盒 pool id）。
3. 事件节点（startEvent / endEvent / intermediate*Event / boundaryEvent）按需写 eventDefinitionType：intermediateCatchEvent 与 boundaryEvent **必填**；start/end/intermediateThrow 不填默认 none。
4. **归属用平铺字段，不要嵌套**：节点属于哪条泳道就写 node.lane="lane_x"；属于哪个池写 node.pool="pool_x"（单池可省）。系统会自动把节点放进对应泳道、配好 partition。
5. **边界事件**：type 写 "boundaryEvent"，并写 attachedTo="宿主节点id"（系统自动挂到宿主上，不要你嵌套）；它的出边照常写在 edges 里，source 用边界事件自己的 id。
6. **连线层级不用你操心**：直接把所有连线平铺写进 edges。同池两节点之间 → 自动 sequenceFlow；跨池/跨组织之间 → 自动 messageFlow（type 可省，系统按两端归属判定）。要显式可写 type："sequenceFlow" / "messageFlow" / "association"。
7. exclusiveGateway：在网关节点写 default="某条出向edge的id"；该默认分支那条 edge 写 isDefault:true；其它分支 edge 写 condition="表达式"。
8. 并行：用 parallelGateway 成对 fork+join（需要"都完成再继续"时）；分支不汇合则只 fork、各分支独立 endEvent。
9. 黑盒池：pool 写 isBlackBox:true（不放任何属于它的 node）；messageFlow 直接连到该 pool 的 id。
10. **子流程**：要展开一个子流程的内部步骤时，先写一个 type="subProcess" 的节点，再把它内部的节点写成普通 node 并加 parent="该子流程id"（系统自动收进子流程、展开）；内部那些边照常写在 edges（两端都在子流程内即可）。外层用 edge 连到/连出**子流程节点本身**（不是它的内部节点）。可任意层嵌套。不需要展开内部就只写一个 subProcess 节点、不写 parent 指向它（折叠框）。
11. 节点输入输出（默认不写）：仅当用户明确要求展示/维护"输入输出 / 字段 / 表单项 / 产出物"时，给相关 node 写 io，如 "io": { "inputs": ["申请表"], "outputs": ["审批单"] }。修改已有流程时，原节点已有 io 的尽量保留。

== 结构选择 ==
- 出现"角色/部门/职能/泳道" → 写 pools + lanes，节点用 lane 指明归属。
- 跨组织/外部系统 → 多个 pool；外部系统不展示内部 → 该 pool 设 isBlackBox。
- 否则 → 不写 pools/lanes，只给 nodes + edges（单流程）。

== 元素类型速查 ==
事件 type：startEvent | endEvent | intermediateCatchEvent | intermediateThrowEvent | boundaryEvent
  eventDefinitionType：none | message | timer | signal | error | terminate | conditional | link
任务 type：task | userTask | serviceTask | scriptTask | businessRuleTask | sendTask | receiveTask | manualTask | callActivity
网关 type：exclusiveGateway | parallelGateway | inclusiveGateway | eventBasedGateway
数据/标注 type：dataObject | dataStoreReference | textAnnotation

== 自检清单（生成前在脑内过一遍）==
1) id 序号不重复、不含中文
2) edges 每个 source/target 都在 nodes 里有声明（或是黑盒 pool id）
3) intermediateCatch / boundary 事件有 eventDefinitionType
4) 有泳道时每个节点都写了 lane（属于哪条泳道）
5) 边界事件 type=boundaryEvent 且写了 attachedTo
6) exclusiveGateway 的 default 指向一条真实存在的出向 edge id；非默认分支有 condition
7) 需要汇合的并行有 fork+join 成对
8) 用户未要求节点输入输出时，node 不写 io
9) summary 作为独立顶层参数传出，没有混进 graph
10) nodes 与 edges 都按执行先后排
范例 A — 单流程 + 排他网关（无 pools/lanes）：
{
  "nodes": [
    { "id": "start_1", "type": "startEvent", "name": "提交申请" },
    { "id": "task_2", "type": "userTask", "name": "审核" },
    { "id": "gateway_3", "type": "exclusiveGateway", "name": "审核结果", "default": "flow_9" },
    { "id": "task_4", "type": "serviceTask", "name": "处理" },
    { "id": "end_5", "type": "endEvent", "name": "通过" },
    { "id": "end_6", "type": "endEvent", "name": "拒绝" }
  ],
  "edges": [
    { "id": "flow_7", "source": "start_1", "target": "task_2" },
    { "id": "flow_8", "source": "task_2", "target": "gateway_3" },
    { "id": "flow_9b", "source": "gateway_3", "target": "task_4", "name": "通过", "condition": "${approved}" },
    { "id": "flow_9", "source": "gateway_3", "target": "end_6", "name": "拒绝", "isDefault": true },
    { "id": "flow_10", "source": "task_4", "target": "end_5" }
  ]
}

范例 B — 带泳道（一个 pool，三条 lane；节点用 lane 指明归属）：
{
  "pools": [ { "id": "pool_1", "name": "公司" } ],
  "lanes": [
    { "id": "lane_2", "name": "申请人", "pool": "pool_1" },
    { "id": "lane_3", "name": "经理", "pool": "pool_1" },
    { "id": "lane_4", "name": "人事", "pool": "pool_1" }
  ],
  "nodes": [
    { "id": "start_5", "type": "startEvent", "name": "开始", "lane": "lane_2" },
    { "id": "task_6", "type": "userTask", "name": "提交申请", "lane": "lane_2" },
    { "id": "task_7", "type": "userTask", "name": "审核", "lane": "lane_3" },
    { "id": "gateway_8", "type": "exclusiveGateway", "name": "审核结果", "lane": "lane_3", "default": "flow_14" },
    { "id": "task_9", "type": "serviceTask", "name": "归档", "lane": "lane_4" },
    { "id": "end_10", "type": "endEvent", "name": "完成", "lane": "lane_4" }
  ],
  "edges": [
    { "id": "flow_11", "source": "start_5", "target": "task_6" },
    { "id": "flow_12", "source": "task_6", "target": "task_7" },
    { "id": "flow_13", "source": "task_7", "target": "gateway_8" },
    { "id": "flow_13b", "source": "gateway_8", "target": "task_9", "name": "通过", "condition": "${approved}" },
    { "id": "flow_14", "source": "gateway_8", "target": "end_10", "name": "拒绝", "isDefault": true },
    { "id": "flow_15", "source": "task_9", "target": "end_10" }
  ]
}

范例 C — 并行网关 fork+join（单流程）：
{
  "nodes": [
    { "id": "start_1", "type": "startEvent", "name": "开始" },
    { "id": "task_2", "type": "userTask", "name": "IT审批" },
    { "id": "gateway_3", "type": "parallelGateway", "name": "并行开始" },
    { "id": "task_4", "type": "userTask", "name": "检查设备" },
    { "id": "task_5", "type": "userTask", "name": "填写交接表" },
    { "id": "gateway_6", "type": "parallelGateway", "name": "等待合并" },
    { "id": "task_7", "type": "serviceTask", "name": "清理账号" },
    { "id": "end_8", "type": "endEvent", "name": "结束" }
  ],
  "edges": [
    { "id": "flow_9", "source": "start_1", "target": "task_2" },
    { "id": "flow_10", "source": "task_2", "target": "gateway_3" },
    { "id": "flow_11", "source": "gateway_3", "target": "task_4" },
    { "id": "flow_12", "source": "gateway_3", "target": "task_5" },
    { "id": "flow_13", "source": "task_4", "target": "gateway_6" },
    { "id": "flow_14", "source": "task_5", "target": "gateway_6" },
    { "id": "flow_15", "source": "gateway_6", "target": "task_7" },
    { "id": "flow_16", "source": "task_7", "target": "end_8" }
  ]
}

范例 D — 边界事件（type=boundaryEvent + attachedTo 指向宿主，不要嵌套）：
{
  "nodes": [
    { "id": "start_1", "type": "startEvent", "name": "开始" },
    { "id": "task_2", "type": "userTask", "name": "优化迭代流程设计" },
    { "id": "boundary_3", "type": "boundaryEvent", "name": "到期触发", "attachedTo": "task_2", "eventDefinitionType": "timer", "isInterrupting": false },
    { "id": "task_4", "type": "userTask", "name": "评审与更新" },
    { "id": "end_5", "type": "endEvent", "name": "结束" }
  ],
  "edges": [
    { "id": "flow_6", "source": "start_1", "target": "task_2" },
    { "id": "flow_7", "source": "task_2", "target": "end_5" },
    { "id": "flow_8", "source": "boundary_3", "target": "task_4", "name": "定时触发" },
    { "id": "flow_9", "source": "task_4", "target": "end_5" }
  ]
}

范例 E — 展开子流程（内部节点用 parent 指向子流程；外层连到子流程节点本身）：
{
  "nodes": [
    { "id": "start_1", "type": "startEvent", "name": "开始" },
    { "id": "sub_2", "type": "subProcess", "name": "审批处理" },
    { "id": "s_start_3", "type": "startEvent", "name": "子开始", "parent": "sub_2" },
    { "id": "s_task_4", "type": "userTask", "name": "内部审核", "parent": "sub_2" },
    { "id": "s_end_5", "type": "endEvent", "name": "子结束", "parent": "sub_2" },
    { "id": "end_6", "type": "endEvent", "name": "结束" }
  ],
  "edges": [
    { "id": "flow_7", "source": "start_1", "target": "sub_2" },
    { "id": "flow_8", "source": "sub_2", "target": "end_6" },
    { "id": "flow_9", "source": "s_start_3", "target": "s_task_4" },
    { "id": "flow_10", "source": "s_task_4", "target": "s_end_5" }
  ]
}