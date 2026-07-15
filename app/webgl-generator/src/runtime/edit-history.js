import {normalizeAffectedLimit, summarizeAffectedTargets} from "./edit-command-effects.js";

export class EditHistory {
  constructor({limit = 100} = {}) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.commandAffected = new WeakMap();
    this.lastLabel = "none";
    this.lastDomain = "none";
    this.lastAffected = [];
  }

  execute(command, context) {
    validateEditCommandContract(command);
    command.apply(context);
    this.undoStack.push(command);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.lastLabel = command.label;
    this.lastDomain = command.domain || "none";
    this.lastAffected = this.captureCommandAffected(command);
    return command;
  }

  undo(context) {
    const command = this.undoStack.pop();
    if (!command) return null;
    command.revert(context);
    this.redoStack.push(command);
    this.lastLabel = `撤销 ${command.label}`;
    this.lastDomain = command.domain || "none";
    this.lastAffected = this.captureCommandAffected(command);
    return command;
  }

  redo(context) {
    const command = this.redoStack.pop();
    if (!command) return null;
    command.apply(context);
    this.undoStack.push(command);
    this.lastLabel = `重做 ${command.label}`;
    this.lastDomain = command.domain || "none";
    this.lastAffected = this.captureCommandAffected(command);
    return command;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.commandAffected = new WeakMap();
    this.lastLabel = "none";
    this.lastDomain = "none";
    this.lastAffected = [];
  }

  createSnapshot() {
    return {
      undoStack: [...this.undoStack],
      redoStack: [...this.redoStack],
      commandAffected: this.commandAffected,
      lastLabel: this.lastLabel,
      lastDomain: this.lastDomain,
      lastAffected: cloneAffectedTargets(this.lastAffected)
    };
  }

  restoreSnapshot(snapshot) {
    if (!snapshot || typeof snapshot !== "object") throw new Error("编辑历史快照无效");
    this.undoStack = [...(snapshot.undoStack || [])];
    this.redoStack = [...(snapshot.redoStack || [])];
    this.commandAffected = snapshot.commandAffected instanceof WeakMap ? snapshot.commandAffected : new WeakMap();
    this.lastLabel = String(snapshot.lastLabel || "none");
    this.lastDomain = String(snapshot.lastDomain || "none");
    this.lastAffected = cloneAffectedTargets(snapshot.lastAffected);
  }

  captureCommandAffected(command) {
    const cached = this.commandAffected.get(command);
    if (cached) return cloneAffectedTargets(cached);
    const affected = cloneAffectedTargets(command.effects?.affected);
    this.commandAffected.set(command, affected);
    return cloneAffectedTargets(affected);
  }

  getStats(options = {}) {
    const affectedLimit = normalizeAffectedLimit(options, {label: "EditHistory.getStats"});
    const affectedSummary = summarizeAffectedTargets(this.lastAffected, {limit: affectedLimit});
    return {
      undo: this.undoStack.length,
      redo: this.redoStack.length,
      lastLabel: this.lastLabel,
      lastDomain: this.lastDomain,
      affectedLimit,
      lastAffected: affectedSummary.preview,
      lastAffectedCount: affectedSummary.count,
      lastAffectedKinds: affectedSummary.kinds,
      lastAffectedSummary: affectedSummary.text || "none",
      lastAffectedTruncated: affectedSummary.count > affectedSummary.preview.length
    };
  }
}

function cloneAffectedTargets(affected) {
  if (!Array.isArray(affected)) return [];
  return affected.map(target => ({kind: target.kind, id: target.id}));
}

export function validateEditCommandContract(command) {
  if (!command || typeof command.apply !== "function" || typeof command.revert !== "function") {
    throw new Error("编辑命令必须提供 apply 和 revert");
  }
  if (command.label != null && typeof command.label !== "string") {
    throw new Error("编辑命令 label 必须是字符串");
  }
  if (!command.label) command.label = "未命名编辑";
  if (command.domain != null && (typeof command.domain !== "string" || !command.domain.trim())) {
    throw new Error("编辑命令 domain 必须是非空字符串");
  }
  if (command.isNoop != null && typeof command.isNoop !== "function") {
    throw new Error("编辑命令 isNoop 必须是函数");
  }
  if (command.getResult != null && typeof command.getResult !== "function") {
    throw new Error("编辑命令 getResult 必须是函数");
  }
  if (command.effects != null) validateEditCommandEffects(command.effects);
  return command;
}

export function applyNestedEditCommand(command, context) {
  validateEditCommandContract(command);
  command.apply(context);
  return command;
}

export function revertNestedEditCommand(command, context) {
  validateEditCommandContract(command);
  command.revert(context);
  return command;
}

function validateEditCommandEffects(effects) {
  if (!effects || typeof effects !== "object" || Array.isArray(effects)) {
    throw new Error("编辑命令 effects 必须是对象");
  }
  if (effects.render != null && !["draw", "none"].includes(effects.render)) {
    throw new Error("编辑命令 effects.render 必须是 draw 或 none");
  }
  if (effects.selection != null && !["refresh", "none"].includes(effects.selection)) {
    throw new Error("编辑命令 effects.selection 必须是 refresh 或 none");
  }
  if (effects.runtimeStats != null && typeof effects.runtimeStats !== "boolean") {
    throw new Error("编辑命令 effects.runtimeStats 必须是布尔值");
  }
  if (effects.pickPanel != null && typeof effects.pickPanel !== "boolean") {
    throw new Error("编辑命令 effects.pickPanel 必须是布尔值");
  }
  if (effects.derived != null) validateStringArray(effects.derived, "effects.derived");
  if (effects.affected != null) validateAffectedTargets(effects.affected);
}

function validateStringArray(value, label) {
  if (!Array.isArray(value) || value.some(item => typeof item !== "string" || !item.trim())) {
    throw new Error(`编辑命令 ${label} 必须是非空字符串数组`);
  }
}

function validateAffectedTargets(affected) {
  if (!Array.isArray(affected)) {
    throw new Error("编辑命令 effects.affected 必须是数组");
  }
  for (const target of affected) {
    if (!target || typeof target !== "object" || Array.isArray(target)) {
      throw new Error("编辑命令 effects.affected 每项必须是对象");
    }
    if (typeof target.kind !== "string" || !target.kind.trim()) {
      throw new Error("编辑命令 effects.affected 每项必须提供 kind");
    }
    if (!["string", "number"].includes(typeof target.id)) {
      throw new Error("编辑命令 effects.affected 每项必须提供字符串或数字 id");
    }
  }
}
