<template>
  <Teleport to="body">
    <section v-if="open" ref="panel" class="ui-tree-display-panel" role="dialog" :aria-label="title" :style="panelStyle">
      <header class="ui-tree-display-header" @pointerdown="startDrag">
        <strong>{{ title }}</strong>
        <span>{{ nodes.length }} 节点</span>
        <button type="button" class="ui-tree-display-close" aria-label="关闭树状总览" @pointerdown.stop @click="emit('update:open', false)">×</button>
      </header>

      <div class="ui-tree-display-viewport">
        <div class="ui-tree-display-canvas" :style="{width: `${layout.width}px`, height: `${layout.height}px`}">
          <svg class="ui-tree-display-lines" :viewBox="`0 0 ${layout.width} ${layout.height}`" aria-hidden="true">
            <path
              v-for="line in layout.lines"
              :key="`${line.from}-${line.to}`"
              class="ui-tree-display-line"
              :d="line.path"
            />
          </svg>

          <button
            v-for="node in layout.nodes"
            :key="node.id"
            type="button"
            class="ui-tree-display-node"
            :class="{active: node.id === selectedId}"
            :style="{left: `${node.x}px`, top: `${node.y}px`}"
            @click="emit('select', node.raw)"
          >
            <span class="ui-tree-node-name">{{ node.name }}</span>
            <span class="ui-tree-node-meta">{{ node.childCount ? `${node.childCount} 子` : "叶" }}</span>
          </button>
        </div>
      </div>
    </section>
  </Teleport>
</template>

<script setup>
import {computed, nextTick, onBeforeUnmount, ref, watch} from "vue";

defineOptions({
  name: "UiTreeDisplayPanel"
});

const props = defineProps({
  open: {
    type: Boolean,
    default: false
  },
  title: {
    type: String,
    required: true
  },
  nodes: {
    type: Array,
    default: () => []
  },
  selectedId: {
    type: [Number, String, null],
    default: null
  }
});

const emit = defineEmits(["update:open", "select"]);
const panel = ref(null);
const position = ref(null);
let dragState = null;
const layout = computed(() => buildTreeLayout(props.nodes));
const panelStyle = computed(() => position.value
  ? {left: `${position.value.x}px`, top: `${position.value.y}px`}
  : {});

watch(() => props.open, open => {
  if (!open) {
    stopDrag();
    return;
  }
  nextTick(() => {
    if (!position.value) position.value = defaultPanelPosition();
  });
});

onBeforeUnmount(() => {
  stopDrag();
});

function buildTreeLayout(nodes) {
  const rowHeight = 46;
  const columnWidth = 172;
  const nodeWidth = 148;
  const nodeHeight = 32;
  const ordered = nodes.map((node, index) => {
    const depth = Math.max(0, Number(node.depth) || 0);
    return {
      id: node.id,
      parentId: Number(node.parentId) || 0,
      depth,
      name: node.name || `#${node.id}`,
      childCount: Number(node.childCount) || 0,
      x: 18 + depth * columnWidth,
      y: 18 + index * rowHeight,
      raw: node
    };
  });
  const byId = new Map(ordered.map(node => [node.id, node]));
  const lines = ordered
    .filter(node => byId.has(node.parentId))
    .map(node => {
      const parent = byId.get(node.parentId);
      const startX = parent.x + nodeWidth;
      const startY = parent.y + nodeHeight / 2;
      const endX = node.x;
      const endY = node.y + nodeHeight / 2;
      const midX = startX + Math.max(18, (endX - startX) * 0.46);
      return {
        from: parent.id,
        to: node.id,
        path: `M ${startX} ${startY} C ${midX} ${startY}, ${midX} ${endY}, ${endX} ${endY}`
      };
    });
  const maxDepth = ordered.reduce((max, node) => Math.max(max, node.depth), 0);
  return {
    nodes: ordered,
    lines,
    width: Math.max(420, 36 + (maxDepth + 1) * columnWidth + nodeWidth),
    height: Math.max(180, 36 + ordered.length * rowHeight)
  };
}

function startDrag(event) {
  if (event.button !== 0) return;
  const rect = panel.value?.getBoundingClientRect();
  if (!rect) return;
  dragState = {
    pointerId: event.pointerId,
    offsetX: event.clientX - rect.left,
    offsetY: event.clientY - rect.top
  };
  event.currentTarget.setPointerCapture?.(event.pointerId);
  window.addEventListener("pointermove", dragPanel);
  window.addEventListener("pointerup", stopDrag);
}

function dragPanel(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const rect = panel.value?.getBoundingClientRect();
  const width = rect?.width || 760;
  const height = rect?.height || 650;
  const margin = 8;
  position.value = {
    x: clamp(event.clientX - dragState.offsetX, margin, window.innerWidth - width - margin),
    y: clamp(event.clientY - dragState.offsetY, margin, window.innerHeight - height - margin)
  };
}

function stopDrag() {
  dragState = null;
  window.removeEventListener("pointermove", dragPanel);
  window.removeEventListener("pointerup", stopDrag);
}

function defaultPanelPosition() {
  const width = Math.min(760, window.innerWidth - 48);
  return {
    x: Math.max(8, window.innerWidth - width - 24),
    y: 64
  };
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(Math.max(min, max), value));
}
</script>
