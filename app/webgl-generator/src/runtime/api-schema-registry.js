export const API_METHOD_SCHEMA_VERSION = "1.0.0";

const ERROR_CODES = Object.freeze([
  "api_error",
  "invalid_argument",
  "not_found",
  "confirmation_required",
  "operation_busy",
  "operation_cancelled",
  "operation_obsolete",
  "operation_invalid_input",
  "operation_failed",
  "inspection_required",
  "inspection-required",
  "unsupported_lock_kind",
  "object_not_found",
  "lock_batch_empty",
  "lock_batch_invalid",
  "regeneration_lock_conflict",
  "inspection_stale",
  "inspection-stale",
  "inspection-token-invalid",
  "inspection-action-mismatch",
  "inspection-input-mismatch",
  "inspection-schema-mismatch"
]);

const REFERENCE_RULES = Object.freeze([
  [/(cities|city)/, ["object:city", "gridCell"]],
  [/(states|state)/, ["object:state", "gridCell"]],
  [/(provinces|province)/, ["object:province", "gridCell"]],
  [/(cultures|culture)/, ["object:culture", "gridCell"]],
  [/(religions|religion)/, ["object:religion", "gridCell"]],
  [/(rivers|river)/, ["object:river", "packCell"]],
  [/(lakes|lake)/, ["object:lake", "packCell"]],
  [/(routes|route)/, ["object:route", "worldPoint"]],
  [/(markers|marker)/, ["object:marker", "packCell", "worldPoint"]],
  [/(labels|label)/, ["object:label", "worldPoint"]],
  [/(measurements|measurement)/, ["object:measurement", "worldPoint"]],
  [/(military)/, ["object:military", "packCell", "worldPoint"]],
  [/(zones|zone)/, ["object:zone", "packCell"]],
  [/(selection|objects)/, ["object"]]
]);

