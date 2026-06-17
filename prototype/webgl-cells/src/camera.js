import {clamp} from "./utils.js";

export class MapCamera {
  constructor(canvas, onChange) {
    this.canvas = canvas;
    this.onChange = onChange;
    this.state = {scale: 1, x: 0, y: 0};
  }

  setCamera(camera) {
    this.state.scale = camera.scale ?? this.state.scale;
    this.state.x = camera.x ?? this.state.x;
    this.state.y = camera.y ?? this.state.y;
    this.onChange?.();
  }

  fitToView(metadata) {
    if (!metadata) return;
    const {graphWidth, graphHeight} = metadata;
    const scale = Math.min(this.canvas.width / graphWidth, this.canvas.height / graphHeight) * 0.94;
    this.state.scale = scale;
    this.state.x = (this.canvas.width - graphWidth * scale) / 2;
    this.state.y = (this.canvas.height - graphHeight * scale) / 2;
    this.onChange?.();
  }

  resize(metadata) {
    const rect = this.canvas.getBoundingClientRect();
    const pixelRatio = getPixelRatio();
    const width = Math.max(1, Math.round(rect.width * pixelRatio));
    const height = Math.max(1, Math.round(rect.height * pixelRatio));
    if (this.canvas.width !== width || this.canvas.height !== height) {
      this.canvas.width = width;
      this.canvas.height = height;
      if (metadata) this.fitToView(metadata);
      else this.onChange?.();
      return;
    }
    this.onChange?.();
  }

  pan(deltaX, deltaY) {
    const pixelRatio = getPixelRatio();
    this.state.x += deltaX * pixelRatio;
    this.state.y += deltaY * pixelRatio;
    this.onChange?.();
  }

  zoomAt(clientX, clientY, factor) {
    const world = this.clientToWorld(clientX, clientY);
    const screen = this.clientToCanvas(clientX, clientY);

    this.state.scale = clamp(this.state.scale * factor, 0.15, 32);
    this.state.x = screen.x - world.x * this.state.scale;
    this.state.y = screen.y - world.y * this.state.scale;
    this.onChange?.();
  }

  clientToWorld(clientX, clientY) {
    const screen = this.clientToCanvas(clientX, clientY);
    return {
      x: (screen.x - this.state.x) / this.state.scale,
      y: (screen.y - this.state.y) / this.state.scale
    };
  }

  screenToWorld(screenX, screenY) {
    return this.clientToWorld(screenX, screenY);
  }

  clientToCanvas(clientX, clientY) {
    const rect = this.canvas.getBoundingClientRect();
    const pixelRatio = getPixelRatio();
    return {
      x: (clientX - rect.left) * pixelRatio,
      y: (clientY - rect.top) * pixelRatio
    };
  }
}

function getPixelRatio() {
  return Math.min(window.devicePixelRatio || 1, 2);
}
