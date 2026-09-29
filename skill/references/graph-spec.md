# Flat ELK-BPMN JSON input spec

> Version: `elk-bpmn-flat@1` (kept in sync with the `validateFlat` validator of the local compiler [tramito-layout](https://www.npmjs.com/package/tramito-layout); after engine upgrades, fix this file guided by validator errors).
> Size guidance: ≤100 nodes / ≤200 edges per diagram (no hard local limit, but layout quality and runtime degrade beyond it; for larger processes prefer splitting into subprocesses).
>
> **About id letter suffixes**: the spec examples contain edge ids like `flow_9b` / `flow_13b` — the customary style for adding a sequence flow at a gateway branch. **A letter suffix does not count as "reusing a sequence number"**; "no reuse" means never reassign the number of a deleted element to a new one.

Full spec:

---

The input is a **flat** ELK-BPMN JSON object; the whole object *is* the graph (there are no sibling parameters).

The shape of the graph (only these keys; do not nest children / no boundaryEvents arrays / no partition config — those are generated automatically):

```
{
  "id": "definitions_1",            // optional
  "pools":  [ { "id", "name", "isBlackBox"? } ],   // optional: omit when there are no roles/organizations = single process
  "lanes":  [ { "id", "name", "pool"?, "parentLane"? } ],  // optional: omit when there are no swimlanes
  "nodes":  [ { "id", "type", "name", "pool"?, "lane"?, ... } ],   // required; all nodes, flat
  "edges":  [ { "id", "source", "target", "type"?, ... } ]        // all edges, flat
}
```

== Hard constraints ==
1. ids are globally unique, pure ASCII (a-z A-Z 0-9 _ -); business text goes in `name`; all elements share one auto-increment sequence N (starting at 1, never reused).
2. `nodes` are ordered by execution (start→…→end); `edges` too. An edge's source/target must be a declared node id (or a black-box pool id).
3. Event nodes (startEvent / endEvent / intermediate*Event / boundaryEvent) take `eventDefinitionType` as needed: **required** on intermediateCatchEvent and boundaryEvent; start/end/intermediateThrow default to none when omitted.
4. **Membership is expressed with flat fields, never nesting**: which lane a node belongs to is `node.lane="lane_x"`; which pool is `node.pool="pool_x"` (optional in a single-pool diagram). The system places nodes into lanes and configures partitions automatically.
5. **Boundary events**: set type to `"boundaryEvent"` and write `attachedTo="<host node id>"` (the system attaches it to the host; do not nest it yourself). Its outgoing edge is written in `edges` as usual, with the boundary event's own id as `source`.
6. **You don't manage edge layers**: write every edge flat into `edges`. Between two nodes of the same pool → automatic sequenceFlow; across pools/organizations → automatic messageFlow (`type` can be omitted; the system decides by endpoint membership). To be explicit, `type` may be `"sequenceFlow"` / `"messageFlow"` / `"association"`.
7. exclusiveGateway: on the gateway node write `default="<id of one outgoing edge>"`; that default-branch edge gets `isDefault:true`; other branch edges get `condition="<expression>"`.
8. Parallel: use parallelGateway in fork+join pairs (for "all must complete before continuing"); branches that never merge use only a fork, each with its own endEvent.
9. Black-box pool: a pool with `isBlackBox:true` (no nodes belong to it); a messageFlow connects directly to that pool's id.
10. **Subprocesses**: to expand a subprocess's internal steps, first write a node with `type="subProcess"`, then write its internal nodes as ordinary nodes with `parent="<subprocess id>"` (the system collects them into the subprocess and expands it); internal edges go into `edges` as usual (both endpoints inside the subprocess is enough). Connect from/to **the subprocess node itself** in the outer layer (not its internal nodes). Nesting to any depth works. When internals don't need expanding, write just one subProcess node with no `parent` pointing at it (collapsed box).
11. Node input/output (don't write by default): only when the user explicitly asks to show/maintain "inputs / outputs / fields / form items / artifacts", add `io` to the relevant nodes, e.g. `"io": { "inputs": ["application form"], "outputs": ["approval form"] }`. When editing an existing process, preserve existing `io` where possible.

== Structure choices ==
- "Roles/departments/functions/swimlanes" appear → write pools + lanes, and mark node membership with `lane`.
- Cross-organization/external systems → multiple pools; an external system whose internals stay hidden → set `isBlackBox` on that pool.
- Otherwise → no pools/lanes; just nodes + edges (single process).

== Element type cheat sheet ==
Event types: startEvent | endEvent | intermediateCatchEvent | intermediateThrowEvent | boundaryEvent
  eventDefinitionType: none | message | timer | signal | error | terminate | conditional | link
Task types: task | userTask | serviceTask | scriptTask | businessRuleTask | sendTask | receiveTask | manualTask | callActivity
Gateway types: exclusiveGateway | parallelGateway | inclusiveGateway | eventBasedGateway
Data/annotation types: dataObject | dataStoreReference | textAnnotation

== Pre-flight checklist (run through it mentally before generating) ==
1) id sequence numbers are unique and contain no non-ASCII characters
2) every edge source/target is declared in nodes (or is a black-box pool id)
3) intermediateCatch / boundary events have eventDefinitionType
4) when lanes exist, every node states its `lane`
5) boundary events have type=boundaryEvent and `attachedTo`
6) an exclusiveGateway's `default` points to a real outgoing edge id; non-default branches have `condition`
7) parallels that must join come in fork+join pairs
8) nodes carry no `io` unless the user asked for input/output
9) no top-level fields outside this spec (e.g. summary, children, partition)
10) nodes and edges are ordered by execution