const METHOD_OVERRIDES = Object.freeze({
  "info.describe": {
    arguments: [argument("method", stringSchema("公开方法全名，例如 edit.states.rename"))],
    result: objectSchema(["method", "schemaVersion", "inputSchema", "resultSchema", "businessCodes"]),
    examples: [["objects.list"], ["edit.states.rename"]]
  },
  "objects.types": {
    arguments: [],
    result: arraySchema(objectSchema(["type", "label", "fields"])),
    examples: [[]]
  },
  "objects.get": {
    arguments: [argument("reference", objectSchema(["kind", "id"]))],
    result: objectSchema(["kind", "id"]),
    examples: [[{kind: "state", id: 1}]]
  },
  "objects.list": {
    arguments: [
      argument("type", stringSchema("对象类型")),
      argument("options", paginationSchema(), false)
    ],
    result: pageSchema(),
    examples: [["state", {limit: 20}]]
  },
  "objects.query": {
    arguments: [
      argument("query", {
        type: "object",
        properties: {
          type: stringSchema("对象类型"),
          types: arraySchema(stringSchema("对象类型")),
          text: stringSchema("名称或文本包含"),
          where: {type: "object", additionalProperties: {type: ["string", "number", "boolean", "null"]}}
        },
        additionalProperties: false
      }),
      argument("options", paginationSchema(), false)
    ],
    result: pageSchema(),
    examples: [[{type: "city", text: "港"}, {limit: 20}]]
  },
  "edit.zones.setContext": {
    arguments: [
      argument("zoneId", {type: "integer", minimum: 0}),
      argument("context", {
        type: "object",
        properties: {
          status: {type: "string", enum: ["active", "planned", "resolved", "incomplete"]},
          participants: arraySchema({
            type: "object",
            required: ["role", "ref"],
            properties: {
              role: {type: "string"},
              ref: {type: "object", required: ["kind", "id"], properties: {kind: {type: "string"}, id: {type: ["integer", "string"]}, nameSnapshot: {type: "string"}}, additionalProperties: false}
            },
            additionalProperties: false
          })
        },
        additionalProperties: false
      })
    ],
    result: objectSchema(["executed", "revision", "result"]),
    examples: [[1, {status: "active", participants: [{role: "invader", ref: {kind: "state", id: 1}}, {role: "defender", ref: {kind: "state", id: 2}}]}]],
    businessCodes: ["ok", "api_error", "invalid_argument", "not_found"]
  },
  "edit.zones.setProperties": {
    arguments: [argument("zoneId", {type: "integer", minimum: 0}), argument("patch", {type: "object", additionalProperties: true})],
    result: objectSchema(["executed", "revision", "result"]),
    examples: [[1, {name: "黑沼", description: "终年积水", coverage: "base", effects: {movementCost: 1.5}}]],
    businessCodes: ["ok", "api_error", "invalid_argument", "not_found"]
  },
  "edit.zones.getEffectsAtCell": {
    arguments: [argument("packCell", {type: "integer", minimum: 0})],
    result: objectSchema(["packCell", "effects", "zones"]),
    examples: [[0]],
    businessCodes: ["ok", "api_error", "invalid_argument"]
  },
  "data.exportHeightmapPNG": {
    arguments: [argument("options", {
      type: "object",
      properties: {
        download: {type: "boolean", default: false},
        pixelScale: {type: "integer", minimum: 1, maximum: 4, default: 1},
        includeDataUrl: {type: "boolean", default: true}
      },
      additionalProperties: false
    }, false)],
    result: objectSchema(["filename", "mimeType", "bytes", "width", "height", "pixelScale", "cellCount", "minHeight", "maxHeight", "encoding"]),
    examples: [[{download: false, pixelScale: 2}]],
    businessCodes: ["ok", "api_error"]
  },
  "planner.listRecipes": {
    arguments: [],
    result: arraySchema(plannerRecipeSummarySchema()),
    examples: [[]],
    businessCodes: ["ok"]
  },
  "planner.getRecipe": {
    arguments: [argument("recipeId", stringSchema("稳定配方 ID，例如 scenario.invasion-and-annexation"))],
    result: plannerRecipeSchema(),
    examples: [["scenario.invasion-and-annexation"]],
    businessCodes: ["ok", "invalid_argument", "recipe-not-found"]
  },
  "regenerationLocks.list": {
    arguments: [argument("options", {type: "object", properties: {kind: {type: "string"}}, additionalProperties: false}, false)],
    result: objectSchema(["version", "count", "entries", "mapRevision"]),
    examples: [[{kind: "river"}]]
  },
  "regenerationLocks.status": {
    arguments: [argument("reference", objectSchema(["kind", "id"]))],
    result: objectSchema(["reference", "locked"]),
    examples: [[{kind: "river", id: 1}]]
  },
  "regenerationLocks.inspect": {
    arguments: [argument("references", arraySchema(objectSchema(["kind", "id"]))), argument("locked", {type: "boolean"})],
    result: objectSchema(["revision", "locked", "references", "changed", "unchanged", "inspectionToken"]),
    examples: [[[{"kind": "river", "id": 1}], true]]
  },
  "regenerationLocks.set": {
    arguments: [
      argument("reference", objectSchema(["kind", "id"])),
      argument("locked", {type: "boolean"}),
      argument("options", {type: "object", properties: {inspectionToken: {type: "string"}, revision: {type: "integer"}}, additionalProperties: false}, false)
    ],
    result: objectSchema(["executed", "changed", "unchanged", "locked", "references", "mapRevisionBefore", "mapRevisionAfter", "history"]),
    examples: [[{kind: "river", id: 1}, true, {}]]
  },
  "regenerationLocks.setMany": {
    arguments: [
      argument("references", arraySchema(objectSchema(["kind", "id"]))),
      argument("locked", {type: "boolean"}),
      argument("options", {type: "object", properties: {inspectionToken: {type: "string"}, revision: {type: "integer"}}, additionalProperties: false}, false)
    ],
    result: objectSchema(["executed", "changed", "unchanged", "locked", "references", "mapRevisionBefore", "mapRevisionAfter", "history"]),
    examples: [[[{"kind": "river", "id": 1}, {"kind": "city", "id": 2}], true, {}]]
  },
  "regenerationLocks.clearKind": {
    arguments: [
      argument("kind", {type: "string"}),
      argument("options", {type: "object", additionalProperties: false}, false)
    ],
    result: objectSchema(["executed", "changed", "kind", "references", "mapRevisionBefore", "mapRevisionAfter", "history"]),
    examples: [["river", {}]]
  },
  "cells.get": {
    arguments: [
      argument("reference", cellRefSchema()),
      argument("options", cellGetOptionsSchema(), false)
    ],
    result: cellSnapshotSchema(),
    examples: [[{space: "grid", id: 0}, {includeNeighbors: true, includeDiagnostics: true}]],
    referenceSpaces: ["gridCell", "packCell"],
    businessCodes: ["ok", "invalid_argument", "not_found"],
    responseMetadata: cellReadonlyMetadataSchema()
  },
  "cells.getAtPoint": {
    arguments: [
      argument("point", pointSchema()),
      argument("options", {
        ...cellGetOptionsSchema(),
        properties: {
          space: {enum: ["grid", "pack"], default: "grid"},
          ...cellGetOptionsSchema().properties
        }
      }, false)
    ],
    result: {
      type: "object",
      required: ["found", "code", "point"],
      properties: {
        found: {type: "boolean"},
        code: {enum: ["cell-found", "cell-not-found", "pack-cell-not-found"]},
        point: objectSchema(["coordinateSpace", "x", "y", "worldX", "worldY"]),
        cell: cellSnapshotSchema()
      }
    },
    examples: [[{coordinateSpace: "world", x: 100, y: 100}, {space: "grid"}]],
    referenceSpaces: ["clientPoint", "worldPoint", "gridCell", "packCell"],
    businessCodes: ["ok", "cell-found", "cell-not-found", "pack-cell-not-found", "invalid_argument", "not_found"],
    responseMetadata: cellReadonlyMetadataSchema()
  },
  "cells.neighbors": {
    arguments: [
      argument("reference", cellRefSchema()),
      argument("options", {
        type: "object",
        properties: {
          depth: {type: "integer", minimum: 1, maximum: 3, default: 1},
          limit: {type: "integer", minimum: 1, maximum: 1000, default: 128}
        },
        additionalProperties: false
      }, false)
    ],
    result: objectSchema(["ref", "requestedDepth", "returned", "truncated", "levels"]),
    examples: [[{space: "grid", id: 0}, {depth: 2, limit: 128}]],
    referenceSpaces: ["gridCell", "packCell"],
    businessCodes: ["ok", "invalid_argument", "not_found"],
    responseMetadata: cellReadonlyMetadataSchema()
  },
  "cells.query": {
    arguments: [argument("query", cellQuerySchema(), false)],
    result: {
      type: "object",
      required: ["items", "count", "total", "limit", "nextCursor"],
      properties: {
        items: arraySchema({type: "object"}),
        count: {type: "integer"},
        total: {type: "integer"},
        limit: {type: "integer"},
        nextCursor: {type: ["string", "null"]}
      }
    },
    examples: [[{
      space: "grid",
      filter: {land: true},
      fields: ["id", "height", "featureId", "stateId"],
      limit: 100
    }]],
    pagination: {supported: true, cursor: "opaque-signed-cellq1", defaultLimit: 100, maxLimit: 1000},
    referenceSpaces: ["gridCell", "packCell"],
    businessCodes: ["ok", "invalid_argument", "cursor-invalid", "cursor-stale"],
    responseMetadata: cellReadonlyMetadataSchema()
  },
  "cells.locate": {
    arguments: [
      argument("reference", cellRefSchema()),
      argument("options", {
        type: "object",
        properties: {
          fit: {type: "boolean", default: true},
          flash: {type: "boolean", default: true},
          openLayer: {type: "boolean", default: false}
        },
        additionalProperties: false
      }, false)
    ],
    result: objectSchema(["found", "code", "ref", "gridRef", "camera", "layerVisible", "highlighted"]),
    examples: [[{space: "grid", id: 0}, {fit: true, flash: true, openLayer: true}]],
    referenceSpaces: ["gridCell", "packCell"],
    businessCodes: ["ok", "cell-located", "cell-not-found", "map-not-ready", "invalid_argument", "not_found"],
    responseMetadata: cellReadonlyMetadataSchema()
  },
  "cells.scan": {
    arguments: [argument("query", cellScanSchema(), false)],
    result: objectSchema(["cancelled", "code", "scanned", "totalCandidates", "totalHits", "counts", "samples", "items", "count", "truncated", "nextCursor", "maxSliceMs"]),
    examples: [[{
      space: "grid",
      checks: ["terrain-consistency", "pack-mapping", "political-owner-range"],
      filter: {viewport: true},
      fields: ["id", "height", "stateId"],
      limit: 200
    }]],
    pagination: {supported: true, cursor: "opaque-signed-cells1", defaultLimit: 200, maxLimit: 1000},
    referenceSpaces: ["gridCell", "packCell"],
    businessCodes: ["ok", "scan-complete", "scan-cancelled", "action-not-inspectable", "invalid_argument", "cursor-invalid", "cursor-stale"],
    responseMetadata: cellReadonlyMetadataSchema()
  },
  "cells.actions": {
    arguments: [],
    result: arraySchema(objectSchema(["actionId", "title", "inputSpace", "inspectTarget", "executeTarget", "semanticLayer", "compoundRulesCovered"])),
    examples: [[]],
    businessCodes: ["ok"],
    responseMetadata: cellReadonlyMetadataSchema()
  },
  "cells.inspectAction": {
    arguments: [
      argument("actionId", stringSchema("registry 中的稳定 actionId")),
      argument("actionInput", {type: "object"}),
      argument("options", {type: "object", additionalProperties: true}, false)
    ],
    result: objectSchema(["allowed", "code", "summary", "details", "action", "normalizedInput", "inspectionToken", "expectedRevision", "inspectorSchemaVersion"]),
    examples: [["states.createAtCell", {cell: {space: "grid", id: 0}}, {}]],
    referenceSpaces: ["gridCell", "packCell", "worldPoint", "path", "range"],
    businessCodes: ["ok", "action-not-inspectable", "invalid-input", "cell-not-found", "point-invalid", "business-rule-rejected"],
    responseMetadata: cellReadonlyMetadataSchema()
  },
  "edit.provinces.inspectCapitalReassessment": {
    arguments: [argument("request", provincialCapitalRequestSchema(), false)],
    result: objectSchema(["allowed", "code", "summary", "fingerprint", "expectedFingerprint", "changes", "unchanged", "protected", "rejected", "history"]),
    examples: [[{provinceIds: [1]}], [{all: true}]],
    referenceSpaces: ["object:province", "object:city"],
    businessCodes: ["ok", "no-op", "protected", "rejected", "province-not-found", "invalid-request", "invalid-province-id"]
  },
  "edit.provinces.reassessCapitals": {
    arguments: [
      argument("request", provincialCapitalRequestSchema(), false),
      argument("options", {
        type: "object",
        required: ["confirm", "expectedFingerprint"],
        properties: {
          confirm: {const: true},
          expectedFingerprint: {type: "string", minLength: 1},
          label: {type: "string"}
        },
        additionalProperties: false
      })
    ],
    result: objectSchema(["executed", "noop", "result", "affected", "history", "preview"]),
    examples: [[{provinceIds: [1]}, {confirm: true, expectedFingerprint: "pcap-v1-00000000"}]],
    referenceSpaces: ["object:province", "object:city"],
    businessCodes: ["ok", "no-op", "confirmation_required", "preview-required", "preview-stale", "protected", "rejected", "province-not-found", "invalid-request", "invalid-province-id"]
  },
  ...createAtCellMethodOverrides(),
  ...existingRuleMethodOverrides(),
  ...remainingRuleMethodOverrides(),
  ...politicalTransferRuleMethodOverrides(),
  ...provinceTopologyRuleMethodOverrides(),
  ...diplomacyRuleMethodOverrides(),
  ...militaryBattleRuleMethodOverrides(),
  ...namebaseRuleMethodOverrides(),
  "oceanCurrents.rename": {
    arguments: [argument("currentId", stringSchema("洋流 ID")), argument("name", stringSchema("新名称"))],
    result: objectSchema(["executed", "id", "name"]),
    examples: [["current-1", "北海暖流"]]
  },
  "oceanCurrents.regenerate": {
    arguments: [argument("options", {type: "object", properties: {seed: {type: ["string", "number"]}}, additionalProperties: false}, false)],
    result: objectSchema(["executed", "currents"]),
    examples: [[{}]]
  },
  "oceanCurrents.inspectWorldRebuild": {
    arguments: [argument("options", {type: "object", properties: {seed: {type: ["string", "number"]}}, additionalProperties: false}, false)],
    result: objectSchema(["valid", "systems"]),
    examples: [[{}]]
  },
  "oceanCurrents.rebuildWorld": {
    arguments: [argument("options", {
      type: "object",
      required: ["confirm"],
      properties: {confirm: {const: true}, seed: {type: ["string", "number"]}},
      additionalProperties: false
    })],
    result: objectSchema(["executed"]),
    examples: [[{confirm: true}]]
  },
  "oceanCurrents.cancelWorldRebuild": {
    arguments: [],
    result: objectSchema(["cancelled"]),
    examples: [[]]
  },
  "edit.height.inspectSeafloorReset": {
    arguments: [argument("options", {type: "object", properties: {seed: {type: ["string", "number"]}}, additionalProperties: false}, false)],
    result: objectSchema(["valid", "inspectionToken", "topologyChecksum", "resultChecksum"]),
    examples: [[{}]]
  },
  "edit.height.applySeafloorReset": {
    arguments: [argument("options", {
      type: "object",
      required: ["inspectionToken", "confirm"],
      properties: {
        inspectionToken: stringSchema("预检令牌"),
        confirm: {const: true},
        seed: {type: ["string", "number"]},
        worldSeed: {type: ["string", "number"]}
      },
      additionalProperties: false
    })],
    result: objectSchema(["executed"]),
    examples: [[{inspectionToken: "<inspect 返回值>", confirm: true}]]
  },
  "edit.height.inspectGlobalTransform": heightOptionsOverride("global", false),
  "edit.height.applyGlobalTransform": heightOptionsOverride("global", true),
  "edit.height.inspectTerrainTemplate": heightOptionsOverride("template", false),
  "edit.height.applyTerrainTemplate": heightOptionsOverride("template", true),
  "edit.height.inspectTerrainProgram": heightProgramOverride(false),
  "edit.height.applyTerrainProgram": heightProgramOverride(true),
  "edit.height.inspectRangeTransform": heightOptionsOverride("range", false),
  "edit.height.applyRangeTransform": heightOptionsOverride("range", true),
  "edit.height.inspectSelectionSmoothing": heightOptionsOverride("selection", false),
  "edit.height.applySelectionSmoothing": heightOptionsOverride("selection", true),
  "edit.labels.setLayout": {
    arguments: [argument("label", labelTargetSchema()), argument("patch", {
      type: "object",
      properties: {
        priority: {type: ["integer", "null"]},
        position: {anyOf: [{type: "null"}, objectSchema(["x", "y"])]}
      },
      additionalProperties: false
    })],
    result: objectSchema(["executed", "layout"]),
    examples: [[{kind: "label", targetKind: "state", targetId: 1}, {priority: 100}]]
  },
  "edit.labels.setPositionLock": {
    arguments: [
      argument("label", labelTargetSchema()),
      argument("locked", {type: "boolean"}),
      argument("options", {type: "object", properties: {position: objectSchema(["x", "y"])}, additionalProperties: false}, false)
    ],
    result: objectSchema(["executed", "locked", "layout"]),
    examples: [[{kind: "label", targetKind: "state", targetId: 1}, true, {position: {x: 10, y: 20}}]]
  },
  "edit.labels.getStyles": {
    arguments: [],
    result: objectSchema(["version", "styles"]),
    examples: [[]]
  },
  "edit.labels.setStyle": {
    arguments: [argument("styleType", stringSchema("标签样式类型")), argument("patch", {type: "object", additionalProperties: {type: ["string", "number", "boolean", "null"]}})],
    result: objectSchema(["executed", "history"]),
    examples: [["state", {fontSize: 24}]]
  },
  "edit.labels.resetStyle": {
    arguments: [argument("styleType", stringSchema("标签样式类型"))],
    result: objectSchema(["executed", "history"]),
    examples: [["state"]]
  },
  "edit.labels.resetStyles": {
    arguments: [],
    result: objectSchema(["executed", "history"]),
    examples: [[]]
  }
});

