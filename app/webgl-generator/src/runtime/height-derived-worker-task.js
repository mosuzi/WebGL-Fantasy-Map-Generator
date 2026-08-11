import {createDomainPatch} from "./domain-patch.js";
import {executeRenderPreparationTask} from "../renderer/render-preparation.js";
import {
  HEIGHT_BASE_REBUILD_STEPS,
  HEIGHT_DOWNSTREAM_REBUILD_STEPS,
  rebuildHeightAllDerived,
  rebuildHeightBaseDerived,
  rebuildHeightDownstreamDerived
} from "./height-derived-rebuild.js";
import {captureRegenerationConstraintBundle} from "./regeneration-constraint-bundle.js";
import {
  getRegenerationPatchPolicy,
  regenerateMapAttributeForWorker
} from "./regeneration-worker-task.js";
import {collectWorkerTransferables} from "./worker-snapshot.js";

export const HEIGHT_DERIVED_WORKER_TASK = "height-derived.compute";
export const HEIGHT_DERIVED_SCOPES = Object.freeze(["base", "downstream", "all"]);

const DOMAIN_BY_KIND = Object.freeze({
  features: "features",
  rivers: "rivers",
  states: "states-provinces",
  religions: "religions",
  markers: "markers-economy",
  diplomacy: "diplomacy",
  military: "military",
  zones: "zones"
});

export async function runHeightDerivedWorkerTask(payload, context = {}) {
  const map = payload?.map;
  if (!map || typeof map !== "object") throw taskError("worker_height_derived_map_missing", "高度派生 Worker 缺少地图快照");
  if (payload?.mode === "render-only") return renderOnly(payload, map, context);
  const scope = normalizeScope(payload?.scope);
  const kinds = scopeKinds(scope);
  const constraintBundle = captureRegenerationConstraintBundle(map, {closure: ["world"]});
  const steps = [];
  const changedKinds = [];

  checkpoint(context);
  report(context, "prepare", `正在准备高度${scopeLabel(scope)}派生重建`, 0.05);
  for (let index = 0; index < kinds.length; index++) {
    const kind = kinds[index];
    const domain = DOMAIN_BY_KIND[kind] || kind;
    checkpoint(context);
    report(context, kind, `正在重建${kindLabel(kind)}`, 0.1 + (index / Math.max(1, kinds.length)) * 0.75);
    constraintBundle.assertDomain(map, domain, "before");
    if (constraintBundle.isDomainFullyLocked(domain)) {
      constraintBundle.assertDomain(map, domain, "skip");
      steps.push({
        kind,
        result: {
          kind,
          action: kindLabel(kind),
          executed: true,
          skipped: true,
          status: "锁定领域已完整跳过",
          constraint: "本阶段全部对象已锁定，未推进阶段 salt。"
        }
      });
      continue;
    }
    failAt(payload?.faultAt, `before:${kind}`);
    const result = regenerateMapAttributeForWorker(map, kind, {
      scope: "all",
      constraintBundle,
      rejectLockedDiplomacy: kind === "states"
    });
    steps.push({kind, result});
    if (result?.executed) changedKinds.push(kind);
    constraintBundle.assertDomain(map, domain, "after");
    failAt(payload?.faultAt, `after:${kind}`);
    checkpoint(context);
    if (!result?.executed) break;
  }

  constraintBundle.assertDomain(map, "world", "after");
  const aggregate = buildAggregate(scope, steps);
  if (!aggregate.executed && changedKinds.length) {
    throw taskError("worker_height_derived_incomplete", `${aggregate.action}未完整执行，Worker 结果已拒绝提交`);
  }
  const executed = aggregate.executed && changedKinds.length > 0;
  const result = executed ? aggregate : {
    ...aggregate,
    executed: false,
    status: aggregate.executed ? "所选高度派生阶段均已完整锁定，未执行重建。" : aggregate.status,
    constraint: aggregate.executed ? "完整锁定阶段已合法跳过，未推进 salt。" : aggregate.constraint
  };
  const policy = getHeightDerivedPatchPolicy(scope, changedKinds);
  const patch = createDomainPatch(policy.domain, executed ? policy.allowedPaths : [], map);
  checkpoint(context);
  report(context, "patch", "正在生成高度派生领域补丁", 0.92);
  const preparedRender = executed && payload?.render
    ? await executeRenderPreparationTask({
        ...payload.render,
        map,
        binding: payload.render.binding || context.binding || null
      }, context)
    : null;
  return {
    kind: "height-derived",
    scope,
    binding: context.binding || null,
    result: {
      ...result,
      scope,
      changedKinds: [...changedKinds],
      staleSystems: [...(map.metadata?.derivedStale?.systems || [])]
    },
    patch,
    refresh: {
      derived: ["terrain-caches", "height-field", "cell-colors", "political-boundaries", "point-layers", "line-layers", "labels", "route-mesh", "river-mesh", "object-panels", "object-index"],
      picking: "all"
    },
    preparedRender
  };
}

