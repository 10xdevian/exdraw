import { useEffect, useRef, useState } from "react";
import { DrawCanva } from ".";
import {
  MousePointer2, Square, Circle, Diamond, ArrowRight,
  Pencil, Type, Image as ImageIcon, Users, Cloud,
  ChevronDown, Book, Minus, Plus, Maximize,
  Undo2, Redo2, HelpCircle, CheckCircle2,
  MoreHorizontal
} from "lucide-react";
import { Button } from "../components/ui/button";
import { ShareModal } from "../components/ShareModal";
import { useUIStore } from "../store/uiStore";
import { useQuery } from "@tanstack/react-query";
import { viewerKeys } from "../lib/queryKeys";
import axios from "axios";
import { BACKEND_URL } from "@repo/shared";

import { useCanvasStore } from "../store/canvasStore";

export default function Canvas({
  roomId,
  socket,
  isCollaborating,
  onCollaborate,
  onShare,
  isViewMode,
  hideShapes = false
}: {
  roomId: string;
  socket: WebSocket | null;
  isCollaborating: boolean;
  onCollaborate: () => boolean;
  onShare: () => Promise<boolean>;
  isViewMode: boolean;
  hideShapes?: boolean;
}) {
  const canvaRef = useRef<HTMLCanvasElement>(null);
  const selectTool = useCanvasStore((s) => s.activeTool);
  const setSelectTool = useCanvasStore((s) => s.setActiveTool);
  const [dimensions, setDimensions] = useState({ width: 2000, height: 2000 });
  const [shareModalMode, setShareModalMode] = useState<"share" | "collaborate" | null>(null);
  const setDrawingsOpen = useUIStore(s => s.setDrawingsOpen);

  const { data: roomInfo } = useQuery({
    queryKey: ['roomInfo', roomId],
    queryFn: async () => {
      if (roomId === "guest" || roomId === "local") return null;
      const token = localStorage.getItem("token");
      const res = await axios.get(`${BACKEND_URL}/room/${roomId}`, {
        headers: token ? { Authorization: token } : {}
      });
      return res.data.room;
    },
    refetchInterval: 5000,
    enabled: roomId !== "guest" && roomId !== "local" && !isViewMode
  });

  const { data: viewers = [] } = useQuery({
    queryKey: viewerKeys.room(roomId || ""),
    queryFn: async () => {
      if (roomId === "guest" || roomId === "local") return [];
      const res = await axios.get(`${BACKEND_URL}/room/${roomId}/viewers`);
      return res.data.viewers as { name: string }[];
    },
    enabled: roomId !== "guest" && roomId !== "local" && !isViewMode,
    refetchInterval: 5000
  });

  const hasCollaborators = (roomInfo?.editors && roomInfo.editors.length > 0) || (viewers && viewers.length > 0);
  const collaboratorCount = 1 + (roomInfo?.editors?.length || 0) + viewers.length;


  useEffect(() => {
    // Resize canvas to fill window
    const updateDimensions = () => {
      setDimensions({ width: window.innerWidth, height: window.innerHeight });
    };
    updateDimensions();
    window.addEventListener("resize", updateDimensions);
    return () => window.removeEventListener("resize", updateDimensions);
  }, []);

  useEffect(() => {
    if (canvaRef.current) {
      const cleanup = DrawCanva(canvaRef.current, roomId, socket);
      return () => {
        // cleanup if implemented
      };
    }
  }, [canvaRef, socket, isCollaborating, roomId]);

  return (
    <div className="h-[100vh] overflow-hidden bg-[#0A0A0A] relative text-white font-sans selection:bg-purple-500/30">
      {/* CSS Grid Pattern Background */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px] pointer-events-none"></div>

      <canvas
        ref={canvaRef}
        width={dimensions.width}
        height={dimensions.height}
        className={`absolute inset-0 transition-opacity duration-500 ${isViewMode ? 'pointer-events-none' : 'cursor-crosshair'} ${hideShapes ? 'opacity-0' : 'opacity-100'}`}
      />

      {/* Top Navigation Bar */}
      <div className="absolute top-0 left-0 w-full flex items-center justify-between p-4 pointer-events-none">
        {/* Left Side */}
        <div className="flex items-center gap-4 pointer-events-auto">
          <div className="flex items-center gap-2">
            <svg viewBox="0 0 24 24" fill="none" className="w-7 h-7 text-[#9b66ff]" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 4L20 20M20 4L4 20" stroke="currentColor" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <span className="text-lg font-bold tracking-tight">Excaldraw</span>
          </div>
          {!isViewMode && (
            <>
              <div className="w-px h-5 bg-white/10 mx-2"></div>
              <div onClick={() => setDrawingsOpen(true)} className="flex items-center gap-1.5 text-sm font-medium hover:bg-white/5 px-2 py-1 rounded cursor-pointer transition-colors">
                Drawings <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
              </div>
              <Cloud className="w-4 h-4 text-gray-400 ml-2" />
              <div className="flex items-center gap-1.5 text-xs text-gray-400">
                <CheckCircle2 className="w-3 h-3 text-green-500" />
                All changes saved
              </div>
            </>
          )}
        </div>

        {/* Right Side */}
        <div className="flex items-center gap-3 pointer-events-auto">
          {!isViewMode && (
            <>
              <Button
                variant="default"
                className="h-9 px-3 rounded-lg text-sm bg-purple-600 hover:bg-purple-700 shadow-none border-none gap-2 font-medium"
                onClick={async () => { const ok = await onShare(); if (ok) setShareModalMode("share"); }}
              >
                <Users className="w-4 h-4" /> Share
              </Button>

              <Button
                variant="outline"
                className={`h-9 px-3 rounded-lg text-sm gap-2 font-medium border-white/10 ${isCollaborating ? 'bg-purple-500/10 text-purple-400 border-purple-500/30' : 'bg-transparent text-white'}`}
                onClick={async () => {
                  const success = onCollaborate(); 
                  if (success) {
                    const shareOk = await onShare();
                    if (shareOk) setShareModalMode("collaborate"); 
                  }
                }}
              >
                <Users className="w-4 h-4" /> Collaborate
                {isCollaborating && hasCollaborators && (
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-purple-600 text-white text-[10px] ml-1">
                    {collaboratorCount}
                  </span>
                )}
              </Button>
            </>
          )}

          <div className="flex items-center gap-1.5 text-sm font-medium px-2 py-1 rounded cursor-pointer hover:bg-white/5 transition-colors">
            100% <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
          </div>

          <Button
            variant="default"
            className="h-9 px-4 rounded-lg text-sm bg-[#582bd4] hover:bg-[#4d26b8] shadow-none border-none font-medium"
          >
            Export
          </Button>

          <div className="p-2 hover:bg-white/5 rounded-lg cursor-pointer">
            <Book className="w-5 h-5 text-gray-300" />
          </div>
        </div>
      </div>

      {/* Top Center Main Toolbar */}
      {!isViewMode && (
        <div className="absolute top-16 left-1/2 -translate-x-1/2 flex items-center gap-1.5 p-1.5 bg-[#09090b] border border-white/10 rounded-xl shadow-xl pointer-events-auto">
          <ToolButton icon={<MousePointer2 />} active={selectTool === "select"} onClick={() => setSelectTool("select")} />
          <div className="w-px h-6 bg-white/10 mx-1"></div>
          <ToolButton icon={<Square />} active={selectTool === "rect"} onClick={() => setSelectTool("rect")} />
          <ToolButton icon={<Circle />} active={selectTool === "circle"} onClick={() => setSelectTool("circle")} />
          <ToolButton icon={<Diamond />} active={selectTool === "diamond"} onClick={() => setSelectTool("diamond")} />
          <ToolButton icon={<ArrowRight />} active={selectTool === "line"} onClick={() => setSelectTool("line")} />
          <div className="w-px h-6 bg-white/10 mx-1"></div>
          <ToolButton icon={<Pencil />} active={selectTool === "pencil"} onClick={() => setSelectTool("pencil")} />
          <ToolButton icon={<Type />} active={selectTool === "text"} onClick={() => setSelectTool("text")} />
          <ToolButton icon={<ImageIcon />} active={selectTool === "image"} onClick={() => setSelectTool("image")} />
          <div className="w-px h-6 bg-white/10 mx-1"></div>
          <ToolButton icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20v-6M12 8V2M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24M2 12h6M16 12h6M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24"/></svg>} active={selectTool === "eraser"} onClick={() => setSelectTool("eraser")} />
          <ToolButton icon={<MoreHorizontal />} active={false} onClick={() => {}} />
        </div>
      )}

      {/* Left Sidebar Toolbar (Optional based on the mockup, but let's stick to Top Center to avoid redundancy, actually the mockup has a vertical one on the left too. I'll add it for exact matching) */}
      {!isViewMode && (
        <div className="absolute top-1/2 -translate-y-1/2 left-4 flex flex-col gap-1.5 p-1.5 bg-[#09090b] border border-white/10 rounded-xl shadow-xl pointer-events-auto">
          <ToolButton icon={<MousePointer2 />} active={selectTool === "select"} onClick={() => setSelectTool("select")} />
          <div className="w-10 h-px bg-white/10 my-1"></div>
          <ToolButton icon={<Square />} active={selectTool === "rect"} onClick={() => setSelectTool("rect")} />
          <ToolButton icon={<Circle />} active={selectTool === "circle"} onClick={() => setSelectTool("circle")} />
          <ToolButton icon={<Diamond />} active={selectTool === "diamond"} onClick={() => setSelectTool("diamond")} />
          <ToolButton icon={<ArrowRight />} active={selectTool === "line"} onClick={() => setSelectTool("line")} />
          <div className="w-10 h-px bg-white/10 my-1"></div>
          <ToolButton icon={<Pencil />} active={selectTool === "pencil"} onClick={() => setSelectTool("pencil")} />
          <ToolButton icon={<Type />} active={selectTool === "text"} onClick={() => setSelectTool("text")} />
          <ToolButton icon={<ImageIcon />} active={selectTool === "image"} onClick={() => setSelectTool("image")} />
          <div className="w-10 h-px bg-white/10 my-1"></div>
          <ToolButton icon={<MoreHorizontal />} active={false} onClick={() => {}} />
        </div>
      )}

      {/* Bottom Left: Minimap / View Controls */}
      <div className="absolute bottom-6 left-6 flex flex-col gap-3 pointer-events-auto">
        <div className="w-48 h-32 bg-[#09090b] border border-purple-500/30 rounded-xl shadow-xl p-2 relative overflow-hidden hidden sm:block">
           <div className="absolute inset-0 bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:8px_8px] pointer-events-none"></div>
           <div className="w-8 h-4 border border-purple-400 absolute top-4 left-4"></div>
           <div className="w-4 h-4 rounded-full border border-green-400 absolute top-10 left-12"></div>
           {/* Minimap selection box */}
           <div className="absolute inset-x-2 inset-y-4 border border-purple-500/50 rounded bg-purple-500/10"></div>
        </div>
        <div className="flex items-center justify-between p-1.5 bg-[#09090b] border border-white/10 rounded-xl shadow-xl">
          <ToolButton icon={<Minus />} active={false} onClick={() => {}} />
          <span className="text-xs font-medium px-2">75%</span>
          <ToolButton icon={<Plus />} active={false} onClick={() => {}} />
          <div className="w-px h-4 bg-white/10 mx-1"></div>
          <ToolButton icon={<Maximize />} active={false} onClick={() => {}} />
        </div>
      </div>

      {/* Bottom Center: Properties Panel (Color & Stroke) */}
      {!isViewMode && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-4 pointer-events-auto">
          {/* Colors */}
          <div className="flex items-center gap-2 p-2 bg-[#09090b] border border-white/10 rounded-xl shadow-xl">
            {[
               { id: "#a855f7", css: "bg-purple-600", border: "border-purple-500" },
               { id: "#22c55e", css: "bg-green-500", border: "border-green-400" },
               { id: "#3b82f6", css: "bg-blue-500", border: "border-blue-400" },
               { id: "#f97316", css: "bg-orange-500", border: "border-orange-400" },
               { id: "#ef4444", css: "bg-red-500", border: "border-red-400" },
               { id: "#ffffff", css: "bg-white", border: "border-gray-300" }
            ].map(c => {
               const isActive = useCanvasStore(s => s.strokeColor) === c.id;
               return (
                 <div key={c.id} onClick={() => useCanvasStore.getState().setStrokeColor(c.id)} className={`w-6 h-6 rounded-full flex items-center justify-center cursor-pointer transition-transform hover:scale-110 ${isActive ? `border ${c.border}` : ''}`}>
                   <div className={`w-4 h-4 rounded-full ${c.css}`}></div>
                 </div>
               );
            })}
            <div className="w-px h-5 bg-white/10 mx-1"></div>
            <div className="w-5 h-5 flex items-center justify-center text-gray-400 hover:text-white cursor-pointer">
               <Plus className="w-4 h-4" />
            </div>
          </div>

          {/* Stroke Width */}
          <div className="flex items-center gap-1.5 p-2 bg-[#09090b] border border-white/10 rounded-xl shadow-xl">
            <div className="w-8 h-8 rounded hover:bg-white/5 flex items-center justify-center cursor-pointer">
              <div className="w-4 h-[1px] bg-white"></div>
            </div>
            <div className="w-8 h-8 rounded bg-[#1a1a24] text-purple-400 flex items-center justify-center cursor-pointer">
              <div className="w-4 h-[2px] bg-purple-500"></div>
            </div>
            <div className="w-8 h-8 rounded hover:bg-white/5 flex items-center justify-center cursor-pointer">
              <div className="w-4 h-[4px] bg-white"></div>
            </div>
          </div>
        </div>
      )}

      {/* Bottom Right: History & Help */}
      <div className="absolute bottom-6 right-6 flex items-center gap-1.5 p-1.5 bg-[#09090b] border border-white/10 rounded-xl shadow-xl pointer-events-auto">
        <ToolButton icon={<Undo2 />} active={false} onClick={() => {}} />
        <ToolButton icon={<Redo2 />} active={false} onClick={() => {}} />
        <div className="w-px h-6 bg-white/10 mx-1"></div>
        <ToolButton icon={<HelpCircle />} active={false} onClick={() => {}} />
      </div>

      <ShareModal
        isOpen={shareModalMode !== null}
        setIsOpen={(open) => !open && setShareModalMode(null)}
        mode={shareModalMode || "share"}
        roomId={roomId}
      />
    </div>
  );
}

function ToolButton({
  icon,
  active,
  onClick
}: {
  icon: React.ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div
      onClick={onClick}
      className={`w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer transition-colors ${
        active ? 'bg-[#2a2a35] text-purple-400' : 'text-gray-400 hover:bg-white/5 hover:text-white'
      }`}
    >
      <div className="w-4 h-4 [&>svg]:w-full [&>svg]:h-full">
        {icon}
      </div>
    </div>
  );
}
