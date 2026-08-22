#!/usr/bin/env node
import assert from "node:assert/strict";

import {generatePlaceholderMap} from "../app/webgl-generator/src/generator/index.js";
import {
  BROWSER_MAP_STORAGE_FALLBACK_RECORD,
  BROWSER_MAP_STORAGE_KEY,
  createBrowserMapStorageEnvelope,
  readBrowserMapStorage,
  writeBrowserMapStorage,
  writeBrowserMapStorageBinary
} from "../app/webgl-generator/src/runtime/browser-map-storage.js";
import {
  createMapDocument,
  parseMapDocument,
  stringifyMapDocument
} from "../app/webgl-generator/src/runtime/map-file-io.js";

const mapMetadata = {
  metadata: {seed: "task-350-r5a-storage", checksum: "r5a-storage-checksum", gridCells: 1, packCells: 1},
  options: {seed: "task-350-r5a-storage"}
};
const raw2024 = storageEnvelope("2024-01-01T00:00:00.000Z", "old-local");
const raw2025 = storageEnvelope("2025-01-01T00:00:00.000Z", "new-fallback");
const raw2026 = storageEnvelope("2026-01-01T00:00:00.000Z", "new-local");

const localFirst = createStorageFixture();
await writeBrowserMapStorage({defaultView: {indexedDB: localFirst.indexedDB}}, raw2024);
assert.equal(localFirst.records.has(BROWSER_MAP_STORAGE_FALLBACK_RECORD), true);
const localFirstStorage = createFakeLocalStorage();
const localFirstWrite = await writeBrowserMapStorage({defaultView: {
  indexedDB: localFirst.indexedDB,
  localStorage: localFirstStorage
}}, raw2026);
assert.deepEqual(localFirstWrite, {backend: "localStorage", storageKey: BROWSER_MAP_STORAGE_KEY});
assert.equal(localFirstStorage.getItem(BROWSER_MAP_STORAGE_KEY), raw2026);
assert.equal(localFirst.records.has(BROWSER_MAP_STORAGE_FALLBACK_RECORD), false, "LocalStorage 成功后必须删除旧 IndexedDB fallback");
assert.deepEqual(
  await readBrowserMapStorage({defaultView: {indexedDB: localFirst.indexedDB, localStorage: localFirstStorage}}),
  {raw: raw2026, backend: "localStorage", storageKey: BROWSER_MAP_STORAGE_KEY}
);

const quotaFallback = createStorageFixture();
const quotaError = Object.assign(new Error("quota exceeded"), {name: "QuotaExceededError"});
const quotaStorage = createFakeLocalStorage({initial: [[BROWSER_MAP_STORAGE_KEY, raw2024]], setError: quotaError});
const quotaWrite = await writeBrowserMapStorage({defaultView: {
  indexedDB: quotaFallback.indexedDB,
  localStorage: quotaStorage
}}, raw2025);
assert.deepEqual(quotaWrite, {backend: "indexedDB", storageKey: BROWSER_MAP_STORAGE_FALLBACK_RECORD, fallback: true});
assert.equal(quotaStorage.getItem(BROWSER_MAP_STORAGE_KEY), raw2024, "quota fallback 不得破坏原始 LocalStorage 存档");
assert.deepEqual(
  await readBrowserMapStorage({defaultView: {indexedDB: quotaFallback.indexedDB, localStorage: quotaStorage}}),
  {raw: raw2025, backend: "indexedDB", storageKey: BROWSER_MAP_STORAGE_FALLBACK_RECORD, fallback: true},
  "较新的 IndexedDB fallback 必须胜出"
);

