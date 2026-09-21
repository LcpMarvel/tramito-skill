# 员工入职（并行等待）

HR 审核材料后，IT 开账号与行政配工位**并行**进行，两项都完成后通知员工报到（parallelGateway fork+join 成对）。

- `employee-onboarding.graph.json` / `employee-onboarding.bpmn` / `employee-onboarding.png`（PNG 为离线生成的文档素材；线上在查看器内导出）

数据虚构。重新生成：`node ../../skill/scripts/tramito.js render employee-onboarding.graph.json`。
