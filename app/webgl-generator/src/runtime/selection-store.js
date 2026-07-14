export class SelectionStore {
  constructor(onChange = () => {}, resolveObject = object => object) {
    this.onChange = onChange;
    this.resolveObject = resolveObject;
    this.selection = null;
    this.editingObject = null;
    this.batchDepth = 0;
    this.pendingEmit = false;
    this.pendingMetadata = null;
  }

  setSelection(selection, metadata = null) {
    const normalized = this.normalizeSelection(selection);
    const selectionChanged = !sameSelection(this.selection, normalized);
    const editingChanged = selectionChanged && !sameObject(this.editingObject, normalized?.object) && Boolean(this.editingObject);
    this.selection = normalized;
    if (editingChanged) {
      this.editingObject = null;
    }
    this.emit(metadata);
  }

  clear() {
    this.selection = null;
    this.editingObject = null;
    this.emit();
  }

  startEditing(object, {select = false} = {}) {
    const resolved = object ? this.resolveObject(object) : null;
    const selection = select ? (resolved ? {object: resolved} : null) : this.selection;
    this.selection = selection;
    this.editingObject = resolved;
    this.emit();
  }

  stopEditing() {
    this.editingObject = null;
    this.emit();
  }

  batch(callback) {
    this.batchDepth++;
    try {
      return callback();
    } finally {
      this.batchDepth--;
      if (this.batchDepth === 0 && this.pendingEmit) {
        this.pendingEmit = false;
        const metadata = this.pendingMetadata;
        this.pendingMetadata = null;
        this.onChange(this.getSnapshot(), metadata);
      }
    }
  }

  getSnapshot() {
    return {
      selection: this.selection,
      editingObject: this.editingObject
    };
  }

  emit(metadata = null) {
    if (this.batchDepth > 0) {
      this.pendingEmit = true;
      if (metadata) this.pendingMetadata = {...this.pendingMetadata, ...metadata};
      return;
    }
    this.onChange(this.getSnapshot(), metadata);
  }

  refresh() {
    this.selection = this.normalizeSelection(this.selection);
    this.editingObject = this.editingObject ? this.resolveObject(this.editingObject) : null;
    this.emit();
  }

  normalizeSelection(selection) {
    if (!selection?.object) return null;
    const object = this.resolveObject(selection.object);
    return object ? {...selection, object} : null;
  }
}

export function sameObject(a, b) {
  return Boolean(a && b && a.kind === b.kind && a.id === b.id);
}

function sameSelection(a, b) {
  if (!a && !b) return true;
  return sameObject(a?.object, b?.object);
}
