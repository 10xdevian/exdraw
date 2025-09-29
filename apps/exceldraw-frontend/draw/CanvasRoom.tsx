"use client";
import { TOKEN, WEBSOCKET_URL } from "@repo/shared";
import { useEffect, useState } from "react";
import Canvas from "./Canvas";

export function CanvasRoom({ roomId }: { roomId: string }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(
      "ws://localhost:8080?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjMsImlhdCI6MTc1OTAzODYyM30.GhELk0WUt65aqnFyhKlArb6SPREkyBudnC-dVIkGirM",
    );

    ws.onopen = () => {
      setSocket(ws);
      ws.send(
        JSON.stringify({
          type: "join_room",
          roomId,
        }),
      );
    };
  }, []);

  if (!socket) {
    return <div>Connectiing..... websocket</div>;
  }
  return <Canvas roomId={roomId} socket={socket} />;
}
