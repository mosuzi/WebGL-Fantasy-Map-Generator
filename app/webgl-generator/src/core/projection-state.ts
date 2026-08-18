import type {ProjectionState, ProjectionStatus} from "./contracts/commit.js";

const TRANSITIONS = Object.freeze({
  pending: ["prepared", "ready", "degraded"],
  prepared: ["ready", "degraded"],
  ready: ["degraded"],
  degraded: ["retrying", "resyncing"],
  retrying: ["ready", "degraded", "resyncing"],
  resyncing: ["ready", "degraded"]
} as const satisfies Readonly<Record<ProjectionState, readonly ProjectionState[]>>);

export function isProjectionTransitionAllowed(from: ProjectionState, to: ProjectionState): boolean {
  return from === to || (TRANSITIONS[from] as readonly ProjectionState[]).includes(to);
}

export function isProjectionSetTerminal(projections: readonly ProjectionStatus[]): boolean {
  return projections.every(status => status.state === "ready" || status.state === "degraded");
}
