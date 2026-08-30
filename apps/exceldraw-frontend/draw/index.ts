import axios from "axios";
import { BACKEND_URL } from "@repo/shared";
import { useCanvasStore } from "../store/canvasStore";
import { Shape, CanvasEvent } from "@repo/shared";
import { getShapesFromDB, saveShapeToDB, saveShapesToDB, getLastSequenceNumber, setLastSequenceNumber } from "../lib/db";

function generateId() {
  return Math.random().toString(36).substring(2, 15);
}

// Throttle function for cursor/shape updates
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

  // 1. INSTANT LOCAL LOAD
  try {
    const localShapes = await getShapesFromDB(roomId);
    if (localShapes.length > 0) {
      useCanvasStore.getState().setShapes(localShapes);
    } else {
      // fallback fetch if idb empty
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

  // Draw loop (Zustand subscription)
  const unsubscribe = useCanvasStore.subscribe((state, prevState) => {
    if (state.shapes !== prevState.shapes) {
      clearCanvas(state.shapes, canvas, ctx);
    }
  });

  // Initial draw
  clearCanvas(useCanvasStore.getState().shapes, canvas, ctx);

  let isDrawing = false;
  let startX = 0;
  let startY = 0;
  let currentShapeId: string | null = null;
  const clientId = generateId();

  const sendEvent = (action: CanvasEvent["action"], shape: Shape) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const event: CanvasEvent = {
      eventId: generateId(),
      clientId,
      roomId,
      timestamp: Date.now(),
      action,
      payload: shape
    };
    socket.send(JSON.stringify({
      type: "chat",
      message: JSON.stringify(event),
      roomId
    }));
  };

  const throttledUpdateBroadcast = throttle((shape: Shape) => {
    sendEvent("SHAPE_UPDATE", shape);
  }, 50);

  const handleMouseDown = (event: MouseEvent) => {
    const state = useCanvasStore.getState();
    if (state.activeTool === "select") return;

    isDrawing = true;
    startX = event.clientX;
    startY = event.clientY;
    currentShapeId = generateId();

    const newShape: Shape = {
      id: currentShapeId,
      type: state.activeTool,
      x: startX,
      y: startY,
      width: 0,
      height: 0,
    };

    state.addShape(newShape);
    sendEvent("SHAPE_ADD", newShape);
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!isDrawing || !currentShapeId) return;

    const width = event.clientX - startX;
    const height = event.clientY - startY;

    // Optimistically update local state via Zustand
    useCanvasStore.getState().updateShape(currentShapeId, { width, height });
    
    const state = useCanvasStore.getState();
    const currentShape = state.shapes.find(s => s.id === currentShapeId);
    if (currentShape) {
       throttledUpdateBroadcast(currentShape);
    }
  };

  const handleMouseUp = async (event: MouseEvent) => {
    if (!isDrawing || !currentShapeId) return;
    
    isDrawing = false;
    const state = useCanvasStore.getState();
    const finishedShape = state.shapes.find(s => s.id === currentShapeId);
    
    if (finishedShape) {
      sendEvent("SHAPE_UPDATE", finishedShape);
      // Persist to IDB once finished drawing
      await saveShapeToDB(roomId, finishedShape);
    }
    
    currentShapeId = null;
  };

  const handleSocketMessage = async (event: MessageEvent) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === "chat") {
        const canvasEvent: CanvasEvent = JSON.parse(msg.message);
        const incomingShape = canvasEvent.payload;
        
        // Ignore our own events reflected back unless we need sequence validation
        if (canvasEvent.clientId === clientId) {
           if (msg.sequenceNumber) {
              await setLastSequenceNumber(roomId, msg.sequenceNumber);
           }
           return;
        }

        const state = useCanvasStore.getState();
        const existingShape = state.shapes.find(s => s.id === incomingShape.id);
        
        if (canvasEvent.action === "SHAPE_ADD" && !existingShape) {
          state.addShape(incomingShape);
          await saveShapeToDB(roomId, incomingShape);
        } else if (canvasEvent.action === "SHAPE_UPDATE") {
          if (existingShape) {
            state.updateShape(incomingShape.id, incomingShape);
          } else {
            state.addShape(incomingShape);
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

  if (socket) {
    socket.addEventListener("message", handleSocketMessage);
  }

  canvas.addEventListener("mousedown", handleMouseDown);
  canvas.addEventListener("mousemove", handleMouseMove);
  canvas.addEventListener("mouseup", handleMouseUp);
  canvas.addEventListener("mouseleave", handleMouseUp); // Handle dragging off canvas

  return () => {
    unsubscribe();
    canvas.removeEventListener("mousedown", handleMouseDown);
    canvas.removeEventListener("mousemove", handleMouseMove);
    canvas.removeEventListener("mouseup", handleMouseUp);
    canvas.removeEventListener("mouseleave", handleMouseUp);
    if (socket) {
      socket.removeEventListener("message", handleSocketMessage);
      socket.removeEventListener("open", syncWithServer);
    }
  };
}

function clearCanvas(
  shapes: Shape[],
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
) {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  shapes.forEach((shape) => {
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
    }
  });
}

async function getExistingShapes(roomId: string) {
  if (roomId === "local" || roomId === "guest") return [];
  const response = await axios.get(`${BACKEND_URL}/chats/${roomId}`);
  const messages = response.data.message;

  const shapes = messages.map((x: { message: string }) => {
    try {
       const messageData = JSON.parse(x.message);
       // handle old { shape: ... } format vs new CanvasEvent format
       return messageData.payload || messageData.shape || messageData;
    } catch {
       return null;
    }
  }).filter(Boolean);

  return shapes as Shape[];
}
