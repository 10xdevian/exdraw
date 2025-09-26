import { BACKEND_URL } from "@repo/shared";
import axios from "axios";
import { ChatRoomClient } from "./ChatRoomClient";

async function getChats(roomId: string) {
  const resoponse = await axios.get(`${BACKEND_URL}/chats/${roomId}`);
  return resoponse.data.message;
}

export async function ChatRoom({ id }: { id: string }) {
  const messages = await getChats(id);

  return <ChatRoomClient id={id} messages={messages} />;
}
