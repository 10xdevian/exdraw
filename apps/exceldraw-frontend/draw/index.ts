import axios from "axios";
import { BACKEND_URL } from "@repo/shared";
import { useCanvasStore } from "../store/canvasStore";
import { Shape, CanvasEvent } from "@repo/shared";
import { getShapesFromDB, saveShapeToDB, saveShapesToDB, getLastSequenceNumber, setLastSequenceNumber } from "../lib/db";

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

function hitTest(x: number, y: number, shape: Shape): boolean {
  if (shape.type === "rect") {
    // Normalization for negative width/height
    const minX = Math.min(shape.x, shape.x + shape.width);
    const maxX = Math.max(shape.x, shape.x + shape.width);
    const minY = Math.min(shape.y, shape.y + shape.height);
    const maxY = Math.max(shape.y, shape.y + shape.height);
    return x >= minX && x <= maxX && y >= minY && y <= maxY;
  }
  if (shape.type === "circle") {
    const rx = Math.abs(shape.width / 2);
    const ry = Math.abs(shape.height / 2);
    const cx = shape.x + shape.width / 2;
    const cy = shape.y + shape.height / 2;
    if (rx === 0 || ry === 0) return false;
    return Math.pow(x - cx, 2) / Math.pow(rx, 2) + Math.pow(y - cy, 2) / Math.pow(ry, 2) <= 1;
  }
  if (shape.type === "line" || shape.type === "connector") {
    const ex = shape.endX ?? shape.x;
    const ey = shape.endY ?? shape.y;
    const l2 = Math.pow(ex - shape.x, 2) + Math.pow(ey - shape.y, 2);
    if (l2 === 0) return Math.hypot(x - shape.x, y - shape.y) < 5;
    let t = ((x - shape.x) * (ex - shape.x) + (y - shape.y) * (ey - shape.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    const projX = shape.x + t * (ex - shape.x);
    const projY = shape.y + t * (ey - shape.y);
    return Math.hypot(x - projX, y - projY) < 5;
  }
  return false;
}

function getCenter(shape: Shape) {
  if (shape.type === "rect" || shape.type === "circle") {
    return { x: shape.x + shape.width / 2, y: shape.y + shape.height / 2 };
  }
  if (shape.type === "line" || shape.type === "connector") {
    return { x: (shape.x + (shape.endX ?? shape.x)) / 2, y: (shape.y + (shape.endY ?? shape.y)) / 2 };
  }
  return { x: shape.x, y: shape.y };
}

export async function DrawCanva(
  canvas: HTMLCanvasElement,
  roomId: string,
  socket: WebSocket | null,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  // 1. INSTANT LOCAL LOAD
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

  // 2. RECONNECT + SYNC (Missed-event replay)
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

  // Draw loop (Zustand subscription)
  const unsubscribe = useCanvasStore.subscribe((state, prevState) => {
    if (state.shapes !== prevState.shapes || state.activeTool !== prevState.activeTool) {
      clearCanvas(state.shapes, selectedIds, canvas, ctx);
    }
  });

  clearCanvas(useCanvasStore.getState().shapes, selectedIds, canvas, ctx);

  let isDrawingOrDragging = false;
  let startX = 0;
  let startY = 0;
  let currentShapeId: string | null = null;
  let dragOffset = { x: 0, y: 0 };
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

  // Auto-update connectors when a connected shape moves
  const updateConnectorsForShape = (movedShapeId: string, deltaX: number, deltaY: number) => {
    const state = useCanvasStore.getState();
    const connectorsToUpdate: Shape[] = [];
    
    state.shapes.forEach(shape => {
      if (shape.type === "connector") {
        let updated = false;
        let newConnector = { ...shape };
        
        if (shape.sourceId === movedShapeId) {
           newConnector.x += deltaX;
           newConnector.y += deltaY;
           updated = true;
        }
        if (shape.targetId === movedShapeId) {
           newConnector.endX = (newConnector.endX ?? newConnector.x) + deltaX;
           newConnector.endY = (newConnector.endY ?? newConnector.y) + deltaY;
           updated = true;
        }
        
        if (updated) {
          state.updateShape(newConnector.id, newConnector);
          connectorsToUpdate.push(newConnector);
        }
      }
    });
    
    // Broadcast connector updates
    connectorsToUpdate.forEach(conn => throttledUpdateBroadcast(conn));
    return connectorsToUpdate;
  };

  const handleMouseDown = (event: MouseEvent) => {
    const state = useCanvasStore.getState();
    startX = event.clientX;
    startY = event.clientY;

    if (state.activeTool === "select") {
      // Find top-most hit shape
      const sortedShapes = [...state.shapes].sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
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
    if (state.activeTool === "line") {
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

    if (state.activeTool === "select" && selectedIds.has(currentShape.id)) {
      const deltaX = event.clientX - dragOffset.x;
      const deltaY = event.clientY - dragOffset.y;
      dragOffset = { x: event.clientX, y: event.clientY };

      // Move all selected shapes
      selectedIds.forEach(id => {
        const shape = state.shapes.find(s => s.id === id);
        if (shape) {
          const updates: Partial<Shape> = { x: shape.x + deltaX, y: shape.y + deltaY };
          if (shape.type === "line" || shape.type === "connector") {
             updates.endX = (shape.endX ?? shape.x) + deltaX;
             updates.endY = (shape.endY ?? shape.y) + deltaY;
          }
          state.updateShape(id, updates);
          
          const updatedShape = state.shapes.find(s => s.id === id);
          if (updatedShape) {
             throttledUpdateBroadcast(updatedShape);
             updateConnectorsForShape(id, deltaX, deltaY);
          }
        }
      });
      return;
    }

    // Drawing new shapes
    const width = event.clientX - startX;
    const height = event.clientY - startY;

    if (currentShape.type === "line") {
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
        // Broadcast final positions for selected shapes
        for (const id of selectedIds) {
           const shape = state.shapes.find(s => s.id === id);
           if (shape) {
             sendEvent("SHAPE_UPDATE", shape);
             await saveShapeToDB(roomId, shape);
             // Connectors saving logic
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
        // If drawing a line, check if it connects two shapes
        if (finishedShape.type === "line") {
           let sourceShape: Shape | null = null;
           let targetShape: Shape | null = null;
           // Find shapes under start and end points
           const sortedShapes = [...state.shapes].sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
           for (let i = sortedShapes.length - 1; i >= 0; i--) {
             const s = sortedShapes[i];
             if (!s) continue;
             if (s.id !== finishedShape.id && (s.type === "rect" || s.type === "circle")) {
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
             finishedShape = state.shapes.find(s => s.id === currentShapeId);
           }
        }

        if (finishedShape) {
          sendEvent("SHAPE_UPDATE", finishedShape);
          await saveShapeToDB(roomId, finishedShape);
        }
      }
    }
    currentShapeId = null;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // Delete/Backspace
    if ((e.key === "Backspace" || e.key === "Delete") && selectedIds.size > 0) {
       const state = useCanvasStore.getState();
       
       if (selectedIds.size === 1) {
         const id = Array.from(selectedIds)[0];
         sendEvent("SHAPE_DELETE", { id });
         const newShapes = state.shapes.filter(s => s.id !== id);
         state.setShapes(newShapes);
         saveShapesToDB(roomId, newShapes); // Sync IDB
       } else {
         const ids = Array.from(selectedIds);
         sendEvent("SHAPES_DELETE", { ids });
         const newShapes = state.shapes.filter(s => !selectedIds.has(s.id));
         state.setShapes(newShapes);
         saveShapesToDB(roomId, newShapes); // Sync IDB
       }
       selectedIds.clear();
       clearCanvas(useCanvasStore.getState().shapes, selectedIds, canvas, ctx);
    }
    // Select All (Cmd+A / Ctrl+A)
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
        
        // Block reflected events
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
              console.log(`[Replay] Dropping out-of-order stale update for ${incomingShape.id}`);
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
    ctx.beginPath();
    ctx.strokeStyle = shape.strokeColor || "white";
    
    if (shape.type === "rect") {
      ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
    } else if (shape.type === "circle") {
      const radiusX = Math.abs(shape.width / 2);
      const radiusY = Math.abs(shape.height / 2);
      const centerX = shape.x + shape.width / 2;
      const centerY = shape.y + shape.height / 2;
      ctx.ellipse(centerX, centerY, radiusX, radiusY, 0, 0, 2 * Math.PI);
      ctx.stroke();
    } else if (shape.type === "line" || shape.type === "connector") {
      ctx.moveTo(shape.x, shape.y);
      ctx.lineTo(shape.endX ?? shape.x, shape.endY ?? shape.y);
      ctx.stroke();
    }
    
    // Draw Selection Highlight
    if (selectedIds.has(shape.id)) {
       ctx.save();
       ctx.strokeStyle = "#a855f7"; // Purple selection
       ctx.lineWidth = 2;
       ctx.setLineDash([5, 5]);
       
       const padding = 6;
       if (shape.type === "rect") {
         const minX = Math.min(shape.x, shape.x + shape.width);
         const minY = Math.min(shape.y, shape.y + shape.height);
         const w = Math.abs(shape.width);
         const h = Math.abs(shape.height);
         ctx.strokeRect(minX - padding, minY - padding, w + padding * 2, h + padding * 2);
       } else if (shape.type === "circle") {
         const radiusX = Math.abs(shape.width / 2);
         const radiusY = Math.abs(shape.height / 2);
         const centerX = shape.x + shape.width / 2;
         const centerY = shape.y + shape.height / 2;
         ctx.beginPath();
         ctx.ellipse(centerX, centerY, radiusX + padding, radiusY + padding, 0, 0, 2 * Math.PI);
         ctx.stroke();
       } else if (shape.type === "line" || shape.type === "connector") {
         const minX = Math.min(shape.x, shape.endX ?? shape.x);
         const minY = Math.min(shape.y, shape.endY ?? shape.y);
         const w = Math.abs((shape.endX ?? shape.x) - shape.x);
         const h = Math.abs((shape.endY ?? shape.y) - shape.y);
         ctx.strokeRect(minX - padding, minY - padding, w + padding * 2, h + padding * 2);
       }
       ctx.restore();
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