export function buildApiMethodDescriptionRegistry(methods, methodMetadata, runtimeApi = null) {
  const descriptions = {};
  for (const [namespace, methodNames] of Object.entries(methods || {})) {
    for (const methodName of methodNames) {
      const method = `${namespace}.${methodName}`;
      const metadata = methodMetadata?.[namespace]?.[methodName];
      if (!metadata) throw new Error(`API 描述缺少方法元数据：${method}`);
      const override = METHOD_OVERRIDES[method] || {};
      const argumentsList = override.arguments || inferArguments(method, metadata, runtimeApi);
      descriptions[method] = {
        method,
        schemaVersion: API_METHOD_SCHEMA_VERSION,
        inputSchema: inputSchema(argumentsList),
        resultSchema: responseSchema(override.result || inferResultSchema(method), override.responseMetadata),
        enumValues: cloneJson(override.enumValues || inferEnumValues(method)),
        referenceSpaces: cloneJson(override.referenceSpaces || inferReferenceSpaces(method)),
        businessCodes: cloneJson(override.businessCodes || inferBusinessCodes(metadata)),
        examples: cloneJson((override.examples || [exampleForArguments(argumentsList)]).map(args => ({
          call: method,
          arguments: args
        }))),
        pagination: cloneJson(override.pagination || (/^objects\.(list|query)$/.test(method)
          ? {supported: true, cursor: "opaque-stable-v1", defaultLimit: 50, maxLimit: 200}
          : {supported: false})),
        jsonSerializable: true,
        metadata: cloneJson(metadata)
      };
    }
  }
  return Object.freeze(descriptions);
}

export function describeApiMethod(registry, method) {
  const qualifiedName = String(method || "").trim();
  const description = registry?.[qualifiedName];
  if (!description) {
    const error = new Error(`未知公开 API 方法：${qualifiedName || "(empty)"}`);
    error.code = "not_found";
    throw error;
  }
  return cloneJson(description);
}

export function buildApiDescriptionCoverage(methods, methodMetadata, registry, runtimeApi = null) {
  const declared = Object.entries(methods || {}).flatMap(([namespace, methodNames]) => methodNames.map(method => `${namespace}.${method}`)).sort();
  const described = Object.keys(registry || {}).sort();
  const metadata = Object.entries(methodMetadata || {}).flatMap(([namespace, entries]) => Object.keys(entries || {}).map(method => `${namespace}.${method}`)).sort();
  const missing = declared.filter(method => !described.includes(method));
  const extra = described.filter(method => !declared.includes(method));
  const metadataMissing = declared.filter(method => !metadata.includes(method));
  const invalid = declared.filter(method => !validDescription(registry?.[method]));
  const signatureMismatch = declared.filter(method => {
    const callable = resolveRuntimeMethod(runtimeApi, method);
    const signature = callable ? parseFunctionParameters(callable) : null;
    if (!signature) return false;
    const describedNames = registry?.[method]?.inputSchema?.prefixItems?.map(item => item.title) || [];
    return signature.map(item => item.name).join("\n") !== describedNames.join("\n");
  });
  return {
    complete: !missing.length && !extra.length && !metadataMissing.length && !invalid.length && !signatureMismatch.length,
    declared: declared.length,
    described: described.length,
    metadata: metadata.length,
    missing,
    extra,
    metadataMissing,
    invalid,
    signatureMismatch
  };
}

function inferArguments(method, metadata, runtimeApi) {
  const callable = resolveRuntimeMethod(runtimeApi, method);
  const signature = callable ? parseFunctionParameters(callable) : null;
  if (signature) return signature.map(item => ({
    ...argument(item.name, parameterSchema(method, item.name, item.defaultValue, metadata)),
    required: item.defaultValue === null && !item.rest
  }));
  if (/^info\.(version|capabilities|mapSummary|runtimeStats)$/.test(method)) return [];
  if (/^(objects\.types|history\.(undo|redo)|selection\.(get|clear|clearHighlights)|layers\.(get|listThemes|fitView))$/.test(method)) return [];
  return [argument("options", metadata.requiresConfirm ? confirmOptionsSchema() : optionalOptionsSchema(), false)];
}

function resolveRuntimeMethod(api, method) {
  const [namespace, ...parts] = String(method).split(".");
  let value = api?.[namespace];
  for (const part of parts) value = value?.[part];
  return typeof value === "function" ? value : null;
}

function parseFunctionParameters(callable) {
  const source = Function.prototype.toString.call(callable).trim();
  const arrow = source.indexOf("=>");
  if (arrow < 0) return null;
  let parameterSource = source.slice(0, arrow).trim();
  if (parameterSource.startsWith("async ")) parameterSource = parameterSource.slice(6).trim();
  if (parameterSource.startsWith("(") && parameterSource.endsWith(")")) parameterSource = parameterSource.slice(1, -1);
  if (!parameterSource) return [];
  return splitTopLevel(parameterSource).map(raw => {
    const [nameSource, defaultValue] = splitDefault(raw);
    const rest = nameSource.trim().startsWith("...");
    const name = nameSource.trim().replace(/^\.\.\./, "");
    return /^[A-Za-z_$][\w$]*$/.test(name) ? {name, defaultValue, rest} : null;
  }).filter(Boolean);
}

function splitTopLevel(value) {
  const result = [];
  let start = 0;
  let depth = 0;
  let quote = "";
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if (quote) {
      if (character === quote && value[index - 1] !== "\\") quote = "";
      continue;
    }
    if (character === "'" || character === '"' || character === "`") {
      quote = character;
      continue;
    }
    if ("([{".includes(character)) depth++;
    else if (")]}".includes(character)) depth--;
    else if (character === "," && depth === 0) {
      result.push(value.slice(start, index).trim());
      start = index + 1;
    }
  }
  result.push(value.slice(start).trim());
  return result.filter(Boolean);
}

function splitDefault(value) {
  let depth = 0;
  for (let index = 0; index < value.length; index++) {
    const character = value[index];
    if ("([{".includes(character)) depth++;
    else if (")]}".includes(character)) depth--;
    else if (character === "=" && depth === 0) return [value.slice(0, index), value.slice(index + 1).trim()];
  }
  return [value, null];
}

function parameterSchema(method, name, defaultValue, metadata) {
  if (name === "options" || /(?:Options|options)$/.test(name)) {
    return metadata.requiresConfirm ? confirmOptionsSchema() : optionalOptionsSchema();
  }
  if (/^(changes|ids|noteIds|stateIds|riverIds|gridCellIds|packCellIds|targets|measurements|objects|points)$/.test(name)) {
    return arraySchema(parameterItemSchema(name));
  }
  if (/^(reference|object|target|source|destination|query|patch|preferences|payload|document|event|ratios|program|body)$/.test(name)) {
    return {type: ["object", "string"], description: `${method} 的 ${name} 参数`};
  }
  if (/^(visible|enabled|closed|locked)$/.test(name)) return {type: "boolean"};
  if (/(Id|Cell|cell|index|limit|scale|population|widthFactor|kmPerCm|percent|direction|clientX|clientY|value)$/.test(name)) {
    return {type: "number"};
  }
  if (/^(kind|name|text|mode|layer|unit|themeId|styleType|color|status|relation|scope|section|goodId|marketId|noteId|measurementId|cityId|provinceId|stateId|cultureId|religionId|routeId|riverId|lakeId|labelId|markerId|baseId|governmentKey)$/.test(name)) {
    return {type: "string"};
  }
  if (defaultValue === "{}") return optionalOptionsSchema();
  if (defaultValue === "[]") return arraySchema({type: ["object", "string", "number", "boolean", "null"]});
  return {type: ["string", "number", "boolean", "object", "array", "null"], description: `${method} 的 ${name} 参数`};
}

function parameterItemSchema(name) {
  if (name === "changes") return objectSchema(["gridCell", "after"]);
  if (name === "points") return objectSchema(["x", "y"]);
  if (/Ids$|Cells$/.test(name)) return {type: ["integer", "string"]};
  return {type: ["object", "string", "number"]};
}

function inferResultSchema(method) {
  if (/(\.list|\.types)$/.test(method) && !/^objects\./.test(method)) return arraySchema({});
  return {type: ["object", "array", "string", "number", "boolean", "null"]};
}

function inferEnumValues(method) {
  if (method === "layers.setViewMode") return {mode: ["height", "temperature", "precipitation", "biomes", "culture", "religion", "diplomacy", "government", "states", "provinces", "regions", "population"]};
  if (method === "selection.startEditing" || method === "selection.toggleEditing") return {editing: [true, false]};
  return {};
}

function inferReferenceSpaces(method) {
  const spaces = [];
  for (const [pattern, values] of REFERENCE_RULES) {
    if (pattern.test(method)) spaces.push(...values);
  }
  return [...new Set(spaces)];
}

function inferBusinessCodes(metadata) {
  return ["ok", ...ERROR_CODES, ...(metadata.requiresConfirm ? ["confirmation_required"] : [])].filter((code, index, values) => values.indexOf(code) === index);
}

function heightOptionsOverride(kind, apply) {
  const common = {
    scope: {enum: ["all", "land", "water"]},
    allowedCells: {type: "array", items: {type: "integer"}},
    includeChanges: {type: "boolean"},
    changeOffset: {type: "integer", minimum: 0},
    changeLimit: {type: "integer", minimum: 1, maximum: 200}
  };
  const properties = kind === "global"
    ? {...common, action: {enum: ["smooth", "disrupt"]}, seed: {type: "integer"}}
    : kind === "template"
      ? {
          ...common,
          templateId: {type: "string"},
          intensity: {type: "number"},
          targetHeight: {type: "number"},
          terraceStep: {type: "number"},
          amplitude: {type: "number"},
          seed: {type: "integer"}
        }
      : kind === "range"
        ? {
            ...common,
            lower: {type: "number"},
            upper: {type: "number"},
            operator: {enum: ["add", "subtract", "multiply", "divide", "exponent"]},
            operand: {type: "number"}
          }
        : {
            cellIds: {type: "array", items: {type: "integer"}},
            smoothness: {type: "number", minimum: 0, maximum: 1},
            includeChanges: {type: "boolean"},
            changeOffset: {type: "integer", minimum: 0},
            changeLimit: {type: "integer", minimum: 1, maximum: 200}
          };
  if (apply) properties.inspectionToken = stringSchema("预检令牌");
  return {
    arguments: [argument("options", {
      type: "object",
      ...(apply ? {required: ["inspectionToken"]} : {}),
      properties,
      additionalProperties: false
    }, false)],
    result: objectSchema(apply ? ["executed"] : ["valid", "inspectionToken", "changeSample"]),
    examples: [[apply ? {inspectionToken: "<inspect 返回值>"} : {}]]
  };
}

