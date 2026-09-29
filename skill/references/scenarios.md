# Four ready-to-use business scenarios

The JSON below can be copied straight into a `*.graph.json` and fed to `node scripts/tramito.mjs render` (all data is fictional).
Each scenario doubles as a **modeling-semantics** reference: boundary conditions, mutually exclusive branches, parallel waits, cross-organization messaging, send-back paths.

## Scenario A — Expense approval (boundary condition + send-back)

An employee submits an expense; the manager approves it; **over 5000** requires the GM's approval, otherwise it goes straight to finance; finance sends it back if documents are missing.

Key points: `amount > 5000` itself takes the "over" branch (whether the boundary value belongs to the normal or the over-limit path is a business question — ask; this example treats "over" as strictly greater); the send-back path `flow_23` loops from "notify missing documents" back to "fill expense form".

```json
{
  "pools": [{ "id": "pool_1", "name": "Company" }],
  "lanes": [
    { "id": "lane_2", "name": "Applicant", "pool": "pool_1" },
    { "id": "lane_3", "name": "Approvers", "pool": "pool_1" },
    { "id": "lane_4", "name": "Finance", "pool": "pool_1" }
  ],
  "nodes": [
    { "id": "start_5", "type": "startEvent", "name": "Submit expense", "lane": "lane_2" },
    { "id": "task_6", "type": "userTask", "name": "Fill expense form", "lane": "lane_2" },
    { "id": "task_7", "type": "userTask", "name": "Manager approval", "lane": "lane_3" },
    { "id": "gateway_8", "type": "exclusiveGateway", "name": "Amount over 5000?", "lane": "lane_3", "default": "flow_18" },
    { "id": "task_9", "type": "userTask", "name": "GM approval", "lane": "lane_3" },
    { "id": "gateway_11", "type": "exclusiveGateway", "name": "Documents complete?", "lane": "lane_4", "default": "flow_22" },
    { "id": "task_10", "type": "serviceTask", "name": "Finance payout", "lane": "lane_4" },
    { "id": "task_12", "type": "sendTask", "name": "Notify missing documents", "lane": "lane_4" },
    { "id": "end_13", "type": "endEvent", "name": "Expense completed", "lane": "lane_4" }
  ],
  "edges": [
    { "id": "flow_14", "source": "start_5", "target": "task_6" },
    { "id": "flow_15", "source": "task_6", "target": "task_7" },
    { "id": "flow_16", "source": "task_7", "target": "gateway_8" },
    { "id": "flow_17", "source": "gateway_8", "target": "task_9", "name": "over 5000", "condition": "${amount > 5000}" },
    { "id": "flow_18", "source": "gateway_8", "target": "gateway_11", "name": "within 5000", "isDefault": true },
    { "id": "flow_19", "source": "task_9", "target": "gateway_11" },
    { "id": "flow_20", "source": "gateway_11", "target": "task_10", "name": "complete", "condition": "${docsComplete}" },
    { "id": "flow_21", "source": "task_10", "target": "end_13" },
    { "id": "flow_22", "source": "gateway_11", "target": "task_12", "name": "missing", "isDefault": true },
    { "id": "flow_23", "source": "task_12", "target": "task_6" }
  ]
}
```

## Scenario B — Procurement (mutually exclusive branches + every path has a destination)

If stock is sufficient, take from the warehouse; otherwise purchase; failed inspection leads to a return.

```json
{
  "nodes": [
    { "id": "start_1", "type": "startEvent", "name": "Raise material request" },
    { "id": "gate_2", "type": "exclusiveGateway", "name": "Stock sufficient?", "default": "flow_9" },
    { "id": "task_3", "type": "userTask", "name": "Take from warehouse" },
    { "id": "task_4", "type": "userTask", "name": "Create purchase order" },
    { "id": "task_5", "type": "userTask", "name": "Inspect delivery" },
    { "id": "gate_6", "type": "exclusiveGateway", "name": "Inspection passed?", "default": "flow_13" },
    { "id": "task_7", "type": "sendTask", "name": "Handle return" },
    { "id": "end_8", "type": "endEvent", "name": "Request fulfilled" }
  ],
  "edges": [
    { "id": "flow_10", "source": "start_1", "target": "gate_2" },
    { "id": "flow_11", "source": "gate_2", "target": "task_3", "name": "sufficient", "condition": "${stockEnough}" },
    { "id": "flow_9", "source": "gate_2", "target": "task_4", "name": "insufficient", "isDefault": true },
    { "id": "flow_12", "source": "task_3", "target": "end_8" },
    { "id": "flow_14", "source": "task_4", "target": "task_5" },
    { "id": "flow_15", "source": "task_5", "target": "gate_6" },
    { "id": "flow_16", "source": "gate_6", "target": "end_8", "name": "passed", "condition": "${passed}" },
    { "id": "flow_13", "source": "gate_6", "target": "task_7", "name": "failed", "isDefault": true },
    { "id": "flow_17", "source": "task_7", "target": "task_4" }
  ]
}
```

