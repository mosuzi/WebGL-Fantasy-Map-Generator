export function isActiveEnemyPair(states, leftId, rightId) {
  const left = states?.[Number(leftId)];
  const right = states?.[Number(rightId)];
  if (!left?.i || !right?.i || left.removed || right.removed || left.i === right.i) return false;
  return left.diplomacy?.[right.i] === "Enemy" && right.diplomacy?.[left.i] === "Enemy";
}

export function reconcileWarDerivedData(mapOrPack) {
  const map = mapOrPack?.pack ? mapOrPack : null;
  const pack = map?.pack || mapOrPack;
  const states = pack?.states || map?.politics?.states || [];
  const result = {
    removedStateCampaigns: pruneStateCampaigns(states),
    removedMilitaryCampaigns: 0,
    removedFronts: 0,
    removedWarzones: 0,
    backfilledWarzones: 0,
    removedWarzoneIds: []
  };

  const military = map?.military || pack?.military;
  if (military) {
    const campaigns = Array.isArray(military.campaigns) ? military.campaigns : [];
    const fronts = Array.isArray(military.fronts) ? military.fronts : [];
    military.campaigns = campaigns.filter(campaign => isActiveEnemyPair(states, campaign?.attacker, campaign?.defender));
    military.fronts = fronts.filter(front => isActiveEnemyPair(states, front?.attacker, front?.defender));
    result.removedMilitaryCampaigns = campaigns.length - military.campaigns.length;
    result.removedFronts = fronts.length - military.fronts.length;
    if (military.metadata) {
      military.metadata.campaigns = military.campaigns.length;
      military.metadata.fronts = military.fronts.length;
    }
    if (pack) pack.military = military;
    if (map) map.military = military;
  }

  const zoneStore = map?.zones;
  const zones = Array.isArray(zoneStore?.zones) ? zoneStore.zones : Array.isArray(pack?.zones) ? pack.zones : [];
  const nextZones = [];
  for (const zone of zones) {
    if (zone?.type !== "Warzone") {
      nextZones.push(zone);
      continue;
    }
    const pair = resolveWarzoneStatePair(pack, zone);
    if (!pair || !isActiveEnemyPair(states, pair.attacker, pair.defender)) {
      result.removedWarzones += 1;
      result.removedWarzoneIds.push(zone?.i ?? zone?.id);
      continue;
    }
    if (Number(zone.attacker) !== pair.attacker || Number(zone.defender) !== pair.defender) {
      nextZones.push({...zone, ...pair});
      result.backfilledWarzones += 1;
    } else {
      nextZones.push(zone);
    }
  }
  if (pack) pack.zones = nextZones;
  if (zoneStore) {
    zoneStore.zones = nextZones;
    updateZoneMetadata(zoneStore.metadata, nextZones, pack?.cells);
  }
  return result;
}

export function resolveWarzoneStatePair(pack, zone) {
  const explicitAttacker = Number(zone?.attacker);
  const explicitDefender = Number(zone?.defender);
  if (explicitAttacker > 0 && explicitDefender > 0 && explicitAttacker !== explicitDefender) {
    return {attacker: explicitAttacker, defender: explicitDefender};
  }

  const stateIds = [...new Set((zone?.cells || [])
    .map(cell => Number(pack?.cells?.state?.[cell]) || 0)
    .filter(Boolean))];
  if (stateIds.length !== 2 || !isActiveEnemyPair(pack?.states, stateIds[0], stateIds[1])) return null;
  return {attacker: stateIds[0], defender: stateIds[1]};
}

function pruneStateCampaigns(states) {
  let removed = 0;
  for (const state of states || []) {
    if (!state || !Array.isArray(state.campaigns)) continue;
    const previous = state.campaigns;
    state.campaigns = previous.filter(campaign => isActiveEnemyPair(states, campaign?.attacker, campaign?.defender));
    removed += previous.length - state.campaigns.length;
  }
  return removed;
}

function updateZoneMetadata(metadata, zones, cells) {
  if (!metadata) return;
  const types = {};
  let cellCount = 0;
  let invalidCells = 0;
  for (const zone of zones) {
    types[zone.type] = (types[zone.type] || 0) + 1;
    cellCount += zone.cells?.length || 0;
    for (const cell of zone.cells || []) {
      if (!Number.isInteger(cell) || cell < 0 || cell >= (cells?.i?.length || 0)) invalidCells += 1;
    }
  }
  metadata.zones = zones.length;
  metadata.types = types;
  metadata.cells = cellCount;
  metadata.hidden = zones.filter(zone => zone.hidden).length;
  metadata.invalidCells = invalidCells;
}
