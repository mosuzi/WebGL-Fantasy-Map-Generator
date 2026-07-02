export function createStageProfile({onStageStart = null, onStageEnd = null} = {}) {
  const startedAt = performance.now();
  const stages = [];
  return {
    stage(id, label, task) {
      const started = performance.now();
      onStageStart?.({id, label});
      const result = task();
      const stage = {id, label, ms: roundMs(performance.now() - started)};
      stages.push(stage);
      onStageEnd?.(stage);
      return result;
    },
    finish() {
      const totalMs = roundMs(performance.now() - startedAt);
      const slowest = stages.reduce((best, stage) => stage.ms > (best?.ms ?? -1) ? stage : best, null);
      return {
        totalMs,
        stages,
        slowest: slowest ? {...slowest} : null
      };
    }
  };
}

function roundMs(value) {
  return Math.round(value * 10) / 10;
}
