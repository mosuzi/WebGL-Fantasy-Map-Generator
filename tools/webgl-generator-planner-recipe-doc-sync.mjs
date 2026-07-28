#!/usr/bin/env node
import {createHash} from "node:crypto";
import {existsSync, readFileSync, writeFileSync} from "node:fs";
import {dirname, resolve} from "node:path";
import {fileURLToPath, pathToFileURL} from "node:url";

import {getPlannerRecipe, listPlannerRecipes} from "../app/webgl-generator/src/runtime/planner-recipe-registry.js";

const TOOL_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(TOOL_DIR, "..");
export const PLANNER_RECIPE_DOC_PATH = resolve(REPO_ROOT, "docs", "task-notes", "gameplay-rules-and-ai-planner-recipes.md");
export const PLANNER_RECIPE_DOC_SYNC_START = "<!-- PLANNER_RECIPE_MACHINE_SYNC:START -->";
export const PLANNER_RECIPE_DOC_SYNC_END = "<!-- PLANNER_RECIPE_MACHINE_SYNC:END -->";

export function buildPlannerRecipeDocSyncReport(documentSource = null) {
  const source = documentSource ?? (existsSync(PLANNER_RECIPE_DOC_PATH)
    ? readFileSync(PLANNER_RECIPE_DOC_PATH, "utf8")
    : "");
  const canonical = buildCanonicalRegistry();
  const parsed = parseMachineAppendix(source);
  const expectedByKey = new Map(canonical.rows.map(row => [rowKey(row), row]));
  const docsByKey = new Map(parsed.rows.map(row => [rowKey(row), row]));
  const machineOnly = [...expectedByKey.keys()].filter(key => !docsByKey.has(key));
  const docsOnly = [...docsByKey.keys()].filter(key => !expectedByKey.has(key));
  const fieldMismatch = [];
  const methodMismatch = [];

  for (const [key, expected] of expectedByKey) {
    const actual = docsByKey.get(key);
    if (!actual) continue;
    if (["actionId", "kind", "spatialActionId", "compensation", "revisionCheckpoints", "successCriteria"]
      .some(field => expected[field] !== actual[field])) fieldMismatch.push(key);
    if (["facts", "inspection", "executeMethods"]
      .some(field => expected[field] !== actual[field])) methodMismatch.push(key);
  }

  const digestMismatch = parsed.canonicalDigest !== canonical.canonicalDigest;
  const markerMissing = !parsed.markerFound;
  const issueCount = machineOnly.length + docsOnly.length + fieldMismatch.length + methodMismatch.length
    + Number(digestMismatch) + Number(markerMissing);
  return {
    complete: issueCount === 0,
    canonicalDigest: canonical.canonicalDigest,
    documentDigest: sha256(source),
    recipeCount: canonical.recipeCount,
    stepCount: canonical.stepCount,
    markerFound: parsed.markerFound,
    digestMismatch,
    issueCount,
    machineOnly,
    docsOnly,
    fieldMismatch,
    methodMismatch,
    expectedAppendix: renderMachineAppendix(canonical)
  };
}

export function syncPlannerRecipeDocument(documentSource = null) {
  const source = documentSource ?? (existsSync(PLANNER_RECIPE_DOC_PATH)
    ? readFileSync(PLANNER_RECIPE_DOC_PATH, "utf8")
    : "");
  const report = buildPlannerRecipeDocSyncReport(source);
  const withoutAppendix = removeMachineAppendix(source).trimEnd();
  const next = `${withoutAppendix}\n\n${report.expectedAppendix}\n`;
  writeFileSync(PLANNER_RECIPE_DOC_PATH, next, "utf8");
  return buildPlannerRecipeDocSyncReport(next);
}

function buildCanonicalRegistry() {
  const recipes = listPlannerRecipes().map(summary => getPlannerRecipe(summary.recipeId));
  const rows = recipes.flatMap(recipe => recipe.steps.map(step => canonicalRow(recipe.recipeId, step)));
  const canonicalPayload = {
    schemaVersion: "1.0.0",
    recipes
  };
  return {
    recipeCount: recipes.length,
    stepCount: rows.length,
    rows,
    canonicalDigest: sha256(JSON.stringify(canonicalPayload))
  };
}

function canonicalRow(recipeId, step) {
  return {
    recipeId,
    stepId: step.stepId,
    actionId: step.actionId || "",
    kind: step.kind,
    facts: step.facts.join("<br>"),
    inspection: step.inspection.methods.join("<br>"),
    executeMethods: step.executeMethods.join("<br>"),
    spatialActionId: step.spatialActionId || "",
    compensation: [
      step.compensation.mode,
      step.compensation.method || "",
      ...(step.compensation.methods || []),
      step.compensation.guard
    ].join("<br>"),
    revisionCheckpoints: step.revisionCheckpoints.join("<br>"),
    successCriteria: step.successCriteria.join("<br>")
  };
}

