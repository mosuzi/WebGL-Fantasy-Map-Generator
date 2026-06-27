export class SelectionStore {
  constructor(onChange = () => {}, resolveObject = object => object) {
    this.onChange = onChange;
    this.resolveObject = resolveObject;
    this.selection = null;
    this.editingObject = null;
  }

  setSelection(selection) {
    const normalized = this.normalizeSelection(selection);
    const changed = !sameSelection(this.selection, normalized);
    this.selection = normalized;
    if (changed && !sameObject(this.editingObject, normalized?.object)) {
      this.editingObject = null;
    }
    this.emit();
  }

  clear() {
    this.selection = null;
    this.editingObject = null;
    this.emit();
  }

  startEditing(object) {
    this.editingObject = object ? this.resolveObject(object) : null;
    this.emit();
  }

  stopEditing() {
    this.editingObject = null;
    this.emit();
  }

  getSnapshot() {
    return {
      selection: this.selection,
      editingObject: this.editingObject
    };
  }

  emit() {
    this.onChange(this.getSnapshot());
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
