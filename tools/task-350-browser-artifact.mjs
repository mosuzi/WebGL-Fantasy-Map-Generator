import {mkdirSync, writeFileSync} from "node:fs";
import {join, resolve} from "node:path";

export function createTask350BrowserArtifact(name, {mode = "browser"} = {}) {
  const artifactDir = resolve(process.env.TASK_350_CDP_ARTIFACT_DIR || join(process.cwd(), "work", "task-350-cdp-artifacts"));
  const artifact = {
    schemaVersion: 1,
    name,
    mode,
    ok: false,
    startedAt: new Date().toISOString(),
    finishedAt: null,
    progress: {phase: "startup", active: null, completed: []},
    failure: null,
    teardownFailures: [],
    result: null
  };
  let compactResult = null;

  return {
    artifact,
    mark(phase, {active = null, complete = null} = {}) {
      if (complete && !artifact.progress.completed.includes(complete)) artifact.progress.completed.push(complete);
      artifact.progress.phase = phase;
      artifact.progress.active = active;
    },
    setResult(result, compact) {
      artifact.result = result;
      compactResult = compact;
    },
    succeed() {
      artifact.ok = true;
      artifact.progress.phase = "complete";
      artifact.progress.active = null;
    },
    fail(error) {
      artifact.ok = false;
      if (!artifact.failure) artifact.failure = serializeError(error);
      artifact.progress.phase = "failed";
    },
    failTeardown(error) {
      const serialized = serializeError(error);
      artifact.ok = false;
      artifact.teardownFailures.push(serialized);
      if (!artifact.failure) artifact.failure = serialized;
      artifact.progress.phase = "failed";
      artifact.progress.active = "teardown";
    },
    persist() {
      artifact.finishedAt = new Date().toISOString();
      mkdirSync(artifactDir, {recursive: true});
      const fullPath = join(artifactDir, `${name}-full.json`);
      const summaryPath = join(artifactDir, `${name}-summary.json`);
      const summary = {
        schemaVersion: artifact.schemaVersion,
        name: artifact.name,
        mode: artifact.mode,
        ok: artifact.ok,
        progress: artifact.progress,
        failure: artifact.failure,
        teardownFailures: artifact.teardownFailures,
        result: compactResult
      };
      writeFileSync(fullPath, `${JSON.stringify(artifact, null, 2)}\n`, "utf8");
      writeFileSync(summaryPath, `${JSON.stringify(summary, null, 2)}\n`, "utf8");
      return {fullPath, summaryPath, summary};
    }
  };
}

export async function closeTask350BrowserResource(label, close, timeoutMs = 5000) {
  if (typeof close !== "function") throw new TypeError(`${label} close 必须是函数`);
  let timeoutId = null;
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => {
      const error = new Error(`${label} close 超过 ${timeoutMs}ms`);
      error.code = "browser_teardown_timeout";
      reject(error);
    }, timeoutMs);
  });
  try {
    return await Promise.race([Promise.resolve().then(close), timeout]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function serializeTask350BrowserError(error) {
  return serializeError(error);
}

function serializeError(error) {
  if (!error) return null;
  return {
    name: error.name || typeof error,
    message: error.message || String(error),
    code: error.code || null,
    stack: error.stack || null
  };
}
