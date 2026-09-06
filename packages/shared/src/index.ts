export const JWT_SECRET = "ilovekiyara";

export const DATABASE_URL = "ilove";

export const BACKEND_URL = "http://localhost:3004";

export const WEBSOCKET_URL = "ws://localhost:8080";

// ws-backend serves its /health and /metrics endpoints over plain HTTP on the SAME port
// as the WebSocket server (they share one underlying http.Server) — see ws-backend/src/index.ts.
export const WS_BACKEND_HTTP_URL = "http://localhost:8080";

// worker has no other HTTP surface; this is purely for /health and /metrics.
export const WORKER_METRICS_URL = "http://localhost:9095";

export const TOKEN =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjMsImlhdCI6MTc1ODk2ODIxNX0.fYw6w6cd3ZACFOUh9cRxOtwVpp6vHgjIu08I8mIvkEY";

export type ShapeType = "rect" | "circle" | "line" | "connector" | "select" | "pencil" | "text" | "diamond" | "arrow" | "image" | "eraser";

export interface Shape {
  id: string;
  type: ShapeType;
  x: number;
  y: number;
  width: number;
  height: number;
  endX?: number;      // For lines
  endY?: number;      // For lines
  sourceId?: string;  // For connectors
  targetId?: string;  // For connectors
  text?: string;      // For text shapes
  strokeColor?: string;
  strokeWidth?: number;
  backgroundColor?: string;
  sequenceNumber?: number;
}

export type EventAction = "SHAPE_ADD" | "SHAPE_UPDATE" | "SHAPE_DELETE" | "SHAPES_DELETE";

export interface CanvasEvent {
  eventId: string;
  clientId: string;
  roomId: string;
  timestamp: number;
  action: EventAction;
  payload: Shape;
  sequenceNumber?: number; // added by server
}
