import axios from "axios";
import { BACKEND_URL } from "@repo/shared";
import { ChatRoom } from "../../../components/ChatRoom";

async function getRoomId(slug: string) {
  const response = await axios.get(`${BACKEND_URL}/room/${slug}`);
  console.log("room\slug pe  : "+response);
  return response.data.room.id;
}

export default async function ChatRoom1({
  params,
}: {
  params: {
    slug: string;
  };
}) {
  const slug = params.slug;
  const roomId = await getRoomId(slug);
  return <ChatRoom id={roomId} />;
}
