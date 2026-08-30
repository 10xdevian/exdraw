import axios from "axios";
import { BACKEND_URL } from "@repo/shared";
import { useCanvasStore } from "../store/canvasStore";
import { Shape, CanvasEvent } from "@repo/shared";
import { getShapesFromDB, saveShapeToDB, saveShapesToDB, getLastSequenceNumber, setLastSequenceNumber } from "../lib/db";
import { getCenter, getBoundingBox, hitTest, hitTestHandle, drawShape, drawSelectionBox, HandleType } from "./ShapeManager";

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

function throttle(func: Function, limit: number) {
  let inThrottle: boolean;
  return function(this: any, ...args: any[]) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  }
}

export async function DrawCanva(
  canvas: HTMLCanvasElement,
  roomId: string,
  socket: WebSocket | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

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

  const syncWithServer = async () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const lastSeq = await getLastSequenceNumber(roomId);
    socket.send(JSON.stringify({ type: "sync", roomId, lastSequenceNumber: lastSeq }));
  };

  if (socket) {
    if (socket.readyState === WebSocket.OPEN) syncWithServer();
    socket.addEventListener("open", syncWithServer);
  }

  let selectedIds = new Set<string>();

  const unsubscribe = useCanvasStore.subscribe((state, prevState) => {
    if (state.shapes !== prevState.shapes || state.activeTool !== prevState.activeTool) {
      clearCanvas(state.shapes, selectedIds, canvas, ctx);
    }
  });

  clearCanvas(useCanvasStore.getState().shapes, selectedIds, canvas, ctx);

  let isDrawingOrDragging = false;
  let activeHandle: HandleType = null;
  let startX = 0;
  let startY = 0;
  let currentShapeId: string | null = null;
  let dragOffset = { x: 0, y: 0 };
  let originalShapeData: Shape | null = null;
  
  const clientId = generateId();

  const sendEvent = (action: CanvasEvent["action"], payload: any) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const event: CanvasEvent = {
      eventId: generateId(),
      clientId,
      roomId,
      timestamp: Date.now(),
      action,
      payload
    };
    socket.send(JSON.stringify({ type: "chat", message: JSON.stringify(event), roomId }));
  };

  const throttledUpdateBroadcast = throttle((shape: Shape) => {
    sendEvent("SHAPE_UPDATE", shape);
  }, 50);

  const updateConnectorsForShape = (movedShapeId: string) => {
    const state = useCanvasStore.getState();
    const connectorsToUpdate: Shape[] = [];
    const movedShape = state.shapes.find(s => s.id === movedShapeId);
    if (!movedShape) return;
    const center = getCenter(movedShape);

    state.shapes.forEach(shape => {
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
          state.updateShape(newConnector.id, newConnector);
          connectorsToUpdate.push(newConnector);
        }
      }
    });
    
    connectorsToUpdate.forEach(conn => throttledUpdateBroadcast(conn));
  };

  const handleMouseDown = (event: MouseEvent) => {
    const state = useCanvasStore.getState();
    startX = event.clientX;
    startY = event.clientY;

    if (state.activeTool === "select") {
      const sortedShapes = [...state.shapes].sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
      
      // 1. Check if we hit a resize handle of currently selected shapes
      for (const id of selectedIds) {
         const shape = state.shapes.find(s => s.id === id);
         if (shape) {
           const handle = hitTestHandle(startX, startY, shape);
           if (handle) {
             isDrawingOrDragging = true;
             activeHandle = handle;
             currentShapeId = shape.id;
             originalShapeData = { ...shape };
             return; // Stop here, we are resizing
           }
         }
      }

      // 2. Check if we hit a shape body
      let hitShape: Shape | null = null;
      for (let i = sortedShapes.length - 1; i >= 0; i--) {
        const s = sortedShapes[i];
        if (s && hitTest(startX, startY, s)) {
          hitShape = s;
          break;
        }
      }

      if (hitShape) {
        if (!selectedIds.has(hitShape.id)) {
          selectedIds.clear();
          selectedIds.add(hitShape.id);
        }
        isDrawingOrDragging = true;
        activeHandle = "body";
        currentShapeId = hitShape.id;
        dragOffset = { x: startX, y: startY };
      } else {
        selectedIds.clear();
      }
      clearCanvas(state.shapes, selectedIds, canvas, ctx);
      return;
    }

    isDrawingOrDragging = true;
    currentShapeId = generateId();

    const newShape: Shape = {
      id: currentShapeId,
      type: state.activeTool,
      x: startX,
      y: startY,
      width: 0,
      height: 0,
    };
    if (state.activeTool === "line" || state.activeTool === "arrow") {
      newShape.endX = startX;
      newShape.endY = startY;
    }

    state.addShape(newShape);
    sendEvent("SHAPE_ADD", newShape);
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!isDrawingOrDragging || !currentShapeId) return;

    const state = useCanvasStore.getState();
    const currentShape = state.shapes.find(s => s.id === currentShapeId);
    if (!currentShape) return;

    if (state.activeTool === "select") {
      if (activeHandle === "body") {
        // Dragging
        const deltaX = event.clientX - dragOffset.x;
        const deltaY = event.clientY - dragOffset.y;
        dragOffset = { x: event.clientX, y: event.clientY };

        selectedIds.forEach(id => {
          const shape = state.shapes.find(s => s.id === id);
          if (shape) {
            const updates: Partial<Shape> = { x: shape.x + deltaX, y: shape.y + deltaY };
            if (shape.type === "line" || shape.type === "connector" || shape.type === "arrow") {
               updates.endX = (shape.endX ?? shape.x) + deltaX;
               updates.endY = (shape.endY ?? shape.y) + deltaY;
            }
            state.updateShape(id, updates);
            
            const updatedShape = state.shapes.find(s => s.id === id);
            if (updatedShape) {
               throttledUpdateBroadcast(updatedShape);
               updateConnectorsForShape(id);
            }
          }
        });
      } else if (activeHandle && originalShapeData) {
        // Resizing
        const deltaX = event.clientX - startX;
        const deltaY = event.clientY - startY;
        
        let updates: Partial<Shape> = {};
        
        if (originalShapeData.type === "line" || originalShapeData.type === "connector" || originalShapeData.type === "arrow") {
           if (activeHandle === "start") {
             updates = { x: originalShapeData.x + deltaX, y: originalShapeData.y + deltaY };
           } else if (activeHandle === "end") {
             updates = { endX: (originalShapeData.endX ?? originalShapeData.x) + deltaX, endY: (originalShapeData.endY ?? originalShapeData.y) + deltaY };
           }
        } else {
           const { x, y, width, height } = originalShapeData;
           let newX = x;
           let newY = y;
           let newW = width;
           let newH = height;

           if (activeHandle.includes("n")) {
             newY = y + deltaY;
             newH = height - deltaY;
           }
           if (activeHandle.includes("s")) {
             newH = height + deltaY;
           }
           if (activeHandle.includes("w")) {
             newX = x + deltaX;
             newW = width - deltaX;
           }
           if (activeHandle.includes("e")) {
             newW = width + deltaX;
           }
           
           updates = { x: newX, y: newY, width: newW, height: newH };
        }
        
        state.updateShape(currentShapeId, updates);
        const updatedShape = state.shapes.find(s => s.id === currentShapeId);
        if (updatedShape) {
          throttledUpdateBroadcast(updatedShape);
          updateConnectorsForShape(currentShapeId);
        }
      }
      return;
    }

    // Drawing new shapes
    const width = event.clientX - startX;
    const height = event.clientY - startY;

    if (currentShape.type === "line" || currentShape.type === "arrow") {
      state.updateShape(currentShapeId, { endX: event.clientX, endY: event.clientY });
    } else {
      state.updateShape(currentShapeId, { width, height });
    }
    
    const updatedShape = state.shapes.find(s => s.id === currentShapeId);
    if (updatedShape) throttledUpdateBroadcast(updatedShape);
  };

  const handleMouseUp = async (event: MouseEvent) => {
    if (!isDrawingOrDragging || !currentShapeId) return;
    isDrawingOrDragging = false;
    const state = useCanvasStore.getState();
    let finishedShape = state.shapes.find(s => s.id === currentShapeId);
    
    if (finishedShape) {
      if (state.activeTool === "select") {
        
        // If we were dragging a line end, check for snaps
        if (activeHandle === "start" || activeHandle === "end") {
           const ptX = activeHandle === "start" ? finishedShape.x : (finishedShape.endX ?? finishedShape.x);
           const ptY = activeHandle === "start" ? finishedShape.y : (finishedShape.endY ?? finishedShape.y);
           
           let hitTarget: Shape | null = null;
           for (let i = state.shapes.length - 1; i >= 0; i--) {
             const s = state.shapes[i];
             if (s && s.id !== finishedShape.id && (s.type === "rect" || s.type === "circle" || s.type === "diamond")) {
                if (hitTest(ptX, ptY, s)) { hitTarget = s; break; }
             }
           }
           
           if (hitTarget) {
             const c = getCenter(hitTarget);
             state.updateShape(finishedShape.id, {
                type: "connector",
                ...(activeHandle === "start" ? { sourceId: hitTarget.id, x: c.x, y: c.y } : { targetId: hitTarget.id, endX: c.x, endY: c.y })
             });
           } else {
             // Detach if dragged away
             const isStart = activeHandle === "start";
             const stillHasOther = isStart ? !!finishedShape.targetId : !!finishedShape.sourceId;
             state.updateShape(finishedShape.id, {
                ...(isStart ? { sourceId: undefined } : { targetId: undefined }),
                type: stillHasOther ? "connector" : "line"
             });
           }
           finishedShape = state.shapes.find(s => s.id === currentShapeId) || finishedShape;
        }

        // Standardize dimensions if resized to negative
        if (activeHandle && activeHandle !== "body" && activeHandle !== "start" && activeHandle !== "end") {
           const { minX, minY, w, h } = getBoundingBox(finishedShape);
           state.updateShape(finishedShape.id, { x: minX, y: minY, width: w, height: h });
           finishedShape = state.shapes.find(s => s.id === currentShapeId) || finishedShape;
        }

        for (const id of selectedIds) {
           const shape = state.shapes.find(s => s.id === id);
           if (shape) {
             sendEvent("SHAPE_UPDATE", shape);
             await saveShapeToDB(roomId, shape);
             if (shape.type !== "connector") {
                state.shapes.forEach(async conn => {
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
           const sortedShapes = [...state.shapes].sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
           for (let i = sortedShapes.length - 1; i >= 0; i--) {
             const s = sortedShapes[i];
             if (s && s.id !== finishedShape.id && (s.type === "rect" || s.type === "circle" || s.type === "diamond")) {
                if (!sourceShape && hitTest(startX, startY, s)) sourceShape = s;
                if (!targetShape && hitTest(event.clientX, event.clientY, s)) targetShape = s;
             }
           }
           if (sourceShape && targetShape && sourceShape.id !== targetShape.id) {
             const sc = getCenter(sourceShape);
             const tc = getCenter(targetShape);
             state.updateShape(finishedShape.id, {
               type: "connector",
               sourceId: sourceShape.id,
               targetId: targetShape.id,
               x: sc.x,
               y: sc.y,
               endX: tc.x,
               endY: tc.y
             });
             finishedShape = state.shapes.find(s => s.id === currentShapeId) || finishedShape;
           } else if (sourceShape || targetShape) {
              const connectedShape = sourceShape || targetShape;
              const c = getCenter(connectedShape!);
              const isSource = !!sourceShape;
              state.updateShape(finishedShape.id, {
                 type: "connector",
                 ...(isSource ? { sourceId: connectedShape!.id, x: c.x, y: c.y } : { targetId: connectedShape!.id, endX: c.x, endY: c.y })
              });
              finishedShape = state.shapes.find(s => s.id === currentShapeId) || finishedShape;
           }
        }

        // Standardize newly drawn shapes
        if (finishedShape.type !== "line" && finishedShape.type !== "connector" && finishedShape.type !== "arrow") {
           const { minX, minY, w, h } = getBoundingBox(finishedShape);
           state.updateShape(finishedShape.id, { x: minX, y: minY, width: w, height: h });
           finishedShape = state.shapes.find(s => s.id === currentShapeId) || finishedShape;
        }

        if (finishedShape) {
          sendEvent("SHAPE_UPDATE", finishedShape);
          await saveShapeToDB(roomId, finishedShape);
        }
      }
    }
    
    activeHandle = null;
    currentShapeId = null;
    originalShapeData = null;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if ((e.key === "Backspace" || e.key === "Delete") && selectedIds.size > 0) {
       const state = useCanvasStore.getState();
       if (selectedIds.size === 1) {
         const id = Array.from(selectedIds)[0];
         sendEvent("SHAPE_DELETE", { id });
         const newShapes = state.shapes.filter(s => s.id !== id);
         state.setShapes(newShapes);
         saveShapesToDB(roomId, newShapes);
       } else {
         const ids = Array.from(selectedIds);
         sendEvent("SHAPES_DELETE", { ids });
         const newShapes = state.shapes.filter(s => !selectedIds.has(s.id));
         state.setShapes(newShapes);
         saveShapesToDB(roomId, newShapes);
       }
       selectedIds.clear();
       clearCanvas(useCanvasStore.getState().shapes, selectedIds, canvas, ctx);
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "a") {
       e.preventDefault();
       const state = useCanvasStore.getState();
       selectedIds = new Set(state.shapes.map(s => s.id));
       clearCanvas(state.shapes, selectedIds, canvas, ctx);
    }
  };

  const handleSocketMessage = async (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "chat") {
        const canvasEvent: CanvasEvent = JSON.parse(msg.message);
        if (canvasEvent.clientId === clientId) {
           if (msg.sequenceNumber) await setLastSequenceNumber(roomId, msg.sequenceNumber);
           return;
        }

        const state = useCanvasStore.getState();
        
        if (canvasEvent.action === "SHAPE_DELETE") {
           const id = canvasEvent.payload.id;
           state.setShapes(state.shapes.filter(s => s.id !== id));
        } else if (canvasEvent.action === "SHAPES_DELETE") {
           const ids = new Set((canvasEvent.payload as any).ids as string[]);
           state.setShapes(state.shapes.filter(s => !ids.has(s.id)));
        } else {
           const incomingShape = { ...canvasEvent.payload, sequenceNumber: msg.sequenceNumber };
           const existingShape = state.shapes.find(s => s.id === incomingShape.id);
           
           if (existingShape && existingShape.sequenceNumber && msg.sequenceNumber && existingShape.sequenceNumber > msg.sequenceNumber) {
              return;
           }

           if (canvasEvent.action === "SHAPE_ADD" && !existingShape) {
             state.addShape(incomingShape);
           } else if (canvasEvent.action === "SHAPE_UPDATE") {
             if (existingShape) state.updateShape(incomingShape.id, incomingShape);
             else state.addShape(incomingShape);
           }
           await saveShapeToDB(roomId, incomingShape);
        }

        if (msg.sequenceNumber) {
          await setLastSequenceNumber(roomId, msg.sequenceNumber);
        }
      }
    } catch (e) {
      console.warn("Error handling WS message", e);
    }
  };

  if (socket) socket.addEventListener("message", handleSocketMessage);
  
  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("mouseleave", handleMouseUp);
  window.addEventListener("keydown", handleKeyDown);

  return () => {
    unsubscribe();
    canvas.removeEventListener("mousedown", handleMouseDown);
    canvas.removeEventListener("mousemove", handleMouseMove);
    canvas.removeEventListener("mouseup", handleMouseUp);
    canvas.removeEventListener("mouseleave", handleMouseUp);
    window.removeEventListener("keydown", handleKeyDown);
    if (socket) {
      socket.removeEventListener("message", handleSocketMessage);
      socket.removeEventListener("open", syncWithServer);
    }
  };
}

function clearCanvas(
  shapes: Shape[],
  selectedIds: Set<string>,
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const sortedShapes = [...shapes].sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));

  sortedShapes.forEach((shape) => {
    drawShape(ctx, shape);
    if (selectedIds.has(shape.id)) {
      drawSelectionBox(ctx, shape);
    }
  });
}

async function getExistingShapes(roomId: string) {
  if (roomId === "local" || roomId === "guest") return [];
  const response = await axios.get(`${BACKEND_URL}/chats/${roomId}`);
  const messages = response.data.message;

  const shapes = messages.map((x: { id: number, message: string }) => {
    try {
       const messageData = JSON.parse(x.message);
       const payload = messageData.payload || messageData.shape || messageData;
       return { ...payload, sequenceNumber: x.id };
    } catch {
       return null;
    }
  }).filter(Boolean);

  return (shapes as Shape[]).sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
}