Example A — single process + exclusive gateway (no pools/lanes):
```json
{
  "nodes": [
    { "id": "start_1", "type": "startEvent", "name": "Submit request" },
    { "id": "task_2", "type": "userTask", "name": "Review" },
    { "id": "gateway_3", "type": "exclusiveGateway", "name": "Review outcome", "default": "flow_9" },
    { "id": "task_4", "type": "serviceTask", "name": "Process" },
    { "id": "end_5", "type": "endEvent", "name": "Approved" },
    { "id": "end_6", "type": "endEvent", "name": "Rejected" }
  ],
  "edges": [
    { "id": "flow_7", "source": "start_1", "target": "task_2" },
    { "id": "flow_8", "source": "task_2", "target": "gateway_3" },
    { "id": "flow_9b", "source": "gateway_3", "target": "task_4", "name": "approved", "condition": "${approved}" },
    { "id": "flow_9", "source": "gateway_3", "target": "end_6", "name": "rejected", "isDefault": true },
    { "id": "flow_10", "source": "task_4", "target": "end_5" }
  ]
}
```

Example B — with swimlanes (one pool, three lanes; nodes state membership via `lane`):
```json
{
  "pools": [ { "id": "pool_1", "name": "Company" } ],
  "lanes": [
    { "id": "lane_2", "name": "Applicant", "pool": "pool_1" },
    { "id": "lane_3", "name": "Manager", "pool": "pool_1" },
    { "id": "lane_4", "name": "HR", "pool": "pool_1" }
  ],
  "nodes": [
    { "id": "start_5", "type": "startEvent", "name": "Start", "lane": "lane_2" },
    { "id": "task_6", "type": "userTask", "name": "Submit application", "lane": "lane_2" },
    { "id": "task_7", "type": "userTask", "name": "Review", "lane": "lane_3" },
    { "id": "gateway_8", "type": "exclusiveGateway", "name": "Review outcome", "lane": "lane_3", "default": "flow_14" },
    { "id": "task_9", "type": "serviceTask", "name": "Archive", "lane": "lane_4" },
    { "id": "end_10", "type": "endEvent", "name": "Done", "lane": "lane_4" }
  ],
  "edges": [
    { "id": "flow_11", "source": "start_5", "target": "task_6" },
    { "id": "flow_12", "source": "task_6", "target": "task_7" },
    { "id": "flow_13", "source": "task_7", "target": "gateway_8" },
    { "id": "flow_13b", "source": "gateway_8", "target": "task_9", "name": "approved", "condition": "${approved}" },
    { "id": "flow_14", "source": "gateway_8", "target": "end_10", "name": "rejected", "isDefault": true },
    { "id": "flow_15", "source": "task_9", "target": "end_10" }
  ]
}
```

Example C — parallel gateway fork+join (single process):
```json
{
  "nodes": [
    { "id": "start_1", "type": "startEvent", "name": "Start" },
    { "id": "task_2", "type": "userTask", "name": "IT approval" },
    { "id": "gateway_3", "type": "parallelGateway", "name": "Parallel split" },
    { "id": "task_4", "type": "userTask", "name": "Check equipment" },
    { "id": "task_5", "type": "userTask", "name": "Fill handover form" },
    { "id": "gateway_6", "type": "parallelGateway", "name": "Wait for all" },
    { "id": "task_7", "type": "serviceTask", "name": "Clean up account" },
    { "id": "end_8", "type": "endEvent", "name": "End" }
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
```

Example D — boundary event (type=boundaryEvent + attachedTo pointing at the host; no nesting):
```json
{
  "nodes": [
    { "id": "start_1", "type": "startEvent", "name": "Start" },
    { "id": "task_2", "type": "userTask", "name": "Iterate on process design" },
    { "id": "boundary_3", "type": "boundaryEvent", "name": "Deadline reached", "attachedTo": "task_2", "eventDefinitionType": "timer", "isInterrupting": false },
    { "id": "task_4", "type": "userTask", "name": "Review and update" },
    { "id": "end_5", "type": "endEvent", "name": "End" }
  ],
  "edges": [
    { "id": "flow_6", "source": "start_1", "target": "task_2" },
    { "id": "flow_7", "source": "task_2", "target": "end_5" },
    { "id": "flow_8", "source": "boundary_3", "target": "task_4", "name": "timer fires" },
    { "id": "flow_9", "source": "task_4", "target": "end_5" }
  ]
}
```

Example E — expanded subprocess (internal nodes point at the subprocess via `parent`; the outer layer connects to the subprocess node itself):
```json
{
  "nodes": [
    { "id": "start_1", "type": "startEvent", "name": "Start" },
    { "id": "sub_2", "type": "subProcess", "name": "Approval handling" },
    { "id": "s_start_3", "type": "startEvent", "name": "Sub start", "parent": "sub_2" },
    { "id": "s_task_4", "type": "userTask", "name": "Internal review", "parent": "sub_2" },
    { "id": "s_end_5", "type": "endEvent", "name": "Sub end", "parent": "sub_2" },
    { "id": "end_6", "type": "endEvent", "name": "End" }
  ],
  "edges": [
    { "id": "flow_7", "source": "start_1", "target": "sub_2" },
    { "id": "flow_8", "source": "sub_2", "target": "end_6" },
    { "id": "flow_9", "source": "s_start_3", "target": "s_task_4" },
    { "id": "flow_10", "source": "s_task_4", "target": "s_end_5" }
  ]
}
```