function heightProgramOverride(apply) {
  return {
    arguments: [
      argument("program", objectSchema(["id", "name", "steps"])),
      argument("options", heightOptionsOverride("global", apply).arguments[0].schema, false)
    ],
    result: objectSchema(apply ? ["executed"] : ["valid", "inspectionToken", "changeSample"]),
    examples: [[{id: "ai-rugged", name: "山地", steps: [{operation: "rugged"}]}, apply ? {inspectionToken: "<inspect 返回值>"} : {}]]
  };
}

function exampleForArguments(argumentsList) {
  return argumentsList.map(item => exampleForSchema(item.schema));
}

function exampleForSchema(schema) {
  if (schema?.const !== undefined) return schema.const;
  if (schema?.type === "string" || schema?.type?.includes?.("string")) return "";
  if (schema?.type === "number" || schema?.type === "integer") return 0;
  if (schema?.type === "boolean") return false;
  if (schema?.type === "array") return [];
  return {};
}

function validDescription(description) {
  return Boolean(
    description
    && description.inputSchema
    && description.resultSchema
    && Array.isArray(description.businessCodes)
    && description.businessCodes.length
    && Array.isArray(description.examples)
    && Array.isArray(description.referenceSpaces)
    && description.pagination
    && description.metadata?.capabilityGroup
    && typeof description.metadata.requiresConfirm === "boolean"
    && description.schemaVersion === API_METHOD_SCHEMA_VERSION
    && description.inputSchema.prefixItems?.every(item => item.title && item.title !== "input" && (item.type || item.anyOf || item.oneOf || item.const))
  );
}

function argument(name, schema, required = true) {
  return {name, schema, required};
}

function inputSchema(argumentsList) {
  return {
    type: "array",
    prefixItems: argumentsList.map(item => ({title: item.name, "x-required": item.required !== false, ...item.schema})),
    minItems: argumentsList.filter(item => item.required !== false).length,
    maxItems: argumentsList.length
  };
}

function responseSchema(dataSchema, metadataSchema = null) {
  const metadata = metadataSchema
    ? {
        ...metadataSchema,
        required: [...new Set([...(metadataSchema.required || []), "at"])],
        properties: {
          ...(metadataSchema.properties || {}),
          at: {type: "string", format: "date-time"}
        }
      }
    : {type: "object", properties: {at: {type: "string", format: "date-time"}}};
  return {
    type: "object",
    required: ["ok", "metadata"],
    properties: {
      ok: {type: "boolean"},
      data: dataSchema,
      error: {
        type: "object",
        properties: {code: {type: "string"}, name: {type: "string"}, message: {type: "string"}}
      },
      metadata
    }
  };
}

function objectSchema(required = []) {
  return {type: "object", required, additionalProperties: true};
}

function plannerRecipeSummarySchema() {
  return {
    type: "object",
    required: ["schemaVersion", "recipeId", "title", "domain", "intent", "stepIds", "stepCount", "historyPolicy"],
    properties: {
      schemaVersion: {type: "string"},
      recipeId: {type: "string"},
      title: {type: "string"},
      domain: {type: "string"},
      intent: {type: "string"},
      stepIds: arraySchema({type: "string"}),
      stepCount: {type: "integer", minimum: 1},
      historyPolicy: {type: "string"}
    },
    additionalProperties: false
  };
}

function plannerRecipeSchema() {
  return {
    type: "object",
    required: [
      "schemaVersion",
      "recipeId",
      "title",
      "domain",
      "intent",
      "preconditions",
      "successCriteria",
      "historyPolicy",
      "compatibilityPolicy",
      "failurePolicy",
      "steps"
    ],
    properties: {
      schemaVersion: {type: "string"},
      recipeId: {type: "string"},
      title: {type: "string"},
      domain: {type: "string"},
      intent: {type: "string"},
      preconditions: arraySchema({type: "string"}),
      successCriteria: arraySchema({type: "string"}),
      historyPolicy: {type: "string"},
      compatibilityPolicy: {type: "string"},
      failurePolicy: {type: "object", additionalProperties: {type: "string"}},
      steps: arraySchema(plannerRecipeStepSchema())
    },
    additionalProperties: false
  };
}

function plannerRecipeStepSchema() {
  return {
    type: "object",
    required: [
      "stepId",
      "kind",
      "actionId",
      "spatialActionId",
      "facts",
      "inspection",
      "executeMethods",
      "inputTemplate",
      "preconditions",
      "authorization",
      "successCriteria",
      "failurePolicy",
      "compensation",
      "revisionCheckpoints"
    ],
    properties: {
      stepId: {type: "string"},
      kind: {enum: ["rule", "service", "fact"]},
      actionId: {type: ["string", "null"]},
      spatialActionId: {type: ["string", "null"]},
      facts: arraySchema({type: "string"}),
      inspection: {
        type: "object",
        required: ["methods", "policy"],
        properties: {
          methods: arraySchema({type: "string"}),
          policy: {type: "string"}
        },
        additionalProperties: false
      },
      executeMethods: arraySchema({type: "string"}),
      inputTemplate: {type: "object", additionalProperties: true},
      preconditions: arraySchema({type: "string"}),
      authorization: {type: "object", required: ["mode", "policy"], additionalProperties: true},
      successCriteria: arraySchema({type: "string"}),
      failurePolicy: {type: "object", required: ["rejected", "stale", "partial"], additionalProperties: true},
      compensation: {type: "object", required: ["mode", "method", "guard"], additionalProperties: true},
      revisionCheckpoints: arraySchema({type: "string"})
    },
    additionalProperties: false
  };
}

function cellRefSchema() {
  return {
    type: "object",
    required: ["space", "id"],
    properties: {
      space: {enum: ["grid", "pack"]},
      id: {type: "integer", minimum: 0}
    },
    additionalProperties: false
  };
}

function pointSchema() {
  return {
    type: "object",
    required: ["coordinateSpace", "x", "y"],
    properties: {
      coordinateSpace: {enum: ["client", "world"]},
      x: {type: "number"},
      y: {type: "number"}
    },
    additionalProperties: false
  };
}

function cellGetOptionsSchema() {
  return {
    type: "object",
    properties: {
      includeGeometry: {type: "boolean", default: false},
      includeNeighbors: {type: "boolean", default: true},
      includeDiagnostics: {type: "boolean", default: false}
    },
    additionalProperties: false
  };
}

function cellSnapshotSchema() {
  const required = ["ref", "center", "geometry", "terrain", "mapping", "ownership", "climate", "occupants", "neighbors", "diagnostics"];
  return {
    type: "object",
    required,
    properties: {
      ref: cellRefSchema(),
      center: objectSchema(["x", "y"]),
      geometry: objectSchema(["vertexCount", "vertices"]),
      terrain: objectSchema(["height", "heightLand", "featureId", "featureType", "featureLand", "consistency"]),
      mapping: {type: "object"},
      ownership: objectSchema(["stateId", "provinceId", "cultureId", "religionId"]),
      climate: objectSchema(["biomeId", "temperature", "precipitation"]),
      occupants: objectSchema(["burgIds", "cityIds", "capitalStateIds"]),
      neighbors: {type: ["array", "null"]},
      diagnostics: arraySchema(objectSchema(["code", "message"]))
    }
  };
}

function cellReadonlyMetadataSchema() {
  return {
    type: "object",
    required: ["action", "readonly", "mapIdentity", "mapRevision"],
    properties: {
      action: {type: "string"},
      readonly: {const: true},
      mapIdentity: {type: ["string", "null"]},
      mapRevision: {type: "integer", minimum: 0}
    }
  };
}

function cellQuerySchema() {
  return {
    type: "object",
    properties: {
      space: {enum: ["grid", "pack"], default: "grid"},
      filter: {
        type: "object",
        properties: {
          land: {type: "boolean"},
          stateId: {type: "integer", minimum: 0},
          provinceId: {type: "integer", minimum: 0},
          cultureId: {type: "integer", minimum: 0},
          religionId: {type: "integer", minimum: 0},
          featureId: {type: "integer", minimum: 0},
          biomeId: {type: "integer", minimum: 0},
          consistency: {
            anyOf: [
              {type: "string"},
              {type: "array", minItems: 1, uniqueItems: true, items: {type: "string"}}
            ]
          }
        },
        additionalProperties: false
      },
      fields: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: {
          enum: [
            "id", "space", "x", "y", "height", "land", "featureId", "featureType", "featureLand",
            "stateId", "provinceId", "cultureId", "religionId", "biomeId", "temperature", "precipitation",
            "population", "burgId", "gridCellId", "packCellId", "consistency"
          ]
        }
      },
      limit: {type: "integer", minimum: 1, maximum: 1000, default: 100},
      cursor: {type: ["string", "null"]}
    },
    additionalProperties: false
  };
}

function cellScanSchema() {
  return {
    type: "object",
    properties: {
      space: {enum: ["grid", "pack"], default: "grid"},
      checks: {
        type: "array",
        minItems: 1,
        uniqueItems: true,
        items: {enum: ["terrain-consistency", "pack-mapping", "political-owner-range"]}
      },
      filter: {
        type: "object",
        properties: {
          viewport: {type: "boolean", default: false},
          bbox: {
            type: "object",
            required: ["minX", "minY", "maxX", "maxY"],
            properties: {
              minX: {type: "number"},
              minY: {type: "number"},
              maxX: {type: "number"},
              maxY: {type: "number"}
            },
            additionalProperties: false
          }
        },
        additionalProperties: false
      },
      fields: cellQuerySchema().properties.fields,
      limit: {type: "integer", minimum: 1, maximum: 1000, default: 200},
      cursor: {type: ["string", "null"]}
    },
    additionalProperties: false
  };
}

