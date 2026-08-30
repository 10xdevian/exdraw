"use client";
import { useEffect, useState } from "react";
import Canvas from "./Canvas";
import { AuthModal } from "../components/AuthModal";
import { ViewerPromptModal } from "../components/ViewerPromptModal";
import { DrawingsModal } from "../components/DrawingsModal";
import axios from "axios";
import { BACKEND_URL, WEBSOCKET_URL } from "@repo/shared";
import { useSearchParams } from "next/navigation";
import { useUIStore } from "../store/uiStore";

export function CanvasRoom({ roomId }: { roomId: string }) {
  const [socket, setSocket] = useState<WebSocket | null>(null);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  const searchParams = useSearchParams();
  const isViewSlug = roomId.startsWith("view-");
  const urlIsViewMode = searchParams.get("mode") === "view" || isViewSlug;
  const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
  const isSavedRoom = roomId !== "local" && roomId !== "guest";
  const isCreator = typeof window !== "undefined" ? localStorage.getItem(`creator_${roomId}`) === "true" : false;

  const [isCollaborating, setIsCollaborating] = useState(() => {
    return !urlIsViewMode && isSavedRoom && !!token;
  });
  
  // Force view mode if URL says so, OR if they are in a saved room without a token AND they didn't create it
  const isViewMode = urlIsViewMode || (isSavedRoom && !token && !isCreator);
  
  const [showCanvas, setShowCanvas] = useState(!isViewMode);
  const [hasPromptedAuth, setHasPromptedAuth] = useState(false);

  const setAuthOpen = useUIStore(s => s.setAuthOpen);
  const isAuthOpen = useUIStore(s => s.isAuthOpen);
  const isViewerPromptOpen = useUIStore(s => s.isViewerPromptOpen);
  const setViewerPromptOpen = useUIStore(s => s.setViewerPromptOpen);

  // If they hit an edit link for a saved room without a token and aren't the creator, prompt sign in
  useEffect(() => {
    if (!urlIsViewMode && isSavedRoom && !token && !isCreator && !hasPromptedAuth) {
      setAuthOpen(true, "signin");
      setHasPromptedAuth(true);
    }
  }, [urlIsViewMode, isSavedRoom, token, isCreator, hasPromptedAuth, setAuthOpen]);

  // If they dismiss the AuthModal without signing in, redirect them to a clean viewer link
  useEffect(() => {
    if (hasPromptedAuth && !isAuthOpen && !token && !urlIsViewMode && isSavedRoom && !isCreator) {
      window.history.replaceState({}, "", `/room/${roomId}?mode=view`);
      window.location.reload();
    } else if (hasPromptedAuth && !isAuthOpen && token && !urlIsViewMode && isSavedRoom) {
      setIsCollaborating(true);
    }
  }, [isAuthOpen, hasPromptedAuth, token, urlIsViewMode, isSavedRoom, isCreator, roomId]);

  useEffect(() => {
    if (isViewMode) {
      const hasJoined = typeof window !== "undefined" ? localStorage.getItem(`guest_${roomId}`) : false;
      // Only show the Viewer Prompt if they explicitly visited a view link.
      // If they visited an edit link without auth, the AuthModal handles the UI.
      if (!hasJoined && urlIsViewMode) {
        setViewerPromptOpen(true);
        setShowCanvas(false);
      } else {
        setShowCanvas(true);
      }
    } else {
      setShowCanvas(true);
    }
  }, [isViewMode, urlIsViewMode, roomId, setViewerPromptOpen]);

  useEffect(() => {
    // Only connect if it's a saved room (viewers and creators should both connect to get real-time updates)
    if (!isSavedRoom) {
      return;
    }

    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    
    // If they explicitly want to collaborate but have no token, prompt login
    if (!isViewMode && isCollaborating && !token) {
      setAuthOpen(true, "signin");
      setIsCollaborating(false);
      return;
    }

    const url = `${WEBSOCKET_URL}?token=${token || ""}`;
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setSocket(ws);
      ws.send(
        JSON.stringify({
          type: "join_room",
          roomId,
        }),
      );
    };

    return () => {
      ws.close();
      setSocket(null);
    };
  }, [isCollaborating, roomId, isViewMode, setAuthOpen]);

  const handleStartCollaborating = () => {
    if (isViewMode) return false;
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    if (!token) {
      setAuthOpen(true, "signin"); 
      return false;
    } else {
      setIsCollaborating(true); 
      return true;
    }
  };

  const handleShare = async () => {
    const token = typeof window !== "undefined" ? localStorage.getItem("token") : null;
    
    try {
      let currentRoomId = typeof window !== 'undefined' ? window.location.pathname.split("/").pop() || roomId : roomId;
      
      // If they are in a temporary room, create a real one
      if (currentRoomId === "guest" || currentRoomId === "local") {
        currentRoomId = "room-" + Date.now();
        if (token) {
          await axios.post(`${BACKEND_URL}/room`, { name: currentRoomId }, {
            headers: { Authorization: token }
          });
        } else {
          await axios.post(`${BACKEND_URL}/room/guest`, { name: currentRoomId });
          if (typeof window !== "undefined") {
            localStorage.setItem(`creator_${currentRoomId}`, "true");
          }
        }
        window.history.pushState({}, "", `/room/${currentRoomId}`);
        // Connect to WebSocket explicitly if logged in
        if (token) setIsCollaborating(true);
      }
      
      // Get shapes and sync
      // @ts-ignore
      const shapes = window.getExistingShapes ? window.getExistingShapes() : [];
      try {
        await axios.post(`${BACKEND_URL}/room/${currentRoomId}/sync`, { shapes }, {
          headers: token ? { Authorization: token } : undefined
        });
      } catch (err: any) {
        if (err.response?.status === 404) {
          alert("This room no longer exists (the database was reset). Please start a new drawing.");
          window.location.href = "/";
          return false;
        }
        if (err.response?.status === 403) {
          alert("Your session has expired or you do not have permission. Please sign in again.");
          localStorage.removeItem("token");
          window.location.reload();
          return false;
        }
        throw err;
      }
      
      return true;
    } catch (e: any) {
      console.error(e);
      if (e.response?.status === 403) {
        alert("Your session has expired or you do not have permission. Please sign in again.");
        localStorage.removeItem("token");
        window.location.reload();
        return false;
      }
      alert("Failed to create share link");
      return false;
    }
  };

  if (!isMounted) return <div className="h-screen w-screen bg-[#0A0A0B]"></div>;

  return (
    <>
      <Canvas 
        roomId={roomId} 
        socket={socket} 
        isCollaborating={isCollaborating} 
        onCollaborate={handleStartCollaborating} 
        onShare={handleShare}
        isViewMode={isViewMode}
        hideShapes={!showCanvas}
      />
      <AuthModal />
      <ViewerPromptModal roomId={roomId} onJoin={() => setShowCanvas(true)} />
      <DrawingsModal />
    </>
  );
}
