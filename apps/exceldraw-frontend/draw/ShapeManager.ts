import { useCanvasStore } from "../store/canvasStore";
import { Shape } from "@repo/shared";

export type HandleType = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "start" | "end" | "body" | null;

const HANDLE_SIZE = 8;

// Single source of truth for the text tool's font — drawShape (rendering) and
// measureTextWidth (hit-testing for select/edit/delete) must always agree on this,
// or clicks on text land outside the box that's actually drawn.
export const TEXT_FONT = "24px sans-serif";

export function measureTextWidth(ctx: CanvasRenderingContext2D, text: string): number {
  ctx.save();
  ctx.font = TEXT_FONT;
  const width = ctx.measureText(text || "").width;
  ctx.restore();
  return width;
}

export function getCenter(shape: Shape) {
  if (shape.type === "line" || shape.type === "connector" || shape.type === "arrow") {
    return { x: (shape.x + (shape.endX ?? shape.x)) / 2, y: (shape.y + (shape.endY ?? shape.y)) / 2 };
  }
  return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
}

// Bounding box for any shape (normalized)
export function getBoundingBox(shape: Shape) {
  if (shape.type === "line" || shape.type === "connector" || shape.type === "arrow") {
    const minX = Math.min(shape.x, shape.endX ?? shape.x);
    const maxX = Math.max(shape.x, shape.endX ?? shape.x);
    const minY = Math.min(shape.y, shape.endY ?? shape.y);
    const maxY = Math.max(shape.y, shape.endY ?? shape.y);
    return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
  }
  const minX = Math.min(shape.x, shape.x + shape.width);
  const maxX = Math.max(shape.x, shape.x + shape.width);
  const minY = Math.min(shape.y, shape.y + shape.height);
  const maxY = Math.max(shape.y, shape.y + shape.height);
  return { minX, minY, maxX, maxY, w: maxX - minX, h: maxY - minY };
}

// Check if x,y hits a specific resize handle. x/y are WORLD coordinates (already
// converted from the mouse event), but HANDLE_SIZE is a constant on-screen pixel size —
// handles should stay just as easy to grab whether you're zoomed in or out. Dividing by
// zoom converts that constant screen tolerance into the equivalent world-space tolerance.
export function hitTestHandle(x: number, y: number, shape: Shape, zoom: number = 1): HandleType {
  const isLine = shape.type === "line" || shape.type === "connector" || shape.type === "arrow";
  const hs = HANDLE_SIZE / zoom;

  if (isLine) {
    const allShapes = useCanvasStore.getState().shapes;
    const { start: startPt, end: endPt } = resolveConnectorEndpoints(shape, allShapes);

    if (Math.abs(x - startPt.x) <= hs && Math.abs(y - startPt.y) <= hs) return "start";
    if (Math.abs(x - endPt.x) <= hs && Math.abs(y - endPt.y) <= hs) return "end";
    return null;
  }

  const { minX, minY, maxX, maxY } = getBoundingBox(shape);
  const midX = (minX + maxX) / 2;
  const midY = (minY + maxY) / 2;

  const hits = (hx: number, hy: number) => Math.abs(x - hx) <= hs && Math.abs(y - hy) <= hs;

  if (hits(minX, minY)) return "nw";
  if (hits(maxX, minY)) return "ne";
  if (hits(maxX, maxY)) return "se";
  if (hits(minX, maxY)) return "sw";
  if (hits(midX, minY)) return "n";
  if (hits(midX, maxY)) return "s";
  if (hits(minX, midY)) return "w";
  if (hits(maxX, midY)) return "e";

  return null;
}

