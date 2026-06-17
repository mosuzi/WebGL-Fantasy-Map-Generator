import {getDemoDisplayName, getDemoNameStyle, getChineseNameStats} from "./chinese-names.js";

const BURG_LABEL_LIMIT = 700;

export class MapOverlayManager {
  constructor(container, renderer) {
    this.container = container;
    this.renderer = renderer;
    this.visible = {
      burgLabels: true,
      stateLabels: true,
      emblems: false
    };
    this.stats = createEmptyStats();
    this.groups = {
      burgLabels: createGroup("overlay-burg-labels"),
      stateLabels: createGroup("overlay-state-labels"),
      emblems: createGroup("overlay-emblems")
    };
    container.replaceChildren(this.groups.burgLabels, this.groups.stateLabels, this.groups.emblems);
    renderer.addViewListener(() => this.sync());
  }

  loadSnapshot(snapshot) {
    this.snapshot = snapshot;
    this.burgLabelItems = selectBurgLabels(snapshot);
    this.stateLabelItems = selectStateLabels(snapshot);
    this.emblemItems = selectEmblems(snapshot);
    this.render();
    this.sync();
  }

  setVisible(layerId, visible) {
    if (!(layerId in this.visible)) throw new Error(`未知 overlay: ${layerId}`);
    this.visible[layerId] = visible;
    this.sync();
  }

  getStats() {
    return {
      strategy: "HTML overlay 跟随 WebGL camera；纹章系统暂不启用，只保留后续接入占位数据。",
      ...this.stats,
      visible: {...this.visible}
    };
  }

  render() {
    this.groups.burgLabels.replaceChildren(
      ...this.burgLabelItems.map(item => {
        const label = document.createElement("span");
        label.className = `map-label burg-label${item.capital ? " capital" : ""}${item.port ? " port" : ""}`;
        label.dataset.x = String(item.x);
        label.dataset.y = String(item.y);
        label.dataset.major = item.major ? "1" : "0";
        label.dataset.nameStyle = getDemoNameStyle(item, "burg");
        label.textContent = getDemoDisplayName(item, "burg");
        if (label.textContent !== item.name) label.title = item.name;
        return label;
      })
    );

    this.groups.stateLabels.replaceChildren(
      ...this.stateLabelItems.map(item => {
        const label = document.createElement("span");
        label.className = "map-label state-label";
        label.dataset.x = String(item.x);
        label.dataset.y = String(item.y);
        label.dataset.nameStyle = getDemoNameStyle(item, "state");
        label.textContent = getDemoDisplayName(item, "state");
        if (label.textContent !== item.name) label.title = item.fullName || item.name;
        label.style.setProperty("--state-color", item.color || "#d7dce2");
        return label;
      })
    );

    this.groups.emblems.replaceChildren(
      ...this.emblemItems.map(item => {
        const badge = document.createElement("span");
        badge.className = `emblem-badge ${item.type}`;
        badge.dataset.x = String(item.x);
        badge.dataset.y = String(item.y);
        badge.textContent = getEmblemText(item);
        badge.style.setProperty("--emblem-color", item.color || "#d7dce2");
        badge.title = item.hasCoa ? `${item.name} COA 数据占位` : `${item.name} 纹章占位`;
        return badge;
      })
    );
  }

  sync() {
    if (!this.snapshot) return;

    this.groups.burgLabels.hidden = !this.visible.burgLabels;
    this.groups.stateLabels.hidden = !this.visible.stateLabels;
    this.groups.emblems.hidden = !this.visible.emblems;

    const transform = getScreenTransform(this.renderer.canvas, this.renderer.camera);
    const scale = this.renderer.camera.scale;
    const counters = {
      burgLabelsVisible: this.visible.burgLabels ? positionElements(this.groups.burgLabels.children, transform, scale) : 0,
      stateLabelsVisible: this.visible.stateLabels ? positionElements(this.groups.stateLabels.children, transform, scale) : 0,
      emblemsVisible: this.visible.emblems ? positionElements(this.groups.emblems.children, transform, scale) : 0
    };

    const chineseNames = getChineseNameStats(this.snapshot);
    this.stats = {
      burgLabelsTotal: getBurgLabelSource(this.snapshot).length,
      burgLabelsRendered: this.burgLabelItems.length,
      stateLabelsTotal: getStateLabelSource(this.snapshot).length,
      stateLabelsRendered: this.stateLabelItems.length,
      emblemsTotal: getEmblemSource(this.snapshot).length,
      emblemsRendered: this.emblemItems.length,
      chineseStateLabels: chineseNames.states,
      chineseBurgLabels: chineseNames.burgs,
      ...counters
    };
  }
}

