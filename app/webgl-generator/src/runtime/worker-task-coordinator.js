import {getWorkerTaskHandler} from "./worker-task-registry.js";
import {createWorkerGraphDecoder, encodeWorkerGraph} from "./worker-graph-stream.js";
import {
  assertWorkerTaskResponse,
  assertWorkerTaskStreamAck,
  assertWorkerTaskStreamPacket,
  createWorkerTaskExecution,
  createWorkerTaskRequest,
  createWorkerTaskSessionCommit,
  createWorkerTaskSessionPatch,
  createWorkerTaskStreamAck,
  createWorkerTaskStreamPacket,
  restoreWorkerTaskError,
  WORKER_TASK_MESSAGE
} from "./worker-task-protocol.js";

let requestSequence = 0;

export function createWorkerTaskCoordinator({createWorker, getBinding, validateBinding, beforeRun, onProgress, onFallback} = {}) {
  let persistentSession = null;
  let pendingSessionPatch = null;
  let sessionSequence = 0;
  return Object.freeze({run, commitSession, applySessionPatch, invalidateSession, getSessionSnapshot});

  async function run(task, payload, options = {}) {
    if (typeof beforeRun === "function") await beforeRun();
    if (pendingSessionPatch) await pendingSessionPatch;
    const binding = clonePlain(options.binding ?? getBinding?.() ?? null);
    const signal = options.signal || null;
    if (signal?.aborted) throw abortError(signal.reason);
    const persistent = options.sessionMode === "map-mirror";
    let reuseSession = false;
    let sessionId = "";
    let worker = null;
    if (persistent) {
      if (persistentSession && persistentSession.status === "idle" && sameSessionBinding(persistentSession.binding, binding)) {
        worker = persistentSession.worker;
        sessionId = persistentSession.id;
        reuseSession = true;
        persistentSession.status = "running";
      } else {
        invalidateSession("replica-binding-mismatch");
        sessionId = `map-${Date.now().toString(36)}-${(++sessionSequence).toString(36)}`;
      }
    }
    const replicaChecksum = persistent && reuseSession ? persistentSession?.checksum || null : null;
    const request = createWorkerTaskRequest({
      requestId: `${Date.now().toString(36)}-${(++requestSequence).toString(36)}`,
      task,
      binding,
      payload,
      sessionId,
      reuseSession,
      persistentSession: persistent
    });
    try {
      if (options.forceFallback) {
        invalidateSession("forced-fallback");
        if (!fallbackAllowed(options)) throw fallbackDisabledError();
        worker = null;
      } else if (!worker) {
        worker = createWorker?.();
      }
    } catch (error) {
      invalidateSession("worker-construction-failed");
      if (!fallbackAllowed(options)) throw fallbackDisabledError(error);
      return runFallback(request, signal, error, options);
    }
    if (!worker) {
      invalidateSession("worker-unavailable");
      if (!fallbackAllowed(options)) throw fallbackDisabledError();
      return runFallback(request, signal, null, options);
    }
    return runDedicatedWorker(worker, request, signal, {
      ...options,
      persistentSession: persistent,
      reuseSession,
      replicaChecksum,
      mainReplicaChecksumMs: 0,
      sessionInputPayload: reuseSession ? createSessionInputPayload(payload, options) : payload
    });
  }

  function commitSession(sessionId, binding, options = {}) {
    const current = persistentSession;
    if (!current || current.id !== String(sessionId || "") || current.status !== "pending") return Promise.resolve(false);
    const committedBinding = clonePlain(binding);
    if (validateBinding && validateBinding(committedBinding) !== true) {
      invalidateSession("session-commit-obsolete");
      return Promise.reject(obsoleteError("Worker session 提交绑定已过期"));
    }
    if (!isValidSessionCommitBinding(current.binding, committedBinding, options.expectedRevisionDelta)) {
      invalidateSession("session-commit-discontinuous");
      return Promise.reject(protocolStateError("worker_protocol_session_commit_invalid", "Worker session 提交绑定不连续"));
    }
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value, {invalidate = false} = {}) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        current.worker.removeEventListener?.("message", onMessage);
        current.worker.removeEventListener?.("error", onError);
        current.worker.removeEventListener?.("messageerror", onMessageError);
        if (invalidate) invalidateSession("session-commit-failed");
        callback(value);
      };
      const onMessage = event => {
        let message;
        try {
          message = assertWorkerTaskResponse(event.data, current.request);
          if (message.type !== WORKER_TASK_MESSAGE.SESSION_COMMITTED || !sameBinding(message.binding, committedBinding)) {
            throw protocolStateError("worker_protocol_session_commit_invalid", "Worker session 提交确认无效");
          }
          current.binding = committedBinding;
          current.request = {...current.request, binding: committedBinding, reuseSession: true};
          current.status = "idle";
          finish(resolve, true);
        } catch (error) {
          finish(reject, error, {invalidate: true});
        }
      };
      const onError = event => finish(reject, event?.error || new Error(event?.message || "Worker session 提交失败"), {invalidate: true});
      const onMessageError = event => finish(reject, event?.error || new Error("Worker session 提交响应无法反序列化"), {invalidate: true});
      const timer = setTimeout(
        () => finish(reject, protocolStateError("worker_session_commit_timeout", "Worker session 提交超时"), {invalidate: true}),
        Math.max(100, Number(options.timeoutMs) || 2500)
      );
      current.worker.addEventListener?.("message", onMessage);
      current.worker.addEventListener?.("error", onError);
      current.worker.addEventListener?.("messageerror", onMessageError);
      try {
        current.worker.postMessage(createWorkerTaskSessionCommit(current.request, committedBinding));
      } catch (error) {
        finish(reject, error, {invalidate: true});
      }
    });
  }

  function applySessionPatch(sessionId, patch, binding, options = {}) {
    const operation = (pendingSessionPatch || Promise.resolve()).then(async () => applySessionPatchNow(sessionId, await patch, await binding, options));
    let tracked;
    tracked = operation.finally(() => {
      if (pendingSessionPatch === tracked) pendingSessionPatch = null;
    });
    pendingSessionPatch = tracked;
    return tracked;
  }

  function applySessionPatchNow(sessionId, patch, binding, options = {}) {
    const current = persistentSession;
    if (!current || current.id !== String(sessionId || "") || current.status !== "idle") return Promise.resolve(false);
    const targetBinding = clonePlain(binding);
    if (!isValidReplicaPatchBinding(current.binding, targetBinding, patch)
      || !current.checksum
      || normalizeChecksum(patch?.baseChecksum) !== current.checksum
      || !normalizeChecksum(patch?.targetChecksum)) {
      invalidateSession("session-patch-discontinuous");
      return Promise.reject(protocolStateError("worker_protocol_session_patch_invalid", "Worker session patch 不连续"));
    }
    current.status = "patching";
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (callback, value, {invalidate = false} = {}) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        current.worker.removeEventListener?.("message", onMessage);
        current.worker.removeEventListener?.("error", onError);
        current.worker.removeEventListener?.("messageerror", onMessageError);
        if (invalidate) invalidateSession("session-patch-failed");
        callback(value);
      };
      const onMessage = event => {
        try {
          const message = assertWorkerTaskResponse(event.data, current.request);
          if (message.type !== WORKER_TASK_MESSAGE.SESSION_PATCHED
            || message.patchId !== patch.patchId
            || Number(message.revision) !== Number(targetBinding.mapRevision)
            || normalizeChecksum(message.checksum) !== normalizeChecksum(patch.targetChecksum)) {
            throw protocolStateError("worker_protocol_session_patch_invalid", "Worker session patch 确认无效");
          }
          current.binding = targetBinding;
          current.request = {...current.request, binding: targetBinding, reuseSession: true};
          current.checksum = normalizeChecksum(message.checksum);
          current.status = "idle";
          finish(resolve, true);
        } catch (error) {
          finish(reject, error, {invalidate: true});
        }
      };
      const onError = event => finish(reject, event?.error || new Error(event?.message || "Worker session patch 失败"), {invalidate: true});
      const onMessageError = event => finish(reject, event?.error || new Error("Worker session patch 响应无法反序列化"), {invalidate: true});
      const timer = setTimeout(
        () => finish(reject, protocolStateError("worker_session_patch_timeout", "Worker session patch 超时"), {invalidate: true}),
        Math.max(100, Number(options.timeoutMs) || 2500)
      );
      current.worker.addEventListener?.("message", onMessage);
      current.worker.addEventListener?.("error", onError);
      current.worker.addEventListener?.("messageerror", onMessageError);
      try {
        current.worker.postMessage(createWorkerTaskSessionPatch(current.request, patch, targetBinding));
      } catch (error) {
        finish(reject, error, {invalidate: true});
      }
    });
  }

  function invalidateSession(reason = "invalidated") {
    const current = persistentSession;
    persistentSession = null;
    if (!current) return false;
    current.status = "invalid";
    current.reason = String(reason || "invalidated");
    current.worker?.terminate?.();
    return true;
  }

  function getSessionSnapshot() {
    if (!persistentSession) return null;
    return {
      id: persistentSession.id,
      task: persistentSession.task,
      status: persistentSession.status,
      binding: clonePlain(persistentSession.binding),
      checksum: persistentSession.checksum,
      requestId: persistentSession.request?.requestId || ""
    };
  }

  function runDedicatedWorker(worker, request, signal, runOptions) {
    return new Promise((resolve, reject) => {
      let settled = false;
      let ready = false;
      let inputPacketsFinished = false;
      let inputReady = false;
      let executionSent = false;
      let accepted = false;
      let phaseTimer = null;
      let heartbeatTimer = null;
      let outputDecoder = null;
      let outputComplete = false;
      let inputStartedAt = 0;
      let outputStartedAt = 0;
      const telemetry = {
        mainReplicaChecksumMs: roundMs(runOptions.mainReplicaChecksumMs),
        inputPackets: 0,
        inputPostMaxMs: 0,
        inputAckWaitMs: 0,
        inputStreamMs: 0,
        outputPackets: 0,
        outputDecodeMaxMs: 0,
        outputDecodeCpuMs: 0,
        outputDecodeCpuMaxMs: 0,
        outputAckPostMaxMs: 0,
        outputReceiveMs: 0
      };
      const inputStreamId = `${request.requestId}:input`;
      const outputStreamId = `${request.requestId}:output`;
      const inputInflight = new Set();
      const inputWaiters = new Set();
      const streamController = new AbortController();
      const maxInflight = Math.max(1, Math.min(16, Number(runOptions.streamWindow) || 4));
      const cleanup = ({terminate = true} = {}) => {
        if (phaseTimer !== null) clearTimeout(phaseTimer);
        if (heartbeatTimer !== null) clearInterval(heartbeatTimer);
        if (!streamController.signal.aborted) streamController.abort("Worker 数据流已停止");
        rejectInputWaiters(abortError("Worker 数据流已停止"));
        signal?.removeEventListener?.("abort", onAbort);
        worker.removeEventListener?.("message", onMessage);
        worker.removeEventListener?.("error", onError);
        worker.removeEventListener?.("messageerror", onMessageError);
        if (terminate) {
          if (persistentSession?.worker === worker) persistentSession = null;
          worker.terminate?.();
        }
      };
      const finish = (callback, value, {retainWorker = false} = {}) => {
        if (settled) return;
        settled = true;
        cleanup({terminate: !retainWorker});
        callback(value);
      };
      const onAbort = () => finish(reject, abortError(signal?.reason));
      const fail = error => {
        if (accepted) {
          finish(reject, error);
          return;
        }
        if (!fallbackAllowed(runOptions)) {
          finish(reject, fallbackDisabledError(error));
          return;
        }
        cleanup();
        settled = true;
        void runFallback(request, signal, error, runOptions).then(resolve, reject);
      };
      const onMessage = event => {
        if (settled) return;
        let message;
        try {
          message = assertWorkerTaskResponse(event.data, request);
          assertCurrentBinding(request.binding, message.binding);
        } catch (error) {
          if (error?.code === "operation_obsolete") finish(reject, error);
          else fail(error);
          return;
        }
        if (message.type === WORKER_TASK_MESSAGE.READY) {
          if (ready || accepted) {
            fail(protocolStateError("worker_protocol_duplicate_ready", "Worker 重复声明准备完成"));
            return;
          }
          ready = true;
          if (phaseTimer !== null) clearTimeout(phaseTimer);
          heartbeatTimer = setInterval(() => {
            if (settled) return;
            const stage = !inputReady ? "input-stream" : !accepted ? "worker-accept" : !outputDecoder ? "worker-compute" : "output-stream";
            const message = !inputReady
              ? "正在整理地图推演所需资料"
              : !accepted
                ? "正在准备地图推演"
                : !outputDecoder
                  ? "正在推演地图内容"
                  : "正在整理地图推演结果";
            try {
              (runOptions.onProgress || onProgress)?.(stage, {message, heartbeat: true}, {
                task: request.task,
                binding: request.binding
              });
            } catch (error) {
              fail(error);
            }
          }, Math.max(200, Number(runOptions.heartbeatMs) || 500));
          void streamInput().catch(error => {
            if (!settled) fail(error);
          });
          return;
        }
        if (message.type === WORKER_TASK_MESSAGE.INPUT_ACK) {
          try {
            message = assertWorkerTaskStreamAck(message, WORKER_TASK_MESSAGE.INPUT_ACK);
          } catch (error) {
            fail(error);
            return;
          }
          if (!ready || inputReady || accepted || message.streamId !== inputStreamId || !inputInflight.has(message.sequence)) {
            fail(protocolStateError("worker_protocol_input_ack_invalid", "Worker 输入流确认消息无效或重复"));
            return;
          }
          inputInflight.delete(message.sequence);
          resolveInputWaiters();
          return;
        }
        if (message.type === WORKER_TASK_MESSAGE.INPUT_READY) {
          if (!ready || !inputPacketsFinished || inputInflight.size || inputReady || accepted || message.streamId !== inputStreamId) {
            fail(protocolStateError("worker_protocol_input_ready_invalid", "Worker 输入流完成消息次序无效"));
            return;
          }
          inputReady = true;
          telemetry.inputStreamMs = roundMs(now() - inputStartedAt);
          if (phaseTimer !== null) clearTimeout(phaseTimer);
          try {
            worker.postMessage(createWorkerTaskExecution(request, inputStreamId));
            executionSent = true;
            phaseTimer = setTimeout(
              () => fail(protocolStateError("worker_accept_timeout", "Worker 接受任务超时")),
              Math.max(100, Number(runOptions.acceptTimeoutMs) || 2500)
            );
          } catch (error) {
            fail(error);
          }
          return;
        }
        if (message.type === WORKER_TASK_MESSAGE.ACCEPTED) {
          if (!ready || !inputReady || !executionSent) {
            fail(protocolStateError("worker_protocol_not_ready", "Worker 在 ready 前接受请求"));
            return;
          }
          if (accepted) {
            finish(reject, protocolStateError("worker_protocol_duplicate_accept", "Worker 重复接受同一请求"));
            return;
          }
          accepted = true;
          if (phaseTimer !== null) {
            clearTimeout(phaseTimer);
            phaseTimer = null;
          }
          return;
        }
        if (message.type === WORKER_TASK_MESSAGE.ERROR) {
          const error = restoreWorkerTaskError(message.error);
          if (accepted) finish(reject, error);
          else fail(error);
          return;
        }
        if (!accepted) {
          fail(protocolStateError("worker_protocol_not_accepted", `Worker 在 accepted 前返回 ${message.type}`));
          return;
        }
        if (message.type === WORKER_TASK_MESSAGE.PROGRESS) {
          try {
            (runOptions.onProgress || onProgress)?.(message.stage, message.detail || {}, {task: request.task, binding: request.binding});
          } catch (error) {
            finish(reject, error);
          }
          return;
        }
        if (message.type === WORKER_TASK_MESSAGE.SESSION_COMMITTED) {
          finish(reject, protocolStateError("worker_protocol_session_commit_unexpected", "运行态收到无效的 session 提交确认"));
          return;
        }
        if (message.type === WORKER_TASK_MESSAGE.OUTPUT_PACKET) {
          try {
            message = assertWorkerTaskStreamPacket(message, WORKER_TASK_MESSAGE.OUTPUT_PACKET);
          } catch (error) {
            finish(reject, error);
            return;
          }
          if (message.streamId !== outputStreamId || message.packet?.streamId !== outputStreamId) {
            finish(reject, protocolStateError("worker_protocol_output_stream_invalid", "Worker 结果流标识不匹配"));
            return;
          }
          try {
            const decodeStartedAt = now();
            if (!outputStartedAt) outputStartedAt = decodeStartedAt;
            if (!outputDecoder) outputDecoder = createWorkerGraphDecoder({streamId: outputStreamId});
            const decodeCpuStartedAt = now();
            outputComplete = outputDecoder.push(message.packet);
            const decodeCpuMs = roundMs(now() - decodeCpuStartedAt);
            telemetry.outputDecodeCpuMs = roundMs(telemetry.outputDecodeCpuMs + decodeCpuMs);
            telemetry.outputDecodeCpuMaxMs = Math.max(telemetry.outputDecodeCpuMaxMs, decodeCpuMs);
            const ackPostStartedAt = now();
            worker.postMessage(createWorkerTaskStreamAck(WORKER_TASK_MESSAGE.OUTPUT_ACK, request, {
              streamId: outputStreamId,
              sequence: message.sequence
            }));
            telemetry.outputAckPostMaxMs = Math.max(telemetry.outputAckPostMaxMs, roundMs(now() - ackPostStartedAt));
            telemetry.outputPackets += 1;
            telemetry.outputDecodeMaxMs = Math.max(telemetry.outputDecodeMaxMs, roundMs(now() - decodeStartedAt));
          } catch (error) {
            finish(reject, error);
          }
          return;
        }
        if (message.type === WORKER_TASK_MESSAGE.RESULT) {
          try {
            if (message.resultStreamId !== outputStreamId || !outputDecoder || !outputComplete) {
              throw protocolStateError("worker_protocol_result_stream_incomplete", "Worker 结果流尚未完整接收");
            }
            const result = outputDecoder.finish();
            telemetry.outputReceiveMs = roundMs(now() - outputStartedAt);
            const retained = Boolean(runOptions.persistentSession);
            if (retained) {
              const replicaChecksum = normalizeChecksum(message.replicaChecksum);
              if (!replicaChecksum || replicaChecksum !== normalizeChecksum(runOptions.replicaChecksum)) {
                throw protocolStateError("worker_protocol_replica_checksum_invalid", "Worker 初始地图副本 checksum 不一致");
              }
              persistentSession = {
                id: request.sessionId,
                task: request.task,
                status: "pending",
                binding: request.binding,
                checksum: replicaChecksum,
                request,
                worker
              };
            }
            finish(resolve, {
              ...result,
              worker: {
                mode: "worker",
                accepted: true,
                session: retained ? {id: request.sessionId, reused: Boolean(runOptions.reuseSession), pending: true} : null,
                telemetry: {...telemetry, ...(message.telemetry || {})}
              }
            }, {retainWorker: retained});
          } catch (error) {
            finish(reject, error);
          }
        }
      };
      const onError = event => {
        const error = event?.error || new Error(event?.message || "Worker 运行失败");
        fail(error);
      };
      const onMessageError = event => fail(event?.error || new Error("Worker 消息无法反序列化"));
      signal?.addEventListener?.("abort", onAbort, {once: true});
      worker.addEventListener?.("message", onMessage);
      worker.addEventListener?.("error", onError);
      worker.addEventListener?.("messageerror", onMessageError);
      phaseTimer = setTimeout(
        () => fail(protocolStateError("worker_ready_timeout", "Worker 初始化超时")),
        Math.max(100, Number(runOptions.readyTimeoutMs) || 2500)
      );
      try {
        worker.postMessage({...request, payload: undefined});
      } catch (error) {
        fail(error);
      }

      async function streamInput() {
        inputStartedAt = now();
        for await (const packet of encodeWorkerGraph(runOptions.sessionInputPayload, {
          streamId: inputStreamId,
          signal: streamController.signal,
          packetUnits: runOptions.streamPacketUnits,
          recordUnits: runOptions.streamRecordUnits,
          sliceBytes: runOptions.streamSliceBytes,
          budgetMs: runOptions.streamBudgetMs,
          yieldToMain: runOptions.streamYieldToMain,
          checksum: runOptions.persistentSession && !runOptions.reuseSession,
          onProgress(stage, detail) {
            (runOptions.onProgress || onProgress)?.(`input-stream-${stage}`, detail, {
              task: request.task,
              binding: request.binding
            });
          }
        })) {
          while (inputInflight.size >= maxInflight) await waitForInputAckMeasured();
          assertCurrentBinding(request.binding, request.binding);
          const message = createWorkerTaskStreamPacket(WORKER_TASK_MESSAGE.INPUT_PACKET, request, packet.message);
          if (packet.message.done) inputPacketsFinished = true;
          if (packet.message.done && runOptions.persistentSession && !runOptions.reuseSession) {
            runOptions.replicaChecksum = packet.message.checksum || null;
          }
          const postStartedAt = now();
          worker.postMessage(message, packet.transferables);
          telemetry.inputPackets += 1;
          telemetry.inputPostMaxMs = Math.max(telemetry.inputPostMaxMs, roundMs(now() - postStartedAt));
          inputInflight.add(packet.message.sequence);
        }
        if (!inputPacketsFinished) throw protocolStateError("worker_input_stream_incomplete", "Worker 输入流缺少完成包");
        while (inputInflight.size) await waitForInputAckMeasured();
        if (!inputReady && !settled) {
          phaseTimer = setTimeout(
            () => fail(protocolStateError("worker_input_ready_timeout", "Worker 输入流组装超时")),
            Math.max(100, Number(runOptions.inputReadyTimeoutMs) || 2500)
          );
        }
      }

      function waitForInputAck() {
        if (!inputInflight.size || settled) return Promise.resolve();
        return new Promise((waitResolve, waitReject) => {
          const waiter = {resolve: waitResolve, reject: waitReject, timer: null};
          waiter.timer = setTimeout(() => {
            inputWaiters.delete(waiter);
            waitReject(protocolStateError("worker_input_ack_timeout", "Worker 输入流确认超时"));
          }, Math.max(100, Number(runOptions.streamAckTimeoutMs) || 5000));
          inputWaiters.add(waiter);
        });
      }

      async function waitForInputAckMeasured() {
        const startedAt = now();
        await waitForInputAck();
        telemetry.inputAckWaitMs = roundMs(telemetry.inputAckWaitMs + now() - startedAt);
      }

      function resolveInputWaiters() {
        for (const waiter of inputWaiters) {
          clearTimeout(waiter.timer);
          waiter.resolve();
        }
        inputWaiters.clear();
      }

      function rejectInputWaiters(error) {
        for (const waiter of inputWaiters) {
          clearTimeout(waiter.timer);
          waiter.reject(error);
        }
        inputWaiters.clear();
      }
    });
  }

  async function runFallback(request, signal, cause, runOptions = {}) {
    if (signal?.aborted) throw abortError(signal.reason);
    if (validateBinding && validateBinding(request.binding) !== true) throw obsoleteError("地图、revision、generation token 或锁已变化");
    const handler = getWorkerTaskHandler(request.task);
    (runOptions.onFallback || onFallback)?.({task: request.task, cause: cause?.message || "worker-unavailable"});
    const fallbackPayload = typeof runOptions.fallbackPayloadFactory === "function"
      ? await createFallbackPayload(runOptions, request, signal, cause)
      : runOptions.payloadIsolated ? request.payload : structuredClone(request.payload);
    if (signal?.aborted) throw abortError(signal.reason);
    if (validateBinding && validateBinding(request.binding) !== true) throw obsoleteError("地图、revision、generation token 或锁已变化");
    const context = {
      binding: request.binding,
      signal,
      report(stage, detail = {}) {
        (runOptions.onProgress || onProgress)?.(stage, detail, {task: request.task, binding: request.binding, fallback: true});
      },
      checkpoint() {
        if (signal?.aborted) throw abortError(signal.reason);
        return true;
      }
    };
    const result = await handler(fallbackPayload, context);
    context.checkpoint();
    assertCurrentBinding(request.binding, request.binding);
    return {...result, worker: {mode: "fallback", accepted: false, cause: cause?.message || "worker-unavailable"}};
  }

  function assertCurrentBinding(expected, returned) {
    if (!sameBinding(expected, returned)) throw obsoleteError("Worker 返回的绑定已损坏");
    if (validateBinding && validateBinding(expected) !== true) throw obsoleteError("地图、revision、generation token 或锁已变化");
  }
}