// General body hit test. x/y are WORLD coordinates; a line/connector's click tolerance
// is a constant on-screen pixel width, so — same reasoning as hitTestHandle — it's
// divided by zoom to land on the equivalent world-space tolerance.
export function hitTest(x: number, y: number, shape: Shape, zoom: number = 1): boolean {
  if (shape.type === "line" || shape.type === "connector" || shape.type === "arrow") {
    const tolerance = 8 / zoom;
    const allShapes = useCanvasStore.getState().shapes;
    const { start, end } = resolveConnectorEndpoints(shape, allShapes);
    const l2 = Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2);
    if (l2 === 0) return Math.hypot(x - start.x, y - start.y) < tolerance;
    let t = ((x - start.x) * (end.x - start.x) + (y - start.y) * (end.y - start.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = start.x + t * (end.x - start.x);
    const projY = start.y + t * (end.y - start.y);
    return Math.hypot(x - projX, y - projY) < tolerance;
  }

  const { minX, minY, maxX, maxY } = getBoundingBox(shape);
  
  if (shape.type === "circle") {
    const rx = (maxX - minX) / 2;
    const ry = (maxY - minY) / 2;
    const cx = minX + rx;
    const cy = minY + ry;
    if (rx === 0 || ry === 0) return false;
    return Math.pow(x - cx, 2) / Math.pow(rx, 2) + Math.pow(y - cy, 2) / Math.pow(ry, 2) <= 1;
  }
  
  if (shape.type === "diamond") {
    const cx = minX + (maxX - minX) / 2;
    const cy = minY + (maxY - minY) / 2;
    // Diamond hit test: normalized Manhattan distance from center
    const dx = Math.abs(x - cx) / ((maxX - minX) / 2 || 1);
    const dy = Math.abs(y - cy) / ((maxY - minY) / 2 || 1);
    return dx + dy <= 1;
  }

  // Rect default
  return x >= minX && x <= maxX && y >= minY && y <= maxY;
}

// Every shape whose bounding box lies fully inside `container`'s — i.e. everything
// visually "nested" inside it. Used to make dragging/resizing a container carry its
// contents along, the way grouping works in most drawing tools. Containment is
// transitive for bounding boxes (if C is inside B and B is inside A, C is inside A
// too), so one flat pass against the container's own box is enough — no need to walk
// nesting levels one at a time. Connectors are excluded: they already track their
// source/target shapes live (see resolveConnectorEndpoints), so dragging them
// directly as well would double-move them.
export function getContainedShapeIds(container: Shape, shapes: Shape[]): string[] {
  if (container.type === "line" || container.type === "connector" || container.type === "arrow" || container.type === "text") {
    return [];
  }
  const { minX, minY, maxX, maxY } = getBoundingBox(container);
  const ids: string[] = [];
  for (const shape of shapes) {
    if (shape.id === container.id || shape.type === "connector") continue;
    const box = getBoundingBox(shape);
    if (box.minX >= minX && box.maxX <= maxX && box.minY >= minY && box.maxY <= maxY) {
      ids.push(shape.id);
    }
  }
  return ids;
}

// Maps a shape's geometry through the same linear transform that took a container from
// `origContainer`'s bounding box to `newContainer`'s — i.e. resizing the container scales
// (and repositions) everything nested inside it by the same proportion, anchored to the
// container's own top-left corner. Used when dragging a resize handle on a shape that has
// other shapes nested inside it (see getContainedShapeIds).
export function scaleContainedShape(
  origShape: Shape,
  origContainer: { minX: number; minY: number; w: number; h: number },
  newContainer: { minX: number; minY: number; w: number; h: number }
): Partial<Shape> {
  // A zero-width/height container (degenerate, e.g. a freshly-started shape) can't define
  // a scale ratio — fall back to 1 (pure translate) on that axis rather than dividing by zero.
  const scaleX = origContainer.w !== 0 ? newContainer.w / origContainer.w : 1;
  const scaleY = origContainer.h !== 0 ? newContainer.h / origContainer.h : 1;

  const mapPoint = (px: number, py: number) => ({
    x: newContainer.minX + (px - origContainer.minX) * scaleX,
    y: newContainer.minY + (py - origContainer.minY) * scaleY,
  });

  if (origShape.type === "line" || origShape.type === "connector" || origShape.type === "arrow") {
    const start = mapPoint(origShape.x, origShape.y);
    const end = mapPoint(origShape.endX ?? origShape.x, origShape.endY ?? origShape.y);
    return { x: start.x, y: start.y, endX: end.x, endY: end.y };
  }

  const topLeft = mapPoint(origShape.x, origShape.y);
  return {
    x: topLeft.x,
    y: topLeft.y,
    width: origShape.width * scaleX,
    height: origShape.height * scaleY,
  };
}

// Picks the best shape hit at (x, y) out of `shapes`. Our shapes are unfilled outlines,
// so hitTest treats a shape's whole bounding box as "inside it" — meaning a big
// container shape's box always fully overlaps anything nested inside it. Picking by
// z-order alone (last drawn wins) means that container permanently steals every click
// meant for something nested inside it, no matter how deep you click. Instead, among
// everything under the cursor, prefer the shape with the SMALLEST bounding-box area —
// the most specific target — and only fall back to z-order (highest sequenceNumber) to
// break ties between same-sized candidates.
//
// Text is the one exception to "smallest wins": a label sitting on a shape (the common
// "server" box + "server" text pattern) is *always* the smallest thing at that point, so
// smallest-area-wins would mean a label permanently steals every click meant for the
// shape it's labeling — you could never grab the box itself to drag it, only the text.
// So text is a fallback tier: it's only picked when nothing else (rect/circle/diamond/
// line/connector) also covers that point. handleDoubleClick's text-only filter is
// unaffected — with every candidate already text, this tier split is a no-op there.
export function findHitShape(x: number, y: number, shapes: Shape[], filter?: (shape: Shape) => boolean, zoom: number = 1): Shape | null {
  const pick = (candidates: Shape[]) => {
    let best: Shape | null = null;
    let bestArea = Infinity;
    let bestSeq = -Infinity;

    for (const shape of candidates) {
      if (filter && !filter(shape)) continue;
      if (!hitTest(x, y, shape, zoom)) continue;

      const { w, h } = getBoundingBox(shape);
      const area = Math.max(w, 0) * Math.max(h, 0);
      const seq = shape.sequenceNumber || 0;

      if (area < bestArea || (area === bestArea && seq > bestSeq)) {
        best = shape;
        bestArea = area;
        bestSeq = seq;
      }
    }

    return best;
  };

  const nonText = shapes.filter(s => s.type !== "text");
  const textOnly = shapes.filter(s => s.type === "text");
  return pick(nonText) ?? pick(textOnly);
}

// Resolves the actual drawn endpoints of a line/connector/arrow, always against the
// LIVE position of whatever it's attached to. Used by rendering, hit-testing, and
// handle-testing alike so a connector never goes stale relative to what's on screen.
export function resolveConnectorEndpoints(shape: Shape, allShapes: Shape[]): { start: { x: number, y: number }, end: { x: number, y: number } } {
  const sourceShape = shape.sourceId ? allShapes.find(s => s.id === shape.sourceId) : undefined;
  const targetShape = shape.targetId ? allShapes.find(s => s.id === shape.targetId) : undefined;

  let start = { x: shape.x, y: shape.y };
  let end = { x: shape.endX ?? shape.x, y: shape.endY ?? shape.y };

  // Use the connected shapes' live centers (not the connector's cached x/y) as the
  // aiming point, so the edge intersection is correct no matter how far either end moved.
  const sourceCenter = sourceShape ? getCenter(sourceShape) : start;
  const targetCenter = targetShape ? getCenter(targetShape) : end;

  if (sourceShape) start = getEdgeIntersection(sourceShape, targetCenter.x, targetCenter.y);
  if (targetShape) end = getEdgeIntersection(targetShape, sourceCenter.x, sourceCenter.y);

  return { start, end };
}

export function getEdgeIntersection(shape: Shape, pointX: number, pointY: number): { x: number, y: number } {
  const { minX, minY, w, h } = getBoundingBox(shape);
  const cx = minX + w / 2;
  const cy = minY + h / 2;
  const dx = pointX - cx;
  const dy = pointY - cy;

  if (dx === 0 && dy === 0) return { x: cx, y: cy };

  if (shape.type === "circle") {
    const rx = w / 2;
    const ry = h / 2;
    const angle = Math.atan2(dy, dx);
    const r = (rx * ry) / Math.sqrt(Math.pow(ry * Math.cos(angle), 2) + Math.pow(rx * Math.sin(angle), 2));
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) };
  } else if (shape.type === "diamond") {
    const hw = w / 2 || 1;
    const hh = h / 2 || 1;
    const t = 1 / (Math.abs(dx) / hw + Math.abs(dy) / hh);
    return { x: cx + t * dx, y: cy + t * dy };
  } else {
    // Rect by default
    const hw = w / 2;
    const hh = h / 2;
    const scaleX = dx !== 0 ? Math.abs(hw / dx) : Infinity;
    const scaleY = dy !== 0 ? Math.abs(hh / dy) : Infinity;
    const scale = Math.min(scaleX, scaleY);
    return { x: cx + dx * scale, y: cy + dy * scale };
  }
}

