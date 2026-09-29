# Expense approval (boundary condition + send-back path)

Employee submits an expense → manager approval → over 5000 adds GM approval → finance payout; when documents are incomplete, finance sends it back to the employee.

- `expense-approval.graph.json` — editable source (flat ELK-BPMN JSON)
- `expense-approval.bpmn` — standard BPMN 2.0 (with layout; opens in bpmn.io / Camunda)
- `expense-approval.png` — rendered image (documentation material, generated offline with bpmn-js)

All data is fictional. Regenerate: `node ../../skill/scripts/tramito.mjs render expense-approval.graph.json`.
