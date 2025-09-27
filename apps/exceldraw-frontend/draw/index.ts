import axios from "axios";

import { BACKEND_URL } from "@repo/shared";
type Shape =
  | {
      type: "rect";
      width: number;
      height: number;
      x: number;
      y: number;
    }
  | {
      type: "circle";
      width: number;
      height: number;
      x: number;
      y: number;
    };
export async function DrawCanva(
  canvas: HTMLCanvasElement,
  roomId: string,
  socket: WebSocket,
) {
  const ctx = canvas.getContext("2d");

  const existingShapes: Shape[] = await getExistingShapes(roomId);

  if (!ctx) {
    return;
  }

  socket.onmessage = (event) => {
    const message = JSON.parse(event.data);

    if (message.type === "chat") {
      const parsedShapes = JSON.parse(message.message);
      existingShapes.push(parsedShapes);
      clearCanvas(existingShapes, canvas, ctx);
    }
  };

  clearCanvas(existingShapes, canvas, ctx);

  let clicked = false;
  let startX = 0;
  let startY = 0;

  canvas.addEventListener("mousedown", (event) => {
    clicked = true;
    startX = event.clientX;
    startY = event.clientY;
  });

  canvas.addEventListener("mouseup", (event) => {
    clicked = false;

    const width = event.clientX - startX;

    const height = event.clientY - startY;

    const shape: Shape = {
      type: "rect",
      x: startX,
      y: startY,
      width,
      height,
    };

    existingShapes.push(shape);

    socket.send(
      JSON.stringify({
        type: "chat",
        message: JSON.stringify({ shape }),
        roomId,
      }),
    );
  });

  canvas.addEventListener("mousemove", (event) => {
    if (clicked) {
      const width = event.clientX - startX;

      const height = event.clientY - startY;

      clearCanvas(existingShapes, canvas, ctx);

      ctx.strokeRect(startX, startY, width, height);
    }
  });
}

function clearCanvas(
  existingShapes: Shape[],
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
) {
  ctx.clearRect(0, 0, canvas.height, canvas.width);

  existingShapes.map((shape) => {
    if (shape.type === "rect")
      ctx.strokeRect(shape.x, shape.y, shape.width, shape.height);
  });
}

async function getExistingShapes(roomId: string) {
  const response = await axios.get(`${BACKEND_URL}/chats/${roomId}`);
  const messages = response.data.message;

  const shapes = messages.map((x: { message: string }) => {
    const messageData = JSON.parse(x.message);

    return messageData;
  });

  return shapes;
}
