// TODO
// 1. add a react hook that change the canva hight and width when you resize the window

import { useEffect, useRef, useState } from "react";
import { DrawCanva } from ".";
import TabBar from "../components/TabBar";

type Shape = "circle" | "rect" | "pencil";

export default function Canvas({
  roomId,
  socket,
}: {
  roomId: string;
  socket: WebSocket;
}) {
  const canvaRef = useRef<HTMLCanvasElement>(null);
  const [selectTool, setSelectTool] = useState<Shape>("rect");

  useEffect(() => {
    if (canvaRef.current) {
      const canvas = canvaRef.current;

      DrawCanva(canvas, roomId, socket);
    }
  }, [canvaRef]);

  return (
    <div className="h-[100vh] overflow-hidden ">
      <TabBar selectTool={selectTool} setSelectTool={setSelectTool} />
      <canvas ref={canvaRef} width={2000} height={2000}></canvas>
    </div>
  );
}

//
