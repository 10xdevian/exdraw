import React from "react";
import { CanvasRoom } from "../../../draw/CanvasRoom";

export default async function Draw({
  params,
}: {
  params: {
    roomId: string;
  };
}): Promise<React.ReactNode> {
  const roomId = (await params).roomId;
  console.log(roomId);
  return <CanvasRoom roomId={roomId} />;
}
