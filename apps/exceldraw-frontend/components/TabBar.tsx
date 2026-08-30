import { Circle, Minus, MousePointer2, RectangleHorizontal } from "lucide-react";
import IconButton from "./IconButton";
import { ShapeType } from "@repo/shared";
import React from "react";

export default function TabBar({
  selectTool,
  setSelectTool,
}: {
  selectTool: ShapeType;
  setSelectTool: (tool: ShapeType) => void;
}): React.ReactNode {
  return (
    <div className="w-full flex fixed justify-center items-center mt-4">
      <div className="flex flex-row gap-1.5 w-auto px-6 justify-center bg-gray-500 rounded-full py-1.5 shadow-lg">
        <IconButton
          activated={selectTool === "select"}
          icon={<MousePointer2 size={20} />}
          onClick={() => setSelectTool("select")}
        />
        <IconButton
          activated={selectTool === "rect"}
          icon={<RectangleHorizontal size={20} />}
          onClick={() => setSelectTool("rect")}
        />
        <IconButton
          activated={selectTool === "circle"}
          icon={<Circle size={20} />}
          onClick={() => setSelectTool("circle")}
        />
        <IconButton
          activated={selectTool === "line"}
          icon={<Minus size={20} />}
          onClick={() => setSelectTool("line")}
        />
      </div>
    </div>
  );
}
