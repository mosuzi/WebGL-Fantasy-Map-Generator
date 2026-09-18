export const CITY_GUIDANCE_EVENT = "webgl-generator-city-guidance";
const DOMAIN_LABELS = {population: "人口潜力", economy: "经济与国力", routes: "道路", military: "军事"};
export class CityUpdateGuidance {
  constructor({getIdentity, getMap, notify = () => {}}) {
    Object.assign(this, {getIdentity, getMap, notify});
    this.identity = null;
    this.records = new Map();
    this.commands = new WeakMap();
  }
  ensure() {
    if (this.identity === this.getIdentity()) return;
    this.identity = this.getIdentity();
    this.records = new Map();
    this.commands = new WeakMap();
  }
  snapshot() { this.ensure(); return {identity: this.identity, records: this.records, commands: this.commands}; }
  restore(snapshot) {
    if (snapshot?.identity !== this.getIdentity()) return;
    Object.assign(this, snapshot); this.notify();
  }
  mutation({action, command}) {
    this.ensure();
    const saved = this.commands.get(command);
    if (saved && action !== "execute") {
      this.records = action === "undo" ? saved.before : saved.after;
      this.notify(); return;
    }
    const change = command.cityUpdateGuidance;
    const domains = (command.effects?.affected || []).filter(item => item.kind === "derived-system").map(item => item.id);
    const clears = [domains.includes("economy-rebuild") || domains.includes("economy") ? "economy" : null,
      domains.includes("routes") ? "routes" : null, domains.includes("military") || domains.includes("military-regeneration") ? "military" : null].filter(Boolean);
    if (!change && !clears.length) return;
    const before = this.records;
    const after = new Map(before);
    const locks = this.getMap()?.regenerationLocks?.entries || [];
    for (const domain of clears) {
      const kinds = domain === "economy" ? ["economy-market", "trade-flow", "state", "province", "city"] : domain === "routes" ? ["route", "city"] : ["military", "state", "city"];
      if (locks.some(lock => kinds.includes(lock.kind))) continue;
      for (const [id, record] of after) after.set(id, {...record, pending: record.pending.filter(item => item !== domain)});
    }
    if (change) {
      const ids = change.cityIds || (change.attribute === "capital"
        ? (command.effects?.affected || []).filter(item => item.kind === "city").map(item => Number(item.id)) : [Number(change.cityId)]);
      for (const id of ids) {
        const previous = after.get(id) || {pending: [], reasons: []};
        const impacted = change.attribute === "population" ? ["economy", "routes", "military"]
          : ["population", "economy", ...(change.attribute === "walls" ? [] : ["routes"]), "military"];
        after.set(id, {pending: [...new Set([...previous.pending.filter(item => !(change.recalculated && item === "population")), ...impacted])],
          reasons: [...new Set([...previous.reasons, change.reason])]});
      }
    }
    this.records = after;
    this.commands.set(command, {before, after});
    this.notify();
  }
  read(cityId) {
    this.ensure();
    const record = this.records.get(Number(cityId));
    return record ? {...record, known: true, domains: record.pending.map(id => ({id, label: DOMAIN_LABELS[id]}))}
      : {known: false, reasons: [], domains: []};
  }
  acknowledgePopulation(cityId) {
    this.ensure();
    const record = this.records.get(Number(cityId));
    if (!record) return;
    this.records = new Map(this.records);
    this.records.set(Number(cityId), {...record, pending: record.pending.filter(domain => domain !== "population")});
    this.notify();
  }
}