export function drawShape(ctx: CanvasRenderingContext2D, shape: Shape, allShapes: Shape[] = []) {
  ctx.beginPath();
  ctx.strokeStyle = shape.strokeColor || "white";
  ctx.lineWidth = shape.strokeWidth || 2;

  const { minX, minY, w, h } = getBoundingBox(shape);

  if (shape.type === "text") {
    ctx.font = TEXT_FONT;
    ctx.fillStyle = shape.strokeColor || "white";
    ctx.textBaseline = "top";
    ctx.fillText(shape.text || "", shape.x, shape.y);
  } else if (shape.type === "rect") {
    ctx.strokeRect(minX, minY, w, h);
  } else if (shape.type === "circle") {
    ctx.ellipse(minX + w / 2, minY + h / 2, w / 2, h / 2, 0, 0, 2 * Math.PI);
    ctx.stroke();
  } else if (shape.type === "diamond") {
    ctx.moveTo(minX + w / 2, minY);
    ctx.lineTo(maxX(shape), minY + h / 2);
    ctx.lineTo(minX + w / 2, maxY(shape));
    ctx.lineTo(minX, minY + h / 2);
    ctx.closePath();
    ctx.stroke();
  } else if (shape.type === "line" || shape.type === "connector" || shape.type === "arrow") {
    const { start: startPt, end: endPt } = resolveConnectorEndpoints(shape, allShapes);

    ctx.moveTo(startPt.x, startPt.y);
    ctx.lineTo(endPt.x, endPt.y);
    ctx.stroke();
  }
}

