import { useCanvasStore } from "../store/canvasStore";
import { Shape } from "@repo/shared";

export type HandleType = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "start" | "end" | "body" | null;

const HANDLE_SIZE = 8;

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

// Check if x,y hits a specific resize handle
export function hitTestHandle(x: number, y: number, shape: Shape): HandleType {
  const isLine = shape.type === "line" || shape.type === "connector" || shape.type === "arrow";
  const hs = HANDLE_SIZE;
  
  if (isLine) {
    let startPt = { x: shape.x, y: shape.y };
    let endPt = { x: shape.endX ?? shape.x, y: shape.endY ?? shape.y };
    const allShapes = useCanvasStore.getState().shapes;

    if (shape.sourceId) {
      const sourceShape = allShapes.find(s => s.id === shape.sourceId);
      if (sourceShape) startPt = getEdgeIntersection(sourceShape, endPt.x, endPt.y);
    }
    if (shape.targetId) {
      const targetShape = allShapes.find(s => s.id === shape.targetId);
      if (targetShape) endPt = getEdgeIntersection(targetShape, shape.x, shape.y);
    }
    if (shape.sourceId) {
      const sourceShape = allShapes.find(s => s.id === shape.sourceId);
      if (sourceShape) startPt = getEdgeIntersection(sourceShape, endPt.x, endPt.y);
    }

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

// General body hit test
export function hitTest(x: number, y: number, shape: Shape): boolean {
  if (shape.type === "line" || shape.type === "connector" || shape.type === "arrow") {
    const ex = shape.endX ?? shape.x;
    const ey = shape.endY ?? shape.y;
    const l2 = Math.pow(ex - shape.x, 2) + Math.pow(ey - shape.y, 2);
    if (l2 === 0) return Math.hypot(x - shape.x, y - shape.y) < 8;
    let t = ((x - shape.x) * (ex - shape.x) + (y - shape.y) * (ey - shape.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = shape.x + t * (ex - shape.x);
    const projY = shape.y + t * (ey - shape.y);
    return Math.hypot(x - projX, y - projY) < 8;
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
    ctx.font = "24px sans-serif";
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
    let startPt = { x: shape.x, y: shape.y };
    let endPt = { x: shape.endX ?? shape.x, y: shape.endY ?? shape.y };

    if (shape.sourceId) {
      const sourceShape = allShapes.find(s => s.id === shape.sourceId);
      if (sourceShape) startPt = getEdgeIntersection(sourceShape, endPt.x, endPt.y);
    }
    if (shape.targetId) {
      const targetShape = allShapes.find(s => s.id === shape.targetId);
      if (targetShape) endPt = getEdgeIntersection(targetShape, shape.x, shape.y);
    }
    // Re-evaluate startPt against new endPt to be perfectly flush
    if (shape.sourceId) {
      const sourceShape = allShapes.find(s => s.id === shape.sourceId);
      if (sourceShape) startPt = getEdgeIntersection(sourceShape, endPt.x, endPt.y);
    }

    ctx.moveTo(startPt.x, startPt.y);
    ctx.lineTo(endPt.x, endPt.y);
    ctx.stroke();
  }
}

function maxX(shape: Shape) { return getBoundingBox(shape).maxX; }
function maxY(shape: Shape) { return getBoundingBox(shape).maxY; }

export function drawSelectionBox(ctx: CanvasRenderingContext2D, shape: Shape) {
  const { minX, minY, maxX, maxY, w, h } = getBoundingBox(shape);
  const hs = HANDLE_SIZE / 2;
  const padding = 6;
  
  ctx.save();
  ctx.strokeStyle = "#a855f7"; // Purple
  ctx.lineWidth = 1;
  
  if (shape.type === "line" || shape.type === "connector" || shape.type === "arrow") {
    // Draw endpoints handles
    ctx.fillStyle = "white";
    
    let startPt = { x: shape.x, y: shape.y };
    let endPt = { x: shape.endX ?? shape.x, y: shape.endY ?? shape.y };
    const allShapes = useCanvasStore.getState().shapes;

    if (shape.sourceId) {
      const sourceShape = allShapes.find(s => s.id === shape.sourceId);
      if (sourceShape) startPt = getEdgeIntersection(sourceShape, endPt.x, endPt.y);
    }
    if (shape.targetId) {
      const targetShape = allShapes.find(s => s.id === shape.targetId);
      if (targetShape) endPt = getEdgeIntersection(targetShape, shape.x, shape.y);
    }
    if (shape.sourceId) {
      const sourceShape = allShapes.find(s => s.id === shape.sourceId);
      if (sourceShape) startPt = getEdgeIntersection(sourceShape, endPt.x, endPt.y);
    }

    ctx.fillRect(startPt.x - hs, startPt.y - hs, HANDLE_SIZE, HANDLE_SIZE);
    ctx.strokeRect(startPt.x - hs, startPt.y - hs, HANDLE_SIZE, HANDLE_SIZE);
    
    ctx.fillRect(endPt.x - hs, endPt.y - hs, HANDLE_SIZE, HANDLE_SIZE);
    ctx.strokeRect(endPt.x - hs, endPt.y - hs, HANDLE_SIZE, HANDLE_SIZE);
  } else {
    // Draw dashed bounding box
    ctx.setLineDash([5, 5]);
    ctx.strokeRect(minX - padding, minY - padding, w + padding * 2, h + padding * 2);
    
    // Draw 8 handles
    ctx.setLineDash([]);
    ctx.fillStyle = "white";
    const drawHandle = (x: number, y: number) => {
      ctx.fillRect(x - hs, y - hs, HANDLE_SIZE, HANDLE_SIZE);
      ctx.strokeRect(x - hs, y - hs, HANDLE_SIZE, HANDLE_SIZE);
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