export function getHeightDerivedPatchPolicy(scope = "all", changedKinds = null) {
  const normalized = normalizeScope(scope);
  const kinds = Array.isArray(changedKinds) ? changedKinds : scopeKinds(normalized);
  return {
    domain: "height-derived",
    allowedPaths: unionPaths(kinds.map(kind => getRegenerationPatchPolicy(kind).allowedPaths)),
    forbiddenPaths: []
  };
}

export function collectHeightDerivedWorkerTransferables(result) {
  return collectWorkerTransferables({patch: result?.patch || null, preparedRender: result?.preparedRender || null});
}

async function renderOnly(payload, map, context) {
  if (!payload.render || typeof payload.render !== "object") {
    throw taskError("worker_height_derived_render_missing", "高度派生渲染准备缺少渲染上下文");
  }
  const binding = payload.render.binding || context.binding || null;
  checkpoint(context);
  const preparedRender = await executeRenderPreparationTask({...payload.render, map, binding}, context);
  checkpoint(context);
  return {mode: "render-only", binding: context.binding || null, preparedRender};
}

function buildAggregate(scope, steps) {
  let cursor = 0;
  const regenerate = () => steps[cursor++]?.result;
  if (scope === "base") return rebuildHeightBaseDerived(regenerate);
  if (scope === "downstream") return rebuildHeightDownstreamDerived(regenerate);
  return rebuildHeightAllDerived(regenerate);
}

function normalizeScope(scope) {
  const value = String(scope || "all").trim().toLowerCase();
  const aliases = {basic: "base", derived: "downstream", full: "all"};
  const normalized = aliases[value] || value;
  if (!HEIGHT_DERIVED_SCOPES.includes(normalized)) {
    throw taskError("worker_height_derived_scope_invalid", `不支持的高度派生范围：${value || "(empty)"}`);
  }
  return normalized;
}

function scopeKinds(scope) {
  if (scope === "base") return [...HEIGHT_BASE_REBUILD_STEPS];
  if (scope === "downstream") return [...HEIGHT_DOWNSTREAM_REBUILD_STEPS];
  return [...HEIGHT_BASE_REBUILD_STEPS, ...HEIGHT_DOWNSTREAM_REBUILD_STEPS];
}

function unionPaths(groups) {
  return [...new Set(groups.flat())].sort();
}

function kindLabel(kind) {
  return ({
    features: "地理要素与岸线",
    rivers: "河流",
    states: "国家、省份、城镇与道路",
    religions: "宗教",
    markers: "资源点与经济",
    diplomacy: "外交",
    military: "军事",
    zones: "地区"
  })[kind] || kind;
}

function scopeLabel(scope) {
  return scope === "base" ? "基础" : scope === "downstream" ? "下游" : "全部";
}

function checkpoint(context) {
  if (context.checkpoint?.() === false) throw new DOMException("高度派生 Worker 已取消", "AbortError");
}

function report(context, stage, message, progress) {
  context.report?.(stage, {message, progress});
}

function failAt(requested, stage) {
  if (requested && String(requested) === stage) throw taskError("worker_height_derived_fault", `高度派生故障注入：${stage}`);
}

function taskError(code, message) {
  const error = new Error(message);
  error.code = code;
  return error;
}
