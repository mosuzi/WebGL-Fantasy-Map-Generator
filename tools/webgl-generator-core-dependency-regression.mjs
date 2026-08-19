#!/usr/bin/env node
import assert from "node:assert/strict";
import path from "node:path";
import {fileURLToPath} from "node:url";
import {createServer} from "vite";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const vite = await createServer({configFile: false, root: path.join(repoRoot, "app/webgl-generator"), server: {middlewareMode: true}, appType: "custom", logLevel: "error"});

try {
  const {createDependencyRegistry} = await vite.ssrLoadModule("/src/core/dependency-registry.ts");
  const {notesManifest} = await vite.ssrLoadModule("/src/domains/notes/manifest.ts");
  const {markersManifest} = await vite.ssrLoadModule("/src/domains/markers/manifest.ts");
  const {populationManifest} = await vite.ssrLoadModule("/src/domains/population/manifest.ts");
  const {foundationManifest} = await vite.ssrLoadModule("/src/domains/foundation/manifest.ts");
  const {societyPoliticsManifest} = await vite.ssrLoadModule("/src/domains/society-politics/manifest.ts");
  const {settlementsManifest} = await vite.ssrLoadModule("/src/domains/settlements/manifest.ts");
  const {zonesManifest} = await vite.ssrLoadModule("/src/domains/zones/manifest.ts");
  const {labelsManifest} = await vite.ssrLoadModule("/src/domains/labels/manifest.ts");
  const {measurementsManifest} = await vite.ssrLoadModule("/src/domains/measurements/manifest.ts");
  const {featuresManifest} = await vite.ssrLoadModule("/src/domains/features/manifest.ts");
  const {routesManifest} = await vite.ssrLoadModule("/src/domains/routes/manifest.ts");
  const {riversManifest} = await vite.ssrLoadModule("/src/domains/rivers/manifest.ts");
  const targets = {
    "object-panels": ["ui"],
    "point-layers": ["renderer"],
    picking: ["renderer"],
    "economy-demand": ["ui"],
    "object-index": ["ui"],
    "population-stats": ["ui"],
    labels: ["renderer"],
    "terrain-caches": ["renderer"],
    "height-field": ["renderer"],
    "render-mesh": ["renderer"],
    "climate-statistics": ["ui"],
    "line-layers": ["renderer"],
    "cell-colors": ["renderer"],
    "political-boundaries": ["renderer"],
    "measurement-overlay": ["renderer"]
  };
  const registry = createDependencyRegistry({invalidationTargets: targets});
  registry.register(notesManifest);
  registry.register(markersManifest);
  registry.register(populationManifest);
  registry.register(foundationManifest);
  registry.register(societyPoliticsManifest);
  registry.register(settlementsManifest);
  registry.register(zonesManifest);
  registry.register(labelsManifest);
  registry.register(measurementsManifest);
  registry.register(featuresManifest);
  registry.register(routesManifest);
  registry.register(riversManifest);
  assert.deepEqual(registry.snapshot().ids, ["features.topology-projection", "foundation.climate", "foundation.height-topology", "foundation.ocean-current-layer", "labels.layout-projection", "markers.point-layer", "markers.resource-economy", "measurements.overlay-projection", "notes.object-panels", "population.downstream", "rivers.hydrology-projection", "routes.line-projection", "settlements.city-projection", "society-politics.administrative-mirror", "society-politics.social-assignment", "zones.region-projection"]);

  const topologyFull = registry.planCanonical({writeSet: ["grid"]});
  assert.equal(topologyFull.mode, "full-rebuild");
  assert.ok(topologyFull.systems.includes("foundation.height-topology"));
  assert.ok(topologyFull.systems.includes("foundation.climate"));
  assert.ok(topologyFull.systems.includes("foundation.ocean-current-layer"));
  assert.ok(topologyFull.invalidated.includes("render-mesh"));

  const notesLocal = registry.planCanonical({writeSet: ["notes"], affected: {note: ["note-1"]}});
  assert.equal(notesLocal.mode, "local");
  assert.deepEqual(notesLocal.systems, ["notes.object-panels"]);
  assert.deepEqual(notesLocal.invalidated, ["object-panels"]);
  assert.deepEqual(notesLocal.projections, ["persistence", "ui"]);
  assert.throws(() => notesLocal.systems.push("escape"), TypeError);

  const missingScope = registry.planCanonical({writeSet: ["notes"]});
  assert.equal(missingScope.mode, "full-rebuild");
  assert.ok(missingScope.fallbackReasons.some(reason => reason.includes("affected objects")));
  assert.deepEqual(new Set(missingScope.projections), new Set(["worker", "renderer", "persistence", "ui"]));

  const populationFull = registry.planCanonical({writeSet: ["pack.cells.pop"], affectedCells: [1, 2]});
  assert.equal(populationFull.mode, "full-rebuild");
  assert.ok(populationFull.systems.includes("population.downstream"));
  assert.ok(populationFull.systems.includes("markers.resource-economy"), "derived writes 必须继续传播下游 invalidation");
  assert.deepEqual(new Set(populationFull.projections), new Set(["worker", "renderer", "persistence", "ui"]));

  const politicsFull = registry.planCanonical({writeSet: ["politics.provinces"], affected: {province: [1]}});
  assert.equal(politicsFull.mode, "full-rebuild");
  assert.ok(politicsFull.systems.includes("society-politics.administrative-mirror"));
  assert.deepEqual(new Set(politicsFull.invalidated), new Set(["cell-colors", "political-boundaries", "labels", "object-index", "picking", "point-layers", "object-panels"]));

  const religionFull = registry.planCanonical({writeSet: ["society.religions"], affected: {religion: [1]}});
  assert.equal(religionFull.mode, "full-rebuild");
  assert.ok(religionFull.systems.includes("society-politics.social-assignment"));
  assert.deepEqual(new Set(religionFull.invalidated), new Set(["cell-colors", "labels", "object-index"]));

  const settlementsFull = registry.planCanonical({writeSet: ["settlements.cities"], affected: {city: [1]}});
  assert.equal(settlementsFull.mode, "full-rebuild");
  assert.ok(settlementsFull.systems.includes("settlements.city-projection"));
  assert.ok(settlementsFull.systems.includes("labels.layout-projection"));
  assert.ok(settlementsFull.invalidated.includes("point-layers"));

  const zonesFull = registry.planCanonical({writeSet: ["zones.zones"], affected: {zone: [0]}});
  assert.equal(zonesFull.mode, "full-rebuild");
  assert.ok(zonesFull.systems.includes("zones.region-projection"));
  assert.ok(zonesFull.systems.includes("labels.layout-projection"));

  const measurementsFull = registry.planCanonical({writeSet: ["measurements.items"], affected: {measurement: ["m-1"]}});
  assert.equal(measurementsFull.mode, "full-rebuild");
  assert.deepEqual(measurementsFull.systems, ["measurements.overlay-projection"]);
  assert.deepEqual(measurementsFull.invalidated, ["measurement-overlay"]);

  const featuresFull = registry.planCanonical({writeSet: ["pack.features"]});
  assert.equal(featuresFull.mode, "full-rebuild");
  assert.ok(featuresFull.systems.includes("features.topology-projection"));
  assert.ok(featuresFull.invalidated.includes("render-mesh"));

  const routesFull = registry.planCanonical({writeSet: ["pack.routes"]});
  assert.equal(routesFull.mode, "full-rebuild");
  assert.ok(routesFull.systems.includes("routes.line-projection"));
  assert.ok(routesFull.invalidated.includes("line-layers"));

  const riversFull = registry.planCanonical({writeSet: ["pack.rivers"]});
  assert.equal(riversFull.mode, "full-rebuild");
  assert.ok(riversFull.systems.includes("rivers.hydrology-projection"));
  assert.ok(riversFull.invalidated.includes("cell-colors"));

  const unknown = registry.planCanonical({writeSet: ["unregistered.section"]});
  assert.equal(unknown.mode, "full-rebuild");
  assert.ok(unknown.fallbackReasons[0].includes("未声明写路径"));

  const presentation = registry.planPresentation({changes: ["theme", "visibility"]});
  assert.equal(presentation.mode, "presentation-only");
  assert.deepEqual(presentation.projections, ["renderer", "ui"]);
  assert.equal(presentation.scheduledRebuilds.length, 0);
  assert.equal(presentation.reusedAcrossPresentation.length, registry.snapshot().ids.length);

  const exactRegistry = createDependencyRegistry();
  exactRegistry.register({...notesManifest, id: "exact-domain", derivedSystems: [], commands: [{...notesManifest.commands[0], id: "exact.write", writeSet: ["document.title"]}], api: undefined});
  assert.equal(exactRegistry.planCanonical({writeSet: ["document.title"]}).mode, "exact");

  const mutableManifest = structuredClone(notesManifest);
  mutableManifest.id = "mutable-domain";
  mutableManifest.derivedSystems[0].id = "mutable.system";
  mutableManifest.commands[0].id = "mutable.write";
  mutableManifest.panels = [];
  mutableManifest.api = undefined;
  const ownedRegistry = createDependencyRegistry({invalidationTargets: targets});
  ownedRegistry.register(mutableManifest);
  mutableManifest.derivedSystems[0].invalidates[0] = "mutated-after-register";
  assert.deepEqual(ownedRegistry.planCanonical({writeSet: ["notes"], affected: {note: ["note-1"]}}).invalidated, ["object-panels"], "registry 必须持有冻结 descriptor snapshot");

  assert.throws(() => registry.register(notesManifest), error => error?.code === "DEPENDENCY_DUPLICATE_DOMAIN");
  const invalidRegistry = createDependencyRegistry({invalidationTargets: targets});
  assert.throws(() => invalidRegistry.register({...notesManifest, id: "invalid-domain", derivedSystems: [{...notesManifest.derivedSystems[0], id: "invalid-system", invalidatedBy: ["markers"]}], api: undefined}), error => error?.code === "DEPENDENCY_INVALID");
  assert.throws(() => createDependencyRegistry({invalidationTargets: {bad: ["unknown"]}}), error => error?.code === "DEPENDENCY_INVALID");

  const missingTargetRegistry = createDependencyRegistry();
  missingTargetRegistry.register(notesManifest);
  const missingTarget = missingTargetRegistry.planCanonical({writeSet: ["notes"], affected: {note: ["note-1"]}});
  assert.equal(missingTarget.mode, "full-rebuild");
  assert.ok(missingTarget.fallbackReasons.some(reason => reason.includes("未登记 projection")));

  console.log(JSON.stringify({
    ok: true,
    registry: registry.snapshot(),
    modes: [notesLocal.mode, populationFull.mode, politicsFull.mode, religionFull.mode, settlementsFull.mode, zonesFull.mode, measurementsFull.mode, featuresFull.mode, routesFull.mode, riversFull.mode, presentation.mode, unknown.mode, exactRegistry.planCanonical({writeSet: ["document.title"]}).mode],
    notes: {systems: notesLocal.systems, projections: notesLocal.projections},
    population: {systems: populationFull.systems, invalidated: populationFull.invalidated, projections: populationFull.projections},
    societyPolitics: {politics: politicsFull.systems, religion: religionFull.systems},
    settlementZonesAnnotations: {settlements: settlementsFull.systems, zones: zonesFull.systems, measurements: measurementsFull.systems},
    featuresNetworksResources: {features: featuresFull.systems, routes: routesFull.systems, rivers: riversFull.systems},
    negative: ["missing-scope", "unknown-write", "duplicate-domain", "invalidatedBy-outside-reads", "invalid-projection", "missing-invalidation-target", "manifest-mutation-after-register"]
  }, null, 2));
} finally {
  await vite.close();
}
