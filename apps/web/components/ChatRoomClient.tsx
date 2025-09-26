"use client";

// TODO
// 1 check the message is from this room or not
//

import { useEffect, useState } from "react";
import { useSocket } from "../hooks/useSocket";

export function ChatRoomClient({
  id,
  messages,
}: {
  id: string;
  messages: { message: string }[];
}) {
  const { loading, socket } = useSocket();
  const [chats, setChats] = useState(messages);
  const [currentMessage, setCurrentMessage] = useState("");

  useEffect(() => {
    if (socket && !loading) {
      socket.send(
        JSON.stringify({
          type: "join_room",
          roomId: id,
        }),
      );
      socket.onmessage = (e) => {
        const parsedData = JSON.parse(e.data);
        if (parsedData.type === "chat") {
          setChats((c) => [...c, { message: parsedData.message }]);
        }
      };
    }
  }, [loading, socket, id]);
  return (
    <div className="flex  justify-between items-center flex-col  ">
      <div className="items-center overflow-y-auto mb-5 max-h-[40rem] h-[40rem] max-w-[40rem] ">
        {chats.map((m, key) => (
          <div
            className="text-lg bg-slate-50  mt-2 p-2 mb-2 rounded-3xl "
            key={key}
          >
            {m.message}
          </div>
        ))}
      </div>

      <div className=" flex flex-row gap-2">
        <input
          className=" border-2 border-indigo-300 hover:border-indigo-500 focus-within:border-indigo-500 py-2 rounded-xl"
          value={currentMessage}
          type="text"
          placeholder="write your messages"
          onChange={(e) => {
            setCurrentMessage(e.target.value);
          }}
        />

        <button
          className="bg-red-400 rounded-xl px-10"
          onClick={() => {
            socket?.send(
              JSON.stringify({
                type: "chat",
                message: currentMessage,
                roomId: id,
              }),
            );

            setCurrentMessage("");
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}
