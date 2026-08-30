"use client";

import { useState } from "react";
import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { Label } from "./ui/label";
import { Link2, Settings, ChevronDown, Eye, Check, RefreshCw } from "lucide-react";
import axios from "axios";
import { BACKEND_URL } from "@repo/shared";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { viewerKeys } from "../lib/queryKeys";

export type ShareModalMode = "share" | "collaborate";

export function ShareModal({
  isOpen,
  setIsOpen,
  mode,
  roomId
}: {
  isOpen: boolean;
  setIsOpen: (isOpen: boolean) => void;
  mode: ShareModalMode;
  roomId: string;
}) {
  const [copied, setCopied] = useState(false);

  // Use TanStack Query for fetching viewers and room info
  const currentRoomSlug = typeof window !== 'undefined' ? window.location.pathname.split("/").pop() || roomId : roomId;
  
  const { data } = useQuery({
    queryKey: ['roomInfo', currentRoomSlug],
    queryFn: async () => {
      if (currentRoomSlug === "guest" || currentRoomSlug === "local") return null;
      const token = localStorage.getItem("token");
      const res = await axios.get(`${BACKEND_URL}/room/${currentRoomSlug}`, {
        headers: token ? { Authorization: token } : {}
      });
      return { room: res.data.room, role: res.data.role };
    },
    staleTime: 60_000,
    refetchInterval: 5000,
    enabled: isOpen && currentRoomSlug !== "guest" && currentRoomSlug !== "local"
  });

  const roomInfo = data?.room;
  const role = data?.role || "viewer";

  const baseOrigin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const link = mode === "share" && roomInfo?.viewSlug
    ? `${baseOrigin}/room/${roomInfo.viewSlug}`
    : mode === "collaborate" && roomInfo?.collabSlug
      ? `${baseOrigin}/room/${roomInfo.collabSlug}`
      : `${baseOrigin}/room/${currentRoomSlug}`;  
  const { data: viewers = [] } = useQuery({
    queryKey: viewerKeys.room(currentRoomSlug || ""),
    queryFn: async () => {
      if (currentRoomSlug === "guest" || currentRoomSlug === "local") return [];
      const res = await axios.get(`${BACKEND_URL}/room/${currentRoomSlug}/viewers`);
      return res.data.viewers as { name: string }[];
    },
    enabled: isOpen && currentRoomSlug !== "guest" && currentRoomSlug !== "local",
    staleTime: 10_000,
    refetchInterval: 5000
  });

  const [inviteUsername, setInviteUsername] = useState("");
  const inviteMutation = useMutation({
    mutationFn: async (username: string) => {
      const token = localStorage.getItem("token");
      await axios.post(`${BACKEND_URL}/room/${currentRoomSlug}/invite`, { username }, {
        headers: { Authorization: token }
      });
    },
    onSuccess: () => {
      setInviteUsername("");
      queryClient.invalidateQueries({ queryKey: ['roomInfo', currentRoomSlug] });
    },
    onError: (err: unknown) => {
      const errorMessage = (err as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to invite user";
      alert(errorMessage);
    }
  });

  const queryClient = useQueryClient();
  const regenerateMutation = useMutation({
    mutationFn: async () => {
      const token = localStorage.getItem("token");
      const res = await axios.post(`${BACKEND_URL}/room/${currentRoomSlug}/regenerate-view`, {}, {
        headers: { Authorization: token }
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['roomInfo', currentRoomSlug] });
    },
    onError: (err: unknown) => {
      const errorMessage = (err as { response?: { data?: { error?: string } } }).response?.data?.error || "Failed to regenerate link";
      alert(errorMessage);
    }
  });

  const handleCopy = () => {
    if (typeof window !== 'undefined') {
      navigator.clipboard.writeText(link);
      setCopied(true);
      setTimeout(() => {
        setCopied(false);
        setIsOpen(false);
      }, 500);
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={setIsOpen}>
      <DialogContent className="sm:max-w-[500px] bg-[#09090b] border-white/10 text-white p-0 overflow-hidden shadow-2xl rounded-2xl">
        
        {/* Header */}
        <div className="p-5 pb-4 border-b border-white/5">
          <h2 className="text-xl font-semibold tracking-tight text-white mb-1">
            {mode === "collaborate" ? "Live collaboration" : "Share drawing"}
          </h2>
          <p className="text-sm text-gray-400">
            {mode === "collaborate" 
              ? "Invite people to edit and collaborate in real-time" 
              : "Get a link to share this drawing with others"}
          </p>
        </div>

        <div className="p-5 flex flex-col gap-6">
          
          {/* Invite people (Only in collaborate mode & if owner) */}
          {mode === "collaborate" && role === "owner" && (
            <div className="flex flex-col gap-2">
              <Label className="text-sm font-medium text-gray-200">Invite people</Label>
              <div className="flex items-center gap-2">
                <Input 
                  placeholder="Enter username..." 
                  className="bg-[#111] border-white/10 h-10 flex-1"
                  value={inviteUsername}
                  onChange={(e) => setInviteUsername(e.target.value)}
                />
                <div className="flex items-center gap-1.5 px-3 h-10 bg-[#111] border border-white/10 rounded-lg text-sm text-gray-300 cursor-pointer hover:bg-white/5">
                  Can edit <ChevronDown className="w-4 h-4 text-gray-500" />
                </div>
                <Button 
                  onClick={() => inviteUsername && inviteMutation.mutate(inviteUsername)}
                  disabled={inviteMutation.isPending || !inviteUsername}
                  className="h-10 px-5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg"
                >
                  {inviteMutation.isPending ? "Inviting..." : "Invite"}
                </Button>
              </div>
            </div>
          )}

          {/* Invite link */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <Label className="text-sm font-medium text-gray-200">Invite link</Label>
              <div className="flex items-center gap-3">
                {role === "owner" && mode === "share" && (
                  <button 
                    onClick={() => regenerateMutation.mutate()}
                    disabled={regenerateMutation.isPending}
                    title="Regenerate view link"
                    className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${regenerateMutation.isPending ? "animate-spin" : ""}`} />
                    Reset Link
                  </button>
                )}
                <Settings className="w-4 h-4 text-gray-500 cursor-pointer hover:text-gray-300" />
              </div>
            </div>
            <p className="text-xs text-gray-400 mb-1">
              {mode === "collaborate" 
                ? "Anyone with this link can view or edit this drawing" 
                : "Anyone with this link can view this drawing"}
            </p>
            <div className="flex items-center gap-2">
              <div className="relative flex-1">
                <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input 
                  readOnly
                  value={link} 
                  className="bg-[#111] border-white/10 h-10 pl-9 text-gray-300"
                />
              </div>
              <div className="flex items-center gap-1.5 px-3 h-10 bg-[#111] border border-white/10 rounded-lg text-sm text-gray-300 cursor-pointer hover:bg-white/5">
                {mode === "collaborate" ? "Can edit" : "Can view"} <ChevronDown className="w-4 h-4 text-gray-500" />
              </div>
              <Button onClick={handleCopy} className="h-10 px-5 bg-purple-600 hover:bg-purple-700 text-white font-medium rounded-lg">
                {copied ? <Check className="w-4 h-4 text-white" /> : "Copy link"}
              </Button>
            </div>
          </div>

          {/* People with access */}
          <div className="flex flex-col gap-4 mt-2">
            <Label className="text-sm font-medium text-gray-200">People with access</Label>
            
            <div className="flex flex-col gap-4 max-h-[160px] overflow-y-auto pr-2">
              
              {/* Admin */}
              {roomInfo?.admin && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-purple-600 flex items-center justify-center font-bold">
                      {roomInfo.admin.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-white">{roomInfo.admin.username}</span>
                      <span className="text-xs text-gray-400">Owner</span>
                    </div>
                  </div>
                  <span className="text-sm text-gray-400 mr-2">Owner</span>
                </div>
              )}

              {/* Editors */}
              {roomInfo?.editors?.map((editor: { id: number, username: string, email: string }) => (
                <div key={editor.id} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center font-bold text-gray-300">
                      {editor.username.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-white">{editor.username}</span>
                      <span className="text-xs text-gray-400">Invited user</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-sm text-gray-300 cursor-pointer hover:text-white">
                      Can edit <ChevronDown className="w-4 h-4 text-gray-500" />
                    </div>
                  </div>
                </div>
              ))}

              {/* Viewers from backend */}
              {viewers.map((viewer, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-full bg-gray-700 flex items-center justify-center font-bold text-gray-300">
                      {viewer.name.charAt(0).toUpperCase()}
                    </div>
                    <div className="flex flex-col">
                      <span className="text-sm font-medium text-white">{viewer.name}</span>
                      <span className="text-xs text-gray-400">Joined via link</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-sm text-gray-300 cursor-pointer hover:text-white">
                      Can view <ChevronDown className="w-4 h-4 text-gray-500" />
                    </div>
                    <div className="w-2 h-2 rounded-full bg-blue-500"></div>
                  </div>
                </div>
              ))}

              {/* No more hardcoded fake collaborators */}
            </div>
          </div>
        </div>

        {/* Footer (Only in collaborate mode and if others have joined) */}
        {mode === "collaborate" && ((roomInfo?.editors?.length > 0) || (viewers?.length > 0)) && (
          <div className="p-4 px-5 border-t border-white/5 flex items-center justify-between bg-[#111]/30">
            <div className="flex items-center gap-3">
              <div className="w-2.5 h-2.5 rounded-full bg-green-500 animate-pulse"></div>
              <span className="text-sm font-medium text-white">Live collaboration</span>
              <span className="text-sm text-gray-500">Active now</span>
            </div>
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
