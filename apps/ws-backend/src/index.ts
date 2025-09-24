console.log("welcome to websocket");
// TODO
// 1 add certin people can join this room
// 2. add auth without authentication cant join
// 3.
//

import { WebSocketServer } from "ws";
import jwt, { JwtPayload } from "jsonwebtoken";
import { JWT_SECRET } from "@repo/shared";
import prisma from "@repo/db/client";

const wss = new WebSocketServer({ port: 8080 });
interface User {
  id: string;
  rooms: string[];
  ws: WebSocket;
}
const users: User[] = [];
function checkUser(token: string): string | null {
  //@ts-ignore
  const deconde = jwt.verify(token, JWT_SECRET);

  if (typeof deconde == "string") {
    return null;
  }

  if (!deconde || !deconde.userId) {
    return null;
  }

  return deconde.userId;
}

wss.on("connection", function connection(ws, request) {
  const url = request.url;

  if (!url) {
    return;
  }

  //@ts-ignore
  const queryParams = new URLSearchParams(url.split("?"[1]));

  const token = queryParams.get("token");

  //@ts-ignore
  const userId = checkUser(token);

  if (!userId) {
    ws.close();
  }

  users.push({
    userId,
    rooms: [],
    //@ts-ignore
    ws,
  });

  ws.on("message", async function message(data) {
    const parsedData = JSON.parse(data as unknown as string);

    if (parsedData.type === "join_room") {
      //@ts-ignore
      const user = users.find((x) => x.ws === ws);

      user?.rooms.push(parsedData.roomId);
    }

    if (parsedData.type === "leave_room") {
      //@ts-ignore
      const user = users.find((x) => x.ws === ws);

      if (!user) {
        return;
      }

      user.rooms = user?.rooms.filter((x) => x === parsedData.room);
    }

    if (parsedData.type === "chat") {
      const message = parsedData.message;
      const roomId = parsedData.roomId;

      await prisma.chat.create({
        data: {
          userId: userId as unknown as number,
          roomId,
          message,
        },
      });

      users.forEach((user) => {
        if (user.rooms.includes(roomId)) {
          user.ws.send(
            JSON.stringify({
              type: "chat",
              message: message,
              roomId,
            }),
          );
        }
      });
    }
  });
});
