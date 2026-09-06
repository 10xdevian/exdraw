import { Shape, CanvasEvent } from "@repo/shared";
import { useCanvasStore } from "../store/canvasStore";
import { InteractionState } from "./InteractionState";
import { measureTextWidth } from "./ShapeManager";
import { generateId } from "./utils";
import { saveShapeToDB, deleteShapeFromDB } from "../lib/db";
import { toScreen } from "./viewport";

interface TextEditingDeps {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  roomId: string;
  state: InteractionState;
  sendEvent: (action: CanvasEvent["action"], payload: any) => void;
}

// The text tool's editor: a real DOM <textarea> floated on top of the canvas rather than
// anything drawn on it, so native text editing (cursor, selection, IME, etc.) just works.
export function createTextEditing({ canvas, ctx, roomId, state, sendEvent }: TextEditingDeps) {
  // x, y are WORLD coordinates — same space every other shape lives in. The <textarea>
  // itself is a real DOM element overlaid with position:fixed, which is SCREEN space, so
  // its on-page placement and font size are converted through the current pan/zoom here;
  // everything else about it (the shape it creates/edits) stays in world units untouched.
  const spawnTextInput = (x: number, y: number, existingShape?: Shape) => {
    if (state.isEditingText) return;
    state.isEditingText = true;

    const store = useCanvasStore.getState();
    const zoom = store.zoom;
    const screenPos = toScreen(x, y, canvas, { panX: state.panX, panY: state.panY, zoom });
    const input = document.createElement("textarea");
    input.style.position = "fixed";
    input.style.left = `${screenPos.x}px`;
    input.style.top = `${screenPos.y}px`;
    input.style.background = "transparent";
    input.style.color = existingShape?.strokeColor || store.strokeColor || "white";
    input.style.border = "1px solid #a855f7";
    input.style.outline = "none";
    input.style.font = `${24 * zoom}px sans-serif`;
    input.style.minWidth = `${100 * zoom}px`;
    input.style.minHeight = `${40 * zoom}px`;
    input.style.zIndex = "9999";
    input.value = existingShape?.text || "";
    document.body.appendChild(input);
    input.focus();

    const finishEditing = async () => {
      if (!state.isEditingText) return;
      state.isEditingText = false;
      const val = input.value.trim();
      document.body.removeChild(input);
      store.setActiveTool("select");
      if (val) {
        if (existingShape) {
          store.updateShape(existingShape.id, { text: val, width: measureTextWidth(ctx, val) });
          const updated = store.shapes.find(s => s.id === existingShape.id);
          if (updated) {
            sendEvent("SHAPE_UPDATE", updated);
            await saveShapeToDB(roomId, updated);
          }
        } else {
          const id = generateId();
          const newShape: Shape = {
            id, type: "text", x, y, width: measureTextWidth(ctx, val), height: 28, text: val, strokeColor: store.strokeColor || "white"
          };
          store.addShape(newShape);
          sendEvent("SHAPE_ADD", newShape);
          await saveShapeToDB(roomId, newShape);
        }
      } else if (existingShape) {
        sendEvent("SHAPE_DELETE", { id: existingShape.id });
        store.setShapes(store.shapes.filter(s => s.id !== existingShape.id));
        await deleteShapeFromDB(roomId, existingShape.id);
      }
    };

    input.onblur = finishEditing;
    input.onkeydown = (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        input.blur();
      }
    };
  };

  return { spawnTextInput };
}
