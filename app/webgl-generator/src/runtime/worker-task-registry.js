import {collectRegenerationWorkerTransferables, runRegenerationWorkerTask} from "./regeneration-worker-task.js";
import {collectMapFileIoWorkerTransferables, MAP_FILE_IO_WORKER_TASK_TYPE, runMapFileIoWorkerTask} from "./map-file-io-worker-task.js";
import {collectRenderPreparationTransfers, executeRenderPreparationTask, RENDER_PREPARATION_TASK} from "../renderer/render-preparation.js";
import {
  collectHeightDerivedWorkerTransferables,
  HEIGHT_DERIVED_WORKER_TASK,
  runHeightDerivedWorkerTask
} from "./height-derived-worker-task.js";
import {
  CLIMATE_DOWNSTREAM_WORKER_TASK,
  collectClimateDownstreamWorkerTransferables,
  runClimateDownstreamWorkerTask
} from "./climate-downstream-worker-task.js";
import {
  collectOceanCurrentWorldWorkerTransferables,
  OCEAN_CURRENT_WORLD_WORKER_TASK,
  runOceanCurrentWorldWorkerTask
} from "./ocean-current-world-worker-task.js";
import {
  collectGridTopologyWorkerTransferables,
  GRID_TOPOLOGY_WORKER_TASK,
  runGridTopologyWorkerTask
} from "./grid-topology-worker-task.js";
import {
  collectSocialExpansionWorkerTransferables,
  runSocialExpansionWorkerTask,
  SOCIAL_EXPANSION_WORKER_TASK
} from "./social-expansion-worker-task.js";
import {
  collectEconomyWorkerTransferables,
  ECONOMY_WORKER_TASK,
  runEconomyWorkerTask
} from "./economy-worker-task.js";
import {
  collectPopulationWorkerTransferables,
  POPULATION_WORKER_TASK,
  runPopulationWorkerTask
} from "./population-worker-task.js";
import {
  collectRoutePathWorkerTransferables,
  ROUTE_PATH_WORKER_TASK,
  runRoutePathWorkerTask
} from "./route-path-worker-task.js";
import {
  collectMilitaryPolicyWorkerTransferables,
  MILITARY_POLICY_WORKER_TASK,
  runMilitaryPolicyWorkerTask
} from "./military-policy-worker-task.js";

const WORKER_TASK_HANDLERS = Object.freeze({
  "regeneration.compute": runRegenerationWorkerTask,
  [MAP_FILE_IO_WORKER_TASK_TYPE]: runMapFileIoWorkerTask,
  [RENDER_PREPARATION_TASK]: executeRenderPreparationTask,
  [HEIGHT_DERIVED_WORKER_TASK]: runHeightDerivedWorkerTask,
  [CLIMATE_DOWNSTREAM_WORKER_TASK]: runClimateDownstreamWorkerTask,
  [OCEAN_CURRENT_WORLD_WORKER_TASK]: runOceanCurrentWorldWorkerTask,
  [GRID_TOPOLOGY_WORKER_TASK]: runGridTopologyWorkerTask,
  [SOCIAL_EXPANSION_WORKER_TASK]: runSocialExpansionWorkerTask,
  [ECONOMY_WORKER_TASK]: runEconomyWorkerTask,
  [POPULATION_WORKER_TASK]: runPopulationWorkerTask,
  [ROUTE_PATH_WORKER_TASK]: runRoutePathWorkerTask,
  [MILITARY_POLICY_WORKER_TASK]: runMilitaryPolicyWorkerTask
});

const WORKER_TASK_TRANSFER_COLLECTORS = Object.freeze({
  "regeneration.compute": collectRegenerationWorkerTransferables,
  [MAP_FILE_IO_WORKER_TASK_TYPE]: collectMapFileIoWorkerTransferables,
  [RENDER_PREPARATION_TASK]: collectRenderPreparationTransfers,
  [HEIGHT_DERIVED_WORKER_TASK]: collectHeightDerivedWorkerTransferables,
  [CLIMATE_DOWNSTREAM_WORKER_TASK]: collectClimateDownstreamWorkerTransferables,
  [OCEAN_CURRENT_WORLD_WORKER_TASK]: collectOceanCurrentWorldWorkerTransferables,
  [GRID_TOPOLOGY_WORKER_TASK]: collectGridTopologyWorkerTransferables,
  [SOCIAL_EXPANSION_WORKER_TASK]: collectSocialExpansionWorkerTransferables,
  [ECONOMY_WORKER_TASK]: collectEconomyWorkerTransferables,
  [POPULATION_WORKER_TASK]: collectPopulationWorkerTransferables,
  [ROUTE_PATH_WORKER_TASK]: collectRoutePathWorkerTransferables,
  [MILITARY_POLICY_WORKER_TASK]: collectMilitaryPolicyWorkerTransferables
});

export function getWorkerTaskHandler(task) {
  const normalized = String(task || "");
  const handler = WORKER_TASK_HANDLERS[normalized];
  if (!handler) {
    const error = new Error(`不支持的 Worker 任务：${normalized || "(empty)"}`);
    error.code = "worker_task_unsupported";
    throw error;
  }
  return handler;
}

export function listWorkerTasks() {
  return Object.keys(WORKER_TASK_HANDLERS);
}

export function collectWorkerTaskTransferables(task, result) {
  return WORKER_TASK_TRANSFER_COLLECTORS[String(task || "")]?.(result) || [];
}