function fallbackAllowed(options) {
  return options?.allowFallback !== false;
}

function fallbackDisabledError(cause = null) {
  const error = new Error("Worker 不可用，且当前任务不允许主线程降级执行");
  error.code = "worker_fallback_disabled";
  if (cause) error.cause = cause;
  return error;
}

async function createFallbackPayload(runOptions, request, signal, cause) {
  if (typeof runOptions.fallbackPayloadFactory !== "function") {
    const error = new Error("Worker 输入已转移且没有可重建的降级快照");
    error.code = "worker_fallback_payload_unavailable";
    throw error;
  }
  return runOptions.fallbackPayloadFactory({
    task: request.task,
    binding: request.binding,
    signal,
    cause
  });
}

export function sameWorkerTaskBinding(left, right) {
  return sameBinding(left, right);
}

function sameBinding(left, right) {
  return stableStringify(left) === stableStringify(right);
}

function sameSessionBinding(left, right) {
  return left?.mapIdentity === right?.mapIdentity
    && Number(left?.mapRevision) === Number(right?.mapRevision)
    && Number(left?.generationToken) === Number(right?.generationToken)
    && String(left?.lockFingerprint || "") === String(right?.lockFingerprint || "");
}

function isValidSessionCommitBinding(previous, next, expectedRevisionDelta) {
  if (previous?.mapIdentity !== next?.mapIdentity
    || Number(previous?.generationToken) !== Number(next?.generationToken)
    || String(previous?.lockFingerprint || "") !== String(next?.lockFingerprint || "")
    || Number(previous?.operationId) !== Number(next?.operationId)
    || String(previous?.operationName || "") !== String(next?.operationName || "")) return false;
  const revisionDelta = Number(next?.mapRevision) - Number(previous?.mapRevision);
  if (Number.isInteger(expectedRevisionDelta)) return revisionDelta === expectedRevisionDelta;
  return revisionDelta === 0 || revisionDelta === 1;
}

