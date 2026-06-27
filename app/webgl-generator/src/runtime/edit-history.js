export class EditHistory {
  constructor({limit = 100} = {}) {
    this.limit = limit;
    this.undoStack = [];
    this.redoStack = [];
    this.lastLabel = "none";
  }

  execute(command, context) {
    validateCommand(command);
    command.apply(context);
    this.undoStack.push(command);
    if (this.undoStack.length > this.limit) this.undoStack.shift();
    this.redoStack = [];
    this.lastLabel = command.label;
    return command;
  }

  undo(context) {
    const command = this.undoStack.pop();
    if (!command) return null;
    command.revert(context);
    this.redoStack.push(command);
    this.lastLabel = `撤销 ${command.label}`;
    return command;
  }

  redo(context) {
    const command = this.redoStack.pop();
    if (!command) return null;
    command.apply(context);
    this.undoStack.push(command);
    this.lastLabel = `重做 ${command.label}`;
    return command;
  }

  clear() {
    this.undoStack = [];
    this.redoStack = [];
    this.lastLabel = "none";
  }

  getStats() {
    return {
      undo: this.undoStack.length,
      redo: this.redoStack.length,
      lastLabel: this.lastLabel
    };
  }
}

function validateCommand(command) {
  if (!command || typeof command.apply !== "function" || typeof command.revert !== "function") {
    throw new Error("编辑命令必须提供 apply 和 revert");
  }
  if (!command.label) command.label = "未命名编辑";
}
