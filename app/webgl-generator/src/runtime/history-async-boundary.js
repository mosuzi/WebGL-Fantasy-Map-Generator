export function createCommittedHistoryGuard({state, sourceMap, revision, operation = null}) {
  const expected = normalizeRevision(revision);
  return () => {
    operation?.throwIfCancelled?.();
    if (typeof operation?.isCurrent === "function" && !operation.isCurrent()) {
      throw obsoleteHistoryError();
    }
    const current = normalizeRevision(state?.mapRevision?.getSnapshot?.());
    if (
      state?.map !== sourceMap
      || current.mapIdentity !== expected.mapIdentity
      || current.mapRevision !== expected.mapRevision
    ) {
      throw obsoleteHistoryError();
    }
  };
}

export function settleHistoryActionResult(result, onSuccess, onError = rethrow) {
  if (result && typeof result.then === "function") {
    return Promise.resolve(result).then(onSuccess, onError);
  }
  return onSuccess(result);
}

function normalizeRevision(revision) {
  return {
    mapIdentity: revision?.mapIdentity ?? null,
    mapRevision: Number(revision?.mapRevision)
  };
}

function obsoleteHistoryError() {
  const error = new Error("历史恢复已被新的地图状态取代");
  error.code = "operation_obsolete";
  return error;
}

function rethrow(error) {
  throw error;
}