function isValidReplicaPatchBinding(previous, next, patch) {
  return previous?.mapIdentity === next?.mapIdentity
    && patch?.mapIdentity === next?.mapIdentity
    && Number(previous?.generationToken) === Number(next?.generationToken)
    && Number(previous?.mapRevision) === Number(patch?.baseRevision)
    && Number(next?.mapRevision) === Number(patch?.targetRevision)
    && Number(patch?.targetRevision) === Number(patch?.baseRevision) + 1;
}

function normalizeChecksum(value) {
  return value === null || value === undefined || value === "" ? null : String(value);
}

function createSessionInputPayload(payload, options) {
  if (typeof options.sessionPayloadFactory === "function") return options.sessionPayloadFactory(payload);
  if (options.sessionPayload !== undefined) return options.sessionPayload;
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return payload;
  const {map: _map, ...rest} = payload;
  return rest;
}

function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${stableStringify(value[key])}`).join(",")}}`;
}

function clonePlain(value) {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value));
}

function abortError(reason) {
  return new DOMException(String(reason || "Worker 任务已取消"), "AbortError");
}

function obsoleteError(message) {
  const error = new Error(message);
  error.code = "operation_obsolete";
  return error;
}

function protocolStateError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}

function now() {
  return globalThis.performance?.now?.() ?? Date.now();
}

function roundMs(value) {
  return Math.round(Number(value || 0) * 1000) / 1000;
}