function createAtCellMethodOverrides() {
  const entries = {};
  const codesByDomain = {
    states: ["ok", "grid-cell-invalid", "grid-cell-water", "pack-cell-missing", "capital-province-protected"],
    provinces: ["ok", "grid-cell-invalid", "grid-cell-water", "pack-cell-missing", "state-missing"],
    cities: ["ok", "grid-cell-invalid", "grid-cell-water", "pack-cell-missing", "burg-cell-occupied"]
  };
  for (const domain of ["states", "provinces", "cities"]) {
    const inspectionMethod = `edit.${domain}.inspectCreateAtCell`;
    const createMethod = `edit.${domain}.createAtCell`;
    entries[inspectionMethod] = {
      arguments: [argument("request", cellCreateInspectionInputSchema())],
      result: objectSchema(["allowed", "code", "summary", "reasons", "details", "cell", "predicted", "warnings", "inspectionToken", "expectedRevision", "inspectorSchemaVersion"]),
      examples: [[{cell: {space: "grid", id: 0}}]],
      referenceSpaces: ["gridCell"],
      businessCodes: [...codesByDomain[domain], "cell-space-not-supported", "invalid_argument"]
    };
    entries[createMethod] = {
      arguments: [argument("request", cellCreateExecutionInputSchema())],
      result: objectSchema(["executed", "noop", "code", "inspection", "created", "affected", "history", "rollback", "mapRevisionBefore", "mapRevisionAfter"]),
      examples: [[{
        cell: {space: "grid", id: 0},
        inspectionToken: "opaque",
        expectedRevision: {mapIdentity: "opaque", mapRevision: 0}
      }]],
      referenceSpaces: ["gridCell"],
      businessCodes: ["ok", "created", ...codesByDomain[domain], "inspection-required", "inspection-stale", "inspection-token-invalid", "inspection-token-mismatch", "create-failed"]
    };
  }
  return entries;
}

function existingRuleMethodOverrides() {
  const entries = {};
  const tokenCodes = [
    "inspection-required",
    "inspection-stale",
    "inspection-token-invalid",
    "inspection-action-mismatch",
    "inspection-input-mismatch",
    "inspection-schema-mismatch"
  ];
  const deleteCodes = ["delete-invalid-id", "delete-duplicate-id", "delete-protected-neutral", "delete-not-found", "delete-not-allowed"];
  const deleteDomains = [
    ["states", "stateId", "国家 ID", true],
    ["provinces", "provinceId", "省份 ID", true],
    ["cities", "cityId", "城市 ID", true],
    ["routes", "routeId", "路线 ID", false],
    ["rivers", "riverId", "河流 ID", true],
    ["lakes", "lakeId", "湖泊 ID", true]
  ];
  for (const [domain, idName, description, confirm] of deleteDomains) {
    entries[`edit.${domain}.inspectDelete`] = ruleInspectorOverride(
      [argument(idName, {type: "integer", minimum: 0, description})],
      deleteCodes,
      [[1]]
    );
    entries[`edit.${domain}.delete`] = ruleExecutorOverride(
      [
        argument(idName, {type: "integer", minimum: 0, description}),
        argument("options", ruleExecutionOptionsSchema({confirm}), false)
      ],
      [...deleteCodes, ...tokenCodes, ...(confirm ? ["confirmation_required"] : [])],
      [[1, confirm ? {confirm: true} : {}]]
    );
  }

  const changesArgument = argument("changes", arraySchema({
    type: "object",
    required: ["gridCell", "after"],
    properties: {
      gridCell: {type: "integer", minimum: 0},
      after: {type: "number", minimum: 0, maximum: 100}
    },
    additionalProperties: true
  }));
  const heightCodes = ["height-changes-empty", "height-cell-invalid", "height-value-invalid", "height-cell-duplicate", "height-no-change"];
  entries["edit.height.inspectChanges"] = ruleInspectorOverride(
    [changesArgument],
    heightCodes,
    [[[{"gridCell": 0, "after": 30}]]]
  );
  entries["edit.height.applyChanges"] = ruleExecutorOverride(
    [changesArgument, argument("options", ruleExecutionOptionsSchema(), false)],
    [...heightCodes, ...tokenCodes],
    [[[{"gridCell": 0, "after": 30}], {}]]
  );

  const biomeOptions = ruleExecutionOptionsSchema({
    properties: {scope: {enum: ["land", "water"]}}
  });
  const biomeCodes = [
    "invalid-biome", "invalid-scope", "target-scope-mismatch", "empty-cells", "region-size",
    "invalid-cell", "land-water-mismatch", "missing-pack-cells"
  ];
  entries["edit.biomes.inspectAssignment"] = ruleInspectorOverride(
    [
      argument("biomeId", {type: "integer", minimum: 0}),
      argument("gridCellIds", arraySchema({type: "integer", minimum: 0})),
      argument("options", biomeOptions, false)
    ],
    biomeCodes,
    [[1, [0], {scope: "land"}]]
  );
  entries["edit.biomes.assignCells"] = ruleExecutorOverride(
    [
      argument("biomeId", {type: "integer", minimum: 0}),
      argument("gridCellIds", arraySchema({type: "integer", minimum: 0})),
      argument("options", biomeOptions, false)
    ],
    [...biomeCodes, ...tokenCodes],
    [[1, [0], {scope: "land"}]]
  );

  const riverOptions = ruleExecutionOptionsSchema({
    properties: {sourcePackCell: {type: "integer", minimum: 0}, label: {type: "string"}}
  });
  const riverCodes = ["invalid-source", "source-water", "source-occupied", "downhill-blocked", "path-too-short", "path-limit"];
  entries["edit.rivers.inspectCreate"] = ruleInspectorOverride(
    [argument("options", riverOptions, false)],
    riverCodes,
    [[{sourcePackCell: 0}]]
  );
  entries["edit.rivers.create"] = ruleExecutorOverride(
    [argument("options", riverOptions, false)],
    [...riverCodes, ...tokenCodes],
    [[{sourcePackCell: 0}]]
  );

  const lakeOptions = ruleExecutionOptionsSchema({
    properties: {
      packCell: {type: "integer", minimum: 0},
      radius: {type: "integer", minimum: 0, maximum: 4},
      waterHeight: {type: "number", minimum: 0, maximum: 19},
      label: {type: "string"}
    }
  });
  const lakeCodes = [
    "invalid-cell", "center-water", "region-size", "region-water", "border-region", "open-basin",
    "pack-region-water", "occupied-burg", "occupied-river", "occupied-route", "occupied-marker", "invalid-shoreline"
  ];
  entries["edit.lakes.inspectCreate"] = ruleInspectorOverride(
    [argument("options", lakeOptions, false)],
    lakeCodes,
    [[{packCell: 0, radius: 0, waterHeight: 19}]]
  );
  entries["edit.lakes.create"] = ruleExecutorOverride(
    [argument("options", lakeOptions, false)],
    [...lakeCodes, ...tokenCodes],
    [[{packCell: 0, radius: 0, waterHeight: 19}]]
  );

  const zoneOptions = ruleExecutionOptionsSchema({
    properties: {
      id: {type: "integer", minimum: 0},
      type: {type: "string"},
      name: {type: "string"},
      centerPackCell: {type: "integer", minimum: 0},
      radius: {type: "integer", minimum: 0},
      packCells: arraySchema({type: "integer", minimum: 0}),
      pattern: {type: "string"},
      color: {type: "string"},
      hexColor: {type: "string"}
    }
  });
  const zoneCreateCodes = ["missing-map", "invalid-id", "duplicate-id", "empty-cells", "duplicate-cell", "too-many-cells", "invalid-cell", "disconnected-cells", "occupied-cell"];
  entries["edit.zones.inspectCreate"] = ruleInspectorOverride(
    [argument("options", zoneOptions, false)],
    zoneCreateCodes,
    [[{packCells: [0]}]]
  );
  entries["edit.zones.create"] = ruleExecutorOverride(
    [argument("options", zoneOptions, false)],
    [...zoneCreateCodes, ...tokenCodes],
    [[{packCells: [0]}]]
  );
  entries["edit.zones.inspectDelete"] = ruleInspectorOverride(
    [argument("zoneId", {type: "integer", minimum: 0})],
    deleteCodes,
    [[1]]
  );
  entries["edit.zones.delete"] = ruleExecutorOverride(
    [
      argument("zoneId", {type: "integer", minimum: 0}),
      argument("options", ruleExecutionOptionsSchema(), false)
    ],
    [...deleteCodes, ...tokenCodes],
    [[1, {}]]
  );
  return entries;
}

