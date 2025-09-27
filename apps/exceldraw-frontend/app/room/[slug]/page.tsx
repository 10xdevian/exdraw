"use client";
import { DrawCanva } from "@/draw";
import { useEffect, useRef } from "react";

export default function Draw() {
  const canvaRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (canvaRef.current) {
      const canvas = canvaRef.current;

      DrawCanva(canvas);
    }
  }, [canvaRef]);
  return (
    <div>
      <div>
        <h1>Hello canvas </h1>
        <canvas ref={canvaRef} width={1500} height={1500}></canvas>;
      </div>
      ;
    </div>
  );
}
