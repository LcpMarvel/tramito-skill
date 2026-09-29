# Cross-organization order (multiple pools + message flows)

Customer orders/pays → merchant confirms/prepares/ships → third-party carrier delivers (black-box pool, internals not shown). Cross-pool communication is a message flow (dashed line), not a sequence flow.

- `order-fulfillment.graph.json` / `order-fulfillment.bpmn` / `order-fulfillment.png` (PNG is offline-generated documentation material)

All data is fictional. Regenerate: `node ../../skill/scripts/tramito.mjs render order-fulfillment.graph.json`.