const missingLocal = createStorageFixture();
assert.deepEqual(
  await writeBrowserMapStorage({defaultView: {indexedDB: missingLocal.indexedDB}}, raw2025),
  {backend: "indexedDB", storageKey: BROWSER_MAP_STORAGE_FALLBACK_RECORD, fallback: true}
);
assert.deepEqual(
  await readBrowserMapStorage({defaultView: {indexedDB: missingLocal.indexedDB}}),
  {raw: raw2025, backend: "indexedDB", storageKey: BROWSER_MAP_STORAGE_FALLBACK_RECORD, fallback: true}
);

const quotaAndIndexedDbFailure = createStorageFixture({failOperations: ["put"]});
await assert.rejects(
  writeBrowserMapStorage({defaultView: {
    indexedDB: quotaAndIndexedDbFailure.indexedDB,
    localStorage: createFakeLocalStorage({setError: quotaError})
  }}, raw2025),
  error => error === quotaError,
  "IndexedDB fallback 失败时必须保留原始 quota 错误"
);

const nonQuotaError = Object.assign(new Error("storage security failure"), {name: "SecurityError"});
const noFallbackOnNonQuota = createStorageFixture();
await assert.rejects(
  writeBrowserMapStorage({defaultView: {
    indexedDB: noFallbackOnNonQuota.indexedDB,
    localStorage: createFakeLocalStorage({setError: nonQuotaError})
  }}, raw2025),
  error => error === nonQuotaError
);
assert.equal(noFallbackOnNonQuota.records.size, 0, "非 quota 错误不得静默改走 IndexedDB");

const newerLocal = createStorageFixture();
await writeBrowserMapStorage({defaultView: {indexedDB: newerLocal.indexedDB}}, raw2025);
const newerLocalStorage = createFakeLocalStorage({initial: [[BROWSER_MAP_STORAGE_KEY, raw2026]]});
assert.deepEqual(
  await readBrowserMapStorage({defaultView: {indexedDB: newerLocal.indexedDB, localStorage: newerLocalStorage}}),
  {raw: raw2026, backend: "localStorage", storageKey: BROWSER_MAP_STORAGE_KEY},
  "较新的 LocalStorage 存档必须胜出"
);

const binaryFixture = createStorageFixture();
const staleLocalStorage = createFakeLocalStorage({
  initial: [[BROWSER_MAP_STORAGE_KEY, raw2024]],
  removeError: Object.assign(new Error("remove denied"), {name: "SecurityError"})
});
const binaryBytes = new Uint8Array([31, 139, 8, 0, 7, 5, 3, 1]);
const binaryWrite = await writeBrowserMapStorageBinary({defaultView: {
  indexedDB: binaryFixture.indexedDB,
  localStorage: staleLocalStorage
}}, binaryBytes, mapMetadata, {originalBytes: 4096});
assert.equal(binaryWrite.backend, "indexedDB");
assert.equal(binaryWrite.directBinary, true);
assert.equal(staleLocalStorage.getItem(BROWSER_MAP_STORAGE_KEY), raw2024, "受限清理失败时旧 local 值应保持原样");
const binaryRead = await readBrowserMapStorage({defaultView: {
  indexedDB: binaryFixture.indexedDB,
  localStorage: staleLocalStorage
}});
assert.equal(binaryRead.backend, "indexedDB");
assert.equal(binaryRead.directBinary, true);
assert.equal(binaryRead.raw.kind, "bytes");
assert.deepEqual(binaryRead.raw.bytes, binaryBytes);
assert.equal(binaryRead.raw.mimeType, "application/gzip");
assert.equal(binaryRead.metadata.checksum, mapMetadata.metadata.checksum);

const readFallback = createStorageFixture({failOperations: ["get"]});
const readableLocal = createFakeLocalStorage({initial: [[BROWSER_MAP_STORAGE_KEY, raw2024]]});
assert.deepEqual(
  await readBrowserMapStorage({defaultView: {indexedDB: readFallback.indexedDB, localStorage: readableLocal}}),
  {raw: raw2024, backend: "localStorage", storageKey: BROWSER_MAP_STORAGE_KEY},
  "IndexedDB 读取失败时仍应保留可用 LocalStorage"
);

