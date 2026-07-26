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
  "unsupported_lock_kind",
  "object_not_found",
  "lock_batch_empty",
  "lock_batch_invalid",
  "regeneration_lock_conflict",
  "inspection_stale"
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
  ...createAtCellMethodOverrides(),
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
      targetKind: {enum: ["city", "state", "province", "custom"]},
      targetId: {type: "integer"}
    },
    anyOf: [
      {required: ["id"]},
      {required: ["targetKind", "targetId"]}
    ],
    additionalProperties: true
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
