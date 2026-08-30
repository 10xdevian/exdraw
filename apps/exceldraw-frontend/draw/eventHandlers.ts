import { Shape, CanvasEvent } from "@repo/shared";
import { useCanvasStore } from "../store/canvasStore";
import { InteractionState } from "./InteractionState";
import { getCenter, getBoundingBox, hitTest, hitTestHandle } from "./ShapeManager";
import { generateId, throttle, clearCanvas } from "./utils";
import { saveShapeToDB, saveShapesToDB } from "../lib/db";

export function createEventHandlers(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  roomId: string,
  state: InteractionState,
  sendEvent: (action: CanvasEvent["action"], payload: any) => void
) {
  const throttledUpdateBroadcast = throttle((shape: Shape) => {
    sendEvent("SHAPE_UPDATE", shape);
  }, 50);

  const updateConnectorsForShape = (movedShapeId: string) => {
    const store = useCanvasStore.getState();
    const connectorsToUpdate: Shape[] = [];
    const movedShape = store.shapes.find(s => s.id === movedShapeId);
    if (!movedShape) return;
    const center = getCenter(movedShape);

    store.shapes.forEach(shape => {
      if (shape.type === "connector") {
        let updated = false;
        let newConnector = { ...shape };
        
        if (shape.sourceId === movedShapeId) {
           newConnector.x = center.x;
           newConnector.y = center.y;
           updated = true;
        }
        if (shape.targetId === movedShapeId) {
           newConnector.endX = center.x;
           newConnector.endY = center.y;
           updated = true;
        }
        
        if (updated) {
          store.updateShape(newConnector.id, newConnector);
          connectorsToUpdate.push(newConnector);
        }
      }
    });
    
    connectorsToUpdate.forEach(conn => throttledUpdateBroadcast(conn));
  };

  const spawnTextInput = (x: number, y: number, existingShape?: Shape) => {
    const store = useCanvasStore.getState();
    const input = document.createElement("textarea");
    input.style.position = "fixed";
    input.style.left = `${x}px`;
    input.style.top = `${y}px`;
    input.style.background = "transparent";
    input.style.color = existingShape?.strokeColor || store.strokeColor || "white";
    input.style.border = "1px solid #a855f7";
    input.style.outline = "none";
    input.style.font = "24px sans-serif";
    input.style.minWidth = "100px";
    input.style.minHeight = "40px";
    input.style.zIndex = "9999";
    input.value = existingShape?.text || "";
    document.body.appendChild(input);
    input.focus();

    input.onblur = async () => {
      const val = input.value.trim();
      document.body.removeChild(input);
      store.setActiveTool("select");
      if (val) {
        if (existingShape) {
          store.updateShape(existingShape.id, { text: val, width: val.length * 14 });
          const updated = store.shapes.find(s => s.id === existingShape.id);
          if (updated) {
            sendEvent("SHAPE_UPDATE", updated);
            await saveShapeToDB(roomId, updated);
          }
        } else {
          const id = generateId();
          const newShape: Shape = {
            id, type: "text", x, y, width: val.length * 14, height: 28, text: val, strokeColor: store.strokeColor || "white"
          };
          store.addShape(newShape);
          sendEvent("SHAPE_ADD", newShape);
          await saveShapeToDB(roomId, newShape);
        }
      } else if (existingShape) {
        sendEvent("SHAPE_DELETE", { id: existingShape.id });
        store.setShapes(store.shapes.filter(s => s.id !== existingShape.id));
      }
    };
  };

  const handleDoubleClick = (event: MouseEvent) => {
    const store = useCanvasStore.getState();
    if (store.activeTool !== "select") return;

    const sortedShapes = [...store.shapes].sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
    let hitShape: Shape | null = null;
    for (let i = sortedShapes.length - 1; i >= 0; i--) {
      const s = sortedShapes[i];
      if (s && hitTest(event.clientX, event.clientY, s) && s.type === "text") {
        hitShape = s;
        break;
      }
    }

    if (hitShape) spawnTextInput(event.clientX, event.clientY, hitShape);
  };

  const handleMouseDown = (event: MouseEvent) => {
    const store = useCanvasStore.getState();
    state.startX = event.clientX;
    state.startY = event.clientY;

    if (store.activeTool === "text") {
       spawnTextInput(state.startX, state.startY);
       return;
    }

    if (store.activeTool === "select") {
      const sortedShapes = [...store.shapes].sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
      
      for (const id of state.selectedIds) {
         const shape = store.shapes.find(s => s.id === id);
         if (shape) {
           const handle = hitTestHandle(state.startX, state.startY, shape);
           if (handle) {
             state.isDrawingOrDragging = true;
             state.activeHandle = handle;
             state.currentShapeId = shape.id;
             state.originalShapeData = { ...shape };
             return;
           }
         }
      }

      let hitShape: Shape | null = null;
      for (let i = sortedShapes.length - 1; i >= 0; i--) {
        const s = sortedShapes[i];
        if (s && hitTest(state.startX, state.startY, s)) {
          hitShape = s;
          break;
        }
      }

      if (hitShape) {
        if (!state.selectedIds.has(hitShape.id)) {
          state.selectedIds.clear();
          state.selectedIds.add(hitShape.id);
        }
        state.isDrawingOrDragging = true;
        state.activeHandle = "body";
        state.currentShapeId = hitShape.id;
        state.dragOffset = { x: state.startX, y: state.startY };
      } else {
        state.selectedIds.clear();
      }
      clearCanvas(store.shapes, state.selectedIds, canvas, ctx);
      return;
    }

    state.isDrawingOrDragging = true;
    state.currentShapeId = generateId();

    const newShape: Shape = {
      id: state.currentShapeId,
      type: store.activeTool,
      x: state.startX,
      y: state.startY,
      width: 0,
      height: 0,
      strokeColor: store.strokeColor,
    };
    if (store.activeTool === "line" || store.activeTool === "arrow") {
      newShape.endX = state.startX;
      newShape.endY = state.startY;
    }

    store.addShape(newShape);
    sendEvent("SHAPE_ADD", newShape);
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!state.isDrawingOrDragging || !state.currentShapeId) return;

    const store = useCanvasStore.getState();
    const currentShape = store.shapes.find(s => s.id === state.currentShapeId);
    if (!currentShape) return;

    if (store.activeTool === "select") {
      if (state.activeHandle === "body") {
        const deltaX = event.clientX - state.dragOffset.x;
        const deltaY = event.clientY - state.dragOffset.y;
        state.dragOffset = { x: event.clientX, y: event.clientY };

        state.selectedIds.forEach(id => {
          const shape = store.shapes.find(s => s.id === id);
          if (shape) {
            const updates: Partial<Shape> = { x: shape.x + deltaX, y: shape.y + deltaY };
            if (shape.type === "line" || shape.type === "connector" || shape.type === "arrow") {
               updates.endX = (shape.endX ?? shape.x) + deltaX;
               updates.endY = (shape.endY ?? shape.y) + deltaY;
            }
            store.updateShape(id, updates);
            
            const updatedShape = store.shapes.find(s => s.id === id);
            if (updatedShape) {
               throttledUpdateBroadcast(updatedShape);
               updateConnectorsForShape(id);
            }
          }
        });
      } else if (state.activeHandle && state.originalShapeData) {
        const deltaX = event.clientX - state.startX;
        const deltaY = event.clientY - state.startY;
        let updates: Partial<Shape> = {};
        
        if (state.originalShapeData.type === "line" || state.originalShapeData.type === "connector" || state.originalShapeData.type === "arrow") {
           let snapCenter: {x: number, y: number} | null = null;
           for (const s of store.shapes) {
              if (s.id !== state.currentShapeId && (s.type === "rect" || s.type === "circle" || s.type === "diamond")) {
                 if (hitTest(event.clientX, event.clientY, s)) {
                    snapCenter = getCenter(s);
                    break;
                 }
              }
           }
           if (state.activeHandle === "start") {
             updates = { x: snapCenter ? snapCenter.x : state.originalShapeData.x + deltaX, y: snapCenter ? snapCenter.y : state.originalShapeData.y + deltaY };
           } else if (state.activeHandle === "end") {
             updates = { endX: snapCenter ? snapCenter.x : (state.originalShapeData.endX ?? state.originalShapeData.x) + deltaX, endY: snapCenter ? snapCenter.y : (state.originalShapeData.endY ?? state.originalShapeData.y) + deltaY };
           }
        } else {
           const { x, y, width, height } = state.originalShapeData;
           let newX = x;
           let newY = y;
           let newW = width;
           let newH = height;

           if (state.activeHandle.includes("n")) { newY = y + deltaY; newH = height - deltaY; }
           if (state.activeHandle.includes("s")) { newH = height + deltaY; }
           if (state.activeHandle.includes("w")) { newX = x + deltaX; newW = width - deltaX; }
           if (state.activeHandle.includes("e")) { newW = width + deltaX; }
           
           updates = { x: newX, y: newY, width: newW, height: newH };
        }
        
        store.updateShape(state.currentShapeId, updates);
        const updatedShape = store.shapes.find(s => s.id === state.currentShapeId);
        if (updatedShape) {
          throttledUpdateBroadcast(updatedShape);
          updateConnectorsForShape(state.currentShapeId);
        }
      }
      return;
    }

    const width = event.clientX - state.startX;
    const height = event.clientY - state.startY;

    if (currentShape.type === "line" || currentShape.type === "arrow") {
      let snapCenter: {x: number, y: number} | null = null;
      for (const s of store.shapes) {
         if (s.id !== state.currentShapeId && (s.type === "rect" || s.type === "circle" || s.type === "diamond")) {
            if (hitTest(event.clientX, event.clientY, s)) {
               snapCenter = getCenter(s);
               break;
            }
         }
      }
      store.updateShape(state.currentShapeId, { 
         endX: snapCenter ? snapCenter.x : event.clientX, 
         endY: snapCenter ? snapCenter.y : event.clientY 
      });
    } else {
      store.updateShape(state.currentShapeId, { width, height });
    }
    
    const updatedShape = store.shapes.find(s => s.id === state.currentShapeId);
    if (updatedShape) throttledUpdateBroadcast(updatedShape);
  };

  const handleMouseUp = async (event: MouseEvent) => {
    if (!state.isDrawingOrDragging || !state.currentShapeId) return;
    state.isDrawingOrDragging = false;
    const store = useCanvasStore.getState();
    let finishedShape = store.shapes.find(s => s.id === state.currentShapeId);
    
    if (finishedShape) {
      if (store.activeTool === "select") {
        if (state.activeHandle === "start" || state.activeHandle === "end") {
           const ptX = state.activeHandle === "start" ? finishedShape.x : (finishedShape.endX ?? finishedShape.x);
           const ptY = state.activeHandle === "start" ? finishedShape.y : (finishedShape.endY ?? finishedShape.y);
           
           let hitTarget: Shape | null = null;
           for (let i = store.shapes.length - 1; i >= 0; i--) {
             const s = store.shapes[i];
             if (s && s.id !== finishedShape.id && (s.type === "rect" || s.type === "circle" || s.type === "diamond")) {
                if (hitTest(ptX, ptY, s)) { hitTarget = s; break; }
             }
           }
           
           if (hitTarget) {
             const c = getCenter(hitTarget);
             store.updateShape(finishedShape.id, {
                type: "connector",
                ...(state.activeHandle === "start" ? { sourceId: hitTarget.id, x: c.x, y: c.y } : { targetId: hitTarget.id, endX: c.x, endY: c.y })
             });
           } else {
             const isStart = state.activeHandle === "start";
             const stillHasOther = isStart ? !!finishedShape.targetId : !!finishedShape.sourceId;
             store.updateShape(finishedShape.id, {
                ...(isStart ? { sourceId: undefined } : { targetId: undefined }),
                type: stillHasOther ? "connector" : "line"
             });
           }
           finishedShape = store.shapes.find(s => s.id === state.currentShapeId) || finishedShape;
        }

        if (state.activeHandle && state.activeHandle !== "body" && state.activeHandle !== "start" && state.activeHandle !== "end") {
           const { minX, minY, w, h } = getBoundingBox(finishedShape);
           store.updateShape(finishedShape.id, { x: minX, y: minY, width: w, height: h });
           finishedShape = store.shapes.find(s => s.id === state.currentShapeId) || finishedShape;
        }

        for (const id of state.selectedIds) {
           const shape = store.shapes.find(s => s.id === id);
           if (shape) {
             sendEvent("SHAPE_UPDATE", shape);
             await saveShapeToDB(roomId, shape);
             if (shape.type !== "connector") {
                store.shapes.forEach(async conn => {
                  if (conn.type === "connector" && (conn.sourceId === id || conn.targetId === id)) {
                    sendEvent("SHAPE_UPDATE", conn);
                    await saveShapeToDB(roomId, conn);
                  }
                });
             }
           }
        }
      } else {
        if (finishedShape.type === "line" || finishedShape.type === "arrow") {
           let sourceShape: Shape | null = null;
           let targetShape: Shape | null = null;
           const sortedShapes = [...store.shapes].sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
           for (let i = sortedShapes.length - 1; i >= 0; i--) {
             const s = sortedShapes[i];
             if (s && s.id !== finishedShape.id && (s.type === "rect" || s.type === "circle" || s.type === "diamond")) {
                if (!sourceShape && hitTest(state.startX, state.startY, s)) sourceShape = s;
                if (!targetShape && hitTest(event.clientX, event.clientY, s)) targetShape = s;
             }
           }
           if (sourceShape && targetShape && sourceShape.id !== targetShape.id) {
             const sc = getCenter(sourceShape);
             const tc = getCenter(targetShape);
             store.updateShape(finishedShape.id, {
               type: "connector",
               sourceId: sourceShape.id,
               targetId: targetShape.id,
               x: sc.x,
               y: sc.y,
               endX: tc.x,
               endY: tc.y
             });
           } else if (sourceShape || targetShape) {
              const connectedShape = sourceShape || targetShape;
              const c = getCenter(connectedShape!);
              const isSource = !!sourceShape;
              store.updateShape(finishedShape.id, {
                 type: "connector",
                 ...(isSource ? { sourceId: connectedShape!.id, x: c.x, y: c.y } : { targetId: connectedShape!.id, endX: c.x, endY: c.y })
              });
           }
           finishedShape = store.shapes.find(s => s.id === state.currentShapeId) || finishedShape;
        }

        if (finishedShape.type !== "line" && finishedShape.type !== "connector" && finishedShape.type !== "arrow") {
           const { minX, minY, w, h } = getBoundingBox(finishedShape);
           store.updateShape(finishedShape.id, { x: minX, y: minY, width: w, height: h });
           finishedShape = store.shapes.find(s => s.id === state.currentShapeId) || finishedShape;
        }

        if (finishedShape) {
          sendEvent("SHAPE_UPDATE", finishedShape);
          await saveShapeToDB(roomId, finishedShape);
        }
      }
    }
    
    state.activeHandle = null;
    state.currentShapeId = null;
    state.originalShapeData = null;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.key === "Backspace" || e.key === "Delete") && state.selectedIds.size > 0) {
       const store = useCanvasStore.getState();
       if (state.selectedIds.size === 1) {
         const id = Array.from(state.selectedIds)[0];
         sendEvent("SHAPE_DELETE", { id });
         const newShapes = store.shapes.filter(s => s.id !== id);
         store.setShapes(newShapes);
         saveShapesToDB(roomId, newShapes);
       } else {
         const ids = Array.from(state.selectedIds);
         sendEvent("SHAPES_DELETE", { ids });
         const newShapes = store.shapes.filter(s => !state.selectedIds.has(s.id));
         store.setShapes(newShapes);
         saveShapesToDB(roomId, newShapes);
       }
       state.selectedIds.clear();
       clearCanvas(useCanvasStore.getState().shapes, state.selectedIds, canvas, ctx);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "a") {
       e.preventDefault();
       const store = useCanvasStore.getState();
       state.selectedIds = new Set(store.shapes.map(s => s.id));
       clearCanvas(store.shapes, state.selectedIds, canvas, ctx);
    }
  };

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    handleDoubleClick,
  };
}