function remainingRuleMethodOverrides() {
  const entries = {};
  const object = {type: "object", additionalProperties: true};
  const tokenCodes = [
    "inspection-required", "inspection-stale", "inspection-token-invalid",
    "inspection-action-mismatch", "inspection-input-mismatch", "inspection-schema-mismatch"
  ];
  const executionOptions = ruleExecutionOptionsSchema();
  const lifecycleCodes = [
    "culture-store-missing", "religion-store-missing", "invalid-culture", "invalid-religion",
    "culture-not-found", "religion-not-found",
    "invalid-operation", "empty-assignment", "invalid-assignment", "invalid-grid-cell", "water-grid-cell",
    "assignment-unchanged", "expansion-invalid", "expansion-unchanged", "invalid-parent",
    "parent-unchanged", "parent-cycle-or-missing", "delete-not-found",
    "invalid-mode", "missing-object", "invalid-center", "invalid-type", "invalid-expansion", "invalid-expansionism",
    "center-out-of-range", "center-water", "center-not-owned", "center-collision",
    "regeneration_locked_noop"
  ];
  const capitalCodes = [
    "invalid-state", "invalid-city", "state-not-found", "city-not-found", "city-state-mismatch",
    "burg-not-found", "capital-unchanged"
  ];
  const ownerCodes = [
    "invalid-city", "city-not-found", "city-cell-missing", "capital-owner-conflict",
    "provincial-owner-conflict", "owner-unchanged"
  ];
  const diplomacyCodes = [
    "invalid-state-pair", "same-state", "subject-not-found", "object-not-found",
    "invalid-relation", "relation-unchanged"
  ];
  const ratioCodes = ["invalid-state", "state-not-found", "invalid-ratios", "empty-ratios", "zero-ratios", "ratios-unchanged"];
  const moveCodes = ["regiment-not-found", "destination-not-found", "foreign-territory", "terrain-mismatch", "station-unchanged"];
  const baseCodes = ["regiment-not-found", "station-coordinates-missing", "base-unchanged"];
  const statusCodes = ["invalid-status", "invalid-target", "empty-targets", "regiment-not-found", "status-unchanged"];
  const collectionCodes = [
    "invalid-collection-kind", "notes-not-importable", "import-unchanged", "invalid-measurements",
    "empty-measurements", "invalid-namebase-document", "empty-namebases", "invalid-military-events",
    "empty-military-events"
  ];

  entries["edit.states.inspectCapitalChange"] = ruleInspectorOverride([
    argument("stateId", {type: "integer", minimum: 1}),
    argument("cityId", {type: "integer", minimum: 1})
  ], capitalCodes, [[1, 1]]);
  entries["edit.states.setCapital"] = ruleExecutorOverride([
    argument("stateId", {type: "integer", minimum: 1}),
    argument("cityId", {type: "integer", minimum: 1}),
    argument("options", executionOptions, false)
  ], [...capitalCodes, ...tokenCodes], [[1, 1, {}]]);

  entries["edit.cities.inspectOwnerSync"] = ruleInspectorOverride([
    argument("cityId", {type: "integer", minimum: 0})
  ], ownerCodes, [[1]]);
  entries["edit.cities.syncOwner"] = ruleExecutorOverride([
    argument("cityId", {type: "integer", minimum: 0}),
    argument("options", executionOptions, false)
  ], [...ownerCodes, ...tokenCodes, "confirmation_required"], [[1, {}]]);

  entries["edit.cultures.inspectLifecycle"] = ruleInspectorOverride([
    argument("operation", {type: "string", enum: ["create", "assign", "expand", "reparent", "delete"]}),
    argument("request", object, false)
  ], lifecycleCodes, [["assign", {id: 1, gridCellIds: [0]}]]);
  entries["edit.religions.inspectLifecycle"] = ruleInspectorOverride([
    argument("operation", {type: "string", enum: ["create", "assign", "expand", "reparent", "delete"]}),
    argument("request", object, false)
  ], lifecycleCodes, [["assign", {id: 1, gridCellIds: [0]}]]);
  for (const kind of ["cultures", "religions"]) {
    for (const method of ["add", "assignCells", "applyExpansion", "delete", "setParent"]) {
      const qualified = `edit.${kind}.${method}`;
      const argumentsList = method === "add"
        ? [argument("options", executionOptions, false)]
        : method === "assignCells"
          ? [argument(`${kind.slice(0, -1)}Id`, {type: "integer", minimum: 1}), argument("gridCellIds", arraySchema({type: "integer", minimum: 0})), argument("options", executionOptions, false)]
          : method === "applyExpansion"
            ? [argument(`${kind.slice(0, -1)}Id`, {type: "integer", minimum: 1}), argument("options", executionOptions, false)]
            : method === "delete"
              ? [argument(`${kind.slice(0, -1)}Id`, {type: "integer", minimum: 1}), argument("options", executionOptions, false)]
              : [argument(`${kind.slice(0, -1)}Id`, {type: "integer", minimum: 1}), argument("parentId", {type: "integer", minimum: 0}), argument("options", executionOptions, false)];
      entries[qualified] = ruleExecutorOverride(argumentsList, [...lifecycleCodes, ...tokenCodes, "confirmation_required"], [[]]);
    }
  }

  entries["edit.diplomacy.inspectRelation"] = ruleInspectorOverride([
    argument("subjectId", {type: "integer", minimum: 1}),
    argument("objectId", {type: "integer", minimum: 1}),
    argument("relation", {type: "string"}),
    argument("options", object, false)
  ], diplomacyCodes, [[1, 2, "Friendly", {}]]);
  entries["edit.diplomacy.setRelation"] = ruleExecutorOverride([
    argument("subjectId", {type: "integer", minimum: 1}),
    argument("objectId", {type: "integer", minimum: 1}),
    argument("relation", {type: "string"}),
    argument("options", ruleExecutionOptionsSchema({properties: {reason: {type: "string"}}}), false)
  ], [...diplomacyCodes, ...tokenCodes, "confirmation_required"], [[1, 2, "Friendly", {}]]);

  entries["edit.military.inspectRatios"] = ruleInspectorOverride([
    argument("stateId", {type: "integer", minimum: 1}),
    argument("ratios", object)
  ], ratioCodes, [[1, {infantry: 0.5, archers: 0.5}]]);
  entries["edit.military.setRatios"] = ruleExecutorOverride([
    argument("stateId", {type: "integer", minimum: 1}),
    argument("ratios", object),
    argument("options", executionOptions, false)
  ], [...ratioCodes, ...tokenCodes, "confirmation_required"], [[1, {infantry: 0.5, archers: 0.5}, {}]]);
  entries["edit.military.inspectMoveStation"] = ruleInspectorOverride([
    argument("target", object),
    argument("destination", object)
  ], moveCodes, [[{stateId: 1, regimentId: 0}, {packCell: 0}]]);
  entries["edit.military.moveStation"] = ruleExecutorOverride([
    argument("target", object),
    argument("destination", object),
    argument("options", executionOptions, false)
  ], [...moveCodes, ...tokenCodes], [[{stateId: 1, regimentId: 0}, {packCell: 0}, {}]]);
  entries["edit.military.inspectBase"] = ruleInspectorOverride([
    argument("target", object)
  ], baseCodes, [[{stateId: 1, regimentId: 0}]]);
  entries["edit.military.setBase"] = ruleExecutorOverride([
    argument("target", object),
    argument("options", executionOptions, false)
  ], [...baseCodes, ...tokenCodes], [[{stateId: 1, regimentId: 0}, {}]]);
  entries["edit.military.inspectStatus"] = ruleInspectorOverride([
    argument("targets", {anyOf: [object, arraySchema(object)]}),
    argument("status", {type: "string"})
  ], statusCodes, [[[{stateId: 1, regimentId: 0}], "resting"]]);
  for (const method of ["setStatus", "setStatusBatch"]) {
    entries[`edit.military.${method}`] = ruleExecutorOverride([
      argument(method === "setStatus" ? "target" : "targets", method === "setStatus" ? object : arraySchema(object)),
      argument("status", {type: "string"}),
      argument("options", executionOptions, false)
    ], [...statusCodes, ...tokenCodes], [[]]);
  }

  entries["data.inspectCollectionImport"] = ruleInspectorOverride([
    argument("kind", {type: "string", enum: ["notes", "measurements", "namebases", "military-events"]}),
    argument("document", {type: ["object", "array", "string"]}),
    argument("options", object, false)
  ], collectionCodes, [["measurements", [], {}]]);
  for (const [method, kind] of [
    ["edit.notes.import", "notes"],
    ["edit.measurements.import", "measurements"],
    ["namebases.import", "namebases"],
    ["edit.military.importBattleEvents", "military-events"]
  ]) {
    entries[method] = ruleExecutorOverride([
      argument(method === "edit.measurements.import" ? "measurements" : "document", {type: ["object", "array", "string"]}),
      argument("options", executionOptions, false)
    ], [...collectionCodes, ...tokenCodes, "confirmation_required"], [[kind === "measurements" ? [] : {}, {}]]);
  }
  return entries;
}

function politicalTransferRuleMethodOverrides() {
  const tokenCodes = [
    "inspection-required", "inspection-stale", "inspection-token-invalid",
    "inspection-action-mismatch", "inspection-input-mismatch", "inspection-schema-mismatch"
  ];
  const territoryCodes = [
    "invalid-transfer-mode", "source-state-not-found", "target-state-not-found", "same-state",
    "territory-empty", "grid-cell-invalid", "grid-cell-water", "cell-owner-mismatch",
    "target-not-adjacent", "war-required", "invalid-province-mode", "province-not-found",
    "province-state-mismatch", "province-anchor-invalid", "province-id-overflow",
    "source-capital-candidate-missing", "source-province-repair-failed",
    "military-relocation-unresolved"
  ];
  const ensureCodes = [
    "state-not-found", "assignment-empty", "grid-cell-invalid", "grid-cell-water",
    "cell-state-mismatch", "invalid-province-mode", "province-not-found",
    "province-state-mismatch", "province-anchor-invalid", "province-id-overflow",
    "province-assignment-unchanged"
  ];
  const transferCodes = [
    "province-not-found", "source-state-not-found", "target-state-not-found", "same-state",
    "province-territory-empty", "province-owner-mismatch", "target-not-adjacent",
    "source-capital-candidate-missing", "military-relocation-unresolved"
  ];
  const gridCellIds = {
    type: "array",
    minItems: 1,
    uniqueItems: true,
    items: {type: "integer", minimum: 0}
  };
  const provinceStrategy = {
    type: "object",
    required: ["mode"],
    properties: {
      mode: {type: "string", enum: ["auto", "existing", "ensure"]},
      provinceId: {type: "integer", minimum: 1},
      anchorGridCell: {type: "integer", minimum: 0}
    },
    additionalProperties: false
  };
  const territoryRequest = {
    type: "object",
    required: ["mode", "sourceStateId", "gridCellIds"],
    properties: {
      mode: {type: "string", enum: ["conquer", "cede", "neutralize"]},
      sourceStateId: {type: "integer", minimum: 1},
      targetStateId: {type: "integer", minimum: 0},
      gridCellIds,
      province: provinceStrategy
    },
    additionalProperties: false
  };
  const ensureRequest = {
    type: "object",
    required: ["stateId", "gridCellIds", "mode"],
    properties: {
      stateId: {type: "integer", minimum: 1},
      gridCellIds,
      mode: {type: "string", enum: ["auto", "existing", "ensure"]},
      provinceId: {type: "integer", minimum: 1},
      anchorGridCell: {type: "integer", minimum: 0}
    },
    additionalProperties: false
  };
  const provinceTransferRequest = {
    type: "object",
    required: ["provinceId", "targetStateId"],
    properties: {
      provinceId: {type: "integer", minimum: 1},
      targetStateId: {type: "integer", minimum: 1}
    },
    additionalProperties: false
  };
  const executionOptions = ruleExecutionOptionsSchema({
    properties: {label: {type: "string"}},
    required: ["inspectionToken", "expectedRevision"]
  });
  const confirmedExecutionOptions = ruleExecutionOptionsSchema({
    confirm: true,
    properties: {label: {type: "string"}},
    required: ["inspectionToken", "expectedRevision"]
  });
  const executionExample = {
    inspectionToken: "rulei1.example",
    expectedRevision: {mapIdentity: "example-map", mapRevision: 1}
  };
  return {
    "edit.states.inspectTerritoryTransfer": ruleInspectorOverride([
      argument("request", territoryRequest)
    ], territoryCodes, [[{mode: "cede", sourceStateId: 1, targetStateId: 2, gridCellIds: [10, 11], province: {mode: "auto"}}]]),
    "edit.states.transferTerritory": ruleExecutorOverride([
      argument("request", territoryRequest),
      argument("options", confirmedExecutionOptions)
    ], [...territoryCodes, ...tokenCodes, "confirmation_required"], [[
      {mode: "cede", sourceStateId: 1, targetStateId: 2, gridCellIds: [10, 11], province: {mode: "auto"}},
      {...executionExample, confirm: true}
    ]]),
    "edit.provinces.inspectEnsureAssignment": ruleInspectorOverride([
      argument("request", ensureRequest)
    ], ensureCodes, [[{stateId: 2, gridCellIds: [10, 11], mode: "auto"}]]),
    "edit.provinces.ensureAssignment": ruleExecutorOverride([
      argument("request", ensureRequest),
      argument("options", executionOptions)
    ], [...ensureCodes, ...tokenCodes, "confirmation_required"], [[
      {stateId: 2, gridCellIds: [10, 11], mode: "auto"},
      executionExample
    ]]),
    "edit.provinces.inspectTransfer": ruleInspectorOverride([
      argument("request", provinceTransferRequest)
    ], transferCodes, [[{provinceId: 3, targetStateId: 2}]]),
    "edit.provinces.transfer": ruleExecutorOverride([
      argument("request", provinceTransferRequest),
      argument("options", confirmedExecutionOptions)
    ], [...transferCodes, ...tokenCodes, "confirmation_required"], [[
      {provinceId: 3, targetStateId: 2},
      {...executionExample, confirm: true}
    ]])
  };
}

