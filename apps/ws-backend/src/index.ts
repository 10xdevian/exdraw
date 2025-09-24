import { WebSocketServer } from "ws";
import jwt, { JwtPayload } from "jsonwebtoken";
import { JWT_SECRET } from "@repo/shared";
const wss = new WebSocketServer({ port: 8080 });

interface User {
  id: string;
  rooms: string[];
  ws: WebSocket;
}
const user: User[] = [];
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

  user.push({
    userId,
    rooms: [],
    //@ts-ignore
    ws,
  });

  ws.on("message", function message(data) {
    ws.send("ping" + data);
  });
});
console.log("welcome to websocket");