function renderMachineAppendix(canonical) {
  const lines = [
    PLANNER_RECIPE_DOC_SYNC_START,
    "## 十三、机器同步附录",
    "",
    "> 本附录由 `tools/webgl-generator-planner-recipe-doc-sync.mjs` 从运行时 canonical registry 生成。手工修改会被 `--check` 判为陈旧；人类说明与机器目录必须同时审阅。",
    "",
    `- canonical registry SHA-256：\`${canonical.canonicalDigest}\``,
    `- 配方 / 顶层步骤：\`${canonical.recipeCount} / ${canonical.stepCount}\``,
    "",
    "| recipeId | stepId | actionId | kind | facts | inspection | execute | spatialAction | compensation | revision | success |",
    "|---|---|---|---|---|---|---|---|---|---|---|",
    ...canonical.rows.map(row => [
      row.recipeId,
      row.stepId,
      row.actionId || "—",
      row.kind,
      row.facts,
      row.inspection,
      row.executeMethods,
      row.spatialActionId || "—",
      row.compensation,
      row.revisionCheckpoints,
      row.successCriteria
    ].map(markdownCell).join(" | ").replace(/^/u, "| ").replace(/$/u, " |")),
    PLANNER_RECIPE_DOC_SYNC_END
  ];
  return lines.join("\n");
}

function parseMachineAppendix(source) {
  const start = source.indexOf(PLANNER_RECIPE_DOC_SYNC_START);
  const end = source.indexOf(PLANNER_RECIPE_DOC_SYNC_END);
  if (start < 0 || end < start) return {markerFound: false, canonicalDigest: "", rows: []};
  const appendix = source.slice(start, end + PLANNER_RECIPE_DOC_SYNC_END.length);
  const canonicalDigest = appendix.match(/canonical registry SHA-256：`([a-f0-9]{64})`/u)?.[1] || "";
  const rows = appendix.split(/\r?\n/u)
    .filter(line => line.startsWith("| `scenario."))
    .map(parseTableRow)
    .filter(Boolean);
  return {markerFound: true, canonicalDigest, rows};
}

function parseTableRow(line) {
  const cells = line.slice(1, -1).split("|").map(cell => unmarkMarkdownCell(cell.trim()));
  if (cells.length !== 11) return null;
  const [recipeId, stepId, actionId, kind, facts, inspection, executeMethods, spatialActionId, compensation, revisionCheckpoints, successCriteria] = cells;
  return {
    recipeId,
    stepId,
    actionId: actionId === "—" ? "" : actionId,
    kind,
    facts,
    inspection,
    executeMethods,
    spatialActionId: spatialActionId === "—" ? "" : spatialActionId,
    compensation,
    revisionCheckpoints,
    successCriteria
  };
}

function markdownCell(value) {
  return `\`${String(value).replace(/\|/gu, "\\|").replace(/`/gu, "\\`")}\``;
}

function unmarkMarkdownCell(value) {
  const unwrapped = value.startsWith("`") && value.endsWith("`") ? value.slice(1, -1) : value;
  return unwrapped.replace(/\\\|/gu, "|").replace(/\\`/gu, "`");
}

function removeMachineAppendix(source) {
  const start = source.indexOf(PLANNER_RECIPE_DOC_SYNC_START);
  const end = source.indexOf(PLANNER_RECIPE_DOC_SYNC_END);
  if (start < 0 || end < start) return source;
  return `${source.slice(0, start)}${source.slice(end + PLANNER_RECIPE_DOC_SYNC_END.length)}`;
}

function rowKey(row) {
  return `${row.recipeId}:${row.stepId}`;
}

function sha256(value) {
  return createHash("sha256").update(String(value)).digest("hex");
}

if (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url) {
  const check = process.argv.includes("--check");
  const report = check ? buildPlannerRecipeDocSyncReport() : syncPlannerRecipeDocument();
  console.log(JSON.stringify({
    ok: report.complete,
    check,
    path: PLANNER_RECIPE_DOC_PATH,
    canonicalDigest: report.canonicalDigest,
    recipeCount: report.recipeCount,
    stepCount: report.stepCount,
    issueCount: report.issueCount,
    machineOnly: report.machineOnly,
    docsOnly: report.docsOnly,
    fieldMismatch: report.fieldMismatch,
    methodMismatch: report.methodMismatch
  }, null, 2));
  if (!report.complete) process.exitCode = 1;
}