function createGroup(className) {
  const group = document.createElement("div");
  group.className = `overlay-group ${className}`;
  return group;
}

function selectBurgLabels(snapshot) {
  return getBurgLabelSource(snapshot)
    .filter(item => item.name && Number.isFinite(item.x) && Number.isFinite(item.y))
    .sort((a, b) => getBurgPriority(b) - getBurgPriority(a))
    .slice(0, BURG_LABEL_LIMIT)
    .map(item => ({
      ...item,
      major: Boolean(item.capital || item.port || item.population >= 10)
    }));
}

function selectStateLabels(snapshot) {
  return getStateLabelSource(snapshot).filter(item => item.name && item.i && Number.isFinite(item.x) && Number.isFinite(item.y));
}

function selectEmblems(snapshot) {
  return getEmblemSource(snapshot).filter(item => item.name && Number.isFinite(item.x) && Number.isFinite(item.y));
}

function getBurgLabelSource(snapshot) {
  if (snapshot.labels?.burgs?.length) return snapshot.labels.burgs;
  return (snapshot.burgs || []).filter(Boolean);
}

function getStateLabelSource(snapshot) {
  if (snapshot.labels?.states?.length) return snapshot.labels.states;

  const burgsByState = new Map((snapshot.burgs || []).filter(Boolean).map(burg => [burg.state, burg]));
  return (snapshot.states || [])
    .filter(state => state?.i && !state.removed)
    .map(state => {
      const burg = burgsByState.get(state.i);
      return {
        i: state.i,
        name: state.name,
        x: state.pole?.[0] ?? burg?.x ?? 0,
        y: state.pole?.[1] ?? burg?.y ?? 0,
        color: state.color
      };
    });
}

function getEmblemSource(snapshot) {
  const stateEmblems = snapshot.emblems?.states || [];
  const burgEmblems = snapshot.emblems?.burgs || [];
  if (stateEmblems.length || burgEmblems.length) return [...stateEmblems, ...burgEmblems];

  const capitalBadges = (snapshot.burgs || [])
    .filter(burg => burg?.capital && !burg.removed)
    .map(burg => ({
      type: "burg",
      i: burg.i,
      name: burg.name,
      x: burg.x,
      y: burg.y,
      color: "#f0c35b",
      hasCoa: Boolean(burg.coa)
    }));

  return capitalBadges;
}

function getBurgPriority(item) {
  return (item.capital ? 100000 : 0) + (item.port ? 10000 : 0) + (item.population || 0);
}

function getScreenTransform(canvas, camera) {
  const rect = canvas.getBoundingClientRect();
  const scaleX = rect.width / canvas.width;
  const scaleY = rect.height / canvas.height;
  return {
    x: camera.x * scaleX,
    y: camera.y * scaleY,
    scaleX: camera.scale * scaleX,
    scaleY: camera.scale * scaleY,
    width: rect.width,
    height: rect.height
  };
}

function positionElements(elements, transform, cameraScale) {
  let visible = 0;
  for (const element of elements) {
    const worldX = Number(element.dataset.x);
    const worldY = Number(element.dataset.y);
    const screenX = worldX * transform.scaleX + transform.x;
    const screenY = worldY * transform.scaleY + transform.y;
    const inView = screenX > -80 && screenX < transform.width + 80 && screenY > -40 && screenY < transform.height + 40;
    const major = element.dataset.major === "1";
    const scaleVisible = !element.classList.contains("burg-label") || major || cameraScale > 0.72;
    const shouldShow = inView && scaleVisible;

    element.style.transform = `translate3d(${screenX}px, ${screenY}px, 0) ${getAnchorTransform(element)}`;
    element.hidden = !shouldShow;
    if (shouldShow) visible++;
  }
  return visible;
}

function getAnchorTransform(element) {
  if (element.classList.contains("burg-label")) return "translate(-50%, -110%)";
  return "translate(-50%, -50%)";
}

function getEmblemText(item) {
  const name = item.name || "?";
  return name.trim().slice(0, 1).toUpperCase();
}

function createEmptyStats() {
  return {
    burgLabelsTotal: 0,
    burgLabelsRendered: 0,
    burgLabelsVisible: 0,
    stateLabelsTotal: 0,
    stateLabelsRendered: 0,
    stateLabelsVisible: 0,
    chineseStateLabels: 0,
    chineseBurgLabels: 0,
    emblemsTotal: 0,
    emblemsRendered: 0,
    emblemsVisible: 0
  };
}
