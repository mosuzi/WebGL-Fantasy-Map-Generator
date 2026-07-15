import {performance} from "node:perf_hooks";

export function runGateSequence(gates, runGate, options = {}) {
  const steps = [];
  let failureCode = 0;

  for (let index = 0; index < gates.length; index += 1) {
    const gate = gates[index];
    if (failureCode) {
      steps.push({id: gate.id, label: gate.label, kind: gate.kind, status: "skipped", durationMs: 0, exitCode: null});
      continue;
    }

    options.onStart?.(gate, index, gates.length);
    const started = performance.now();
    const result = runGate(gate, index) || {};
    const exitCode = Number.isInteger(result.status) ? result.status : 1;
    const status = !result.error && exitCode === 0 ? "passed" : "failed";
    const step = {
      id: gate.id,
      label: gate.label,
      kind: gate.kind,
      status,
      durationMs: round(performance.now() - started),
      exitCode,
      ...(result.signal ? {signal: result.signal} : {}),
      ...(result.error ? {error: result.error.message || String(result.error)} : {})
    };
    steps.push(step);
    options.onFinish?.(step, gate, index, gates.length);
    if (status === "failed") failureCode = exitCode || 1;
  }

  return {failureCode, steps};
}

function round(value) {
  return Math.round(value * 1000) / 1000;
}
