import { CanvasRoom } from "../../../draw/CanvasRoom";

export default async function Draw({
  params,
}: {
  params: {
    roomId: string;
  };
}) {
  const roomId = (await params).roomId;
  console.log(roomId);
  return (
    <div>
      <CanvasRoom roomId={roomId} />;
    </div>
  );
}
