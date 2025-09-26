"use client";
import { useState } from "react";
import Input from "./Input";
import { useRouter } from "next/navigation";

export default function Home() {
  const [roomId, setRoomId] = useState("");
  const router = useRouter();
  return (
    <div className="flex justify-center items-center">
      {/*<h1 className="text-5xl font-semibold">Home page</h1>*/}

      <input
      className="border-sky-950"
        value={roomId}
        type="text"
        placeholder="Enter the roomID"
        onChange={(e) => {
          setRoomId(e.target.value);
          
        }}
      />

      <button
        onClick={() => {
          router.push(`/room/${roomId}`);
        }}
      >
        Join Room
      </button>
    </div>
  );
}
 