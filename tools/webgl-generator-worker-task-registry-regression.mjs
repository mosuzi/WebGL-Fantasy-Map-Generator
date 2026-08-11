import assert from "node:assert/strict";
import {
  collectEconomyWorkerTransferables,
  ECONOMY_WORKER_TASK,
  runEconomyWorkerTask
} from "../app/webgl-generator/src/runtime/economy-worker-task.js";
import {
  collectGridTopologyWorkerTransferables,
  GRID_TOPOLOGY_WORKER_TASK,
  runGridTopologyWorkerTask
} from "../app/webgl-generator/src/runtime/grid-topology-worker-task.js";
import {
  collectMilitaryPolicyWorkerTransferables,
  MILITARY_POLICY_WORKER_TASK,
  runMilitaryPolicyWorkerTask
} from "../app/webgl-generator/src/runtime/military-policy-worker-task.js";
import {
  collectPopulationWorkerTransferables,
  POPULATION_WORKER_TASK,
  runPopulationWorkerTask
} from "../app/webgl-generator/src/runtime/population-worker-task.js";
import {
  collectRoutePathWorkerTransferables,
  ROUTE_PATH_WORKER_TASK,
  runRoutePathWorkerTask
} from "../app/webgl-generator/src/runtime/route-path-worker-task.js";
import {
  collectSocialExpansionWorkerTransferables,
  runSocialExpansionWorkerTask,
  SOCIAL_EXPANSION_WORKER_TASK
} from "../app/webgl-generator/src/runtime/social-expansion-worker-task.js";
import {
  collectWorkerTaskTransferables,
  getWorkerTaskHandler,
  listWorkerTasks
} from "../app/webgl-generator/src/runtime/worker-task-registry.js";

const cases = [
  {
    task: GRID_TOPOLOGY_WORKER_TASK,
    handler: runGridTopologyWorkerTask,
    collector: collectGridTopologyWorkerTransferables,
    missingCode: "grid-worker-map-missing",
    carrier: "replacementMap"
  },
  {
    task: SOCIAL_EXPANSION_WORKER_TASK,
    handler: runSocialExpansionWorkerTask,
    collector: collectSocialExpansionWorkerTransferables,
    missingCode: "social-expansion-worker-map-missing",
    carrier: "patch"
  },
  {
    task: ECONOMY_WORKER_TASK,
    handler: runEconomyWorkerTask,
    collector: collectEconomyWorkerTransferables,
    missingCode: "economy-worker-map-missing",
    carrier: "patch"
  },
  {
    task: POPULATION_WORKER_TASK,
    handler: runPopulationWorkerTask,
    collector: collectPopulationWorkerTransferables,
    missingCode: "population-worker-map-missing",
    carrier: "patch"
  },
  {
    task: ROUTE_PATH_WORKER_TASK,
    handler: runRoutePathWorkerTask,
    collector: collectRoutePathWorkerTransferables,
    missingCode: "route-path-worker-map-missing",
    carrier: "result"
  },
  {
    task: MILITARY_POLICY_WORKER_TASK,
    handler: runMilitaryPolicyWorkerTask,
    collector: collectMilitaryPolicyWorkerTransferables,
    missingCode: "military-policy-worker-map-missing",
    carrier: "patch"
  }
];

const listed = listWorkerTasks();
assert.equal(new Set(listed).size, listed.length, "Worker registry 不应返回重复任务");

for (const item of cases) {
  assert(listed.includes(item.task), `${item.task} 未被 listWorkerTasks 发现`);
  assert.equal(getWorkerTaskHandler(item.task), item.handler, `${item.task} registry handler 身份错误`);

  const bytes = new Uint8Array([1, 2, 3]);
  const result = item.carrier === "result"
    ? {bytes}
    : {[item.carrier]: {bytes}};
  const expected = item.collector(result);
  const actual = collectWorkerTaskTransferables(item.task, result);
  assert.deepEqual(actual, expected, `${item.task} registry collector 与正式 collector 不一致`);
  assert(actual.includes(bytes.buffer), `${item.task} registry collector 未返回目标 buffer`);

  await assert.rejects(
    () => getWorkerTaskHandler(item.task)({}),
    error => error?.code === item.missingCode,
    `${item.task} registry handler 未进入对应领域校验`
  );
}

assert.throws(
  () => getWorkerTaskHandler("unsupported.compute"),
  error => error?.code === "worker_task_unsupported",
  "未知 Worker 任务没有被拒绝"
);
assert.deepEqual(
  collectWorkerTaskTransferables("unsupported.compute", {bytes: new Uint8Array([9])}),
  [],
  "未知 Worker 任务不得误用其它 collector"
);

console.log(JSON.stringify({
  status: "PASS",
  registered: cases.map(item => item.task),
  unsupported: "worker_task_unsupported"
}, null, 2));
