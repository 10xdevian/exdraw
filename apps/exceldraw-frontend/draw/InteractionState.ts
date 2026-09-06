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
  // Snapshot of whatever's nested inside the shape currently being dragged/resized,
  // taken once at drag-start so contents carry along with the container — see
  // getContainedShapeIds. Keyed by id rather than folded into selectedIds so this is
  // purely a drag-time effect: it doesn't change what Delete/restyle apply to.
  containedOriginalData = new Map<string, Shape>();
  clientId = generateId();
  // Guards spawnTextInput/finishEditing (textEditing.ts) against a second textarea being
  // opened while one is already active.
  isEditingText = false;

  // Pan offset, in screen pixels: worldX * zoom + panX = screenX. Deliberately not in the
  // zustand store — it changes on every wheel tick, and a mousewheel-frequency React
  // re-render would be wasteful. Mutated directly by the wheel handler in index.ts and
  // read directly by clearCanvas / the screen<->world conversion helpers.
  panX = 0;
  panY = 0;
}
