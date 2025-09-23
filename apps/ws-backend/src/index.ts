import { WebSocketServer } from "ws";
import jwt, { JwtPayload } from "jsonwebtoken";
const wss = new WebSocketServer({ port: 8080 });

wss.on("connection", function connection(ws, request) {
  const url = request.url;

  if (!url) {
    return;
  }

  //@ts-ignore
  const queryParams = new URLSearchParams(url.split("?"[1]));

  const token = queryParams.get("token");

  //@ts-ignore
  const decond = jwt.verify(token, "ilovekiyara");

  if (!decond || !(decond as JwtPayload).email) {
    ws.close();
    return;
  }
  ws.on("message", function message(data) {
    ws.send("ping" + data);
  });
});
console.log("welcome to websocket");
