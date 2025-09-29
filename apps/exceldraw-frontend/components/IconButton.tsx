import { ReactNode } from "react";
import { Button } from "./ui/button";

export default function IconButton({
  icon,
  onClick,
  activated,
}: {
  icon: ReactNode;
  onClick: () => void;
  activated?: string;
}) {
  return (
    <Button
      onClick={onClick}
      variant={"secondary"}
      className={
        activated ? "text-red-900 cursor-pointer" : "text-black cursor-pointer"
      }
    >
      {icon}
    </Button>
  );
}
