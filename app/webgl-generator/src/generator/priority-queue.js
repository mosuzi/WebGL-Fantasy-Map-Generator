export class MinPriorityQueue {
  constructor() {
    this.items = [];
  }

  get length() {
    return this.items.length;
  }

  push(value, priority) {
    const item = {value, priority};
    this.items.push(item);
    this.bubbleUp(this.items.length - 1);
  }

  pop() {
    const root = this.items[0];
    const tail = this.items.pop();
    if (this.items.length && tail) {
      this.items[0] = tail;
      this.sinkDown(0);
    }
    return root.value;
  }

  bubbleUp(index) {
    const item = this.items[index];
    while (index > 0) {
      const parentIndex = Math.floor((index - 1) / 2);
      const parent = this.items[parentIndex];
      if (item.priority >= parent.priority) break;
      this.items[parentIndex] = item;
      this.items[index] = parent;
      index = parentIndex;
    }
  }

  sinkDown(index) {
    const length = this.items.length;
    const item = this.items[index];

    while (true) {
      const leftIndex = index * 2 + 1;
      const rightIndex = leftIndex + 1;
      let swapIndex = -1;

      if (leftIndex < length && this.items[leftIndex].priority < item.priority) swapIndex = leftIndex;
      if (rightIndex < length) {
        const comparison = swapIndex === -1 ? item.priority : this.items[swapIndex].priority;
        if (this.items[rightIndex].priority < comparison) swapIndex = rightIndex;
      }
      if (swapIndex === -1) break;

      this.items[index] = this.items[swapIndex];
      this.items[swapIndex] = item;
      index = swapIndex;
    }
  }
}
