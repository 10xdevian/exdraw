import { CanvasEvent, Shape } from "@repo/shared";
import { useCanvasStore } from "../store/canvasStore";
import { getLastSequenceNumber, setLastSequenceNumber, saveShapeToDB } from "../lib/db";
import { generateId } from "./utils";

export function setupNetwork(socket: WebSocket | null, roomId: string, clientId: string) {
  
  const syncWithServer = async () => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    const lastSeq = await getLastSequenceNumber(roomId);
    socket.send(JSON.stringify({ type: "sync", roomId, lastSequenceNumber: lastSeq }));
  };

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

  if (socket) {
    if (socket.readyState === WebSocket.OPEN) syncWithServer();
    socket.addEventListener("open", syncWithServer);
    socket.addEventListener("message", handleSocketMessage);
  }

  const cleanupNetwork = () => {
    if (socket) {
      socket.removeEventListener("message", handleSocketMessage);
      socket.removeEventListener("open", syncWithServer);
    }
  };

  return { sendEvent, cleanupNetwork };
}
