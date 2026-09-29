# Employee onboarding (parallel wait)

After HR reviews the documents, IT creates the account and Admin prepares the workstation **in parallel**; once both complete, the employee is notified to report (parallelGateway fork+join pair).

- `employee-onboarding.graph.json` / `employee-onboarding.bpmn` / `employee-onboarding.png` (PNG is offline-generated documentation material)

All data is fictional. Regenerate: `node ../../skill/scripts/tramito.mjs render employee-onboarding.graph.json`.
