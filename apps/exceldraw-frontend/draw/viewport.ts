// Screen-space <-> world-space conversion for the infinite canvas.
//
// Every shape's x/y/width/height/endX/endY is stored in WORLD coordinates — unaffected by
// pan or zoom, and exactly what gets persisted/broadcast to other clients (each client's
// pan/zoom is purely local UI state, never synced). The canvas's own 2D transform maps
// world space to screen space at draw time: screenX = worldX * zoom + panX.
//
// Anything that reads a raw mouse/pointer event (event.clientX/clientY) is in SCREEN space
// and must be converted to world space with toWorld() before it touches shape geometry —
// that's every mousedown/mousemove/mouseup/dblclick handler in eventHandlers.ts. Anything
// positioning a real DOM element on top of the canvas (the text tool's <textarea>) needs
// the opposite conversion, toScreen(), since position:fixed operates in screen space.

export interface Viewport {
  panX: number;
  panY: number;
  zoom: number;
}

export function toWorld(clientX: number, clientY: number, canvas: HTMLCanvasElement, viewport: Viewport) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: (clientX - rect.left - viewport.panX) / viewport.zoom,
    y: (clientY - rect.top - viewport.panY) / viewport.zoom,
  };
}

export function toScreen(worldX: number, worldY: number, canvas: HTMLCanvasElement, viewport: Viewport) {
  const rect = canvas.getBoundingClientRect();
  return {
    x: worldX * viewport.zoom + viewport.panX + rect.left,
    y: worldY * viewport.zoom + viewport.panY + rect.top,
  };
}
