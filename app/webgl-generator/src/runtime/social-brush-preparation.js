import {socialCoverageInput} from "./social-brush-coverage.js";

export function prepareSocialBrush(state, kind) {
  const map = state.map, revision = state.mapRevision.mapRevision;
  const current = state.socialBrushPreparation;
  if (current?.map === map && current.kind === kind && current.revision === revision) return current;
  current?.dispose();
  if (!map || typeof Worker !== "function") return null;
  let worker, sequence = 0, busy = true, result = null;
  const queued = new Map();
  const job = {
    map, kind, revision,
    edit(changes, originals) {
      if (!worker) return;
      sequence++;
      result = null;
      for (const {gridCell, after} of changes) queued.set(gridCell, [gridCell, after, originals.get(gridCell).packBefore.map(entry => entry.packCell)]);
      send();
    },
    read: () => result,
    dispose() {
      worker?.terminate();
      worker = null;
      queued.clear();
      if (state.socialBrushPreparation === job) state.socialBrushPreparation = null;
    }
  };
  function send() {
    if (busy || !queued.size || !worker) return;
    busy = true;
    worker.postMessage({sequence, edits: [...queued.values()]});
    queued.clear();
  }
  try {
    worker = new Worker(new URL("./social-brush-coverage-worker.js", import.meta.url), {type: "module"});
    worker.onmessage = ({data}) => {
      if (!worker) return;
      busy = false;
      if (sequence === data.sequence) result = data.coverage;
      send();
    };
    worker.onerror = () => job.dispose();
    state.socialBrushPreparation = job;
    worker.postMessage({sequence, input: socialCoverageInput(map, kind)});
    return job;
  } catch {
    job.dispose();
    return null;
  }
}
