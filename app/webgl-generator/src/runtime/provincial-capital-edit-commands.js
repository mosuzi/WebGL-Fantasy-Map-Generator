import {
  applyProvincialCapitalPlan,
  captureProvincialCapitalSnapshot,
  inspectProvincialCapitalReassessment,
  markProvincialCapitalDerivedStale,
  restoreProvincialCapitalSnapshot
} from "../generator/provincial-capitals.js";
import {refreshProvincialCapitalRoutePriorities} from "../generator/settlements.js";
import {systemAffected} from "./edit-command-effects.js";

export function createReassessProvincialCapitalsCommand(request, {
  expectedFingerprint,
  label = "重评省会",
  faultInjector = null
} = {}) {
  let preview = null;
  let snapshot = null;
  let result = null;
  let applied = false;
  return {
    label,
    domain: "provincial-capital",
    effects: {
      render: "draw",
      selection: "refresh",
      runtimeStats: true,
      pickPanel: true,
      derived: ["city-icons", "labels", "route-mesh", "province-statistics", "object-panels", "object-index"],
      affected: systemAffected("provincial-capitals")
    },
    apply(context) {
      if (!applied) {
        preview ??= inspectProvincialCapitalReassessment(context.map, request);
        assertExpectedFingerprint(preview, expectedFingerprint);
        if (!preview.allowed) throw provincialCapitalCommandError(preview.code, preview.summary);
        snapshot ??= captureProvincialCapitalSnapshot(context.map, preview.changes.map(change => change.provinceId));
      }
      try {
        result = applyProvincialCapitalPlan(context.map, preview, {faultInjector});
        refreshProvincialCapitalRoutePriorities(
          context.map?.settlements?.cities,
          context.map?.settlements?.routes,
          context.map?.pack,
          {
            lockedRoutes: (context.map?.regenerationLocks?.entries || [])
              .filter(entry => entry?.kind === "route")
              .map(entry => ({id: Number(entry.id)}))
          }
        );
        markProvincialCapitalDerivedStale(context.map);
        faultInjector?.({stage: "after-derived-stale", preview, result, map: context.map});
        applied = true;
        this.effects.affected = systemAffected(
          "provincial-capitals",
          preview.changes.flatMap(change => [
            {kind: "province", id: change.provinceId},
            {kind: "city", id: change.currentCityId},
            {kind: "city", id: change.nextCityId}
          ].filter(target => target.id !== null && target.id !== undefined))
        );
      } catch (error) {
        if (snapshot) restoreProvincialCapitalSnapshot(context.map, snapshot);
        applied = false;
        throw error;
      }
    },
    revert(context) {
      restoreProvincialCapitalSnapshot(context.map, snapshot);
      applied = false;
    },
    isNoop(context) {
      if (applied) return false;
      preview ??= inspectProvincialCapitalReassessment(context.map, request);
      assertExpectedFingerprint(preview, expectedFingerprint);
      return !preview.allowed && preview.code === "no-op";
    },
    getPreview() {
      return preview;
    },
    getResult() {
      return result;
    }
  };
}

function assertExpectedFingerprint(preview, expectedFingerprint) {
  if (!expectedFingerprint) {
    throw provincialCapitalCommandError("preview-required", "省会重评必须先预览并提交 expectedFingerprint");
  }
  if (String(expectedFingerprint) !== String(preview.fingerprint)) {
    throw provincialCapitalCommandError("preview-stale", "省会重评预览已过期，请重新预览");
  }
}

function provincialCapitalCommandError(code, message) {
  const error = new Error(message);
  error.code = code || "provincial-capital-rejected";
  return error;
}
