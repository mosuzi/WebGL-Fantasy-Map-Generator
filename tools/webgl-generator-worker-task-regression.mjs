import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {runInNewContext} from "node:vm";
import {createGenerationSummary, generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {buildZones} from "../app/webgl-generator/src/generator/zones.js";
import {PlaceholderMapRenderer} from "../app/webgl-generator/src/renderer/placeholder-renderer.js";
import {createDomainPatchCommand} from "../app/webgl-generator/src/runtime/domain-patch.js";
import {collectRegenerationWorkerTransferables, getRegenerationPatchPolicy, REGENERATION_WORKER_KINDS, runRegenerationWorkerTask} from "../app/webgl-generator/src/runtime/regeneration-worker-task.js";
import {createWorkerTaskCoordinator} from "../app/webgl-generator/src/runtime/worker-task-coordinator.js";
import {getWorkerTaskHandler} from "../app/webgl-generator/src/runtime/worker-task-registry.js";
import {applyMapReplicaPatch, createMapReplicaPatch} from "../app/webgl-generator/src/runtime/map-replica-journal.js";
import {computeAppliedMapReplicaPatchTargetChecksum, computeCanonicalMapReplicaChecksum, computeMapReplicaPatchTargetChecksum} from "../app/webgl-generator/src/runtime/map-replica-checksum.js";
import {createWorkerGraphDecoder, encodeWorkerGraph} from "../app/webgl-generator/src/runtime/worker-graph-stream.js";
import {createStagedWorkerSnapshot} from "../app/webgl-generator/src/runtime/worker-snapshot.js";
import {runMapFileIoWorkerTask} from "../app/webgl-generator/src/runtime/map-file-io-worker-task.js";
import {materializeMapAdoptionHandoff} from "../app/webgl-generator/src/runtime/map-adoption-handoff.js";
import {
  createWorkerTaskExecution,
  createWorkerTaskMessage,
  createWorkerTaskRequest,
  createWorkerTaskStreamAck,
  createWorkerTaskStreamPacket,
  WORKER_TASK_MESSAGE
} from "../app/webgl-generator/src/runtime/worker-task-protocol.js";

class FakeWorker {
  constructor(options = {}) {
    this.options = options;
    this.listeners = {message: new Set(), error: new Set(), messageerror: new Set()};
    this.terminated = false;
    this.request = null;
    this.decoder = null;
    this.payload = undefined;
    this.outputInflight = new Set();
    this.outputWaiters = new Set();
    this.unackedInputs = 0;
    this.maxInputInflight = 0;
    this.maxOutputInflight = 0;
    this.retainedSession = null;
    this.renderOnlyRecords = [];
    this.archiveRecords = [];
  }

  addEventListener(type, listener) {
    this.listeners[type]?.add(listener);
  }

  removeEventListener(type, listener) {
    this.listeners[type]?.delete(listener);
  }

  postMessage(request, transferables = []) {
    const clonedRequest = structuredClone(request, transferables.length ? {transfer: transferables} : undefined);
    queueMicrotask(async () => {
      if (this.terminated) return;
      request = clonedRequest;
      if (request.type === WORKER_TASK_MESSAGE.APPLY_SESSION_PATCH) {
        if (!this.retainedSession || this.retainedSession.status !== "idle" || this.retainedSession.id !== request.sessionId) return;
        applyMapReplicaPatch(this.retainedSession.map, request.patch);
        const actualChecksum = await computeAppliedMapReplicaPatchTargetChecksum(this.retainedSession.map, request.patch, {yieldToMain: async () => {}});
        this.retainedSession.binding = request.binding;
        this.retainedSession.checksum = actualChecksum;
        this.retainedSession.request = {...this.retainedSession.request, binding: request.binding, reuseSession: true};
        this.emitMessage(createWorkerTaskMessage(WORKER_TASK_MESSAGE.SESSION_PATCHED, this.retainedSession.request, {
          patchId: request.patch.patchId,
          revision: request.patch.targetRevision,
          checksum: actualChecksum
        }));
        return;
      }
      if (request.type === WORKER_TASK_MESSAGE.COMMIT_SESSION) {
        if (!this.retainedSession || this.retainedSession.status !== "pending" || this.retainedSession.id !== request.sessionId) return;
        this.retainedSession.status = "idle";
        this.retainedSession.binding = request.binding;
        this.retainedSession.request = {...this.retainedSession.request, binding: request.binding, reuseSession: true};
        this.emitMessage(createWorkerTaskMessage(WORKER_TASK_MESSAGE.SESSION_COMMITTED, this.retainedSession.request));
        return;
      }
      if (request.type === WORKER_TASK_MESSAGE.RUN) {
        if (request.reuseSession && (!this.retainedSession || this.retainedSession.status !== "idle" || this.retainedSession.id !== request.sessionId)) {
          this.emitMessage(createWorkerTaskMessage(WORKER_TASK_MESSAGE.ERROR, request, {
            error: {name: "Error", code: "worker_protocol_session_stale", message: "stale-session"}
          }));
          return;
        }
        this.request = request;
        this.decoder = null;
        this.payload = undefined;
        this.baseMap = request.reuseSession ? this.retainedSession.map : null;
        if (this.options.errorBeforeReady) {
          this.emit("error", {error: new Error("before-ready-failure"), message: "before-ready-failure"});
          return;
        }
        if (this.options.neverReady) return;
        if (this.options.resultBeforeReady) {
          this.emit("message", {data: createWorkerTaskMessage(WORKER_TASK_MESSAGE.RESULT, request, {result: {}})});
          return;
        }
        if (this.options.acceptedBeforeReady) {
          this.emit("message", {data: createWorkerTaskMessage(WORKER_TASK_MESSAGE.ACCEPTED, request)});
          return;
        }
        this.emit("message", {data: createWorkerTaskMessage(WORKER_TASK_MESSAGE.READY, request)});
        if (this.options.duplicateReady) this.emit("message", {data: createWorkerTaskMessage(WORKER_TASK_MESSAGE.READY, request)});
        return;
      }
      if (request.type === WORKER_TASK_MESSAGE.INPUT_PACKET) {
        if (this.options.workerInboundMessageError || this.options.failBeforeAccepted) {
          this.emitMessage(createWorkerTaskMessage(WORKER_TASK_MESSAGE.ERROR, this.request, {
            error: {name: "Error", code: "worker_protocol_deserialize_failed", message: "before-accepted-failure"}
          }));
          return;
        }
        if (this.options.progressBeforeAccepted) {
          this.emitMessage(createWorkerTaskMessage(WORKER_TASK_MESSAGE.PROGRESS, this.request, {stage: "invalid-order"}));
          return;
        }
        if (!this.decoder) this.decoder = createWorkerGraphDecoder({
          streamId: `${this.request.requestId}:input`,
          checksum: this.request.persistentSession && !this.request.reuseSession && !this.request.adoptResultMap
        });
        const complete = this.decoder.push(request.packet);
        if (complete) {
          this.payload = this.decoder.finish();
          this.replicaChecksum = this.decoder.checksum;
        }
        this.unackedInputs += 1;
        this.maxInputInflight = Math.max(this.maxInputInflight, this.unackedInputs);
        const ack = createWorkerTaskStreamAck(WORKER_TASK_MESSAGE.INPUT_ACK, this.request, {
          streamId: request.streamId,
          sequence: this.options.mismatchInputAck ? request.sequence + 1 : request.sequence
        });
        const finishInputPacket = () => {
          if (this.terminated) return;
          this.unackedInputs -= 1;
          this.emitMessage(ack);
          if (complete) {
            this.emitMessage(createWorkerTaskMessage(WORKER_TASK_MESSAGE.INPUT_READY, this.request, {
              streamId: request.streamId
            }));
          }
        };
        if (this.options.inputAckDelayMs) setTimeout(finishInputPacket, this.options.inputAckDelayMs);
        else finishInputPacket();
        return;
      }
      if (request.type === WORKER_TASK_MESSAGE.OUTPUT_ACK) {
        if (!this.outputInflight.has(request.sequence)) return;
        this.outputInflight.delete(request.sequence);
        for (const resolve of this.outputWaiters) resolve();
        this.outputWaiters.clear();
        return;
      }
      if (this.options.workerInboundMessageError || this.options.failBeforeAccepted) {
        this.emit("message", {data: createWorkerTaskMessage(WORKER_TASK_MESSAGE.ERROR, request, {
          error: {name: "Error", code: "worker_protocol_deserialize_failed", message: "before-accepted-failure"}
        })});
        return;
      }
      if (this.options.neverAccept) return;
      this.emitMessage(createWorkerTaskMessage(WORKER_TASK_MESSAGE.ACCEPTED, this.request));
      this.options.afterAccepted?.();
      if (this.options.sessionCommittedAfterAccepted) {
        this.emitMessage(createWorkerTaskMessage(WORKER_TASK_MESSAGE.SESSION_COMMITTED, this.request));
        return;
      }
      if (this.options.duplicateAccepted) {
        this.emitMessage(createWorkerTaskMessage(WORKER_TASK_MESSAGE.ACCEPTED, this.request));
        return;
      }
      if (this.options.outboundMessageError) {
        this.emit("messageerror", {error: new Error("outbound-messageerror")});
        return;
      }
      if (this.options.emitProgress) {
        this.emitMessage(createWorkerTaskMessage(WORKER_TASK_MESSAGE.PROGRESS, this.request, {stage: "fixture-progress"}));
      }
      if (this.options.hang) return;
      if (this.options.failAfterAccepted) {
        this.emit("error", {error: new Error("accepted-failure"), message: "accepted-failure"});
        return;
      }
      try {
        const handlerPayload = this.request.reuseSession ? {...this.payload, map: this.baseMap} : this.payload;
        let replicaChecksum = this.request.persistentSession
          ? this.request.reuseSession
            ? this.retainedSession?.checksum || null
            : this.replicaChecksum
          : null;
        const renderOnlyBefore = handlerPayload?.mode === "render-only" ? structuredClone(handlerPayload.map) : null;
        let adoptedMap = null;
        const result = await getWorkerTaskHandler(this.request.task)(handlerPayload, {
          binding: this.request.binding,
          checkpoint: () => true,
          report: () => {},
          ...(this.request.adoptResultMap ? {adoptMap: map => { adoptedMap = map; }} : {})
        });
        if (renderOnlyBefore) {
          assert.deepEqual(handlerPayload.map, renderOnlyBefore, "render-only handler 不得改写 Worker 地图镜像");
          this.renderOnlyRecords.push({
            inputHasMap: Object.prototype.hasOwnProperty.call(this.payload || {}, "map"),
            resultKeys: Object.keys(result).sort(),
            mapSummary: structuredClone(handlerPayload.map.summary),
            generationLog: structuredClone(handlerPayload.map.generationLog),
            metadataRegeneration: structuredClone(handlerPayload.map.metadata?.regeneration || {})
          });
        }
        if (handlerPayload?.mode === "archive-export") {
          this.archiveRecords.push({
            inputHasMap: Object.prototype.hasOwnProperty.call(this.payload || {}, "map"),
            resultKeys: Object.keys(result).sort(),
            archiveKeys: Object.keys(result.archive || {}).sort()
          });
        }
        const emitResult = async () => {
          const outputStreamId = `${this.request.requestId}:output`;
          const retainedAdoption = Boolean(this.request.adoptResultMap || (this.request.reuseSession && this.retainedSession?.adoptResultMap));
          for await (const packet of encodeWorkerGraph(result, {
            streamId: outputStreamId,
            checksum: this.request.adoptResultMap === true,
            yieldToMain: async () => {}
          })) {
            while (this.outputInflight.size >= 4) await new Promise(resolve => this.outputWaiters.add(resolve));
            this.outputInflight.add(packet.message.sequence);
            this.maxOutputInflight = Math.max(this.maxOutputInflight, this.outputInflight.size);
            const outputMessage = createWorkerTaskStreamPacket(WORKER_TASK_MESSAGE.OUTPUT_PACKET, this.request, packet.message);
            if (this.options.mismatchOutputSequence) outputMessage.sequence += 1;
            this.emitMessage(outputMessage, packet.transferables);
            if (packet.message.done && this.request.adoptResultMap) replicaChecksum = packet.message.checksum;
          }
          while (this.outputInflight.size) await new Promise(resolve => this.outputWaiters.add(resolve));
          if (this.request.persistentSession) {
            this.retainedSession = {
              id: this.request.sessionId,
              status: "pending",
              binding: this.request.binding,
              checksum: replicaChecksum,
              request: this.request,
              map: this.request.adoptResultMap ? adoptedMap : handlerPayload.map,
              adoptResultMap: retainedAdoption
            };
          }
          this.emitMessage(createWorkerTaskMessage(WORKER_TASK_MESSAGE.RESULT, this.request, {resultStreamId: outputStreamId, replicaChecksum}));
        };
        if (this.options.resultDelayMs) setTimeout(emitResult, this.options.resultDelayMs);
        else await emitResult();
      } catch (error) {
        this.emit("error", {error, message: error.message});
      }
    });
  }

  terminate() {
    this.terminated = true;
  }

  emit(type, event) {
    for (const listener of this.listeners[type] || []) listener(event);
  }

  emitMessage(message, transferables = []) {
    const cloned = structuredClone(message, transferables.length ? {transfer: transferables} : undefined);
    this.emit("message", {data: cloned});
  }
}

if (process.argv.includes("--app-replay-static")) {
  console.log(JSON.stringify({
    ok: true,
    appDeferredReplayStaticSummary: verifyAppDeferredReplayStaticContract(),
    deferredRendererSummary: verifyDeferredRendererReplay()
  }, null, 2));
  process.exit(0);
}

const source = generatePlaceholderMap({seed: "worker-task-skeleton", cellsTarget: 1000, heightmapTemplate: "continents"});
const original = structuredClone(source);
const binding = {mapIdentity: "fixture", mapRevision: 0, generationToken: 1, lockFingerprint: "none", operationId: 7, operationName: "generate.regenerate"};
let currentBinding = {...binding};
let fallbackCount = 0;

const coordinator = createWorkerTaskCoordinator({
  createWorker: () => new FakeWorker(),
  getBinding: () => currentBinding,
  validateBinding: expected => JSON.stringify(expected) === JSON.stringify(currentBinding),
  onFallback: () => fallbackCount += 1
});
const workerResult = await coordinator.run("regeneration.compute", {map: source, kind: "zones"});
assert.equal(workerResult.worker.mode, "worker");
assert.equal(workerResult.result.executed, true);
assert.equal(source.metadata.regeneration?.zones, original.metadata.regeneration?.zones, "Worker 输入不得改写正式地图");

const fallbackResult = await coordinator.run("regeneration.compute", {map: source, kind: "zones"}, {forceFallback: true});
assert.equal(fallbackResult.worker.mode, "fallback");
assert.deepEqual(normalizeSemanticResult(fallbackResult), normalizeSemanticResult(workerResult), "Worker 与同 handler 降级结果必须语义一致");
assert.equal(fallbackCount, 1);

const strictFallbackCases = [
  {name: "force-fallback", createWorker: () => new FakeWorker(), options: {forceFallback: true}},
  {name: "constructor-failure", createWorker: () => { throw new Error("worker-constructor-failure"); }, options: {}},
  {name: "worker-unavailable", createWorker: () => null, options: {}},
  {name: "before-ready-failure", createWorker: () => new FakeWorker({errorBeforeReady: true}), options: {}}
];
for (const fixture of strictFallbackCases) {
  let strictFallbacks = 0;
  const strictCoordinator = createWorkerTaskCoordinator({
    createWorker: fixture.createWorker,
    getBinding: () => binding,
    validateBinding: () => true,
    onFallback: () => { strictFallbacks++; }
  });
  await assert.rejects(
    strictCoordinator.run("regeneration.compute", {map: original, kind: "zones"}, {...fixture.options, allowFallback: false}),
    error => error?.code === "worker_fallback_disabled",
    `${fixture.name} 禁止降级时必须拒绝`
  );
  assert.equal(strictFallbacks, 0, `${fixture.name} 禁止降级时不得触发 onFallback`);
  assert.equal(strictCoordinator.getSessionSnapshot(), null, `${fixture.name} 禁止降级失败后不得保留 session`);
}

const boundedWorker = new FakeWorker({inputAckDelayMs: 2});
const boundedResult = await createWorkerTaskCoordinator({
  createWorker: () => boundedWorker,
  getBinding: () => binding,
  validateBinding: () => true
}).run("regeneration.compute", {map: original, kind: "zones"}, {
  streamPacketUnits: 64,
  streamWindow: 4
});
assert.equal(boundedResult.worker.mode, "worker");
assert.ok(boundedWorker.maxInputInflight <= 4, `输入流在途包必须有界：${boundedWorker.maxInputInflight}`);
assert.ok(boundedWorker.maxOutputInflight <= 4, `结果流在途包必须有界：${boundedWorker.maxOutputInflight}`);

const mismatchedInput = await createWorkerTaskCoordinator({
  createWorker: () => new FakeWorker({mismatchInputAck: true}),
  getBinding: () => binding,
  validateBinding: () => true
}).run("regeneration.compute", {map: original, kind: "zones"});
assert.equal(mismatchedInput.worker.mode, "fallback", "accepted 前输入 ACK 错绑必须安全降级");

const patchTransferView = new Uint8Array([1, 2, 3]);
const preparedTransferView = new Float32Array([4, 5, 6]);
const archiveTransferView = new Uint8Array([7, 8, 9]);
const combinedTransfers = collectRegenerationWorkerTransferables({
  patch: {value: patchTransferView, alias: patchTransferView},
  preparedRender: {layers: {point: {vertices: preparedTransferView}}},
  archive: {data: archiveTransferView}
});
assert.equal(combinedTransfers.length, 3, "补丁、prepared render 与存档 bytes 的 transfer buffer 必须同时收集且去重");
assert.ok(combinedTransfers.includes(patchTransferView.buffer));
assert.ok(combinedTransfers.includes(preparedTransferView.buffer));
assert.ok(combinedTransfers.includes(archiveTransferView.buffer));
await assert.rejects(
  runRegenerationWorkerTask({mode: "render-only", render: {}}, {}),
  error => error?.code === "worker_regeneration_map_missing"
);
await assert.rejects(
  runRegenerationWorkerTask({mode: "render-only", map: structuredClone(original)}, {}),
  error => error?.code === "worker_regeneration_render_missing"
);

await assert.rejects(
  createWorkerTaskCoordinator({
    createWorker: () => new FakeWorker({mismatchOutputSequence: true}),
    getBinding: () => binding,
    validateBinding: () => true
  }).run("regeneration.compute", {map: original, kind: "zones"}),
  error => error?.code === "worker_protocol_stream_binding_invalid"
);

let sessionBinding = {...binding};
const sessionWorkers = [];
const sessionCoordinator = createWorkerTaskCoordinator({
  createWorker: () => {
    const worker = new FakeWorker();
    sessionWorkers.push(worker);
    return worker;
  },
  getBinding: () => sessionBinding,
  validateBinding: expected => JSON.stringify(expected) === JSON.stringify(sessionBinding)
});
const sessionFormal = structuredClone(original);
const firstSessionResult = await sessionCoordinator.run("regeneration.compute", {map: sessionFormal, kind: "zones"}, {
  binding: sessionBinding,
  sessionMode: "map-mirror",
  sessionPayload: {kind: "zones"}
});
assert.equal(firstSessionResult.worker.session.reused, false);
for (const key of ["setupMs", "domainComputeMs", "patchCaptureMs", "renderPrepareWorkerMs", "totalTaskMs"]) {
  assert.ok(Number.isFinite(firstSessionResult.timings?.[key]) && firstSessionResult.timings[key] >= 0, `重生成缺少 ${key} 阶段计时`);
}
assert.ok(firstSessionResult.timings.totalTaskMs >= firstSessionResult.timings.domainComputeMs, "领域计算时间大于 Worker 任务总时间");
applyWorkerPatch(sessionFormal, "zones", firstSessionResult.patch);
sessionBinding = {...sessionBinding, mapRevision: 1};
assert.equal(await sessionCoordinator.commitSession(firstSessionResult.worker.session.id, sessionBinding, {expectedRevisionDelta: 1}), true);
sessionBinding = {...sessionBinding, operationId: 8};
const renderOnlyFormalBefore = structuredClone(sessionFormal);
const renderOnlyResult = await sessionCoordinator.run("regeneration.compute", {
  map: sessionFormal,
  mode: "render-only",
  kind: "must-not-be-normalized",
  render: {
    binding: sessionBinding,
    camera: {scale: 1, offsetX: 0, offsetY: 0},
    canvas: {width: 800, height: 600, clientWidth: 800, clientHeight: 600},
    visibility: {},
    layers: ["point"]
  }
}, {
  binding: sessionBinding,
  sessionMode: "map-mirror",
  allowFallback: false
});
assert.equal(renderOnlyResult.mode, "render-only");
assert.equal(renderOnlyResult.worker.session.reused, true);
assert.equal(renderOnlyResult.worker.session.id, firstSessionResult.worker.session.id);
assert.equal(renderOnlyResult.worker.session.pending, true);
assert.ok(renderOnlyResult.preparedRender?.layers?.point?.vertices instanceof Float32Array);
for (const forbidden of ["patch", "result", "summary", "generationLog", "refresh"]) {
  assert.equal(Object.prototype.hasOwnProperty.call(renderOnlyResult, forbidden), false, `render-only 不得返回 ${forbidden}`);
}
assert.deepEqual(sessionFormal, renderOnlyFormalBefore, "render-only session 不得改写正式地图、摘要或历史载荷");
assert.equal(sessionWorkers.length, 1, "render-only 必须复用同一 Worker");
assert.equal(sessionWorkers[0].renderOnlyRecords.length, 1);
assert.equal(sessionWorkers[0].renderOnlyRecords[0].inputHasMap, false, "复用 session 的 render-only 输入不得重传 map");
assert.deepEqual(sessionWorkers[0].renderOnlyRecords[0].resultKeys, ["binding", "mode", "preparedRender"]);
assert.equal(sessionCoordinator.getSessionSnapshot()?.status, "pending");
assert.equal(await sessionCoordinator.commitSession(renderOnlyResult.worker.session.id, sessionBinding, {expectedRevisionDelta: 0}), true);
assert.equal(sessionCoordinator.getSessionSnapshot()?.status, "idle");
assert.equal(sessionCoordinator.getSessionSnapshot()?.id, firstSessionResult.worker.session.id);
sessionBinding = {...sessionBinding, operationId: 9};
const archiveResult = await sessionCoordinator.run("regeneration.compute", {
  map: sessionFormal,
  mode: "archive-export",
  archive: {operation: "export", encoding: "gzip", resultType: "bytes", options: sessionFormal.options || {}}
}, {
  binding: sessionBinding,
  sessionMode: "map-mirror",
  sessionPayload: {mode: "archive-export", archive: {operation: "export", encoding: "gzip", resultType: "bytes", options: sessionFormal.options || {}}}
});
assert.equal(archiveResult.mode, "archive-export");
assert.equal(archiveResult.worker.session.reused, true);
assert.equal(archiveResult.worker.session.id, firstSessionResult.worker.session.id);
assert.ok(archiveResult.archive.data instanceof Uint8Array);
assert.equal(archiveResult.archive.timings.serializationPasses, 1);
assert.equal(sessionWorkers[0].archiveRecords.length, 1);
assert.equal(sessionWorkers[0].archiveRecords[0].inputHasMap, false, "同图存档不得重传 map");
assert.deepEqual(sessionWorkers[0].archiveRecords[0].resultKeys, ["archive", "binding", "mode"]);
const archivedDocument = await runMapFileIoWorkerTask({
  operation: "import",
  input: {kind: "bytes", bytes: archiveResult.archive.data, mimeType: "application/gzip"}
});
assert.equal(archivedDocument.metadata.checksum, sessionFormal.metadata.checksum);

let adoptionBinding = {...binding, mapIdentity: "before-import", operationId: 30};
const adoptionWorkers = [];
const adoptionCoordinator = createWorkerTaskCoordinator({
  createWorker: () => {
    const worker = new FakeWorker();
    adoptionWorkers.push(worker);
    return worker;
  },
  getBinding: () => adoptionBinding,
  validateBinding: expected => JSON.stringify(expected) === JSON.stringify(adoptionBinding)
});
const adoptedImport = await adoptionCoordinator.run("map-file-io", {
  operation: "import",
  input: {kind: "bytes", bytes: archiveResult.archive.data, mimeType: "application/gzip"}
}, {
  binding: adoptionBinding,
  sessionMode: "adopt-result-map",
  allowFallback: false
});
assert.equal(Object.hasOwn(adoptedImport, "map"), false, "adoption 输出不得回传完整 map 对象图");
assert.equal(Object.hasOwn(adoptedImport, "document"), false, "adoption 输出不得回传完整 document 对象图");
const adoptedDocument = await materializeMapAdoptionHandoff(adoptedImport.handoff);
assert.equal(adoptedDocument.map.metadata.checksum, sessionFormal.metadata.checksum);
assert.equal(adoptedImport.worker.session.reused, false);
assert.equal(adoptionCoordinator.getSessionSnapshot()?.status, "pending");
assert.equal(adoptionCoordinator.getSessionSnapshot()?.adopted, true);
assert.ok(adoptionCoordinator.getSessionSnapshot()?.checksum, "adoption 必须以结果流 checksum 建立 owner");
adoptionBinding = {...adoptionBinding, mapIdentity: "imported-map", mapRevision: 0};
assert.equal(await adoptionCoordinator.commitSession(adoptedImport.worker.session.id, adoptionBinding, {adoptResultMap: true}), true);
assert.equal(adoptionCoordinator.getSessionSnapshot()?.status, "idle");
assert.equal(adoptionWorkers[0].retainedSession.map.metadata.checksum, adoptedDocument.map.metadata.checksum);
const adoptedSave = await adoptionCoordinator.run("map-file-io", {
  map: adoptedDocument.map,
  operation: "export",
  encoding: "gzip",
  resultType: "bytes",
  options: adoptedDocument.map.options || {}
}, {
  binding: adoptionBinding,
  sessionMode: "map-mirror",
  sessionPayload: {operation: "export", encoding: "gzip", resultType: "bytes", options: adoptedDocument.map.options || {}},
  allowFallback: false
});
assert.equal(adoptedSave.worker.session.reused, true, "导入 adoption 后首次保存必须复用同一 owner");
assert.equal(adoptionWorkers.length, 1, "导入 adoption 后首次保存不得重建 Worker");
assert.ok(adoptedSave.worker.telemetry.inputPackets <= 3, `导入 adoption 后首次保存不得重传地图：${adoptedSave.worker.telemetry.inputPackets}`);
assert.equal(await adoptionCoordinator.commitSession(adoptedSave.worker.session.id, adoptionBinding, {expectedRevisionDelta: 0}), true);
assert.equal(adoptionCoordinator.getSessionSnapshot()?.adopted, true, "后续复用保存不得丢失 adoption owner 来源");

let adoptedGenerationMap = null;
const adoptedGeneration = await getWorkerTaskHandler("generation.compute")({
  options: {seed: "worker-adoption-generation", cellsTarget: 1000, heightmapTemplate: "continents"}
}, {
  binding,
  checkpoint: () => true,
  report: () => {},
  adoptMap: map => { adoptedGenerationMap = map; }
});
assert.equal(Object.hasOwn(adoptedGeneration, "map"), false, "生成 adoption 输出不得回传完整 map 对象图");
const adoptedGenerationDocument = await materializeMapAdoptionHandoff(adoptedGeneration.handoff);
assert.equal(adoptedGenerationMap.metadata.checksum, adoptedGenerationDocument.map.metadata.checksum);
assert.equal(await sessionCoordinator.commitSession(archiveResult.worker.session.id, sessionBinding, {expectedRevisionDelta: 0}), true);
sessionBinding = {...sessionBinding, operationId: 10};
const secondSessionResult = await sessionCoordinator.run("regeneration.compute", {map: sessionFormal, kind: "routes"}, {
  binding: sessionBinding,
  sessionMode: "map-mirror",
  sessionPayload: {kind: "routes"}
});
assert.equal(secondSessionResult.worker.session.reused, true);
assert.ok(secondSessionResult.worker.telemetry.inputPackets < firstSessionResult.worker.telemetry.inputPackets / 4, "复用 Worker 镜像后输入包数必须骤降");
for (const key of ["mainReplicaChecksumMs", "inputAckWaitMs", "outputDecodeCpuMs", "outputDecodeCpuMaxMs", "outputAckPostMaxMs"]) {
  assert.ok(Number.isFinite(firstSessionResult.worker.telemetry[key]) && firstSessionResult.worker.telemetry[key] >= 0, `首次 Worker 会话缺少 ${key} telemetry`);
}
assert.equal(secondSessionResult.worker.telemetry.mainReplicaChecksumMs, 0, "复用会话不应再次扫描主线程 checksum");
const computeWorkerSource = readFileSync(new URL("../app/webgl-generator/src/runtime/compute-worker.js", import.meta.url), "utf8");
for (const key of ["inputDecodeCpuMs", "inputDecodeCpuMaxMs", "workerReplicaChecksumMs", "outputWorkerAckWaitMs"]) {
  assert.match(computeWorkerSource, new RegExp(`\\b${key}\\b`, "u"), `正式 compute-worker 缺少 ${key} telemetry`);
}
applyWorkerPatch(sessionFormal, "routes", secondSessionResult.patch);
sessionBinding = {...sessionBinding, mapRevision: 2};
assert.equal(await sessionCoordinator.commitSession(secondSessionResult.worker.session.id, sessionBinding, {expectedRevisionDelta: 1}), true);
assert.equal(sessionWorkers.length, 1, "连续同图重算必须复用同一个 Worker");
sessionBinding = {...sessionBinding, operationId: 11};
const crossTaskResult = await sessionCoordinator.run("map-file-io", {
  map: sessionFormal,
  operation: "export",
  encoding: "gzip",
  resultType: "bytes",
  options: sessionFormal.options || {}
}, {
  binding: sessionBinding,
  sessionMode: "map-mirror",
  sessionPayload: {operation: "export", encoding: "gzip", resultType: "bytes", options: sessionFormal.options || {}}
});
assert.equal(crossTaskResult.worker.session.reused, true, "跨 task 必须复用同一地图副本");
assert.equal(crossTaskResult.worker.session.id, firstSessionResult.worker.session.id);
assert.equal(crossTaskResult.kind, "map-file-export-result");
assert.ok(crossTaskResult.data instanceof Uint8Array);
assert.equal(sessionWorkers.length, 1, "跨 task 不得重建 Worker 或重传地图");
assert.ok(crossTaskResult.worker.telemetry.inputPackets < firstSessionResult.worker.telemetry.inputPackets / 4);
assert.equal(await sessionCoordinator.commitSession(crossTaskResult.worker.session.id, sessionBinding, {expectedRevisionDelta: 0}), true);
const replicaWrites = [{path: "metadata.name", mode: "replace", value: "副本增量已应用"}];
const replicaBaseChecksum = sessionCoordinator.getSessionSnapshot().checksum;
const replicaPatch = createMapReplicaPatch({
  mapIdentity: sessionBinding.mapIdentity,
  patchId: "worker-task-cross-task-patch",
  baseRevision: 2,
  targetRevision: 3,
  baseChecksum: replicaBaseChecksum,
  targetChecksum: await computeMapReplicaPatchTargetChecksum(replicaBaseChecksum, replicaWrites, {yieldToMain: async () => {}}),
  writes: replicaWrites
});
sessionFormal.metadata.name = "副本增量已应用";
sessionBinding = {...sessionBinding, mapRevision: 3, operationId: 12};
assert.equal(await sessionCoordinator.applySessionPatch(crossTaskResult.worker.session.id, replicaPatch, sessionBinding), true);
assert.equal(sessionWorkers[0].retainedSession.map.metadata.name, "副本增量已应用");
assert.equal(sessionCoordinator.getSessionSnapshot()?.binding.mapRevision, 3);
const queuedWrites4 = [{path: "metadata.generatorStage", mode: "replace", value: "queue-4"}];
const queuedBaseChecksum4 = sessionCoordinator.getSessionSnapshot().checksum;
const queuedPatch4 = createMapReplicaPatch({
  mapIdentity: sessionBinding.mapIdentity, patchId: "queued-4", baseRevision: 3, targetRevision: 4,
  baseChecksum: queuedBaseChecksum4,
  targetChecksum: await computeMapReplicaPatchTargetChecksum(queuedBaseChecksum4, queuedWrites4, {yieldToMain: async () => {}}),
  writes: queuedWrites4
});
const binding4 = {...sessionBinding, mapRevision: 4, operationId: 13};
sessionBinding = binding4;
const queued4 = sessionCoordinator.applySessionPatch(crossTaskResult.worker.session.id, queuedPatch4, binding4);
const queuedWrites5 = [{path: "metadata.name", mode: "replace", value: "queue-5"}];
const queuedTargetChecksum4 = queuedPatch4.targetChecksum;
const queuedPatch5 = createMapReplicaPatch({
  mapIdentity: sessionBinding.mapIdentity, patchId: "queued-5", baseRevision: 4, targetRevision: 5,
  baseChecksum: queuedTargetChecksum4,
  targetChecksum: await computeMapReplicaPatchTargetChecksum(queuedTargetChecksum4, queuedWrites5, {yieldToMain: async () => {}}),
  writes: queuedWrites5
});
const binding5 = {...sessionBinding, mapRevision: 5, operationId: 14};
sessionBinding = binding5;
const queued5 = sessionCoordinator.applySessionPatch(crossTaskResult.worker.session.id, queuedPatch5, binding5);
assert.deepEqual(await Promise.all([queued4, queued5]), [true, true], "连续地图 patch 必须按 revision 串行 ACK");
assert.equal(sessionWorkers[0].retainedSession.map.metadata.generatorStage, "queue-4");
assert.equal(sessionWorkers[0].retainedSession.map.metadata.name, "queue-5");
assert.equal(sessionCoordinator.getSessionSnapshot()?.binding.mapRevision, 5);
sessionBinding = {...sessionBinding, operationId: 15};
const preCancelledSession = new AbortController();
preCancelledSession.abort("pre-cancelled-session");
await assert.rejects(
  sessionCoordinator.run("regeneration.compute", {map: sessionFormal, kind: "zones"}, {
    binding: sessionBinding,
    signal: preCancelledSession.signal,
    sessionMode: "map-mirror",
    sessionPayload: {kind: "zones"}
  }),
  error => error?.name === "AbortError"
);
assert.equal(sessionCoordinator.getSessionSnapshot()?.status, "idle", "预取消不得把持久 session 留在 running 状态");
assert.equal(sessionCoordinator.invalidateSession("undo-fixture"), true);
assert.equal(sessionWorkers[0].terminated, true, "撤销/失效必须 terminate 持久 Worker");
assert.equal(sessionCoordinator.getSessionSnapshot(), null);

const driftWorkers = [];
const driftCoordinator = createWorkerTaskCoordinator({
  createWorker: () => {
    const worker = new FakeWorker();
    driftWorkers.push(worker);
    return worker;
  },
  validateBinding: () => true
});
const driftMap = structuredClone(sessionFormal);
let driftBinding = {mapIdentity: "checksum-drift", mapRevision: 0, generationToken: 1, lockFingerprint: "locks", operationId: 1, operationName: "generate.regenerate"};
const driftResult = await driftCoordinator.run("regeneration.compute", {map: driftMap, kind: "zones"}, {binding: driftBinding, sessionMode: "map-mirror"});
applyWorkerPatch(driftMap, "zones", driftResult.patch);
driftBinding = {...driftBinding, mapRevision: 1};
assert.equal(await driftCoordinator.commitSession(driftResult.worker.session.id, driftBinding, {expectedRevisionDelta: 1}), true);
const driftBaseChecksum = driftCoordinator.getSessionSnapshot().checksum;
const driftPatch = createMapReplicaPatch({
  mapIdentity: driftBinding.mapIdentity,
  patchId: "checksum-drift",
  baseRevision: 1,
  targetRevision: 2,
  baseChecksum: driftBaseChecksum,
  targetChecksum: "r1:0000000000000000",
  writes: [{path: "metadata.name", mode: "replace", value: "应触发重同步"}]
});
await assert.rejects(
  driftCoordinator.applySessionPatch(driftResult.worker.session.id, driftPatch, {...driftBinding, mapRevision: 2}),
  error => error?.code === "worker_protocol_session_patch_invalid"
);
assert.equal(driftCoordinator.getSessionSnapshot(), null, "checksum 漂移必须销毁 Worker 副本");
const resynced = await driftCoordinator.run("regeneration.compute", {map: driftMap, kind: "zones"}, {binding: driftBinding, sessionMode: "map-mirror"});
assert.equal(resynced.worker.session.reused, false, "checksum 漂移后的下一次请求必须完整重同步");
assert.equal(driftWorkers.length, 2);
driftCoordinator.invalidateSession("checksum-resync-fixture-complete");

const command = createDomainPatchCommand({patch: workerResult.patch, policy: getRegenerationPatchPolicy("zones"), label: "Worker 地区重算", effects: {}, result: workerResult.result});
command.apply({map: source});
assert.equal(source.metadata.regeneration.zones, (Number(original.metadata.regeneration?.zones) || 0) + 1);
const applied = structuredClone(source);
command.revert({map: source});
assert.deepEqual(source, original, "领域补丁撤销必须恢复原图");
command.apply({map: source});
assert.deepEqual(source, applied, "领域补丁重做必须恢复 Worker 结果");

const lateCoordinator = createWorkerTaskCoordinator({
  createWorker: () => new FakeWorker(),
  getBinding: () => binding,
  validateBinding: () => false,
  onFallback: () => fallbackCount += 1
});
await assert.rejects(
  lateCoordinator.run("regeneration.compute", {map: original, kind: "zones"}),
  error => error?.code === "operation_obsolete"
);

const acceptedFailure = createWorkerTaskCoordinator({
  createWorker: () => new FakeWorker({failAfterAccepted: true}),
  getBinding: () => binding,
  validateBinding: () => true,
  onFallback: () => fallbackCount += 1
});
await assert.rejects(acceptedFailure.run("regeneration.compute", {map: original, kind: "zones"}), /accepted-failure/);
assert.equal(fallbackCount, 1, "Worker accepted 后的错误不得回到主线程重算");

await assert.rejects(
  createWorkerTaskCoordinator({
    createWorker: () => new FakeWorker({sessionCommittedAfterAccepted: true}),
    getBinding: () => binding,
    validateBinding: () => true
  }).run("regeneration.compute", {map: original, kind: "zones"}),
  error => error?.code === "worker_protocol_session_commit_unexpected"
);

let acceptedCancellation;
const acceptedCancellationReady = new Promise(resolve => acceptedCancellation = resolve);
const abortController = new AbortController();
const hangingWorker = new FakeWorker({hang: true, afterAccepted: acceptedCancellation});
const cancellation = createWorkerTaskCoordinator({
  createWorker: () => hangingWorker,
  getBinding: () => binding,
  validateBinding: () => true
}).run("regeneration.compute", {map: original, kind: "zones"}, {signal: abortController.signal});
await acceptedCancellationReady;
abortController.abort("fixture-cancel");
await assert.rejects(cancellation, error => error?.name === "AbortError");
assert.equal(hangingWorker.terminated, true, "取消必须 terminate 专属 Worker");

const detachedInput = await createStagedWorkerSnapshot({map: original, kind: "zones"}, {yieldToMain: async () => {}});
let fallbackRebuilds = 0;
const beforeAcceptedFallback = createWorkerTaskCoordinator({
  createWorker: () => new FakeWorker({failBeforeAccepted: true}),
  getBinding: () => binding,
  validateBinding: () => true,
  onFallback: () => fallbackCount += 1
});
const rebuiltFallback = await beforeAcceptedFallback.run("regeneration.compute", detachedInput.snapshot, {
  transferables: detachedInput.transferables,
  payloadIsolated: true,
  fallbackPayloadFactory: async () => {
    fallbackRebuilds += 1;
    return {map: structuredClone(original), kind: "zones"};
  }
});
assert.equal(rebuiltFallback.worker.mode, "fallback");
assert.equal(fallbackRebuilds, 1, "输入流 accepted 前失败必须重建降级快照");
assert.ok(detachedInput.transferables.every(buffer => buffer.byteLength > 0), "分块图协议不得 detach 主线程隔离快照");

const readyTimeoutFallback = await createWorkerTaskCoordinator({
  createWorker: () => new FakeWorker({neverReady: true}),
  getBinding: () => binding,
  validateBinding: () => true
}).run("regeneration.compute", {map: original, kind: "zones"}, {readyTimeoutMs: 100});
assert.equal(readyTimeoutFallback.worker.mode, "fallback", "READY 超时必须安全降级");

let acceptTimeoutRebuilds = 0;
const acceptTimeoutInput = await createStagedWorkerSnapshot({map: original, kind: "zones"}, {yieldToMain: async () => {}});
const acceptTimeoutFallback = await createWorkerTaskCoordinator({
  createWorker: () => new FakeWorker({neverAccept: true}),
  getBinding: () => binding,
  validateBinding: () => true
}).run("regeneration.compute", acceptTimeoutInput.snapshot, {
  acceptTimeoutMs: 100,
  transferables: acceptTimeoutInput.transferables,
  payloadIsolated: true,
  fallbackPayloadFactory: async () => {
    acceptTimeoutRebuilds += 1;
    return {map: structuredClone(original), kind: "zones"};
  }
});
assert.equal(acceptTimeoutFallback.worker.mode, "fallback", "ACCEPTED 超时必须安全降级");
assert.equal(acceptTimeoutRebuilds, 1);

for (const invalidOrder of ["resultBeforeReady", "acceptedBeforeReady", "progressBeforeAccepted", "duplicateReady"]) {
  const ordered = await createWorkerTaskCoordinator({
    createWorker: () => new FakeWorker({[invalidOrder]: true}),
    getBinding: () => binding,
    validateBinding: () => true
  }).run("regeneration.compute", {map: original, kind: "zones"});
  assert.equal(ordered.worker.mode, "fallback", `${invalidOrder} 必须在 accepted 前安全降级`);
}

await assert.rejects(
  createWorkerTaskCoordinator({
    createWorker: () => new FakeWorker({duplicateAccepted: true}),
    getBinding: () => binding,
    validateBinding: () => true
  }).run("regeneration.compute", {map: original, kind: "zones"}),
  error => error?.code === "worker_protocol_duplicate_accept"
);

await assert.rejects(
  createWorkerTaskCoordinator({
    createWorker: () => new FakeWorker({emitProgress: true}),
    getBinding: () => binding,
    validateBinding: () => true
  }).run("regeneration.compute", {map: original, kind: "zones"}, {onProgress: () => { throw new Error("progress-callback-fault"); }}),
  /progress-callback-fault/
);

await assert.rejects(
  createWorkerTaskCoordinator({
    createWorker: () => new FakeWorker({outboundMessageError: true}),
    getBinding: () => binding,
    validateBinding: () => true
  }).run("regeneration.compute", {map: original, kind: "zones"}),
  /outbound-messageerror/
);

for (const field of ["mapIdentity", "mapRevision", "generationToken", "lockFingerprint", "operationId", "operationName"]) {
  let liveBinding = {...binding};
  const bindingCoordinator = createWorkerTaskCoordinator({
    createWorker: () => new FakeWorker({afterAccepted: () => {
      liveBinding = {...liveBinding, [field]: typeof liveBinding[field] === "number" ? liveBinding[field] + 1 : `${liveBinding[field]}-late`};
    }}),
    getBinding: () => liveBinding,
    validateBinding: expected => JSON.stringify(expected) === JSON.stringify(liveBinding)
  });
  await assert.rejects(
    bindingCoordinator.run("regeneration.compute", {map: original, kind: "zones"}, {binding}),
    error => error?.code === "operation_obsolete",
    `${field} 变化必须丢弃迟到结果`
  );
}

const forgedRiverPatch = structuredClone(workerResult.patch);
forgedRiverPatch.domain = "rivers";
forgedRiverPatch.operations = [{path: ["pack", "routes"], exists: true, value: []}];
forgedRiverPatch.writeSet = ["pack.routes"];
assert.throws(
  () => createDomainPatchCommand({patch: forgedRiverPatch, policy: getRegenerationPatchPolicy("rivers"), label: "伪造河流补丁", effects: {}}),
  error => error?.code === "worker_patch_write_set_violation"
);
const prototypePatch = structuredClone(workerResult.patch);
prototypePatch.operations = [{path: ["metadata", "__proto__", "workerPwned"], exists: true, value: true}];
prototypePatch.writeSet = ["metadata.__proto__.workerPwned"];
assert.throws(
  () => createDomainPatchCommand({patch: prototypePatch, policy: getRegenerationPatchPolicy("zones"), label: "原型污染补丁", effects: {}}),
  error => error?.code === "worker_patch_invalid"
);
assert.equal(({}).workerPwned, undefined);
const resegmentedPatch = structuredClone(nestedPatchFixture());
resegmentedPatch.operations = [{path: ["metadata", "regeneration.rivers"], exists: true, value: 1}];
assert.throws(
  () => createDomainPatchCommand({patch: resegmentedPatch, policy: getRegenerationPatchPolicy("rivers"), label: "伪造分段补丁", effects: {}}),
  error => error?.code === "worker_patch_invalid"
);
const malformedExistsPatch = structuredClone(nestedPatchFixture());
malformedExistsPatch.operations[0].exists = 1;
assert.throws(
  () => createDomainPatchCommand({patch: malformedExistsPatch, policy: getRegenerationPatchPolicy("rivers"), label: "伪造 exists 补丁", effects: {}}),
  error => error?.code === "worker_patch_invalid"
);
const mismatchedWriteSetPatch = structuredClone(nestedPatchFixture());
mismatchedWriteSetPatch.writeSet = ["metadata.derivedStale"];
assert.throws(
  () => createDomainPatchCommand({patch: mismatchedWriteSetPatch, policy: getRegenerationPatchPolicy("rivers"), label: "伪造 writeSet 补丁", effects: {}}),
  error => error?.code === "worker_patch_invalid"
);
const nestedMap = {metadata: {}};
const nestedPatch = nestedPatchFixture();
const nestedCommand = createDomainPatchCommand({patch: nestedPatch, policy: getRegenerationPatchPolicy("rivers"), label: "河流 salt 嵌套补丁", effects: {}});
nestedCommand.apply({map: nestedMap});
assert.equal(nestedMap.metadata.regeneration.rivers, 1);
const atomicMap = {first: {value: "before"}, second: {}};
Object.defineProperty(atomicMap.second, "value", {get: () => "before", set: () => { throw new Error("setter-fault"); }, configurable: true});
const atomicPatch = {
  version: 1,
  domain: "fixture",
  writeSet: ["first.value", "second.value"],
  operations: [
    {path: ["first", "value"], exists: true, value: "after"},
    {path: ["second", "value"], exists: true, value: "after"}
  ]
};
assert.throws(
  () => createDomainPatchCommand({patch: atomicPatch, policy: {domain: "fixture", allowedPaths: ["first.value", "second.value"]}, label: "原子补丁", effects: {}}).apply({map: atomicMap}),
  error => error?.code === "worker_patch_target_unsafe"
);
assert.equal(atomicMap.first.value, "before", "后续路径失败时必须回滚此前路径");
let setterSideEffect = "before";
const sideEffectMap = {first: {value: "before"}, second: {}};
Object.defineProperty(sideEffectMap.second, "value", {
  get: () => setterSideEffect,
  set: value => {
    setterSideEffect = value;
    throw new Error("setter-after-write");
  },
  configurable: true
});
assert.throws(
  () => createDomainPatchCommand({patch: atomicPatch, policy: {domain: "fixture", allowedPaths: ["first.value", "second.value"]}, label: "副作用 setter 补丁", effects: {}}).apply({map: sideEffectMap}),
  error => error?.code === "worker_patch_target_unsafe"
);
assert.equal(sideEffectMap.first.value, "before");
assert.equal(setterSideEffect, "before", "写后抛错 setter 必须在任何写入前被拒绝");
const readonlyMap = {first: {value: "before"}, second: {}};
Object.defineProperty(readonlyMap.second, "value", {value: "before", writable: false, enumerable: true, configurable: true});
assert.throws(
  () => createDomainPatchCommand({patch: atomicPatch, policy: {domain: "fixture", allowedPaths: ["first.value", "second.value"]}, label: "只读目标补丁", effects: {}}).apply({map: readonlyMap}),
  error => error?.code === "worker_patch_target_unsafe"
);
assert.equal(readonlyMap.first.value, "before");
assert.equal(readonlyMap.second.value, "before");
const primitiveParentMap = {metadata: 7};
assert.throws(
  () => createDomainPatchCommand({patch: nestedPatchFixture(), policy: getRegenerationPatchPolicy("rivers"), label: "非法父路径补丁", effects: {}}).apply({map: primitiveParentMap}),
  error => error?.code === "worker_patch_parent_invalid"
);
assert.deepEqual(primitiveParentMap, {metadata: 7}, "非对象父路径失败不得覆盖原值");
const missingDeleteMap = {};
const missingDeletePatch = {
  version: 1,
  domain: "fixture",
  writeSet: ["optional.nested.value"],
  operations: [{path: ["optional", "nested", "value"], exists: false, value: undefined}]
};
createDomainPatchCommand({patch: missingDeletePatch, policy: {domain: "fixture", allowedPaths: ["optional.nested.value"]}, label: "缺失删除补丁", effects: {}}).apply({map: missingDeleteMap});
assert.deepEqual(missingDeleteMap, {}, "缺失删除不得创建空父容器");
nestedCommand.revert({map: nestedMap});
assert.deepEqual(nestedMap, {metadata: {}}, "撤销嵌套补丁必须清理原先不存在的父容器");
nestedCommand.apply({map: nestedMap});
assert.equal(nestedMap.metadata.regeneration.rivers, 1);
const forgedRiverSaltPatch = structuredClone(forgedRiverPatch);
forgedRiverSaltPatch.operations = [{path: ["metadata", "regeneration", "routes"], exists: true, value: 999}];
forgedRiverSaltPatch.writeSet = ["metadata.regeneration.routes"];
assert.throws(
  () => createDomainPatchCommand({patch: forgedRiverSaltPatch, policy: getRegenerationPatchPolicy("rivers"), label: "伪造道路 salt 补丁", effects: {}}),
  error => error?.code === "worker_patch_write_set_violation"
);
const forgedZoneSaltPatch = {
  version: 1,
  domain: "zones",
  writeSet: ["metadata.regeneration.routes"],
  operations: [{path: ["metadata", "regeneration", "routes"], exists: true, value: 999}]
};
assert.throws(
  () => createDomainPatchCommand({patch: forgedZoneSaltPatch, policy: getRegenerationPatchPolicy("zones"), label: "地区伪造道路 salt", effects: {}}),
  error => error?.code === "worker_patch_write_set_violation"
);
const forgedZoneEconomyPatch = {
  version: 1,
  domain: "zones",
  writeSet: ["economy.metadata.deals"],
  operations: [{path: ["economy", "metadata", "deals"], exists: true, value: 999}]
};
assert.throws(
  () => createDomainPatchCommand({patch: forgedZoneEconomyPatch, policy: getRegenerationPatchPolicy("zones"), label: "地区伪造经济统计", effects: {}}),
  error => error?.code === "worker_patch_write_set_violation"
);

const sharedBuffer = new ArrayBuffer(24);
const fullView = new Uint8Array(sharedBuffer);
for (let index = 0; index < fullView.length; index++) fullView[index] = index * 3;
const stagedSource = {
  first: new Uint8Array(sharedBuffer, 4, 8),
  second: new Uint16Array(sharedBuffer, 4, 4)
};
stagedSource.alias = stagedSource.first;
const formalFirst = stagedSource.first;
const formalBuffer = sharedBuffer;
const stagedViews = await createStagedWorkerSnapshot(stagedSource, {yieldToMain: async () => {}});
assert.notEqual(stagedViews.snapshot.first, formalFirst);
assert.equal(stagedViews.snapshot.first, stagedViews.snapshot.alias, "同一 view 别名必须保留");
assert.equal(stagedViews.snapshot.first.buffer, stagedViews.snapshot.second.buffer, "共享 buffer 多视图必须保留");
assert.equal(stagedViews.snapshot.first.byteOffset, 4);
assert.equal(stagedViews.snapshot.second.byteOffset, 4);
assert.deepEqual([...stagedViews.snapshot.first], [...formalFirst]);
structuredClone(stagedViews.snapshot, {transfer: stagedViews.transferables});
assert.equal(stagedViews.snapshot.first.buffer.byteLength, 0, "Worker 快照传输后必须 detach");
assert.equal(formalBuffer.byteLength, 24, "正式 TypedArray buffer 不得 detach");
assert.equal(stagedSource.first, formalFirst, "正式 TypedArray 引用不得替换");

let smallBufferYields = 0;
const manySmallBuffers = Array.from({length: 4096}, (_, index) => new Uint8Array([index & 255]));
const stagedSmallBuffers = await createStagedWorkerSnapshot(manySmallBuffers, {
  budgetMs: 1,
  yieldToMain: async () => { smallBufferYields += 1; }
});
assert.ok(smallBufferYields < 128, `大量小 buffer 不得逐个等待浏览器帧：${smallBufferYields}`);
assert.deepEqual(stagedSmallBuffers.snapshot.map(view => view[0]), manySmallBuffers.map(view => view[0]));

const deferredRendererSummary = verifyDeferredRendererReplay();
const appDeferredReplayStaticSummary = verifyAppDeferredReplayStaticContract();
const computeWorkerOutputNumericBatchValues = verifyComputeWorkerOutputBatchContract();

const allKindParity = {};
let representativeRegenerationNumeric = null;
for (const kind of REGENERATION_WORKER_KINDS) {
  const fixture = generatePlaceholderMap({seed: `worker-all-kinds-${kind}`, cellsTarget: 1000, heightmapTemplate: "continents"});
  const workerInput = structuredClone(fixture);
  const fallbackInput = structuredClone(fixture);
  const workerOutput = await coordinator.run("regeneration.compute", {map: workerInput, kind});
  const fallbackOutput = await coordinator.run("regeneration.compute", {map: fallbackInput, kind}, {forceFallback: true});
  assert.deepEqual(normalizeSemanticResult(workerOutput), normalizeSemanticResult(fallbackOutput), `${kind} Worker/fallback 语义必须一致`);

  const expected = structuredClone(fixture);
  const patched = structuredClone(fixture);
  const direct = await runRegenerationWorkerTask({map: expected, kind}, {checkpoint() {}, report() {}});
  if (["states", "provinces"].includes(kind) && direct.result.executed) {
    const diagnostics = direct.result.details?.riverBoundaries;
    assert(diagnostics?.model?.candidates > 0, `${kind} 缺少逐河结构化诊断`);
    assert.equal(diagnostics.model.rivers.length, diagnostics.model.candidates, `${kind} 逐河诊断数量不一致`);
    assert.equal(typeof diagnostics.model.checksum, "number", `${kind} 缺少河障 checksum`);
    assert.equal(typeof diagnostics.states.adoptionRate, "number", `${kind} 缺少国家采用率`);
    assert.equal(typeof diagnostics.provinces.adoptionRate, "number", `${kind} 缺少省份采用率`);
    assert.equal(Object.hasOwn(expected.politics.metadata.riverBoundaries, "rivers"), false, `${kind} 持久 metadata 不得携带逐河大数组`);
  }
  if (kind === "routes") {
    const denseArrays = inspectPlainDenseNumericArrays(direct);
    assert.ok(denseArrays.count > 0, "代表性 routes regeneration output 缺少 plain dense numeric Array");
    assert.ok(denseArrays.maxValues <= computeWorkerOutputNumericBatchValues, `代表性 routes regeneration output 单数组超过 32k：${denseArrays.maxValues}`);
    const packets = await inspectNumericPackets(direct, computeWorkerOutputNumericBatchValues, "representative-routes-output");
    representativeRegenerationNumeric = {...denseArrays, ...packets};
  }
  if (kind === "zones") {
    const legacy = structuredClone(fixture);
    const salt = (Number(legacy.metadata?.regeneration?.zones) || 0) + 1;
    const legacyZones = buildZones(legacy.pack, {
      ...legacy.options,
      seed: `${legacy.options?.seed || "map"}:regenerate-zones:${salt}`,
      preservedZones: []
    });
    const actualZones = structuredClone(expected.zones);
    const expectedZones = structuredClone(legacyZones);
    expectedZones.metadata.stale = false;
    scrubBuildTiming(actualZones);
    scrubBuildTiming(expectedZones);
    assert.deepEqual(actualZones.zones, expectedZones.zones, "zones Worker 必须与独立 buildZones 正式算法一致");
    assert.deepEqual(actualZones.metadata, expectedZones.metadata, "zones Worker 元数据必须与独立 buildZones 正式算法一致");
  }
  if (direct.result.executed) {
    const beforeSummary = patched.summary;
    const patchCommand = createDomainPatchCommand({patch: direct.patch, policy: getRegenerationPatchPolicy(kind), label: `${kind} 写集门`, effects: {}});
    patchCommand.apply({map: patched});
    const afterSummary = rebuildSummary(patched);
    patched.summary = afterSummary;
    assert.deepEqual(patched, expected, `${kind} 声明补丁必须覆盖 handler 全部实际写入`);
    assertCanonicalAliases(patched, `${kind} apply`);
    patchCommand.revert({map: patched});
    patched.summary = beforeSummary;
    assert.deepEqual(patched, fixture, `${kind} undo 必须恢复完整图`);
    assertCanonicalAliases(patched, `${kind} undo`);
    patchCommand.apply({map: patched});
    patched.summary = afterSummary;
    assert.deepEqual(patched, expected, `${kind} redo 必须恢复完整图`);
    assertCanonicalAliases(patched, `${kind} redo`);
  }
  allKindParity[kind] = {executed: direct.result.executed, operations: direct.patch.operations.length};
}
assert.ok(representativeRegenerationNumeric, "未检查代表性 routes regeneration output");

const computeWorkerSessionGuards = await verifyComputeWorkerSessionGuards(original, binding);
const computeWorkerRenderCacheContract = verifyComputeWorkerRenderCacheContract();

console.log(JSON.stringify({
  protocol: "PASS",
  kind: "zones",
  cells: source.grid.cells.i.length,
  workerFallbackParity: true,
  undoRedo: true,
  lateRejected: true,
  acceptedFailureFallbacks: 0,
  cancellationTerminated: true,
  computeWorkerSessionGuards,
  computeWorkerRenderCacheContract,
  computeWorkerOutputNumericBatchValues,
  representativeRegenerationNumeric,
  deferredRendererSummary,
  appDeferredReplayStaticSummary,
  allKindParity
}, null, 2));

function verifyComputeWorkerOutputBatchContract() {
  const source = readFileSync(new URL("../app/webgl-generator/src/runtime/compute-worker.js", import.meta.url), "utf8");
  const sendResultStream = source.match(/async function sendResultStream\(state, result, context(?:, \{checksum = false\} = \{\})?\) \{[\s\S]*?\n\}/u)?.[0] || "";
  assert.match(sendResultStream, /encodeWorkerGraph\(result, \{[\s\S]*?numericBatchValues:\s*32\s*\*\s*1024/u, "Compute Worker 正式输出必须使用 32k numeric batch");
  return 32 * 1024;
}

function verifyComputeWorkerRenderCacheContract() {
  const source = readFileSync(new URL("../app/webgl-generator/src/runtime/compute-worker.js", import.meta.url), "utf8");
  assert.match(source, /renderCache:\s*request\.reuseSession\s*\?\s*retainedSession\.renderCache/u, "复用 Worker session 必须继承渲染缓存");
  assert.match(source, /task === "render\.prepare" \|\| \(task === "regeneration\.compute" && payload\?\.mode === "render-only"\)/u, "只有只读渲染任务可以复用渲染缓存");
  assert.match(source, /renderCache:\s*context\.renderCache/u, "持久 Worker session 必须保存本次渲染缓存");
  assert.match(source, /if \(adoptResultMap\) rebindAdoptedRenderCache\(retainedSession\.renderCache, request\.binding\)/u, "adoption 提交必须把既有渲染缓存重绑到正式 map identity");
  assert.match(source, /\["cellVisual", "shore", "statePaths", "provincePaths"\][\s\S]*?cache\.renderBinding = \{[\s\S]*?mapIdentity:[\s\S]*?mapRevision:/u, "adoption 缓存重绑必须保留正式渲染基础缓存并更新 binding");
  return {renderPrepare: true, renderOnly: true, mutatingTasks: false};
}

function inspectPlainDenseNumericArrays(value) {
  const visited = new WeakSet();
  let count = 0;
  let totalValues = 0;
  let maxValues = 0;
  const visit = current => {
    if (!current || typeof current !== "object" || visited.has(current)) return;
    visited.add(current);
    if (Array.isArray(current)) {
      const denseNumeric = Object.getPrototypeOf(current) === Array.prototype
        && Object.keys(current).length === current.length
        && current.every((item, index) => Object.prototype.hasOwnProperty.call(current, index) && typeof item === "number");
      if (denseNumeric) {
        count += 1;
        totalValues += current.length;
        maxValues = Math.max(maxValues, current.length);
        return;
      }
      for (const item of current) visit(item);
      return;
    }
    if (ArrayBuffer.isView(current) || current instanceof ArrayBuffer) return;
    if (current instanceof Map) {
      for (const [key, item] of current) {
        visit(key);
        visit(item);
      }
      return;
    }
    if (current instanceof Set) {
      for (const item of current) visit(item);
      return;
    }
    for (const item of Object.values(current)) visit(item);
  };
  visit(value);
  return {count, totalValues, maxValues};
}

async function inspectNumericPackets(value, numericBatchValues, streamId) {
  let packets = 0;
  let maxPacketValues = 0;
  for await (const packet of encodeWorkerGraph(value, {streamId, numericBatchValues, yieldToMain: async () => {}})) {
    for (const record of packet.message.records) {
      if (record.type !== "numeric-arrays") continue;
      const values = new Float64Array(record.buffer);
      packets += 1;
      maxPacketValues = Math.max(maxPacketValues, values.length);
      assert.ok(values.length <= numericBatchValues, `代表性 regeneration numeric packet 超过 32k：${values.length}`);
    }
  }
  return {packets, maxPacketValues};
}

function verifyAppDeferredReplayStaticContract() {
  const source = readFileSync(new URL("../app/webgl-generator/src/runtime/app.js", import.meta.url), "utf8");
  const decisionMatch = source.match(/function decideWorkerRegenerationDeferredReplay\(contextCurrent, sequenceCurrent\) \{[\s\S]*?\n\}/u);
  assert.ok(decisionMatch, "app 必须保留可独立验证的 replay 决策函数");
  const decide = runInNewContext(`(${decisionMatch[0]})`);
  assert.equal(decide(true, true), "current");
  assert.equal(decide(true, false), "retry", "仅 deferred sequence 漂移可以重试");
  assert.equal(decide(false, true), "obsolete", "render context 漂移不得重试");
  assert.equal(decide(false, false), "obsolete", "context 漂移必须优先于 sequence 漂移");
  const obsoleteMatch = source.match(/function isWorkerRegenerationPreparedInstallObsolete\(error\) \{[\s\S]*?\n\}/u);
  assert.ok(obsoleteMatch, "app 必须显式收口 prepared install sequence-only obsolete code");
  const isPreparedObsolete = runInNewContext(`(${obsoleteMatch[0]})`);
  assert.equal(isPreparedObsolete({code: "render-overlay-preparation-obsolete"}), true, "overlay prepare sequence 漂移必须允许 cleanup + delta0 retry");
  assert.equal(isPreparedObsolete({code: "picking-rebind-obsolete"}), false, "deferred replay 不含 picking，不得扩张其 obsolete 白名单");
  for (const code of ["render-install-shape", "picking-rebind-obsolete", "unknown-obsolete"]) {
    assert.equal(isPreparedObsolete({code}), false, `${code} 不得被误吞为 sequence-only retry`);
  }
  const outerMapperMatch = source.match(/function normalizeWorkerRegenerationOuterPreparedInstallError\(error, operation\) \{[\s\S]*?\n\}/u);
  assert.ok(outerMapperMatch, "app 必须保留 outer 首次 prepared install obsolete mapper");
  const normalizeOuterPreparedError = runInNewContext(`(${outerMapperMatch[0]})`, {
    createRuntimeOperationError(code, message, options) {
      return {code, message, ...options};
    }
  });
  const outerObsoleteCodes = [
    "render-install-obsolete",
    "render-cache-unpack-obsolete",
    "label-descriptor-rebind-obsolete",
    "render-overlay-preparation-obsolete",
    "picking-rebind-obsolete"
  ];
  for (const code of outerObsoleteCodes) {
    const raw = {code, message: `${code}-message`};
    const normalized = normalizeOuterPreparedError(raw, {stage: "render-install-labels:labels"});
    assert.equal(normalized.code, "operation_obsolete", `${code} outer mapper 未转为 operation_obsolete`);
    assert.equal(normalized.stage, "render-install-labels:labels", `${code} outer mapper 未保留当前精确阶段`);
    assert.equal(normalized.expected, true, `${code} outer mapper 未标记 expected`);
    assert.equal(normalized.cause, raw, `${code} outer mapper 未保留 raw cause`);
    assert.equal(normalized.details?.internalCode, code, `${code} outer mapper 未保留内部诊断码`);
    assert.deepEqual(Object.keys(normalized.details || {}), ["internalCode"], `${code} outer mapper 暴露了额外内部详情`);
  }
  for (const code of ["render-install-shape", "render-political-debug-stale", "unknown-obsolete"]) {
    const raw = {code, message: `${code}-message`};
    assert.equal(normalizeOuterPreparedError(raw, {stage: "render-install"}), raw, `${code} 不得被 outer mapper 误吞`);
  }

  const displayFlow = source.slice(
    source.indexOf("async function applyRuntimeDisplayMutationViaWorker"),
    source.indexOf("function runtimeDisplayObsoleteError")
  );
  assert.ok(displayFlow.length > 0, "普通显示入口必须接入共享 MapWorker 渲染事务");
  const captureStart = displayFlow.indexOf("renderer.beginDeferredWorkerRenderMutationCapture?.()");
  const displayOrder = [
    captureStart,
    displayFlow.indexOf("result = apply()", captureStart),
    displayFlow.indexOf("renderer.endDeferredWorkerRenderMutationCapture?.()"),
    displayFlow.indexOf("renderer.captureDeferredWorkerRenderSnapshot?.()"),
    displayFlow.indexOf("state.mapWorkerCoordinator.run(\"render.prepare\""),
    displayFlow.indexOf("install = await prepareRendererWorkerInstall"),
    displayFlow.lastIndexOf("renderer.suspendWorkerRenderInstall()"),
    displayFlow.indexOf("renderer.applyDeferredWorkerRenderPresentationOnly?.(snapshot)"),
    displayFlow.indexOf("install.commit()"),
    displayFlow.indexOf("state.mapWorkerCoordinator.commitSession"),
    displayFlow.indexOf("renderer.resumePreparedWorkerRenderInstall?.(snapshot"),
    displayFlow.indexOf("install.finalize?.()")
  ];
  assert.ok(displayOrder.every(index => index >= 0), "普通显示事务缺少 capture/apply/prepare/短挂起/install/session/resume/finalize 链");
  assert.ok(displayOrder.every((index, position) => position === 0 || index > displayOrder[position - 1]), "普通显示事务顺序未把挂起收窄到原子安装窗");
  assert.ok(displayFlow.lastIndexOf("renderer.suspendWorkerRenderInstall()") > displayFlow.indexOf("install = await prepareRendererWorkerInstall"), "Worker 准备和临时安装期间不得挂起旧画面");
  assert.match(displayFlow, /const sourceToken[\s\S]*?isCurrent: isSourceCurrent[\s\S]*?const targetToken/u, "显示事务必须分别校验旧画面准备上下文与新画面提交上下文");
  assert.match(displayFlow, /sessionMode: "map-mirror"/u, "普通显示必须复用共享 map mirror session");
  assert.match(displayFlow, /sessionPayload: renderRequest/u, "普通显示复用请求不得重传 map");
  assert.match(displayFlow, /allowFallback: false/u, "复杂显示准备不得回退主线程");
  assert.match(displayFlow, /expectedRevisionDelta: 0/u, "显示事务不得推进 map revision");
  assert.match(source, /surfacePatchScope = layers\.includes\("surface"\)[\s\S]*?canPrepareDeferredSurfaceColorPatch/u, "surface 显示事务必须优先选择 compact color patch");
  const regenerationFlow = source.slice(
    source.indexOf("async function regenerateMapAttributeViaWorker"),
    source.indexOf("async function commitRegenerationWorkerSession")
  );
  assert.match(regenerationFlow, /inPlaceSurfaceColorPatch/u, "省份颜色重生成必须允许复用正式 surface geometry");
  assert.ok(regenerationFlow.indexOf("preparedInstall.prepareCommit") < regenerationFlow.indexOf("preparedInstall.commit()"), "surface 颜色补丁必须先准备后提交");
  assert.match(regenerationFlow, /await preparedInstall\.rollbackAsync\(\{isCurrent:/u, "失败回滚必须恢复原位 surface 颜色");
  const deferredRequestFlow = source.slice(
    source.indexOf("function createWorkerRegenerationDeferredRenderRequest"),
    source.indexOf("function isWorkerRegenerationDeferredReplayContextCurrent")
  );
  assert.match(deferredRequestFlow, /const presentation = snapshot\?\.finalPresentation \|\| \{\}/u, "deferred render request 必须以目标展示快照为权威");
  for (const field of ["visualTheme", "unitPreferences", "politicalMeshDebugMode", "visibility", "colorMode", "viewOptions", "labelOptions", "oceanCurrentHighlightIds"]) {
    assert.match(deferredRequestFlow, new RegExp(`${field}:`), `deferred render request 缺少目标 ${field}`);
  }
  assert.ok(deferredRequestFlow.indexOf("...createWorkerRegenerationRenderRequest") < deferredRequestFlow.indexOf("colorMode: String(presentation.colorMode"), "目标展示字段必须覆盖旧 renderer 请求，禁止首次切换落后一帧");
  assert.match(displayFlow, /cache: structuredClone\(prepared\.cache \|\| null\)/u, "显示诊断必须记录正式 Worker 渲染缓存命中");
  assert.match(displayFlow, /operation: \{id: operation\?\.id \|\| "", name: operation\?\.name \|\| ""\}/u, "显示诊断必须绑定当前 operation 身份");
  assert.match(source, /state\.workerTaskCoordinator = state\.mapWorkerCoordinator;[\s\S]*?state\.renderTaskCoordinator = state\.mapWorkerCoordinator;/u, "计算与显示必须共用唯一 MapWorker coordinator");
  assert.match(source, /workerRenderInstallSuspended > 0 && !activeName\.startsWith\("layers\."\)\) \{[\s\S]*?const result = apply\(\);[\s\S]*?onCommitted\(\);[\s\S]*?return result;/u, "地图事务暂停 renderer 时显示设置必须继续进入原 deferred 队列并回显当前提交状态");
  assert.match(displayFlow, /ownerCurrent \|\| !install\.committed/u, "显示失败清理必须区分当前图与 detached committed owner");
  assert.match(displayFlow, /renderer\.restoreDeferredWorkerRenderPresentation/u, "显示失败必须恢复展示标量");
  assert.match(displayFlow, /renderer\.abortWorkerRenderInstall/u, "显示失败必须解冻并清理 deferred queue");
  assert.match(displayFlow, /error\?\.code === "worker_fallback_disabled" && ownerCurrent/u, "仅 Worker 预接受不可用且地图仍属当前事务时允许兼容路径");
  assert.match(displayFlow, /message: "正在改用兼容方式继续处理"/u, "兼容阶段必须使用普通用户可理解的中文文案");
  assert.ok(displayFlow.indexOf("renderer.abortWorkerRenderInstall?.()") < displayFlow.lastIndexOf("return apply()"), "兼容路径必须先完整恢复 Worker 事务再执行原同步入口");
  assert.match(source, /queueCommandMapReplicaPatch\(state, mutation, before, after, \{[\s\S]*?includeCompute: !state\?\.workerSessionMutationGuard/u, "map revision 前进必须区分 Worker 已更新的计算镜像");
  assert.match(source, /if \(!includeCompute\) return;[\s\S]*?const coordinators = \[state\.mapWorkerCoordinator \|\| state\.workerTaskCoordinator\]/u, "Worker 已原地推进唯一 owner 时不得重复应用 canonical patch");
  assert.match(source, /coordinator\.applySessionPatch\(session\.id, patchPromise, nextBinding\)/u, "唯一 MapWorker 镜像必须消费 canonical patch");
  assert.match(source, /invalidateMapReplicaCoordinators\(state, includeCompute, "map-revision-unpatchable"\)/u, "未登记 mutation 必须保守清理显示镜像");
  assert.match(source, /invalidateMapReplicaCoordinators\(state, true, "map-replaced"\)/u, "换图必须只清理一次共享 MapWorker 镜像");
  assert.match(source, /onLayerGroupVisible:[\s\S]*?runtimeActions\.layers\.setManyVisible/u, "图层组入口不得绕过统一显示事务");
  const displayUiRestore = source.slice(
    source.indexOf("function restoreRuntimeDisplayControls"),
    source.indexOf("function createRuntimeActions")
  );
  assert.ok(displayUiRestore.length > 0, "显示入口失败后必须恢复正式控件状态");
  for (const marker of ["renderer?.colorMode", "renderer?.visualTheme?.id", "renderer?.viewOptions?.showOceanHeight", "renderer?.viewOptions?.smoothCellBorders", "renderer?.labelOptions?.maxCityLabels", "renderer?.layerVisibility"]) {
    assert.ok(displayUiRestore.includes(marker), `显示控件恢复缺少正式 renderer 来源：${marker}`);
  }
  assert.doesNotMatch(displayUiRestore, /readControlPreferences/u, "显示控件恢复不得读取已经被用户改写的 DOM 偏好");
  assert.match(source, /invokeRuntimeDisplayActionFromUi\(state, documentRef,[\s\S]*?catch\(error => \{[\s\S]*?restoreRuntimeDisplayControls\(state, documentRef\)/u, "UI 显示操作拒绝后必须回写最终提交状态");
  assert.match(source, /const onCommitted = \(\) => restoreRuntimeDisplayControls\(state, documentRef\)[\s\S]*?applyRuntimeDisplayMutationViaWorker\(state, documentRef, context, \{apply, rollback, onCommitted\}\)/u, "显示操作成功后必须从正式 renderer 单次收敛控件");
  assert.match(source, /viewportIndependent = layers\.length === 1 && layers\[0\] === "surface"[\s\S]*?includeViewport: !viewportIndependent/u, "纯 surface 显示准备不得因相机或画布变化作废");
  const displayErrorMessage = source.match(/function runtimeDisplayActionErrorMessage\(error\) \{[\s\S]*?\n\}/u)?.[0] || "";
  assert.match(displayErrorMessage, /operation_busy[\s\S]*?当前已有地图操作正在进行，请稍后再试/u, "重叠显示操作必须使用自然中文提示");
  assert.match(displayErrorMessage, /operation_obsolete[\s\S]*?地图状态已变化，请重新设置/u, "过期显示操作必须使用自然中文提示");
  assert.doesNotMatch(displayErrorMessage, /error\?\.message|String\(error/u, "普通显示 toast 不得透传内部 action、Worker 或协议错误");
  assert.match(source, /showMapToast\(documentRef, runtimeDisplayActionErrorMessage\(error\)/u, "显示入口必须经用户文案映射后展示错误");

  const replay = source.slice(
    source.indexOf("async function replayWorkerRegenerationDeferredPresentation"),
    source.indexOf("async function refreshWorkerRegenerationPreparedUi")
  );
  assert.ok(replay.length > 0, "app 必须接入 deferred replay orchestrator");
  for (const phase of ["计算", "准备", "安装提交", "会话确认"]) {
    assert.ok(replay.includes(`token, sequenceCurrent(), "${phase}"`), `${phase}窗口必须先分类 context 与 sequence`);
  }
  assert.ok((replay.match(/expectedRevisionDelta: 0/gu) || []).length >= 4, "所有 pending retry 窗口必须以 delta0 收口 session");
  assert.match(replay, /sessionPayload: \{mode: "render-only", render: renderRequest\}/u);
  assert.match(replay, /allowFallback: false/u);
  const layerContract = source.slice(
    source.indexOf("function workerRegenerationDeferredReplayLayers"),
    source.indexOf("function createWorkerRegenerationDeferredRenderRequest")
  );
  assert.doesNotMatch(layerContract, /picking/u, "deferred replay 不得重建 picking");
  assert.match(layerContract, /targetKind !== "rivers"/u, "河流 replay 不得准备 route");
  assert.match(layerContract, /if \(effects\.labels\) layers\.push\("labels"\)/u, "只有真实 labels effect 才能请求完整 labels prepared replay");
  assert.doesNotMatch(layerContract, /effects\.labels\s*\|\|\s*effects\.units/u, "unit-only 不得触发完整 labels prepared replay");
  const rendererSource = readFileSync(new URL("../app/webgl-generator/src/renderer/placeholder-renderer.js", import.meta.url), "utf8");
  assert.match(rendererSource, /refreshMilitaryIconLabels\(\{relayout = true\} = \{\}\)/u, "军事文本轻刷必须默认保留既有 relayout 语义");
  assert.match(rendererSource, /snapshot\?\.effects\?\.units && !snapshot\?\.effects\?\.labels[\s\S]*?refreshMilitaryIconLabels\(\{relayout: false\}\)/u, "unit-only prepared resume 必须轻刷军事文本且不重复布局");

  const workerFlow = source.slice(
    source.indexOf("async function regenerateMapAttributeViaWorker"),
    source.indexOf("async function commitRegenerationWorkerSession")
  );
  const outerPrepareFlow = workerFlow.slice(
    workerFlow.indexOf("const renderPrepareStartedAt"),
    workerFlow.indexOf("renderInstallPrepareMs =", workerFlow.indexOf("const renderPrepareStartedAt"))
  );
  assert.match(outerPrepareFlow, /try \{[\s\S]*?preparedInstall = await prepareRendererWorkerInstall[\s\S]*?catch \(error\) \{[\s\S]*?normalizeWorkerRegenerationOuterPreparedInstallError\(error, operation\)/u, "outer 首次 prepared await 必须只映射正式 obsolete");
  const sessionBrowserSource = readFileSync(new URL("./webgl-generator-worker-session-browser-regression.mjs", import.meta.url), "utf8");
  const latePanFlow = sessionBrowserSource.slice(
    sessionBrowserSource.indexOf("async function runLatePanGate"),
    sessionBrowserSource.indexOf("async function runCommittedDisplayReplayGate")
  );
  assert.match(latePanFlow, /response\?\.error\?\.code, "operation_obsolete"/u, "late-pan 必须锁公开 operation_obsolete");
  assert.match(latePanFlow, /response\?\.error\?\.details\?\.internalCode, "render-overlay-preparation-obsolete"/u, "late-pan 必须锁底层 overlay obsolete 诊断码");
  const rollbackStart = workerFlow.indexOf("const rollbackFailures = error?.rollbackFailed");
  const rollbackEnd = workerFlow.indexOf("\n  }\n  } finally {", rollbackStart);
  assert.ok(rollbackStart >= 0 && rollbackEnd > rollbackStart, "app 必须保留可审计的 deferred rollback/recovery catch");
  const rollbackFlow = workerFlow.slice(rollbackStart, rollbackEnd);
  const rollbackOrder = [
    "cleanupWorkerRegenerationPreparedInstalls(deferredPreparedInstalls, preparedCleanup)",
    "cleanupWorkerRegenerationPreparedInstalls(preparedInstall ? [preparedInstall] : [], preparedCleanup)",
    "command.revert({map: committedMap})",
    "state.editHistory.restoreSnapshot(historySnapshot)",
    "restoreWorkerRegenerationUiSnapshot(state, documentRef, uiSnapshot",
    "state.workerTaskCoordinator.invalidateSession(\"commit-or-render-install-failed\")",
    "await recoverWorkerRegenerationDeferredPresentation("
  ].map(marker => rollbackFlow.indexOf(marker));
  assert.ok(rollbackOrder.every(index => index >= 0), "失败链必须覆盖 inner/outer/domain/history/UI/invalidate/recovery 全顺序");
  assert.ok(rollbackOrder.every((index, position) => position === 0 || index > rollbackOrder[position - 1]), "失败链必须按 inner→outer→domain/history/UI→invalidate→recovery 执行");
  assert.match(rollbackFlow, /const preparedCleanup = mapStillCurrent[\s\S]*?"rollback-current"[\s\S]*?"release-detached"/u, "prepared cleanup 必须显式区分当前图与已换图 owner");
  assert.match(rollbackFlow, /if \(mapStillCurrent && execution\?\.executed\) \{[\s\S]*?command\.revert/u, "domain/history/UI 回滚只能作用当前图");
  assert.doesNotMatch(workerFlow, /abortWorkerRenderInstall/u, "失败链不得 abort 并清空 deferred queue");
  assert.doesNotMatch(workerFlow, /workerRenderInstallDeferredMutations\.clear/u, "app 失败链不得直接清空 deferred queue");
  assert.match(rollbackFlow, /else if \(renderInstallSuspended\)[\s\S]*?resumeWorkerRenderInstall/u, "无 deferred queue 时必须保留便宜 resume");
  assert.match(rollbackFlow, /combined\.originalError = error/u);
  assert.match(rollbackFlow, /combined\.recoveryError = recoveryError/u);
  assert.match(rollbackFlow, /combined\.cause = new AggregateError/u, "恢复失败必须保留原错与恢复因果链");
  const detachedStart = rollbackFlow.indexOf("if (!mapStillCurrent) {");
  const detachedEnd = rollbackFlow.indexOf("const hasDeferredPresentation", detachedStart);
  assert.ok(detachedStart >= 0 && detachedEnd > detachedStart, "已换图失败分支必须在 recovery 前直接退出");
  const detachedFlow = rollbackFlow.slice(detachedStart, detachedEnd);
  assert.match(detachedFlow, /throw error/u, "已换图必须保留原 operation_obsolete");
  assert.doesNotMatch(detachedFlow, /command\.revert|restoreSnapshot|restoreWorkerRegenerationUiSnapshot|recoverWorkerRegenerationDeferredPresentation|resumeWorkerRenderInstall|restoreCityIconLayerStatistics/u, "已换图不得写回新 renderer/history/UI");

  const uiRestore = source.slice(
    source.indexOf("function restoreWorkerRegenerationUiSnapshot"),
    source.indexOf("function captureWorkerRegenerationStatus")
  );
  const preserveStart = uiRestore.indexOf("} else {");
  const preserveEnd = uiRestore.indexOf("state.lastEditRefresh", preserveStart);
  assert.ok(preserveStart >= 0 && preserveEnd > preserveStart, "UI restore 必须保留 preserveRenderContext 分支");
  const preserveFlow = uiRestore.slice(preserveStart, preserveEnd);
  const preserveOrder = [
    "reconcilePersistentObjectHighlights(state, documentRef, {refreshUi: false})",
    "state.selectionStore.refresh()",
    "state.renderer.dynamicBuffersDirty.selection = true"
  ].map(marker => preserveFlow.indexOf(marker));
  assert.ok(preserveOrder.every(index => index >= 0), "preserve restore 必须覆盖高亮重绑定、selection refresh 与 dirty");
  assert.ok(preserveOrder[0] < preserveOrder[1] && preserveOrder[1] < preserveOrder[2], "preserve restore 必须按高亮重绑定→selection refresh→dirty 执行");
  const forwardFlow = uiRestore.slice(0, preserveStart);
  assert.doesNotMatch(forwardFlow, /reconcilePersistentObjectHighlights/u, "普通 restore 分支不得改变既有 forward 恢复语义");

  const cleanupContract = source.slice(
    source.indexOf("function workerRegenerationPreparedInstallCleanupAction"),
    source.indexOf("function finalizeWorkerRegenerationPreparedInstalls")
  );
  assert.ok(cleanupContract.length > 0, "app 必须保留 owner-aware prepared transaction cleanup helper");
  const detachedCalls = [];
  const newRendererSentinel = {value: "new-renderer"};
  const detachedTransactions = [
    {
      name: "committed",
      committed: true,
      rollback() { detachedCalls.push("committed:rollback"); newRendererSentinel.value = "old-renderer"; },
      finalize() { detachedCalls.push("committed:finalize"); }
    },
    {
      name: "uncommitted",
      committed: false,
      rollback() { detachedCalls.push("uncommitted:rollback"); },
      finalize() { detachedCalls.push("uncommitted:finalize"); newRendererSentinel.value = "old-renderer"; }
    }
  ];
  const detachedCleanup = runInNewContext(`${cleanupContract}\ncleanupWorkerRegenerationPreparedInstalls(installs, options)`, {
    installs: detachedTransactions,
    options: {mode: "release-detached", ownerCurrent: false}
  });
  assert.equal(detachedCleanup.length, 0);
  assert.deepEqual(detachedCalls, ["uncommitted:rollback", "committed:finalize"], "换图后 committed 只 finalize、uncommitted 只 rollback");
  assert.equal(newRendererSentinel.value, "new-renderer", "换图清理不得改写新 renderer sentinel");
  const sameMapCalls = [];
  const sameMapTransactions = ["outer", "inner-1", "inner-2"].map(name => ({
    name,
    committed: true,
    rollback() { sameMapCalls.push(`${name}:rollback`); },
    finalize() { sameMapCalls.push(`${name}:finalize`); }
  }));
  const sameMapCleanup = runInNewContext(`${cleanupContract}\ncleanupWorkerRegenerationPreparedInstalls(installs, options)`, {
    installs: sameMapTransactions,
    options: {mode: "rollback-current", ownerCurrent: true}
  });
  assert.equal(sameMapCleanup.length, 0);
  assert.deepEqual(sameMapCalls, ["inner-2:rollback", "inner-1:rollback", "outer:rollback"], "同图 transaction 必须保持逆序 rollback");

  const recovery = source.slice(
    source.indexOf("async function recoverWorkerRegenerationDeferredPresentation"),
    source.indexOf("async function refreshWorkerRegenerationPreparedUi")
  );
  assert.ok(recovery.length > 0, "app 必须保留异步 deferred recovery helper");
  assert.match(recovery, /const recoveryMap = state\.map/u, "recovery 入口必须冻结 map owner");
  assert.match(recovery, /if \(state\.map !== recoveryMap\)[\s\S]*?error\.code = "operation_obsolete"/u, "recovery 换图必须先走 context obsolete gate");
  assert.match(recovery, /const map = recoveryMap/u, "recovery snapshot/installer 必须绑定冻结 map owner");
  assert.match(recovery, /const controller = new AbortController\(\)/u, "recovery 必须使用独立 AbortController");
  assert.match(recovery, /60_000/u, "recovery 必须有独立 60s 超时");
  assert.ok((recovery.match(/signal: controller\.signal/gu) || []).length >= 3, "snapshot/task/installer 必须共用 recovery signal");
  assert.doesNotMatch(recovery, /signal: operation\?\.signal/u, "recovery 不得继承已取消的用户 signal");
  assert.match(recovery, /for \(let attempt = 1; attempt <= 3; attempt\+\+\)/u, "recovery latest-wins 最多三轮");
  assert.match(recovery, /const binding = createRegenerationWorkerBinding\(state, operation\)/u, "recovery 必须读取回滚后的 current binding");
  assert.ok(recovery.indexOf("createStagedWorkerSnapshot(map") < recovery.indexOf("state.workerTaskCoordinator.run(\"render.prepare\""), "recovery 必须先分片旧图再运行 render.prepare");
  assert.match(recovery, /state\.workerTaskCoordinator\.run\("render\.prepare"/u);
  assert.match(recovery, /allowFallback: false/u, "recovery 不得主线程降级");
  assert.doesNotMatch(recovery, /sessionMode:/u, "recovery render.prepare 必须是非持久任务");
  assert.match(recovery, /prepared\.worker\?\.session/u, "recovery 必须拒绝意外持久 session");
  const recoveryCatchStart = recovery.indexOf("} catch (error) {\n    const ownerCurrent = state.map === recoveryMap");
  const recoveryCatchEnd = recovery.indexOf("\n  } finally {", recoveryCatchStart);
  assert.ok(recoveryCatchStart >= 0 && recoveryCatchEnd > recoveryCatchStart, "recovery 必须有保留队列的失败分支");
  const recoveryCatch = recovery.slice(recoveryCatchStart, recoveryCatchEnd);
  assert.match(recoveryCatch, /restoreDeferredWorkerRenderPresentation/u, "recovery 失败必须恢复操作前显示标量");
  assert.doesNotMatch(recoveryCatch, /abortWorkerRenderInstall|resumeWorkerRenderInstall|resumePreparedWorkerRenderInstall|consumeDeferredWorkerRenderMutationsThrough|applyWorkerRenderMutationBatch|workerRenderInstallDeferredMutations\.clear/u, "recovery 失败不得消费或清空 deferred queue");
  assert.match(recoveryCatch, /ownerCurrent[\s\S]*?"rollback-current"[\s\S]*?"release-detached"/u, "recovery cleanup 必须按冻结 map owner 分流");
  const recoveryDetachedStart = recoveryCatch.indexOf("if (!ownerCurrent) {");
  const recoveryDetachedEnd = recoveryCatch.indexOf("\n    try {\n      renderer?.restoreDeferredWorkerRenderPresentation", recoveryDetachedStart);
  assert.ok(recoveryDetachedStart >= 0 && recoveryDetachedEnd > recoveryDetachedStart, "recovery detached 分支必须在 presentation restore 前退出");
  const recoveryDetached = recoveryCatch.slice(recoveryDetachedStart, recoveryDetachedEnd);
  assert.match(recoveryDetached, /throw error/u, "recovery 换图必须保留原 operation_obsolete");
  assert.doesNotMatch(recoveryDetached, /restoreDeferredWorkerRenderPresentation|dynamicBuffersDirty|resume|consume/u, "recovery 换图不得写 presentation/routes 或消费队列");
  assert.match(recovery, /finally \{[\s\S]*?state\.map === recoveryMap[\s\S]*?"release-detached"/u, "recovery finally 也必须 owner-aware 清理旧 transaction");

  const recoveryMap = {id: "old-map"};
  const replacementMap = {id: "new-map"};
  const recoveryState = {
    map: recoveryMap,
    renderer: {sentinel: "old-renderer", presentation: "old-presentation", routesDirty: true}
  };
  const recoveryCleanupCalls = [];
  const committedRecoveryInstall = {
    committed: true,
    rollback() {
      recoveryCleanupCalls.push("rollback");
      recoveryState.renderer.sentinel = "old-ref-written";
      recoveryState.renderer.presentation = "old-presentation";
      recoveryState.renderer.routesDirty = true;
    },
    finalize() { recoveryCleanupCalls.push("finalize"); }
  };
  recoveryState.map = replacementMap;
  recoveryState.renderer = {sentinel: "new-renderer", presentation: "new-presentation", routesDirty: false};
  assert.equal(decide(recoveryState.map === recoveryMap, true), "obsolete", "recovery committed 后换图必须由 context gate 拒绝");
  const recoveryDetachedCleanup = runInNewContext(`${cleanupContract}\ncleanupWorkerRegenerationPreparedInstalls(installs, options)`, {
    installs: [committedRecoveryInstall],
    options: {mode: "release-detached", ownerCurrent: false}
  });
  assert.equal(recoveryDetachedCleanup.length, 0);
  assert.deepEqual(recoveryCleanupCalls, ["finalize"], "recovery committed install 换图后只能 finalize");
  assert.deepEqual(recoveryState.renderer, {sentinel: "new-renderer", presentation: "new-presentation", routesDirty: false}, "recovery 换图不得改写新 renderer presentation/routes sentinel");

  const generationFlow = source.slice(
    source.indexOf("async function generateMapOffMainThread"),
    source.indexOf("function setGenerationStatus")
  );
  assert.match(generationFlow, /sessionMode: "adopt-result-map"/u, "生成必须在唯一 MapWorker 中 adoption");
  assert.match(generationFlow, /allowFallback: false/u, "生成 adoption 不得回退主线程");
  assert.doesNotMatch(generationFlow, /fallbackPayloadFactory/u, "生成 adoption 不得保留主线程完整生成回退");
  const importFlow = source.slice(
    source.indexOf("async function parseMapDocumentViaWorker"),
    source.indexOf("function storageClock")
  );
  assert.match(importFlow, /sessionMode: "adopt-result-map"/u, "导入必须在唯一 MapWorker 中 adoption");
  assert.match(importFlow, /allowFallback: false/u, "导入 adoption 不得回退主线程");
  for (const [label, start, end] of [
    ["浏览器恢复", "async function restoreMapFromBrowserStorageViaApi", "async function saveMapToBrowserStorageViaApi"],
    ["地图导入", "async function importMapDocumentViaApi", "async function importParsedMapDocumentViaApi"]
  ]) {
    const flow = source.slice(source.indexOf(start), source.indexOf(end));
    assert.match(flow, /state\.pendingGenerateId = \(state\.pendingGenerateId \|\| 0\) \+ 1[\s\S]*?parseMapDocumentViaWorker/u, `${label} 必须先淘汰旧生成 token 再建立 adoption binding`);
  }
  const parsedImportFlow = source.slice(source.indexOf("async function importParsedMapDocumentViaApi"), source.indexOf("async function importGeoData"));
  assert.doesNotMatch(parsedImportFlow, /pendingGenerateId\s*=/u, "解析完成后不得再次漂移 adoption generation token");
  const loadFlow = source.slice(
    source.indexOf("async function loadMapIntoRuntime"),
    source.indexOf("function refreshRuntimeAfterMapLoad")
  );
  assert.match(loadFlow, /if \(!workerAdoption\?\.session\?\.id\) invalidateMapReplicaCoordinators/u, "adoption 装载不得销毁待提交 owner");
  assert.match(loadFlow, /commitSession\(workerAdoption\.session\.id, adoptedBinding, \{adoptResultMap: true\}\)/u, "装载后必须显式提交 adopted owner");
  assert.match(loadFlow, /invalidateSession\("map-adoption-failed"\)/u, "adoption 失败不得残留 pending owner");

  return {
    decision: "context-first",
    displayRenderSession: "shared-map-worker",
    windows: 4,
    overlayPrepareRetry: true,
    pendingDelta0Closures: (replay.match(/expectedRevisionDelta: 0/gu) || []).length,
    rollbackOrder: "inner-outer-domain-history-ui-invalidate-recovery",
    recoveryAttempts: 3,
    independentRecoverySignal: true,
    deferredQueuePreservedOnFailure: true,
    detachedTransactionCleanup: [...detachedCalls],
    sameMapRollbackOrder: [...sameMapCalls],
    detachedRecoveryCleanup: [...recoveryCleanupCalls],
    mapAdoption: "generation-import-owner"
  };
}

function verifyDeferredRendererReplay() {
  const captureRenderer = createDeferredRendererFixture();
  captureRenderer.workerRenderInstallSuspended = 0;
  captureRenderer.beginDeferredWorkerRenderMutationCapture();
  captureRenderer.setColorMode("biomes");
  captureRenderer.endDeferredWorkerRenderMutationCapture();
  assert.equal(captureRenderer.workerRenderInstallSuspended, 0, "effect capture 不得提前挂起 renderer");
  assert.equal(captureRenderer.colorMode, "height", "effect capture 期间必须继续呈现旧画面");
  assert.equal(captureRenderer.cpuRefreshCalls, 0, "effect capture 不得同步重建 surface");
  const captureSnapshot = captureRenderer.captureDeferredWorkerRenderSnapshot();
  assert.equal(captureSnapshot.finalPresentation.colorMode, "biomes", "effect capture 必须生成不可变目标展示快照");
  assert.equal(captureSnapshot.effects.surfacePatchScope, "all", "颜色模式切换必须声明全 cell 颜色补丁");

  const oceanRenderer = createDeferredRendererFixture();
  oceanRenderer.setViewOptions({showOceanHeight: true});
  assert.equal(oceanRenderer.captureDeferredWorkerRenderSnapshot().effects.surfacePatchScope, "water", "显示海底只能声明水域颜色补丁");
  const smoothRenderer = createDeferredRendererFixture();
  smoothRenderer.setViewOptions({smoothCellBorders: false});
  assert.equal(smoothRenderer.captureDeferredWorkerRenderSnapshot().effects.surfacePatchScope, "unavailable", "边界几何变化不得伪装成颜色补丁");

  const renderer = createDeferredRendererFixture();
  renderer.setColorMode("biomes");
  renderer.setDiplomacySubjectId(3);
  renderer.setViewOptions({smoothCellBorders: false, showOceanHeight: true});
  renderer.setVisualTheme("ancient", {force: true});
  renderer.setLabelOptions({maxCityLabels: 64});
  renderer.setUnitPreferences({numberAbbreviation: "none", militaryScale: 2});
  renderer.setOceanCurrentHighlights([7, 9]);
  renderer.setPoliticalMeshDebugMode("provinces");
  renderer.setLayersVisible([["cities", false], ["gridCells", true], ["tradeFlows", true]]);

  const cloneProbe = renderer.captureDeferredWorkerRenderSnapshot();
  cloneProbe.entries.find(entry => entry.key === "label-options").value.maxCityLabels = 1;
  assert.equal(renderer.workerRenderInstallDeferredMutations.get("label-options").value.maxCityLabels, 64, "deferred snapshot 必须深克隆 entry value");
  const firstSnapshot = renderer.captureDeferredWorkerRenderSnapshot();
  assert.ok(firstSnapshot.maxSequence > 0);
  assert.equal(firstSnapshot.finalPresentation.colorMode, "biomes");
  assert.equal(firstSnapshot.finalPresentation.visualTheme.id, "ancient");
  assert.equal(firstSnapshot.finalPresentation.viewOptions.smoothCellBorders, false);
  assert.equal(firstSnapshot.finalPresentation.labelOptions.maxCityLabels, 64);
  assert.equal(firstSnapshot.finalPresentation.unitPreferences.numberAbbreviation, "none");
  assert.deepEqual([...firstSnapshot.finalPresentation.oceanCurrentHighlights], ["7", "9"]);
  assert.equal(firstSnapshot.finalPresentation.politicalMeshDebugMode, "provinces");
  assert.equal(firstSnapshot.finalPresentation.layerVisibility.cities, false);
  assert.equal(firstSnapshot.finalPresentation.layerVisibility.gridCells, true);
  assert.equal(firstSnapshot.finalPresentation.layerVisibility.tradeFlows, false, "退役图层必须 fail-closed");
  assert.equal(firstSnapshot.effects.surface, true);
  assert.equal(firstSnapshot.effects.lines, true);
  assert.equal(firstSnapshot.effects.points, true);
  assert.equal(firstSnapshot.effects.labels, true);
  assert.equal(firstSnapshot.effects.units, true);
  assert.equal(firstSnapshot.effects.political, true);
  assert.equal(firstSnapshot.effects.routes, true);
  assert.equal(firstSnapshot.effects.gridDiagnostics, true);

  renderer.setLabelOptions({maxCityLabels: 96});
  const lateLabelSequence = renderer.workerRenderInstallDeferredMutations.get("label-options").sequence;
  assert.ok(lateLabelSequence > firstSnapshot.maxSequence);
  renderer.applyDeferredWorkerRenderPresentationOnly(firstSnapshot);
  assert.equal(renderer.cpuRefreshCalls, 0, "presentation-only 不得触发任何 CPU render rebuild");
  assert.equal(renderer.colorMode, "biomes");
  assert.equal(renderer.labelOptions.maxCityLabels, 64);
  assert.equal(renderer.unitPreferences.militaryScale, 2);
  assert.equal(renderer.layerVisibility.tradeFlows, false);
  assert.equal(renderer.dynamicBuffersDirty.routes, true);
  renderer.dynamicBuffersDirty.tradeFlows = true;
  renderer.dynamicBuffersDirty.selection = true;
  renderer.resumePreparedWorkerRenderInstall(firstSnapshot);
  assert.equal(renderer.cpuRefreshCalls, 0, "prepared resume 不得补做 surface/line/point/label/political CPU rebuild");
  assert.equal(renderer.cheapCalls.clearTradeFlows, 1, "prepared resume 必须清理退役 tradeFlows");
  assert.equal(renderer.cheapCalls.selection, 1, "prepared resume 必须刷新 selection");
  assert.equal(renderer.cheapCalls.routes, 1, "非河流 prepared resume 必须异步调度 route");
  assert.equal(renderer.cheapCalls.draw, 1);
  assert.equal(renderer.cheapCalls.view, 1);
  assert.equal(renderer.cheapCalls.grid, 1);
  assert.equal(renderer.workerRenderInstallSuspended, 1, "仍有晚到 mutation 时必须保持 suspended 供下一轮 replay");
  assert.equal(renderer.workerRenderInstallDeferredMutations.size, 1);
  assert.equal(renderer.workerRenderInstallDeferredMutations.get("label-options").sequence, lateLabelSequence, "旧 snapshot consume 不得删除同 key 晚到覆盖");

  const lateSnapshot = renderer.captureDeferredWorkerRenderSnapshot();
  renderer.applyDeferredWorkerRenderPresentationOnly(lateSnapshot);
  renderer.resumePreparedWorkerRenderInstall(lateSnapshot);
  assert.equal(renderer.labelOptions.maxCityLabels, 96);
  assert.equal(renderer.workerRenderInstallSuspended, 0);
  assert.equal(renderer.workerRenderInstallDeferredMutations.size, 0);
  assert.equal(renderer.cheapCalls.draw, 2);
  assert.equal(renderer.cheapCalls.view, 2);

  const unitRenderer = createDeferredRendererFixture();
  unitRenderer.setUnitPreferences({numberAbbreviation: "none", militaryScale: 3});
  const unitSnapshot = unitRenderer.captureDeferredWorkerRenderSnapshot();
  assert.equal(unitSnapshot.effects.units, true);
  assert.equal(unitSnapshot.effects.labels, false, "unit-only snapshot 不得声明 labels effect");
  unitRenderer.applyDeferredWorkerRenderPresentationOnly(unitSnapshot);
  unitRenderer.resumePreparedWorkerRenderInstall(unitSnapshot);
  assert.equal(unitRenderer.cpuRefreshCalls, 0, "unit-only prepared resume 不得触发 CPU render rebuild");
  assert.deepEqual(unitRenderer.cheapCalls.militaryRelayout, [false], "unit-only prepared resume 必须只轻刷军事文本");
  assert.equal(unitRenderer.cheapCalls.draw, 1, "unit-only prepared resume 必须沿最终 draw 完成一次布局");

  const themeUnitsRenderer = createDeferredRendererFixture();
  themeUnitsRenderer.setVisualTheme("ancient", {force: true});
  themeUnitsRenderer.setUnitPreferences({numberAbbreviation: "none", militaryScale: 3});
  const themeUnitsSnapshot = themeUnitsRenderer.captureDeferredWorkerRenderSnapshot();
  assert.equal(themeUnitsSnapshot.effects.labels, true);
  assert.equal(themeUnitsSnapshot.effects.units, true);
  themeUnitsRenderer.applyDeferredWorkerRenderPresentationOnly(themeUnitsSnapshot);
  themeUnitsRenderer.resumePreparedWorkerRenderInstall(themeUnitsSnapshot);
  assert.deepEqual(themeUnitsRenderer.cheapCalls.militaryRelayout, [], "theme+units prepared replay 不得重复轻刷军事文本");

  const preserveRenderer = createDeferredRendererFixture();
  const preserveUnitPreferences = preserveRenderer.unitPreferences;
  preserveRenderer.setVisualTheme("ancient", {force: true});
  const preserveSnapshot = preserveRenderer.captureDeferredWorkerRenderSnapshot();
  preserveRenderer.applyDeferredWorkerRenderPresentationOnly(preserveSnapshot);
  assert.equal(preserveRenderer.unitPreferences, preserveUnitPreferences, "theme-only presentation apply 不得替换 unitPreferences 引用");
  preserveRenderer.dynamicBuffersDirty.selection = false;
  preserveRenderer.resumePreparedWorkerRenderInstall(preserveSnapshot, {preserveRoutes: true});
  assert.equal(preserveRenderer.unitPreferences, preserveUnitPreferences, "theme-only prepared resume 不得替换 unitPreferences 引用");
  assert.equal(preserveRenderer.cheapCalls.routes, 0, "河流目标 prepared resume 不得触碰 route refresh");
  assert.equal(preserveRenderer.dynamicBuffersDirty.routes, true, "preserveRoutes 必须保留 route dirty 状态");
  assert.equal(preserveRenderer.workerRenderInstallDeferredMutations.size, 0);

  const highlightRenderer = Object.create(PlaceholderMapRenderer.prototype);
  highlightRenderer.objectHighlights = [{kind: "route", id: 0, from: "旧起点", to: "旧终点"}];
  highlightRenderer.dynamicBuffersDirty = {selection: false, routes: false};
  highlightRenderer.workerRenderInstallSuspended = 1;
  highlightRenderer.workerRenderInstallPendingDraw = false;
  highlightRenderer.updateRouteBuffer = () => { throw new Error("suspended highlight 不得构建 route mesh"); };
  highlightRenderer.updateSelectionBuffer = () => { throw new Error("suspended highlight 不得构建 selection mesh"); };
  highlightRenderer.setObjectHighlights([{kind: "route", id: 0, from: "当前起点", to: "当前终点"}]);
  assert.equal(highlightRenderer.objectHighlights[0].from, "当前起点", "suspended highlight 必须接受当前地图 DTO");
  assert.equal(highlightRenderer.dynamicBuffersDirty.selection, true, "suspended highlight 必须标记 selection dirty");
  assert.equal(highlightRenderer.dynamicBuffersDirty.routes, false, "同 route membership 重绑定不得自行改 routes dirty");
  assert.equal(highlightRenderer.workerRenderInstallPendingDraw, true, "suspended highlight 应只登记 pending draw");

  const viewportRenderer = createDeferredRendererFixture();
  viewportRenderer.setLabelOptions({maxCityLabels: 48});
  const viewportSnapshot = viewportRenderer.captureDeferredWorkerRenderSnapshot();
  viewportRenderer.applyDeferredWorkerRenderPresentationOnly(viewportSnapshot);
  viewportRenderer.workerRenderInstallViewportChanged = true;
  viewportRenderer.resumePreparedWorkerRenderInstall(viewportSnapshot);
  assert.equal(viewportRenderer.cheapCalls.viewport, 1, "prepared resume 必须保留 viewport 恢复");
  assert.equal(viewportRenderer.cheapCalls.draw, 0, "viewport 恢复不得额外重复 draw");
  assert.equal(viewportRenderer.cheapCalls.view, 1);

  const faultRenderer = createDeferredRendererFixture();
  faultRenderer.setLabelOptions({maxCityLabels: 32});
  const faultSnapshot = faultRenderer.captureDeferredWorkerRenderSnapshot();
  faultRenderer.applyDeferredWorkerRenderPresentationOnly(faultSnapshot);
  faultRenderer.draw = () => { throw new Error("prepared-resume-draw-fault"); };
  assert.throws(() => faultRenderer.resumePreparedWorkerRenderInstall(faultSnapshot), /prepared-resume-draw-fault/);
  assert.equal(faultRenderer.workerRenderInstallSuspended, 1);
  assert.equal(faultRenderer.workerRenderInstallDeferredMutations.size, 1, "prepared resume 抛错不得消费 deferred queue");
  assert.equal(faultRenderer.cheapCalls.cancelViewport, 1);

  return {
    firstEntries: firstSnapshot.entries.length,
    maxSequence: firstSnapshot.maxSequence,
    latePreserved: true,
    cpuRefreshCalls: renderer.cpuRefreshCalls,
    cheapCalls: renderer.cheapCalls,
    preserveRoutes: true,
    faultQueuePreserved: true
  };
}

function createDeferredRendererFixture() {
  const renderer = Object.create(PlaceholderMapRenderer.prototype);
  renderer.map = null;
  renderer.stage = null;
  renderer.canvas = {ownerDocument: {defaultView: globalThis}};
  renderer.colorMode = "height";
  renderer.visualTheme = {id: "default"};
  renderer.viewOptions = {showOceanHeight: false, smoothCellBorders: true, diplomacySubjectId: null, visualTheme: renderer.visualTheme};
  renderer.labelOptions = {maxCityLabels: 128};
  renderer.unitPreferences = {};
  renderer.layerVisibility = {
    routes: true,
    tradeFlows: false,
    gridCells: false,
    cities: true,
    population: true,
    markers: true,
    resources: true,
    military: true,
    coastline: true,
    lakeShore: true,
    stateBorders: true,
    provinceBorders: true,
    warFronts: true,
    zones: true,
    zoneEvents: true,
    zoneNatural: true,
    zoneWilderness: true,
    oceanCurrents: true
  };
  renderer.oceanCurrentHighlights = new Set();
  renderer.politicalMeshDebugMode = "none";
  renderer.dynamicBuffersDirty = {routes: false, tradeFlows: false, rivers: false, selection: false};
  renderer.workerRenderInstallSuspended = 1;
  renderer.workerRenderInstallPendingDraw = false;
  renderer.workerRenderInstallViewportChanged = false;
  renderer.workerRenderInstallApplyingDeferred = false;
  renderer.workerRenderMutationCaptureDepth = 0;
  renderer.workerRenderInstallDeferredMutations = new Map();
  renderer.workerRenderInstallMutationSequence = 0;
  renderer.workerRenderInstallEnsureGridDiagnostics = false;
  renderer.cpuRefreshCalls = 0;
  renderer.cheapCalls = {clearTradeFlows: 0, tradeFlows: 0, selection: 0, routes: 0, draw: 0, view: 0, grid: 0, viewport: 0, cancelViewport: 0, militaryRelayout: []};
  for (const method of ["refreshCellSurface", "refreshLineLayers", "refreshPointLayers", "refreshLabels", "rebuildPoliticalVisualMeshesIfNeeded", "updatePoliticalMeshDebugBuffer"]) {
    renderer[method] = () => { renderer.cpuRefreshCalls++; };
  }
  renderer.refreshMilitaryIconLabels = ({relayout = true} = {}) => { renderer.cheapCalls.militaryRelayout.push(relayout); };
  renderer.clearTradeFlowBuffer = () => {
    renderer.cheapCalls.clearTradeFlows++;
    renderer.dynamicBuffersDirty.tradeFlows = false;
  };
  renderer.updateTradeFlowBuffer = () => {
    renderer.cheapCalls.tradeFlows++;
    renderer.dynamicBuffersDirty.tradeFlows = false;
  };
  renderer.updateSelectionBuffer = () => {
    renderer.cheapCalls.selection++;
    renderer.dynamicBuffersDirty.selection = false;
  };
  renderer.scheduleRouteBufferRefresh = () => {
    renderer.cheapCalls.routes++;
    renderer.dynamicBuffersDirty.routes = false;
  };
  renderer.draw = () => { renderer.cheapCalls.draw++; };
  renderer.onViewChange = () => { renderer.cheapCalls.view++; };
  renderer.ensureGridCellDiagnosticsBuffer = () => {
    renderer.cheapCalls.grid++;
    return Promise.resolve(true);
  };
  renderer.drawViewportPreview = () => { renderer.cheapCalls.viewport++; };
  renderer.cancelViewportCommitForWorkerInstall = () => { renderer.cheapCalls.cancelViewport++; };
  return renderer;
}

async function verifyComputeWorkerSessionGuards(map, baseBinding) {
  const previousSelf = globalThis.self;
  const listeners = new Map();
  const posted = [];
  globalThis.self = {
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    postMessage(message) {
      posted.push(structuredClone(message));
    }
  };
  try {
    await import(`${new URL("../app/webgl-generator/src/runtime/compute-worker.js", import.meta.url).href}?session-guards=${Date.now()}`);
    const dispatch = message => listeners.get("message")?.({data: structuredClone(message)});

    const inputRequest = createWorkerTaskRequest({
      requestId: "wrong-session-input",
      task: "regeneration.compute",
      binding: baseBinding,
      sessionId: "session-input-correct",
      persistentSession: true
    });
    await dispatch(inputRequest);
    const inputStreamId = `${inputRequest.requestId}:input`;
    const inputPacket = await firstPacket({map: structuredClone(map), kind: "zones", options: {}}, inputStreamId);
    await dispatch({
      ...createWorkerTaskStreamPacket(WORKER_TASK_MESSAGE.INPUT_PACKET, inputRequest, inputPacket.message),
      sessionId: "session-input-wrong"
    });
    const inputError = posted.find(message => message.requestId === inputRequest.requestId && message.type === WORKER_TASK_MESSAGE.ERROR);
    assert.equal(inputError?.error?.code, "worker_protocol_not_ready", "Compute Worker 必须拒绝 wrong-session INPUT_PACKET");

    posted.length = 0;
    const outputRequest = createWorkerTaskRequest({
      requestId: "wrong-session-output",
      task: "regeneration.compute",
      binding: baseBinding,
      sessionId: "session-output-correct",
      persistentSession: true
    });
    await dispatch(outputRequest);
    const outputInputStreamId = `${outputRequest.requestId}:input`;
    for await (const packet of encodeWorkerGraph({map: structuredClone(map), kind: "features", options: {}}, {
      streamId: outputInputStreamId,
      checksum: true,
      yieldToMain: async () => {}
    })) {
      await dispatch(createWorkerTaskStreamPacket(WORKER_TASK_MESSAGE.INPUT_PACKET, outputRequest, packet.message));
    }
    const execution = Promise.resolve(dispatch(createWorkerTaskExecution(outputRequest, outputInputStreamId)));
    await waitForPosted(posted, message => message.requestId === outputRequest.requestId && message.type === WORKER_TASK_MESSAGE.OUTPUT_PACKET, 4);
    const outputPacket = posted.filter(message => message.requestId === outputRequest.requestId && message.type === WORKER_TASK_MESSAGE.OUTPUT_PACKET).at(-1);
    await new Promise(resolve => setTimeout(resolve, 5));
    await dispatch({
      ...createWorkerTaskStreamAck(WORKER_TASK_MESSAGE.OUTPUT_ACK, outputRequest, {
        streamId: outputPacket.streamId,
        sequence: outputPacket.sequence
      }),
      sessionId: "session-output-wrong"
    });
    const outputError = await waitForPosted(posted, message => message.requestId === outputRequest.requestId && message.type === WORKER_TASK_MESSAGE.ERROR, 1);
    assert.equal(outputError.error?.code, "worker_protocol_not_active", "Compute Worker 必须拒绝 wrong-session OUTPUT_ACK");
    await execution.catch(() => {});
    return {wrongInputPacket: true, wrongOutputAck: true};
  } finally {
    if (previousSelf === undefined) delete globalThis.self;
    else globalThis.self = previousSelf;
  }
}

async function firstPacket(value, streamId) {
  for await (const packet of encodeWorkerGraph(value, {streamId, yieldToMain: async () => {}})) return packet;
  throw new Error("图流没有生成输入包");
}

async function waitForPosted(messages, predicate, count = 1, timeoutMs = 10000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    const matches = messages.filter(predicate);
    if (matches.length >= count) return matches.at(-1);
    await new Promise(resolve => setTimeout(resolve, 1));
  }
  throw new Error("等待 Compute Worker 测试消息超时");
}

function applyWorkerPatch(map, kind, patch) {
  const command = createDomainPatchCommand({
    patch,
    policy: getRegenerationPatchPolicy(kind),
    label: `${kind} session`,
    effects: {}
  });
  command.apply({map});
  map.summary = rebuildSummary(map);
}

function nestedPatchFixture() {
  return {
    version: 1,
    domain: "rivers",
    writeSet: ["metadata.regeneration.rivers"],
    operations: [{path: ["metadata", "regeneration", "rivers"], exists: true, value: 1}]
  };
}

function normalizeSemanticResult(result) {
  const clone = structuredClone(result);
  delete clone.worker;
  scrubBuildTiming(clone);
  return clone;
}

function rebuildSummary(map) {
  return createGenerationSummary(
    map.options,
    map.grid,
    map.features,
    map.climate,
    map.society,
    map.politics,
    map.settlements,
    map.markers,
    map.pack,
    map.rivers,
    map.layers,
    map.military,
    map.zones,
    map.economy,
    map.diplomacy
  );
}

function assertCanonicalAliases(map, label) {
  const aliasPairs = [
    ["features.features", "grid.features"],
    ["rivers.rivers", "pack.rivers"],
    ["economy.goods", "pack.goods"],
    ["economy.markets", "pack.markets"],
    ["economy.deals", "pack.deals"],
    ["diplomacy", "pack.diplomacy"],
    ["military", "pack.military"],
    ["zones.zones", "pack.zones"],
    ["politics.states", "pack.states"],
    ["politics.provinces", "pack.provinces"],
    ["markers.markers", "pack.markers"],
    ["society.religions", "pack.religions"],
    ["summary.features", "features.metadata"],
    ["summary.climate.mapCoordinates", "climate.mapCoordinates"],
    ["summary.climate.biomeCounts", "climate.metadata.biomeCounts"],
    ["summary.rivers", "rivers.metadata"],
    ["summary.markers", "markers.metadata"],
    ["summary.diplomacy", "diplomacy.metadata"],
    ["summary.military", "military.metadata"],
    ["summary.zones", "zones.metadata"],
    ["summary.economy", "economy.metadata"]
  ];
  for (const [left, right] of aliasPairs) assert.equal(readPath(map, left), readPath(map, right), `${label} alias ${left} === ${right}`);
}

function readPath(value, path) {
  return path.split(".").reduce((owner, key) => owner?.[key], value);
}

function scrubBuildTiming(value, visited = new WeakSet()) {
  if (!value || typeof value !== "object" || visited.has(value)) return;
  visited.add(value);
  for (const key of Object.keys(value)) if (key === "ms" || key.endsWith("Ms")) value[key] = 0;
  if (Object.prototype.hasOwnProperty.call(value, "slowest")) value.slowest = {id: "semantic", label: "semantic", ms: 0};
  if (Object.prototype.hasOwnProperty.call(value, "updatedAt")) value.updatedAt = "semantic-time";
  if (Object.prototype.hasOwnProperty.call(value, "checksum") && value.zones) value.checksum = "semantic";
  for (const child of Object.values(value)) scrubBuildTiming(child, visited);
}
