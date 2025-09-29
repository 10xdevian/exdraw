import { Circle, Pencil, RectangleHorizontal } from "lucide-react";
import IconButton from "./IconButton";
type Shape = "circle" | "rect" | "pencil";

export default function TabBar({
  setSelectTool,
  selectTool,
}: {
  selectTool: Shape;
  setSelectTool: () => void;
}) {
  return (
    <div className=" w-full flex fixed justify-center items-center  ">
      <div className="flex flex-row gap-1.5 w-auto px-6 justify-center  bg-gray-500  rounded-full py-1.5">
        <IconButton
          activated="rect"
          icon={<RectangleHorizontal />}
          onClick={() => {}}
        />
        <IconButton
          activated="circle"
          icon={<Circle />}
          onClick={() => {
            setSelectTool("circle");
          }}
        />
        <IconButton activated="pencil" icon={<Pencil />} onClick={() => {}} />
        <IconButton activated="pencil" icon={<Pencil />} onClick={() => {}} />
          <IconButton activated="pencil" icon={<Pencil />} onClick={() => {}} />

      </div>
    </div>
  );
}