## Scenario C — Employee onboarding (parallel wait)

After HR review, IT creates the account and Admin prepares the workstation **in parallel**; once both finish, the employee is notified to report.

Key point: a fork+join pair of `parallelGateway` expresses "all must complete before continuing" — never model it as sequential or either-one.

```json
{
  "pools": [{ "id": "pool_1", "name": "Company" }],
  "lanes": [
    { "id": "lane_2", "name": "HR", "pool": "pool_1" },
    { "id": "lane_3", "name": "IT", "pool": "pool_1" },
    { "id": "lane_4", "name": "Admin", "pool": "pool_1" }
  ],
  "nodes": [
    { "id": "start_5", "type": "startEvent", "name": "Send onboarding notice", "lane": "lane_2" },
    { "id": "task_6", "type": "userTask", "name": "HR reviews documents", "lane": "lane_2" },
    { "id": "gate_7", "type": "parallelGateway", "name": "Prepare in parallel", "lane": "lane_2" },
    { "id": "task_8", "type": "serviceTask", "name": "IT creates account", "lane": "lane_3" },
    { "id": "task_9", "type": "userTask", "name": "Admin prepares workstation", "lane": "lane_4" },
    { "id": "gate_10", "type": "parallelGateway", "name": "Wait for all", "lane": "lane_2" },
    { "id": "task_11", "type": "sendTask", "name": "Notify employee to report", "lane": "lane_2" },
    { "id": "end_12", "type": "endEvent", "name": "Onboarding completed", "lane": "lane_2" }
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

## Scenario D — Cross-organization order (multiple pools + message flows)

The customer places and pays for an order; the merchant receives the message and starts confirm/stock/ship; delivery is delegated to a third-party carrier (internals not shown → black-box pool); after delivery the customer signs for it.

Key points: cross-pool communication automatically becomes a messageFlow (dashed line, hollow-circle start), **not** an inter-pool sequence flow; the merchant's start event is message-triggered (`eventDefinitionType: "message"`); the carrier is a black-box pool, so a messageFlow connects directly to the pool itself.

```json
{
  "pools": [
    { "id": "pool_1", "name": "Customer" },
    { "id": "pool_2", "name": "Merchant" },
    { "id": "pool_3", "name": "Carrier", "isBlackBox": true }
  ],
  "nodes": [
    { "id": "start_4", "type": "startEvent", "name": "Wants to buy a product", "pool": "pool_1" },
    { "id": "task_5", "type": "userTask", "name": "Browse and order", "pool": "pool_1" },
    { "id": "task_6", "type": "sendTask", "name": "Pay for order", "pool": "pool_1" },
    { "id": "start_12", "type": "startEvent", "name": "New order received", "pool": "pool_2", "eventDefinitionType": "message" },
    { "id": "task_7", "type": "receiveTask", "name": "Confirm order", "pool": "pool_2" },
    { "id": "task_8", "type": "userTask", "name": "Prepare stock", "pool": "pool_2" },
    { "id": "task_9", "type": "sendTask", "name": "Ship order", "pool": "pool_2" },
    { "id": "end_11", "type": "endEvent", "name": "Order completed", "pool": "pool_2" },
    { "id": "task_20", "type": "receiveTask", "name": "Sign for goods", "pool": "pool_1" },
    { "id": "end_10", "type": "endEvent", "name": "Goods received", "pool": "pool_1" }
  ],
  "edges": [
    { "id": "flow_13", "source": "start_4", "target": "task_5" },
    { "id": "flow_14", "source": "task_5", "target": "task_6" },
    { "id": "flow_15", "source": "task_6", "target": "start_12", "type": "messageFlow" },
    { "id": "flow_16", "source": "start_12", "target": "task_7" },
    { "id": "flow_17", "source": "task_7", "target": "task_8" },
    { "id": "flow_18", "source": "task_8", "target": "task_9" },
    { "id": "flow_19", "source": "task_9", "target": "end_11" },
    { "id": "flow_21", "source": "task_9", "target": "pool_3", "name": "delegate delivery", "type": "messageFlow" },
    { "id": "flow_22", "source": "pool_3", "target": "task_20", "type": "messageFlow" },
    { "id": "flow_23", "source": "task_20", "target": "end_10" }
  ]
}
```

## Successive-edit example (based on Scenario A)

User: "change the manager to the department head" — only `task_7`'s `name` changes ("Manager approval" → "Department head approval"); every other node, edge, lane and id stays exactly as it was; validate, re-convert, and produce `expense-approval-v2.*` without overwriting the old files. A follow-up "what does this process mean?" → just explain; **do not re-convert**.
