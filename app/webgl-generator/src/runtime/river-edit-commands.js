import {EDIT_REFRESH_PRESETS} from "./edit-refresh-scheduler.js";

export function createSetRiverWidthFactorCommand(riverId, nextValue) {
  const nextWidthFactor = normalizeWidthFactor(nextValue);
  let previousWidthFactor = null;
  let hadPreviousWidthFactor = false;
  let capturedPrevious = false;

  return {
    label: `调整河流 #${riverId} 宽度因子`,
    effects: {
      ...EDIT_REFRESH_PRESETS.RIVER_WIDTH_ONLY,
      affected: [{kind: "river", id: riverId}]
    },
    apply(context) {
      const river = findRiver(context.map, riverId);
      if (!river) throw new Error(`找不到河流 #${riverId}`);
      if (!capturedPrevious) {
        hadPreviousWidthFactor = Object.prototype.hasOwnProperty.call(river, "widthFactor");
        previousWidthFactor = river.widthFactor;
        capturedPrevious = true;
      }
      river.widthFactor = nextWidthFactor;
    },
    revert(context) {
      const river = findRiver(context.map, riverId);
      if (!river) throw new Error(`找不到河流 #${riverId}`);
      if (hadPreviousWidthFactor) {
        river.widthFactor = previousWidthFactor;
      } else {
        delete river.widthFactor;
      }
    },
    isNoop(context) {
      const river = findRiver(context.map, riverId);
      return river ? normalizeWidthFactor(river.widthFactor) === nextWidthFactor : true;
    }
  };
}

function findRiver(map, riverId) {
  return map?.rivers?.rivers?.find(river => river.id === riverId) || null;
}

function normalizeWidthFactor(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 1;
  return Math.max(0.2, Math.min(3, numeric));
}
