import { useCanvasStore } from "../store/canvasStore";
import { getShapesFromDB, saveShapesToDB, saveShapeToDB } from "../lib/db";
import { clearCanvas, getExistingShapes } from "./utils";
import { setupNetwork } from "./network";
import { InteractionState } from "./InteractionState";
import { createEventHandlers } from "./eventHandlers";

export async function DrawCanva(
  canvas: HTMLCanvasElement,
  roomId: string,
  socket: WebSocket | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const state = new InteractionState();

  try {
    const localShapes = await getShapesFromDB(roomId);
    if (localShapes.length > 0) {
      useCanvasStore.getState().setShapes(localShapes);
    } else {
      const existingShapes = await getExistingShapes(roomId);
      useCanvasStore.getState().setShapes(existingShapes);
      await saveShapesToDB(roomId, existingShapes);
    }
  } catch (e) {
    console.warn("Could not load shapes", e);
  }

  const { sendEvent, cleanupNetwork } = setupNetwork(socket, roomId, state.clientId);

  const unsubscribe = useCanvasStore.subscribe(async (storeState, prevState) => {
    let styleChanged = false;
    
    if (storeState.strokeColor !== prevState.strokeColor || storeState.strokeWidth !== prevState.strokeWidth) {
      if (state.selectedIds.size > 0) {
        state.selectedIds.forEach(async id => {
           storeState.updateShape(id, { 
             strokeColor: storeState.strokeColor,
             strokeWidth: storeState.strokeWidth 
           });
           const s = storeState.shapes.find(s => s.id === id);
           if (s) {
             sendEvent("SHAPE_UPDATE", s);
             await saveShapeToDB(roomId, s);
           }
        });
      }
      styleChanged = true;
    }
    
    // zoom lives in the store (reactive — see canvasStore.ts), so a redraw here is what
    // makes the +/- toolbar buttons actually repaint the canvas. Pan does NOT live here
    // (InteractionState, mutated imperatively) — the wheel handler redraws for that itself.
    if (storeState.shapes !== prevState.shapes || storeState.activeTool !== prevState.activeTool || storeState.zoom !== prevState.zoom || styleChanged) {
      clearCanvas(storeState.shapes, state.selectedIds, canvas, ctx, { panX: state.panX, panY: state.panY, zoom: storeState.zoom });
    }
  });

  clearCanvas(useCanvasStore.getState().shapes, state.selectedIds, canvas, ctx, { panX: state.panX, panY: state.panY, zoom: useCanvasStore.getState().zoom });

  const handlers = createEventHandlers(canvas, ctx, roomId, state, sendEvent);

  canvas.addEventListener("mousedown", handlers.handleMouseDown);
  canvas.addEventListener("mousemove", handlers.handleMouseMove);
  canvas.addEventListener("mouseup", handlers.handleMouseUp);
  canvas.addEventListener("mouseleave", handlers.handleMouseUp);
  canvas.addEventListener("dblclick", handlers.handleDoubleClick);
  canvas.addEventListener("wheel", handlers.handleWheel, { passive: false });
  window.addEventListener("keydown", handlers.handleKeyDown);

  return () => {
    unsubscribe();
    canvas.removeEventListener("mousedown", handlers.handleMouseDown);
    canvas.removeEventListener("mousemove", handlers.handleMouseMove);
    canvas.removeEventListener("mouseup", handlers.handleMouseUp);
    canvas.removeEventListener("mouseleave", handlers.handleMouseUp);
    canvas.removeEventListener("dblclick", handlers.handleDoubleClick);
    canvas.removeEventListener("wheel", handlers.handleWheel);
    window.removeEventListener("keydown", handlers.handleKeyDown);
    cleanupNetwork();
  };
}
