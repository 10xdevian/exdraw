import { Shape } from "@repo/shared";
import { HandleType } from "./ShapeManager";
import { generateId } from "./utils";

export class InteractionState {
  isDrawingOrDragging = false;
  activeHandle: HandleType = null;
  startX = 0;
  startY = 0;
  currentShapeId: string | null = null;
  dragOffset = { x: 0, y: 0 };
  originalShapeData: Shape | null = null;
  selectedIds = new Set<string>();
  clientId = generateId();
}
