import axios from "axios";
import { BACKEND_URL, Shape } from "@repo/shared";
import { drawShape, drawSelectionBox } from "./ShapeManager";

export function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

export function throttle(func: Function, limit: number) {
  let inThrottle: boolean;
  return function(this: any, ...args: any[]) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
}

export function clearCanvas(
  shapes: Shape[],
  selectedIds: Set<string>,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const sortedShapes = [...shapes].sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));

  sortedShapes.forEach((shape) => {
    drawShape(ctx, shape, shapes);
    if (selectedIds.has(shape.id)) {
      drawSelectionBox(ctx, shape);
    }
  });
}

export async function getExistingShapes(roomId: string) {
  if (roomId === "local" || roomId === "guest") return [];
  const response = await axios.get(`${BACKEND_URL}/chats/${roomId}`);
  const messages = response.data.message;

  const shapesMap = new Map<string, Shape>();

  // Ensure chronological order before reducing
  messages.sort((a: any, b: any) => a.id - b.id);

  messages.forEach((x: { id: number, message: string }) => {
    try {
       const messageData = JSON.parse(x.message);
       const action = messageData.action;
       const payload = messageData.payload || messageData.shape || messageData;
       
       if (action === "SHAPE_DELETE") {
         shapesMap.delete(payload.id);
       } else if (action === "SHAPES_DELETE") {
         if (payload.ids) {
            payload.ids.forEach((id: string) => shapesMap.delete(id));
         }
       } else if (action === "SHAPE_ADD" || action === "SHAPE_UPDATE" || payload.id) {
         const existing = shapesMap.get(payload.id);
         shapesMap.set(payload.id, { ...existing, ...payload, sequenceNumber: x.id });
       }
    } catch {
       // ignore malformed
    }
  });

  return Array.from(shapesMap.values()).sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
}
