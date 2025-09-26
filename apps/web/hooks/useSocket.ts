import { WEBSOCKET_URL } from "@repo/shared";
import { useEffect, useState } from "react";

export function useSocket() {
  const [loading, setLoading] = useState(true);
  const [socket, setSocket] = useState<WebSocket>();

  useEffect(() => {
    const ws = new WebSocket(
      `ws://localhost:8080?token=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VySWQiOjMsImlhdCI6MTc1ODg2MjQyMH0.Q_CGoGPOuZAZc2M8jyJtrciMYNvTx6JKm-98utWJQOo`,
    );
    ws.onopen = () => {
      setLoading(false);
      setSocket(ws);
      console.log("WebSocket connection established");
    };
  }, []);
  return {
    socket,
    loading,
  };
}