function provinceTopologyRuleMethodOverrides() {
  const tokenCodes = [
    "inspection-required", "inspection-stale", "inspection-token-invalid",
    "inspection-action-mismatch", "inspection-input-mismatch", "inspection-schema-mismatch"
  ];
  const mergeCodes = [
    "province-selection-too-small", "target-province-not-selected", "province-not-found",
    "province-state-mismatch", "province-territory-empty", "province-owner-mismatch",
    "merge-region-disconnected", "merge-region-without-city", "capital-city-not-found",
    "capital-outside-merge", "capital-candidate-missing"
  ];
  const splitCodes = [
    "source-province-not-found", "source-province-territory-empty", "split-selection-empty",
    "pack-cell-invalid", "pack-cell-water", "pack-cell-outside-source", "split-covers-all",
    "split-side-disconnected", "split-side-without-city", "new-capital-not-found",
    "new-capital-outside-selection", "source-capital-candidate-missing",
    "pack-grid-mapping-missing", "province-id-overflow"
  ];
  const positiveIds = {type: "array", minItems: 2, uniqueItems: true, items: {type: "integer", minimum: 1}};
  const mergeRequest = {
    type: "object",
    required: ["provinceIds", "targetProvinceId"],
    properties: {
      provinceIds: positiveIds,
      targetProvinceId: {type: "integer", minimum: 1},
      capitalCityId: {type: "integer", minimum: 1}
    },
    additionalProperties: false
  };
  const splitRequest = {
    type: "object",
    required: ["sourceProvinceId", "packCellIds"],
    properties: {
      sourceProvinceId: {type: "integer", minimum: 1},
      packCellIds: {type: "array", minItems: 1, uniqueItems: true, items: {type: "integer", minimum: 0}},
      newCapitalCityId: {type: "integer", minimum: 1}
    },
    additionalProperties: false
  };
  const options = ruleExecutionOptionsSchema({
    confirm: true,
    properties: {label: {type: "string"}},
    required: ["inspectionToken", "expectedRevision"]
  });
  const exampleOptions = {
    inspectionToken: "rulei1.example",
    expectedRevision: {mapIdentity: "example-map", mapRevision: 1},
    confirm: true
  };
  return {
    "edit.provinces.inspectMerge": ruleInspectorOverride([
      argument("request", mergeRequest)
    ], mergeCodes, [[{provinceIds: [1, 2], targetProvinceId: 1}]]),
    "edit.provinces.merge": ruleExecutorOverride([
      argument("request", mergeRequest),
      argument("options", options)
    ], [...mergeCodes, ...tokenCodes, "province-topology-validation-failed", "confirmation_required"], [[
      {provinceIds: [1, 2], targetProvinceId: 1},
      exampleOptions
    ]]),
    "edit.provinces.inspectSplit": ruleInspectorOverride([
      argument("request", splitRequest)
    ], splitCodes, [[{sourceProvinceId: 1, packCellIds: [10, 11]}]]),
    "edit.provinces.split": ruleExecutorOverride([
      argument("request", splitRequest),
      argument("options", options)
    ], [...splitCodes, ...tokenCodes, "province-topology-validation-failed", "confirmation_required"], [[
      {sourceProvinceId: 1, packCellIds: [10, 11]},
      exampleOptions
    ]])
  };
}

function diplomacyRuleMethodOverrides() {
  const tokenCodes = [
    "inspection-required", "inspection-stale", "inspection-token-invalid",
    "inspection-action-mismatch", "inspection-input-mismatch", "inspection-schema-mismatch"
  ];
  const declareCodes = [
    "invalid-state-pair", "same-state", "attacker-not-found", "defender-not-found",
    "war-already-active", "direct-vassal-war-forbidden", "diplomacy-validation-failed"
  ];
  const peaceCodes = [
    "invalid-state-pair", "same-state", "left-not-found", "right-not-found",
    "war-not-active", "invalid-peace-relation", "invalid-peace-terms",
    "peace-term-rejected", "diplomacy-validation-failed"
  ];
  const overlordCodes = [
    "vassal-not-found", "overlord-not-found", "same-state", "overlord-unchanged",
    "overlord-missing", "overlord-cycle", "overlord-war-conflict",
    "invalid-release-relation", "diplomacy-validation-failed"
  ];
  const declareRequest = {
    type: "object",
    required: ["attackerStateId", "defenderStateId"],
    properties: {
      attackerStateId: {type: "integer", minimum: 1},
      defenderStateId: {type: "integer", minimum: 1},
      reason: {type: "string", maxLength: 160}
    },
    additionalProperties: false
  };
  const reparations = {
    type: "object",
    required: ["fromStateId", "toStateId", "amount"],
    properties: {
      fromStateId: {type: "integer", minimum: 1},
      toStateId: {type: "integer", minimum: 1},
      amount: {type: "number", exclusiveMinimum: 0},
      unit: {type: "string", maxLength: 40},
      note: {type: "string", maxLength: 160}
    },
    additionalProperties: false
  };
  const peaceRequest = {
    type: "object",
    required: ["leftStateId", "rightStateId"],
    properties: {
      leftStateId: {type: "integer", minimum: 1},
      rightStateId: {type: "integer", minimum: 1},
      relation: {enum: ["Ally", "Friendly", "Neutral", "Suspicion", "Rival", "Unknown"]},
      terms: {
        type: "object",
        properties: {
          reparations,
          note: {type: "string", maxLength: 240}
        },
        additionalProperties: false
      }
    },
    additionalProperties: false
  };
  const overlordRequest = {
    type: "object",
    required: ["vassalStateId", "overlordStateId"],
    properties: {
      vassalStateId: {type: "integer", minimum: 1},
      overlordStateId: {type: ["integer", "null"], minimum: 1},
      releaseRelation: {enum: ["Ally", "Friendly", "Neutral", "Suspicion", "Rival", "Unknown"]}
    },
    additionalProperties: false
  };
  const options = ruleExecutionOptionsSchema({
    confirm: true,
    properties: {label: {type: "string"}},
    required: ["inspectionToken", "expectedRevision"]
  });
  const exampleOptions = {
    inspectionToken: "rulei1.example",
    expectedRevision: {mapIdentity: "example-map", mapRevision: 1},
    confirm: true
  };
  return {
    "edit.diplomacy.inspectDeclareWar": ruleInspectorOverride([
      argument("request", declareRequest)
    ], declareCodes, [[{attackerStateId: 1, defenderStateId: 2, reason: "边境争端"}]]),
    "edit.diplomacy.declareWar": ruleExecutorOverride([
      argument("request", declareRequest),
      argument("options", options)
    ], [...declareCodes, ...tokenCodes, "confirmation_required"], [[
      {attackerStateId: 1, defenderStateId: 2, reason: "边境争端"},
      exampleOptions
    ]]),
    "edit.diplomacy.inspectPeace": ruleInspectorOverride([
      argument("request", peaceRequest)
    ], peaceCodes, [[{leftStateId: 1, rightStateId: 2, relation: "Neutral"}]]),
    "edit.diplomacy.makePeace": ruleExecutorOverride([
      argument("request", peaceRequest),
      argument("options", options)
    ], [...peaceCodes, ...tokenCodes, "confirmation_required"], [[
      {leftStateId: 1, rightStateId: 2, relation: "Neutral"},
      exampleOptions
    ]]),
    "edit.diplomacy.inspectOverlordChange": ruleInspectorOverride([
      argument("request", overlordRequest)
    ], overlordCodes, [[{vassalStateId: 2, overlordStateId: 1, releaseRelation: "Neutral"}]]),
    "edit.diplomacy.changeOverlord": ruleExecutorOverride([
      argument("request", overlordRequest),
      argument("options", options)
    ], [...overlordCodes, ...tokenCodes, "confirmation_required"], [[
      {vassalStateId: 2, overlordStateId: 1, releaseRelation: "Neutral"},
      exampleOptions
    ]])
  };
}