const identityMap = generatePlaceholderMap({
  seed: "task-350-r5a-holey-identities",
  cellsTarget: 1000,
  graphWidth: 800,
  graphHeight: 600
});
const highCityId = 5000;
const highRouteId = 7000;
const sourceCities = identityMap.settlements.cities.slice();
const sourceBurgs = identityMap.pack.burgs.slice();
const sourceRoutes = identityMap.pack.routes.slice();
sourceCities.length = highCityId + 1;
sourceBurgs.length = highCityId + 1;
sourceRoutes.length = highRouteId + 1;
sourceCities[highCityId] = {...sourceCities.find(Boolean), id: highCityId, burgId: highCityId, removed: true};
sourceBurgs[highCityId] = {...sourceBurgs.find(item => item?.i > 0), i: highCityId, id: highCityId, cityId: highCityId, removed: true};
sourceRoutes[highRouteId] = {...sourceRoutes.find(Boolean), i: highRouteId, id: highRouteId, removed: true};
identityMap.settlements = {...identityMap.settlements, cities: sourceCities};
identityMap.pack = {...identityMap.pack, burgs: sourceBurgs, routes: sourceRoutes};

const sourceProfiles = [sourceCities, sourceBurgs, sourceRoutes].map(captureSparseArrayProfile);
const sourceObjects = [sourceCities[highCityId], sourceBurgs[highCityId], sourceRoutes[highRouteId]];
const sourceArraySnapshots = [sourceCities, sourceBurgs, sourceRoutes].map(values => structuredClone(values));
const sourceObjectSnapshots = sourceObjects.map(value => structuredClone(value));
const identityDocument = createMapDocument(identityMap, identityMap.options);
const projectedArrays = [
  identityDocument.map.settlements.cities,
  identityDocument.map.pack.burgs,
  identityDocument.map.pack.routes
];

for (const [index, source] of [sourceCities, sourceBurgs, sourceRoutes].entries()) {
  const expected = sourceProfiles[index];
  assert.strictEqual([identityMap.settlements.cities, identityMap.pack.burgs, identityMap.pack.routes][index], source);
  assert.deepEqual(captureSparseArrayProfile(source), expected, "导出不得补写运行时源数组的 hole");
  assert.deepEqual(source, sourceArraySnapshots[index], "导出不得改写运行时 identity array 的已有内容");
  assert.strictEqual(source[source.length - 1], sourceObjects[index], "导出不得替换运行时源对象");
  assert.deepEqual(sourceObjects[index], sourceObjectSnapshots[index], "导出不得改写运行时高编号对象");
  assert.notStrictEqual(projectedArrays[index], source, "含 hole 的持久投影必须与运行时数组分离");
  assertCanonicalIdentityProjection(source, projectedArrays[index]);

  const firstHoleOnly = source.slice();
  firstHoleOnly[expected.firstHole] = null;
  assert.throws(
    () => assertCanonicalIdentityProjection(source, firstHoleOnly),
    /持久投影槽 .* 必须为 own-property/u,
    "只补首个 hole、保留后续 hole 的伪投影不得通过"
  );
}
assert.equal(identityDocument.map.settlements.cities[sourceProfiles[0].firstHole], null);
assert.equal(identityDocument.map.pack.burgs[sourceProfiles[1].firstHole], null);
assert.equal(identityDocument.map.pack.routes[sourceProfiles[2].firstHole], null);
assert.equal(identityDocument.map.settlements.cities[highCityId].id, highCityId);
assert.equal(identityDocument.map.pack.burgs[highCityId].i, highCityId);
assert.equal(identityDocument.map.pack.routes[highRouteId].i, highRouteId);

