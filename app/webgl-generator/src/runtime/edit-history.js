export class EditHistory {
  constructor({limit = 100} = {}) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.lastLabel = "none";
    this.lastDomain = "none";
  }

  execute(command, context) {
    validateEditCommandContract(command);
    command.apply(context);
    this.undoStack.push(command);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.lastLabel = command.label;
    this.lastDomain = command.domain || "none";
    return command;
  }

  undo(context) {
    const command = this.undoStack.pop();
    if (!command) return null;
    command.revert(context);
    this.redoStack.push(command);
    this.lastLabel = `撤销 ${command.label}`;
    this.lastDomain = command.domain || "none";
    return command;
  }

  redo(context) {
    const command = this.redoStack.pop();
    if (!command) return null;
    command.apply(context);
    this.undoStack.push(command);
    this.lastLabel = `重做 ${command.label}`;
    this.lastDomain = command.domain || "none";
    return command;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.lastLabel = "none";
    this.lastDomain = "none";
  }

  getStats() {
    return {
      undo: this.undoStack.length,
      redo: this.redoStack.length,
      lastLabel: this.lastLabel,
      lastDomain: this.lastDomain
    };
  }
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
