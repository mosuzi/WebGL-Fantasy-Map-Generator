import {createMapCoreEngine} from "../../core/map-core-engine.js";
import type {InteractiveRevisionVector} from "../../core/contracts/revision.js";
import type {CommitId} from "../../core/contracts/identity.js";
import {adaptLegacyInteractiveRevision} from "../../core/adapters/identity-adapters.js";
import {markerPresentationRecords} from "./presentation.js";

export function createMarkersPresentationRuntime<TMap>(options: {
  readonly getMap: () => TMap;
  readonly getLegacyRevision: () => Readonly<{mapIdentity: string | null; mapRevision: number; topologyRevision?: number}>;
  readonly getHistoryFingerprint: () => string;
}) {
  const core = createMapCoreEngine({
    owner: {
      getMap: options.getMap,
      getRevision,
      getHistoryFingerprint: options.getHistoryFingerprint
    },
    createCommitId: () => "markers-presentation-read-only" as CommitId
  });

  return Object.freeze({list, get, snapshot: core.snapshot});

  function list(): readonly Readonly<Record<string, unknown>>[] {
    const serialized = core.readCanonical(map => JSON.stringify(markerPresentationRecords(map)));
    return Object.freeze((JSON.parse(serialized) as Record<string, unknown>[]).map(marker => Object.freeze(marker)));
  }

  function get(id: string | number): Readonly<Record<string, unknown>> | null {
    const normalized = String(id);
    return list().find(marker => String(marker.id) === normalized) || null;
  }

  function getRevision(): InteractiveRevisionVector {
    const revision = options.getLegacyRevision();
    return adaptLegacyInteractiveRevision({...revision, topologyRevision: revision.topologyRevision ?? 0, domainRevisions: {markers: revision.mapRevision}});
  }
}