const identityRoundtrip = parseMapDocument(stringifyMapDocument(identityDocument));
assert.equal(identityRoundtrip.map.settlements.cities.length, highCityId + 1);
assert.equal(identityRoundtrip.map.pack.burgs.length, highCityId + 1);
assert.equal(identityRoundtrip.map.pack.routes.length, highRouteId + 1);
assert.equal(identityRoundtrip.map.settlements.cities[highCityId].id, highCityId);
assert.equal(identityRoundtrip.map.pack.burgs[highCityId].i, highCityId);
assert.equal(identityRoundtrip.map.pack.routes[highRouteId].i, highRouteId);

console.log(JSON.stringify({
  ok: true,
  browser: 0,
  storage: {
    localSuccessDeletesFallback: true,
    quotaFallback: true,
    noLocalFallback: true,
    originalQuotaPreserved: true,
    nonQuotaRejected: true,
    savedAtArbitration: true,
    directBinary: true,
    readFailureUsesLocal: true
  },
  identityArrays: {
    sourceImmutable: true,
    holesProjectedAsNull: true,
    cityHighId: highCityId,
    burgHighId: highCityId,
    routeHighId: highRouteId
  }
}, null, 2));

function storageEnvelope(savedAt, marker) {
  return JSON.stringify({
    ...createBrowserMapStorageEnvelope(`{\"marker\":\"${marker}\"}`, mapMetadata, {encoding: "plain"}),
    savedAt
  });
}

function captureSparseArrayProfile(values) {
  let firstHole = -1;
  for (let index = 0; index < values.length; index++) {
    if (!Object.hasOwn(values, index)) {
      firstHole = index;
      break;
    }
  }
  return {length: values.length, keys: Object.keys(values), firstHole};
}

function assertCanonicalIdentityProjection(source, projected) {
  assert.equal(projected.length, source.length);
  for (let index = 0; index < source.length; index++) {
    assert.equal(Object.hasOwn(projected, index), true, `持久投影槽 ${index} 必须为 own-property`);
    if (!Object.hasOwn(source, index)) assert.strictEqual(projected[index], null, `源 hole ${index} 必须投影为显式 null`);
  }
}

function createFakeLocalStorage(options = {}) {
  const values = new Map(options.initial || []);
  return {
    getItem(key) {
      return values.has(key) ? values.get(key) : null;
    },
    setItem(key, value) {
      if (options.setError) throw options.setError;
      values.set(key, String(value));
    },
    removeItem(key) {
      if (options.removeError) throw options.removeError;
      values.delete(key);
    }
  };
}

function createStorageFixture(options = {}) {
  const records = new Map();
  const failOperations = new Set(options.failOperations || []);
  let created = false;
  const indexedDB = {
    open() {
      const request = {};
      queueMicrotask(() => {
        if (failOperations.has("open")) {
          request.error = new Error("fake IndexedDB open failure");
          request.onerror?.();
          return;
        }
        const db = createDatabase();
        request.result = db;
        if (!created) request.onupgradeneeded?.();
        request.onsuccess?.();
      });
      return request;
    }
  };

  return {indexedDB, records};

  function createDatabase() {
    return {
      objectStoreNames: {contains: () => created},
      createObjectStore() {
        created = true;
      },
      transaction() {
        const transaction = {
          objectStore() {
            return {
              put(value, key) {
                return schedule("put", () => records.set(key, structuredClone(value)));
              },
              get(key) {
                return schedule("get", () => structuredClone(records.get(key)));
              },
              delete(key) {
                return schedule("delete", () => records.delete(key));
              }
            };
          }
        };
        return transaction;

        function schedule(operation, action) {
          const request = {};
          queueMicrotask(() => {
            if (failOperations.has(operation)) {
              const error = new Error(`fake IndexedDB ${operation} failure`);
              request.error = error;
              transaction.error = error;
              request.onerror?.();
              transaction.onerror?.();
              return;
            }
            request.result = action();
            request.onsuccess?.();
            queueMicrotask(() => transaction.oncomplete?.());
          });
          return request;
        }
      },
      close() {}
    };
  }
}