function maxX(shape: Shape) { return getBoundingBox(shape).maxX; }
function maxY(shape: Shape) { return getBoundingBox(shape).maxY; }

// zoom keeps the selection handles/padding a constant on-screen size — since this draws
// in world space under the canvas's zoom transform, dividing by zoom here is what cancels
// that scale back out (same reasoning as hitTestHandle's tolerance).
export function drawSelectionBox(ctx: CanvasRenderingContext2D, shape: Shape, zoom: number = 1) {
  const { minX, minY, maxX, maxY, w, h } = getBoundingBox(shape);
  const HANDLE_SIZE_WORLD = HANDLE_SIZE / zoom;
  const hs = HANDLE_SIZE_WORLD / 2;
  const padding = 6 / zoom;

  ctx.save();
  ctx.strokeStyle = "#a855f7"; // Purple
  ctx.lineWidth = 1 / zoom;
  
  if (shape.type === "line" || shape.type === "connector" || shape.type === "arrow") {
    // Draw endpoints handles
    ctx.fillStyle = "white";

    const allShapes = useCanvasStore.getState().shapes;
    const { start: startPt, end: endPt } = resolveConnectorEndpoints(shape, allShapes);

    ctx.fillRect(startPt.x - hs, startPt.y - hs, HANDLE_SIZE_WORLD, HANDLE_SIZE_WORLD);
    ctx.strokeRect(startPt.x - hs, startPt.y - hs, HANDLE_SIZE_WORLD, HANDLE_SIZE_WORLD);

    ctx.fillRect(endPt.x - hs, endPt.y - hs, HANDLE_SIZE_WORLD, HANDLE_SIZE_WORLD);
    ctx.strokeRect(endPt.x - hs, endPt.y - hs, HANDLE_SIZE_WORLD, HANDLE_SIZE_WORLD);
  } else {
    // Draw dashed bounding box
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(minX - padding, minY - padding, w + padding * 2, h + padding * 2);
    
    // Draw 8 handles
    ctx.setLineDash([]);
    ctx.fillStyle = "white";
    const drawHandle = (x: number, y: number) => {
      ctx.fillRect(x - hs, y - hs, HANDLE_SIZE_WORLD, HANDLE_SIZE_WORLD);
      ctx.strokeRect(x - hs, y - hs, HANDLE_SIZE_WORLD, HANDLE_SIZE_WORLD);
    };

    const midX = (minX + maxX) / 2;
    const midY = (minY + maxY) / 2;

    drawHandle(minX - padding, minY - padding); // NW
    drawHandle(midX, minY - padding); // N
    drawHandle(maxX + padding, minY - padding); // NE
    drawHandle(maxX + padding, midY); // E
    drawHandle(maxX + padding, maxY + padding); // SE
    drawHandle(midX, maxY + padding); // S
    drawHandle(minX - padding, maxY + padding); // SW
    drawHandle(minX - padding, midY); // W
  }
  
  ctx.restore();
}