function militaryBattleRuleMethodOverrides() {
  const tokenCodes = [
    "inspection-required", "inspection-stale", "inspection-token-invalid",
    "inspection-action-mismatch", "inspection-input-mismatch", "inspection-schema-mismatch"
  ];
  const battleCodes = [
    "invalid-battle-request", "invalid-attacker", "invalid-defender", "same-regiment",
    "attacker-regiment-not-found", "defender-regiment-not-found", "same-state",
    "states-not-at-war", "attacker-empty", "defender-empty", "battle-result-required",
    "battle-result-ambiguous", "invalid-outcome", "invalid-seed", "invalid-battle-type",
    "battle-terrain-mismatch", "battle-cell-missing", "warzone-not-found",
    "warzone-pair-mismatch", "battle-out-of-contact", "battle-validation-failed"
  ];
  const regimentTarget = {
    type: "object",
    properties: {
      id: {type: "string", pattern: "^[1-9][0-9]*:[0-9]+$"},
      stateId: {type: "integer", minimum: 1},
      regimentId: {type: "integer", minimum: 0}
    },
    anyOf: [
      {required: ["id"]},
      {required: ["stateId", "regimentId"]}
    ],
    additionalProperties: false
  };
  const request = {
    type: "object",
    required: ["attacker", "defender"],
    properties: {
      attacker: regimentTarget,
      defender: regimentTarget,
      outcome: {enum: ["victory", "defeat", "draw", "loss", "regroup"]},
      seed: {type: "string", minLength: 1},
      type: {enum: ["skirmish", "siege", "raid", "naval", "retreat", "report"]},
      warzoneId: {type: ["integer", "string"]},
      description: {type: "string", maxLength: 500}
    },
    oneOf: [
      {required: ["outcome"], not: {required: ["seed"]}},
      {required: ["seed"], not: {required: ["outcome"]}}
    ],
    additionalProperties: false
  };
  const options = ruleExecutionOptionsSchema({
    confirm: true,
    properties: {label: {type: "string"}},
    required: ["inspectionToken", "expectedRevision"]
  });
  const exampleRequest = {
    attacker: {stateId: 1, regimentId: 0},
    defender: {stateId: 2, regimentId: 0},
    seed: "front-a-turn-1",
    type: "skirmish"
  };
  const exampleOptions = {
    inspectionToken: "rulei1.example",
    expectedRevision: {mapIdentity: "example-map", mapRevision: 1},
    confirm: true
  };
  return {
    "edit.military.inspectBattle": ruleInspectorOverride([
      argument("request", request)
    ], battleCodes, [[exampleRequest]]),
    "edit.military.resolveBattle": ruleExecutorOverride([
      argument("request", request),
      argument("options", options)
    ], [...battleCodes, ...tokenCodes, "confirmation_required"], [[exampleRequest, exampleOptions]])
  };
}

function namebaseRuleMethodOverrides() {
  const tokenCodes = [
    "inspection-required", "inspection-stale", "inspection-token-invalid",
    "inspection-action-mismatch", "inspection-input-mismatch", "inspection-schema-mismatch"
  ];
  const bindCodes = [
    "missing-map", "invalid-input", "invalid-scope", "invalid-target",
    "invalid-culture", "culture-not-found", "namebase-not-found", "invalid-rename",
    "target-kind-mismatch", "invalid-rename-ids", "rename-object-not-found", "rename-culture-mismatch",
    "binding-unchanged", "rename-unchanged", "name-conflict"
  ];
  const replacementCodes = [
    "missing-map", "invalid-input", "invalid-operation", "invalid-base", "user-namebase-not-found",
    "no-user-namebases", "invalid-document", "empty-document", "replacement-not-found",
    "replacement-will-be-removed"
  ];
  const bindRequest = {
    type: "object",
    required: ["scope", "target", "baseId"],
    properties: {
      scope: {type: "string", enum: ["global", "culture"]},
      cultureId: {type: "integer", minimum: 1},
      target: {type: "string", enum: ["stateRoot", "place", "hydro", "culture", "religion"]},
      baseId: {type: "string"},
      rename: {
        type: "object",
        required: ["kind", "ids"],
        properties: {
          kind: {type: "string", enum: ["state", "province", "city", "river", "lake", "culture", "religion"]},
          ids: arraySchema({type: "integer", minimum: 0})
        },
        additionalProperties: false
      }
    },
    additionalProperties: false
  };
  const replacementRequest = {
    type: "object",
    required: ["operation"],
    properties: {
      operation: {type: "string", enum: ["delete", "clear", "replace"]},
      baseId: {type: "string"},
      replacementBaseId: {type: "string"},
      document: {type: "object"},
      filename: {type: "string"}
    },
    additionalProperties: false
  };
  const executionOptions = ruleExecutionOptionsSchema({
    properties: {label: {type: "string"}},
    required: ["inspectionToken", "expectedRevision"]
  });
  const destructiveExecutionOptions = ruleExecutionOptionsSchema({
    confirm: true,
    properties: {label: {type: "string"}},
    required: ["inspectionToken", "expectedRevision"]
  });
  const executionExample = {
    inspectionToken: "rulei1.example",
    expectedRevision: {mapIdentity: "example-map", mapRevision: 1}
  };
  return {
    "namebases.inspectBindAndRename": ruleInspectorOverride([
      argument("request", bindRequest)
    ], bindCodes, [[{scope: "global", target: "place", baseId: "", rename: {kind: "city", ids: [1]}}]]),
    "namebases.bindAndRename": ruleExecutorOverride([
      argument("request", bindRequest),
      argument("options", executionOptions)
    ], [...bindCodes, ...tokenCodes, "confirmation_required"], [[
      {scope: "global", target: "place", baseId: "", rename: {kind: "city", ids: [1]}},
      {...executionExample, confirm: true}
    ]]),
    "namebases.inspectReplacement": ruleInspectorOverride([
      argument("request", replacementRequest)
    ], replacementCodes, [[{operation: "delete", baseId: "user-1", replacementBaseId: ""}]]),
    "namebases.replace": ruleExecutorOverride([
      argument("request", replacementRequest),
      argument("options", destructiveExecutionOptions)
    ], [...replacementCodes, ...tokenCodes, "confirmation_required"], [[
      {operation: "delete", baseId: "user-1", replacementBaseId: ""},
      {...executionExample, confirm: true}
    ]])
  };
}

function ruleInspectorOverride(argumentsList, actionCodes, examples) {
  return {
    arguments: argumentsList,
    result: ruleInspectionResultSchema(),
    examples,
    businessCodes: ["ok", ...actionCodes, "invalid-argument", "invalid_argument"]
  };
}

function ruleExecutorOverride(argumentsList, actionCodes, examples) {
  return {
    arguments: argumentsList,
    result: objectSchema(["executed", "history"]),
    examples,
    businessCodes: ["ok", ...actionCodes, "invalid-argument", "invalid_argument"]
  };
}

function ruleInspectionResultSchema() {
  return {
    type: "object",
    required: [
      "allowed", "code", "summary", "normalizedInput", "affected", "requiresConfirm",
      "expectedRevision", "inspectionToken", "inspectorSchemaVersion"
    ],
    properties: {
      allowed: {type: "boolean"},
      code: {type: "string"},
      summary: {type: "string"},
      normalizedInput: {type: ["object", "array"]},
      affected: arraySchema(objectSchema(["kind", "id"])),
      requiresConfirm: {type: "boolean"},
      expectedRevision: ruleExpectedRevisionSchema(),
      inspectionToken: {type: ["string", "null"]},
      inspectorSchemaVersion: {type: "integer", minimum: 1}
    },
    additionalProperties: false
  };
}

function ruleExecutionOptionsSchema({confirm = false, properties = {}, required = []} = {}) {
  const requiredProperties = [...new Set([...required, ...(confirm ? ["confirm"] : [])])];
  return {
    type: "object",
    ...(requiredProperties.length ? {required: requiredProperties} : {}),
    properties: {
      ...properties,
      inspectionToken: {type: "string", minLength: 1},
      expectedRevision: ruleExpectedRevisionSchema(),
      inspectorSchemaVersion: {type: "integer", minimum: 1},
      ...(confirm ? {confirm: {const: true}} : {confirm: {type: "boolean"}})
    },
    additionalProperties: true
  };
}

function ruleExpectedRevisionSchema() {
  return {
    type: "object",
    required: ["mapIdentity", "mapRevision"],
    properties: {
      mapIdentity: {type: ["string", "null"]},
      mapRevision: {type: "integer", minimum: 0}
    },
    additionalProperties: false
  };
}

function cellCreateInspectionInputSchema() {
  return {
    anyOf: [
      {type: "integer", minimum: 0},
      {
        type: "object",
        required: ["cell"],
        properties: {cell: {...cellRefSchema(), properties: {...cellRefSchema().properties, space: {const: "grid"}}}},
        additionalProperties: false
      }
    ]
  };
}

function cellCreateExecutionInputSchema() {
  return {
    type: "object",
    required: ["cell", "inspectionToken", "expectedRevision"],
    properties: {
      cell: {...cellRefSchema(), properties: {...cellRefSchema().properties, space: {const: "grid"}}},
      inspectionToken: {type: "string", minLength: 1},
      expectedRevision: {
        type: "object",
        required: ["mapIdentity", "mapRevision"],
        properties: {
          mapIdentity: {type: ["string", "null"]},
          mapRevision: {type: "integer", minimum: 0}
        },
        additionalProperties: false
      }
    },
    additionalProperties: false
  };
}

function labelTargetSchema() {
  return {
    type: "object",
    properties: {
      kind: {const: "label"},
      id: {type: "integer"},
      targetKind: {enum: ["city", "state", "province", "zone", "custom"]},
      targetId: {type: "integer"}
    },
    anyOf: [
      {required: ["id"]},
      {required: ["targetKind", "targetId"]}
    ],
    additionalProperties: true
  };
}

function provincialCapitalRequestSchema() {
  return {
    type: "object",
    properties: {
      provinceId: {type: "integer", minimum: 1},
      provinceIds: {type: "array", minItems: 1, uniqueItems: true, items: {type: "integer", minimum: 1}},
      all: {type: "boolean"}
    },
    additionalProperties: false
  };
}

function arraySchema(items) {
  return {type: "array", items};
}

function stringSchema(description) {
  return {type: "string", ...(description ? {description} : {})};
}

function paginationSchema() {
  return {
    type: "object",
    properties: {
      limit: {type: "integer", minimum: 1, maximum: 200, default: 50},
      cursor: {type: "string"},
      fields: {type: "array", minItems: 1, uniqueItems: true, items: {type: "string"}, description: "对象类型白名单内的返回字段"}
    },
    additionalProperties: false
  };
}

function pageSchema() {
  return {
    type: "object",
    required: ["items", "page"],
    properties: {
      items: arraySchema(objectSchema(["kind", "id"])),
      page: objectSchema(["limit", "returned", "hasMore", "nextCursor", "fields"])
    }
  };
}

function optionalOptionsSchema() {
  return {type: "object", additionalProperties: true};
}

function confirmOptionsSchema() {
  return {
    type: "object",
    required: ["confirm"],
    properties: {confirm: {const: true}},
    additionalProperties: true
  };
}

function cloneJson(value) {
  return JSON.parse(JSON.stringify(value));
}
