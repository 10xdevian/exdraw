"use client";
import { TOKEN, WEBSOCKET_URL } from "@repo/shared";
import { useEffect, useState } from "react";
import Canvas from "./Canvas";

export function CanvasRoom({ roomId }: { roomId: string }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);

  useEffect(() => {
    const ws = new WebSocket(
      `${WEBSOCKET_URL}?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjMsImlhdCI6MTc1ODk2ODIxNX0.fYw6w6cd3ZACFOUh9cRxOtwVpp6vHgjIu08I8mIvkEY`,
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
  return (
    <div>
      <Canvas roomId={roomId} socket={socket} />
    </div>
  );
}
