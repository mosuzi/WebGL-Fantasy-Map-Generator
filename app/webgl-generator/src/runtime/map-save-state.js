// Content positions follow reversible commands, independently of monotonic map revisions.
export class MapSaveState {
  constructor({getIdentity, getPresentation}) {
    this.getIdentity = getIdentity;
    this.getPresentation = getPresentation;
    this.identity = null;
    this.sequence = 0;
    this.ticketSequence = 0;
    this.position = 0;
    this.commands = new WeakMap();
    this.receipts = new Map();
  }

  ensureIdentity() {
    const identity = this.getIdentity();
    if (identity !== this.identity) {
      this.identity = identity;
      this.position = ++this.sequence;
      this.commands = new WeakMap();
      this.receipts.clear();
    }
    return identity;
  }

  mutation({action, command}) {
    this.ensureIdentity();
    let positions = this.commands.get(command);
    if (action === "execute" || !positions) {
      positions = {before: this.position, after: ++this.sequence};
      this.commands.set(command, positions);
    }
    this.position = action === "undo" ? positions.before : positions.after;
  }

  capture() {
    const identity = this.ensureIdentity();
    return Object.freeze({identity, position: this.position, presentation: JSON.stringify(this.getPresentation()), order: ++this.ticketSequence});
  }

  snapshot() {
    this.ensureIdentity();
    return {identity: this.identity, position: this.position, commands: this.commands, receipts: new Map(this.receipts)};
  }

  restorePosition(snapshot) {
    if (!snapshot || snapshot.identity !== this.getIdentity()) return;
    this.identity = snapshot.identity;
    this.position = snapshot.position;
    this.commands = snapshot.commands;
    this.receipts = new Map(snapshot.receipts);
  }

  record(ticket, destination, detail = "") {
    this.ensureIdentity();
    if (!ticket?.identity || ticket.identity !== this.identity) return false;
    if ((this.receipts.get(destination)?.order || 0) > ticket.order) return false;
    this.receipts.delete(destination);
    this.receipts.set(destination, {...ticket, destination, detail, savedAt: new Date().toISOString()});
    return true;
  }

  getStatus() {
    const current = this.capture();
    const receipts = [...this.receipts.values()];
    const matching = receipts.filter(item => item.position === current.position && item.presentation === current.presentation);
    const latest = receipts.at(-1) || null;
    return {available: Boolean(current.identity), dirty: Boolean(current.identity) && !matching.length, current, receipts, matching, latest};
  }
}

export function installMapSaveStatus(documentRef, tracker) {
  const view = documentRef.defaultView;
  const labels = {browser: "已保存到浏览器", cloud: "已上传到云端", download: "下载已交给浏览器", imported: "已从存档读取"};
  const refresh = () => {
    const element = documentRef.getElementById("map-save-status");
    if (!element) return;
    const status = tracker.getStatus();
    const receipt = status.matching.at(-1) || status.latest;
    const message = !status.available ? "尚无地图" : `${status.dirty ? "有未保存修改" : "当前内容已有存档"}${receipt ? ` · ${labels[receipt.destination] || receipt.destination} ${new Date(receipt.savedAt).toLocaleTimeString()}${receipt.detail ? ` · ${receipt.detail}` : ""}` : ""}`;
    if (element.textContent !== message) element.textContent = message;
    element.dataset.dirty = String(status.dirty);
  };
  const onBeforeUnload = event => {
    if (!tracker.getStatus().dirty) return;
    event.preventDefault();
    event.returnValue = "";
  };
  const timer = view.setInterval(refresh, 750);
  view.addEventListener("beforeunload", onBeforeUnload);
  return {refresh, dispose() { view.clearInterval(timer); view.removeEventListener("beforeunload", onBeforeUnload); }};
}
