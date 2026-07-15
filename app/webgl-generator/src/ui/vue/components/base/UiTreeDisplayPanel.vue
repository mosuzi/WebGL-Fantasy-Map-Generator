<template>
  <Teleport to="body">
    <section v-if="open" ref="panel" class="ui-tree-display-panel" tabindex="-1" role="dialog" :aria-label="title" :style="panelStyle">
      <header class="ui-tree-display-header" @pointerdown="startPanelDrag">
        <strong>{{ title }}</strong>
        <span>{{ nodes.length }} 节点</span>
        <ElButton class="ui-tree-display-close" text circle :icon="Close" aria-label="关闭树状总览" @pointerdown.stop @click="emit('update:open', false)" />
      </header>

      <div ref="viewport" class="ui-tree-display-viewport">
        <div class="ui-tree-display-canvas" :style="{width: `${layout.width}px`, height: `${layout.height}px`}">
          <svg class="ui-tree-display-lines" :viewBox="`0 0 ${layout.width} ${layout.height}`" aria-hidden="true">
            <path
              v-for="line in layout.lines"
              :key="`${line.from}-${line.to}`"
              class="ui-tree-display-line"
              :d="line.path"
            />
          </svg>

          <ElButton
            v-for="node in layout.nodes"
            :key="node.id"
            class="ui-tree-display-node"
            :class="{active: sameObjectId(node.id, selectedId)}"
            :style="{left: `${node.x}px`, top: `${node.y}px`}"
            @click="emit('select', node.raw)"
          >
            <span class="ui-tree-node-name">{{ node.name }}</span>
            <span class="ui-tree-node-meta">{{ node.childCount ? `${node.childCount} 子` : "叶" }}</span>
          </ElButton>
        </div>
      </div>
    </section>
  </Teleport>
</template>

<script setup>
import {computed, nextTick, onBeforeUnmount, ref, watch} from "vue";
import {Close} from "@element-plus/icons-vue";
import {useDraggableFloatingPanel} from "../../composables/use-draggable-floating-panel.js";
import {objectIdKey, sameObjectId} from "../../../object-id.js";
import {createSelectionCenterController, selectionCenterAnchor, selectionOrderSignature} from "../../../components/selection-scroll.js";
import {useManagedOverlay} from "../../composables/use-managed-overlay.js";

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
const viewport = ref(null);
const layout = computed(() => buildTreeLayout(props.nodes));
const selectedNodePosition = computed(() => layout.value.nodes.findIndex(node => sameObjectId(node.id, props.selectedId)));
const nodeOrderSignature = computed(() => selectionOrderSignature(layout.value.nodes.map(node => objectIdKey(node.id))));
const selectedScrollAnchor = computed(() => props.open ? selectionCenterAnchor(
  props.selectedId === null || props.selectedId === undefined ? null : objectIdKey(props.selectedId),
  selectedNodePosition.value,
  nodeOrderSignature.value
) : null);
const selectedCenterController = createSelectionCenterController({
  getScroller: () => viewport.value,
  getTarget: () => viewport.value?.querySelector(".ui-tree-display-node.active")
});
const {
  panelStyle,
  position,
  setPanelPosition,
  constrainPanel,
  startDrag: startPanelDrag,
  stopDrag
} = useDraggableFloatingPanel(panel, {
  defaultWidth: 760,
  defaultHeight: 650,
  margin: 8
});
useManagedOverlay(panel, () => props.open, {
  id: "tree-display",
  onClose: () => emit("update:open", false)
});

watch(() => props.open, open => {
  if (!open) {
    stopDrag();
    return;
  }
  nextTick(() => {
    if (!position.value) setPanelPosition(defaultPanelPosition(), {save: false});
    else constrainPanel();
  });
});

watch(selectedScrollAnchor, () => {
  if (selectedNodePosition.value < 0) return;
  nextTick(() => selectedCenterController.request());
}, {flush: "post", immediate: true});

onBeforeUnmount(() => selectedCenterController.cancel());

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

function defaultPanelPosition() {
  const width = Math.min(760, window.innerWidth - 48);
  return {
    x: Math.max(8, window.innerWidth - width - 24),
    y: 64
  };
}

</script>
