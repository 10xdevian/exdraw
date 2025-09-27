import { useEffect, useRef } from "react";
import { DrawCanva } from ".";
export default function Canvas({
  roomId,
  socket,
}: {
  roomId: string;
  socket: WebSocket;
}) {
  const canvaRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvaRef.current) {
      const canvas = canvaRef.current;

      DrawCanva(canvas, roomId, socket);
    }
  }, [canvaRef]);

  return (
    <div>
      <canvas ref={canvaRef} width={1500} height={1500}></canvas>;
    </div>
  );
}
