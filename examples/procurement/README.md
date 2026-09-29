# Procurement (mutually exclusive branches)

Raise a material request → if stock is sufficient, take from the warehouse; otherwise create a purchase order → inspect the delivery → on failure, handle the return (loops back to re-purchase).

- `procurement.graph.json` / `procurement.bpmn` / `procurement.png` (PNG is offline-generated documentation material)

All data is fictional. Regenerate: `node ../../skill/scripts/tramito.mjs render procurement.graph.json`.
