import { Circle, Pencil, RectangleHorizontal } from "lucide-react";
import IconButton from "./IconButton";
type Shape = "circle" | "rect" | "pencil";

import React from "react";
export default function TabBar({
  setSelectTool,
  selectTool,
}: {
  selectTool: Shape;
  setSelectTool: (tool: Shape) => void;
}): React.ReactNode {
  return (
    <div className=" w-full flex fixed justify-center items-center  ">
      <div className="flex flex-row gap-1.5 w-auto px-6 justify-center  bg-gray-500  rounded-full py-1.5">
        <IconButton
          activated={selectTool === "rect"}
          icon={<RectangleHorizontal />}
          onClick={() => {
            setSelectTool("rect");
          }}
        />
        <IconButton
          activated={selectTool === "circle"}
          icon={<Circle />}
          onClick={() => {
            setSelectTool("circle");
          }}
        />
        <IconButton
          activated={selectTool === "pencil"}
          icon={<Pencil />}
          onClick={() => {
            setSelectTool("pencil");
          }}
        />
      </div>
    </div>
  );
}
