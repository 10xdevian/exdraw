"use client";

import { Dialog, DialogContent } from "./ui/dialog";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import { useUIStore } from "../store/uiStore";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { BACKEND_URL } from "@repo/shared";
import { FolderOpen, Clock, Star, Plus, Search, LayoutGrid, List, MoreHorizontal, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { formatDistanceToNow } from "date-fns";
import { useState, useEffect } from "react";

export function DrawingsModal() {
  const isDrawingsOpen = useUIStore(s => s.isDrawingsOpen);
  const setDrawingsOpen = useUIStore(s => s.setDrawingsOpen);
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<"all" | "recent" | "favorites">("all");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    if (isDrawingsOpen) {
      setFavorites(JSON.parse(localStorage.getItem('excal_favorites') || '[]'));
    }
  }, [isDrawingsOpen]);

  const toggleFavorite = (slug: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const newFavs = favorites.includes(slug) ? favorites.filter(f => f !== slug) : [...favorites, slug];
    setFavorites(newFavs);
    localStorage.setItem('excal_favorites', JSON.stringify(newFavs));
  };

  const { data, isLoading } = useQuery({
    queryKey: ['rooms'],
    queryFn: async () => {
      let dbRooms: { slug: string, createdAt: string, id: string | number, isLocal?: boolean, admin?: { username: string } }[] = [];
      const token = localStorage.getItem("token");
      if (token) {
        try {
          const res = await axios.get(`${BACKEND_URL}/rooms`, {
            headers: { Authorization: token }
          });
          dbRooms = res.data.rooms || [];
        } catch (e: unknown) {
          const err = e as { response?: { status?: number }, message?: string };
          if (err.response?.status === 403) {
            localStorage.removeItem("token");
          }
          console.warn("Failed to fetch rooms:", err.message);
        }
      }

      const localRooms: { slug: string, createdAt: string, id: string | number, isLocal?: boolean, admin?: { username: string } }[] = [];
      if (typeof window !== "undefined") {
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith("creator_room-")) {
            const slug = key.replace("creator_", "");
            if (!dbRooms.find(r => r.slug === slug)) {
              const tsStr = slug.replace("room-", "");
              const ts = parseInt(tsStr, 10);
              localRooms.push({
                id: slug,
                slug: slug,
                createdAt: isNaN(ts) ? new Date().toISOString() : new Date(ts).toISOString(),
                isLocal: true
              });
            }
          }
        }
      }

      const combined = [...dbRooms, ...localRooms].sort((a, b) => {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      });

      return { rooms: combined };
    },
    enabled: isDrawingsOpen,
  });

  let rooms = data?.rooms || [];

  if (searchQuery.trim()) {
    rooms = rooms.filter(r => r.slug.toLowerCase().includes(searchQuery.toLowerCase()));
  }

  if (activeTab === "favorites") {
    rooms = rooms.filter(r => favorites.includes(r.slug));
  } else if (activeTab === "recent") {
    rooms = rooms.slice(0, 10); // Show top 10 for recent
  }

  return (
    <Dialog open={isDrawingsOpen} onOpenChange={setDrawingsOpen}>
      <DialogContent showCloseButton={false} className="sm:max-w-[1000px] h-[75vh] max-h-[800px] bg-[#0E0E12] border-white/5 text-white p-0 overflow-hidden shadow-2xl rounded-xl flex flex-col">
        
        {/* Header Tabs */}
        <div className="flex items-center justify-between px-6 border-b border-white/5 h-16 shrink-0">
          <div className="flex h-full">
            <button className="flex items-center gap-2 px-4 h-full border-b-2 border-[#9b66ff] text-white text-sm font-medium">
              <FolderOpen className="w-4 h-4" />
              Open a drawing
            </button>
            <button className="flex items-center gap-2 px-4 h-full text-gray-500 hover:text-gray-300 text-sm font-medium transition-colors">
              <Plus className="w-4 h-4" />
              Create new
            </button>
          </div>
          <button onClick={() => setDrawingsOpen(false)} className="text-gray-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Main Body */}
        <div className="flex flex-1 overflow-hidden">
          
          {/* Sidebar */}
          <div className="w-64 border-r border-white/5 flex flex-col p-4 bg-[#0A0A0B]">
            <div className="flex flex-col gap-1 flex-1">
              <button 
                onClick={() => setActiveTab("all")}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === "all" ? "bg-[#9b66ff]/10 text-[#9b66ff]" : "text-gray-400 hover:bg-white/5 hover:text-gray-200"}`}
              >
                <FolderOpen className="w-4 h-4" />
                All Drawings
              </button>
              <button 
                onClick={() => setActiveTab("recent")}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === "recent" ? "bg-[#9b66ff]/10 text-[#9b66ff]" : "text-gray-400 hover:bg-white/5 hover:text-gray-200"}`}
              >
                <Clock className="w-4 h-4" />
                Recent
              </button>
              <button 
                onClick={() => setActiveTab("favorites")}
                className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors ${activeTab === "favorites" ? "bg-[#9b66ff]/10 text-[#9b66ff]" : "text-gray-400 hover:bg-white/5 hover:text-gray-200"}`}
              >
                <Star className="w-4 h-4" />
                Favorites
              </button>
            </div>
            
            <Button 
              onClick={() => {
                setDrawingsOpen(false);
                router.push("/room/local");
              }}
              className="w-full bg-[#7950f2] hover:bg-[#6741d9] text-white flex items-center gap-2 mt-4"
            >
              <Plus className="w-4 h-4" />
              New Drawing
            </Button>
          </div>

          {/* Content Area */}
          <div className="flex-1 flex flex-col min-w-0 bg-[#0E0E12]">
            {/* Toolbar */}
            <div className="flex items-center justify-between p-6 pb-2">
              <div className="relative w-72">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                <Input 
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search drawings..." 
                  className="pl-9 bg-[#1a1a1a] border-white/5 text-sm h-10 rounded-lg focus-visible:ring-1 focus-visible:ring-[#9b66ff]/50 text-white"
                />
              </div>
              <div className="flex items-center gap-4">
                <select className="bg-[#1a1a1a] border-white/5 text-gray-300 text-sm rounded-lg px-3 py-2 outline-none focus:ring-1 focus:ring-[#9b66ff]/50 cursor-pointer">
                  <option>Sort by: Last modified</option>
                  <option>Sort by: Name</option>
                  <option>Sort by: Created date</option>
                </select>
                <div className="flex items-center bg-[#1a1a1a] rounded-lg border border-white/5 p-1">
                  <button className="p-1.5 rounded text-white bg-white/5">
                    <LayoutGrid className="w-4 h-4" />
                  </button>
                  <button className="p-1.5 rounded text-gray-500 hover:text-gray-300">
                    <List className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>

            {/* Grid */}
            <div className="flex-1 overflow-y-auto p-6 pt-4">
              {isLoading ? (
                <div className="text-gray-500 text-sm text-center mt-10">Loading drawings...</div>
              ) : rooms.length === 0 ? (
                <div className="text-gray-500 text-sm text-center mt-10 flex flex-col items-center">
                  <FolderOpen className="w-12 h-12 text-gray-600 mb-3 opacity-50" />
                  <p>No drawings found.</p>
                  <p className="text-xs mt-1">Create a new drawing to get started.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                  {rooms.map((room: { id: string | number, slug: string, createdAt: string, isLocal?: boolean, admin?: { username: string } }) => {
                    const isFav = favorites.includes(room.slug);
                    return (
                      <div 
                        key={room.id}
                        onClick={() => {
                          setDrawingsOpen(false);
                          router.push(`/room/${room.slug}`);
                        }}
                        className="group flex flex-col bg-[#111115] border border-white/5 rounded-xl overflow-hidden hover:border-[#9b66ff]/40 hover:shadow-[0_0_15px_rgba(155,102,255,0.1)] transition-all cursor-pointer"
                      >
                        <div className="aspect-[4/3] bg-[#0A0A0B] border-b border-white/5 p-4 relative flex items-center justify-center overflow-hidden">
                          {/* Mock drawing thumbnail */}
                          <div className="absolute inset-0 opacity-20" style={{
                            backgroundImage: 'radial-gradient(circle at 2px 2px, rgba(255,255,255,0.2) 1px, transparent 0)',
                            backgroundSize: '16px 16px'
                          }}></div>
                          
                          <div className="flex items-center justify-center gap-2 z-10 opacity-70 group-hover:opacity-100 transition-opacity">
                            <div className="w-10 h-8 border border-green-500/50 rounded-sm"></div>
                            <div className="w-8 h-2 bg-white/10 rounded-full"></div>
                            <div className="w-10 h-8 border border-blue-500/50 rounded-sm"></div>
                          </div>

                          <button 
                            onClick={(e) => toggleFavorite(room.slug, e)} 
                            className={`absolute top-3 right-3 p-1.5 backdrop-blur rounded-md transition-opacity hover:bg-black/60 ${isFav ? 'bg-black/60 opacity-100' : 'bg-black/40 opacity-0 group-hover:opacity-100'}`}
                          >
                            <Star className={`w-4 h-4 ${isFav ? 'text-[#9b66ff] fill-[#9b66ff]' : 'text-gray-400 hover:text-yellow-500'}`} />
                          </button>
                        </div>
                        
                        <div className="p-4 flex flex-col">
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-medium text-gray-200 truncate" title={room.slug}>
                              {room.slug}
                            </h3>
                            <button onClick={(e) => e.stopPropagation()} className="text-gray-500 hover:text-gray-300">
                              <MoreHorizontal className="w-4 h-4" />
                            </button>
                          </div>
                          <p className="text-xs text-gray-500 mt-1 flex flex-col gap-1">
                            <span className="flex items-center gap-1.5">
                              Edited {formatDistanceToNow(new Date(room.createdAt || Date.now()), { addSuffix: true })}
                              {room.isLocal && <span className="bg-white/10 px-1.5 py-0.5 rounded text-[10px]">Local</span>}
                            </span>
                            {room.admin?.username && (
                              <span className="text-[10px] text-gray-400">By {room.admin.username}</span>
                            )}
                          </p>
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end px-6 py-4 border-t border-white/5 bg-[#0E0E12]">
              <Button variant="outline" onClick={() => setDrawingsOpen(false)} className="bg-[#1a1a1a] border-white/5 hover:bg-white/10 text-gray-300 font-medium">
                Cancel
              </Button>
            </div>
            
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
