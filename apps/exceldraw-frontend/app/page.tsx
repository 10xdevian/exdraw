"use client";
import React, { useState } from "react";
import { useUIStore } from "../store/uiStore";
import Image from "next/image";
import Link from "next/link";
import {
  MousePointer2,
  Square,
  Circle,
  Pencil,
  Type,
  Maximize,
  Users,
  MonitorSmartphone,
  Github,
  Star,
  Play,
  ArrowRight,
  Diamond,
  Image as ImageIcon,
  CloudLightning,
  Sparkles,
  LayoutGrid,
  Undo2,
  Redo2,
  HelpCircle
} from "lucide-react";
import { Button } from "../components/ui/button";
import { AuthModal } from "../components/AuthModal";

export default function Home(): React.ReactNode {
  const setAuthOpen = useUIStore(s => s.setAuthOpen);

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white font-sans selection:bg-purple-500/30 overflow-x-hidden">
      {/* Navigation */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-7xl mx-auto border-b border-white/5">
        <div className="flex items-center gap-2">
          {/* Logo Icon */}
          <div className="w-8 h-8 flex items-center justify-center">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              className="w-8 h-8 text-[#9b66ff]"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                d="M4 4L20 20M20 4L4 20"
                stroke="currentColor"
                strokeWidth="4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight">Excaldraw</span>
        </div>

        <div className="hidden md:flex items-center gap-8 text-sm text-gray-300 font-medium">
          <Link href="#" className="hover:text-white transition-colors flex items-center gap-1">
            Features
            <svg width="10" height="6" viewBox="0 0 10 6" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M1 1L5 5L9 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </Link>
          <Link href="#" className="hover:text-white transition-colors">
            Templates
          </Link>
          <Link href="#" className="hover:text-white transition-colors">
            Community
          </Link>
          <Link href="#" className="hover:text-white transition-colors">
            Pricing
          </Link>
          <Link href="#" className="hover:text-white transition-colors">
            Docs
          </Link>
        </div>

        <div className="flex items-center gap-4 text-sm font-medium">
          <button className="text-gray-400 hover:text-white hidden sm:block p-1">
            {/* Moon Icon */}
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"></path>
            </svg>
          </button>
          <Button
            variant="ghost" 
            className="text-gray-300 hover:text-white hover:bg-white/5"
            onClick={() => setAuthOpen(true, "signin")}
          >
            Sign in
          </Button>
          <Link href="/room/guest">
            <Button
              className="px-4 py-2 rounded-lg bg-[#6938ef] hover:bg-[#582bd4] text-white h-10 border-none shadow-md shadow-purple-500/20"
            >
              Get Started Free <ArrowRight className="w-4 h-4 ml-1" />
            </Button>
          </Link>
        </div>
      </nav>

      <main className="max-w-[1400px] mx-auto px-6 pt-16 pb-16 flex flex-col xl:flex-row items-start gap-12 xl:gap-8">
        {/* Left column - Text Content */}
        <div className="flex-1 flex flex-col gap-6 pt-4 xl:max-w-xl">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-purple-500/30 bg-purple-500/10 text-sm font-medium text-gray-300 w-fit cursor-pointer hover:bg-purple-500/20 transition-colors">
            <span className="flex items-center text-yellow-400 text-xs gap-1 font-semibold">
              <Sparkles className="w-3.5 h-3.5" /> New
            </span>
            <span>Excaldraw 2.0 is here!</span>
            <span className="text-gray-400 ml-1">&gt;</span>
          </div>

          <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold leading-[1.1] tracking-tight">
            Where ideas <br />
            take <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#814bff] to-[#d434fe] relative inline-block">
              shape
              <svg
                className="absolute w-full h-4 -bottom-1 left-0 text-[#9b66ff]"
                viewBox="0 0 100 10"
                preserveAspectRatio="none"
              >
                <path
                  d="M0 5 Q 50 10 100 2"
                  stroke="currentColor"
                  strokeWidth="3"
                  fill="none"
                />
              </svg>
            </span>
          </h1>

          <p className="text-lg md:text-xl text-gray-400 max-w-lg leading-relaxed mt-2">
            The intuitive and collaborative drawing tool <br className="hidden md:block" />
            for creating anything, anywhere.
          </p>

          <div className="flex flex-col sm:flex-row items-center gap-4 mt-4">
            <Link href="/room/guest" className="w-full sm:w-auto">
              <Button
                size="lg"
                className="w-full sm:w-auto px-6 py-6 rounded-xl bg-[#6938ef] hover:bg-[#582bd4] text-white font-medium text-lg border-none"
              >
                Get Started Free <ArrowRight className="w-5 h-5 ml-2" />
              </Button>
            </Link>
            <Button
              size="lg"
              variant="outline"
              className="w-full sm:w-auto px-6 py-6 rounded-xl bg-[#111] hover:bg-[#1A1A1A] text-white border-white/5 font-medium text-lg flex items-center gap-2"
            >
              <LayoutGrid className="w-5 h-5" /> Explore Templates
            </Button>
          </div>

          {/* Features Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-6 mt-12 text-sm text-gray-300 font-medium">
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-xl mt-0.5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#9b66ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z"></path><path d="M8 12h8"></path><path d="M12 8v8"></path></svg>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-white font-semibold">Infinite Canvas</span>
                <span className="text-gray-500 text-xs">Draw without limits</span>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="p-2 bg-indigo-500/10 border border-indigo-500/20 rounded-xl mt-0.5">
                <Users className="w-5 h-5 text-indigo-400" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-white font-semibold">Real-time Collaboration</span>
                <span className="text-gray-500 text-xs">Work together seamlessly</span>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="p-2 bg-purple-500/10 border border-purple-500/20 rounded-xl mt-0.5">
                <CloudLightning className="w-5 h-5 text-purple-400" />
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-white font-semibold">Cross Platform</span>
                <span className="text-gray-500 text-xs">Access anywhere</span>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="p-2 bg-pink-500/10 border border-pink-500/20 rounded-xl mt-0.5">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#d434fe" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"></path></svg>
              </div>
              <div className="flex flex-col gap-0.5">
                <span className="text-white font-semibold">Open Source</span>
                <span className="text-gray-500 text-xs">Built by the community</span>
              </div>
            </div>
          </div>
        </div>

        {/* Right column - Illustration (Flowchart) */}
        <div className="flex-1 w-full xl:max-w-4xl relative mt-10 xl:mt-0">
          <div className="aspect-[4/3] rounded-2xl bg-[#09090b] border border-purple-500/20 relative overflow-hidden shadow-[0_0_80px_-15px_rgba(105,56,239,0.3)] bg-[linear-gradient(to_right,#80808012_1px,transparent_1px),linear-gradient(to_bottom,#80808012_1px,transparent_1px)] bg-[size:24px_24px]">
            
            {/* Top Toolbar */}
            <div className="absolute top-4 left-6 flex items-center justify-between right-6">
              <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-[#111] border border-white/10 text-gray-400 shadow-xl">
                <div className="p-1.5 bg-purple-600 rounded text-white"><MousePointer2 className="w-4 h-4" /></div>
                <div className="p-1.5 hover:bg-white/5 rounded cursor-pointer"><Square className="w-4 h-4" /></div>
                <div className="p-1.5 hover:bg-white/5 rounded cursor-pointer"><Circle className="w-4 h-4" /></div>
                <div className="p-1.5 hover:bg-white/5 rounded cursor-pointer"><Diamond className="w-4 h-4" /></div>
                <div className="p-1.5 hover:bg-white/5 rounded cursor-pointer"><ArrowRight className="w-4 h-4" /></div>
                <div className="p-1.5 hover:bg-white/5 rounded cursor-pointer"><Pencil className="w-4 h-4" /></div>
                <div className="p-1.5 hover:bg-white/5 rounded cursor-pointer"><Type className="w-4 h-4" /></div>
                <div className="p-1.5 hover:bg-white/5 rounded cursor-pointer"><ImageIcon className="w-4 h-4" /></div>
                <div className="w-px h-6 bg-white/10 mx-1"></div>
                <div className="p-1.5 hover:bg-white/5 rounded cursor-pointer"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 20v-6M12 8V2M4.93 19.07l4.24-4.24M14.83 9.17l4.24-4.24M2 12h6M16 12h6M4.93 4.93l4.24 4.24M14.83 14.83l4.24 4.24"/></svg></div>
              </div>
              
              <div className="flex items-center gap-4">
                <div className="flex items-center -space-x-2 bg-[#111] p-1.5 rounded-xl border border-white/10">
                  <img src="https://i.pravatar.cc/100?img=11" alt="u" className="w-6 h-6 rounded-full border border-[#111]" />
                  <img src="https://i.pravatar.cc/100?img=12" alt="u" className="w-6 h-6 rounded-full border border-[#111]" />
                  <img src="https://i.pravatar.cc/100?img=13" alt="u" className="w-6 h-6 rounded-full border border-[#111]" />
                  <div className="w-6 h-6 rounded-full border border-[#111] bg-gray-700 text-[10px] flex items-center justify-center font-medium">+3</div>
                </div>
                
                <div className="flex items-center gap-1 px-3 py-1.5 rounded-xl bg-[#111] border border-white/10 text-xs font-medium cursor-pointer">
                  100% <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M6 9l6 6 6-6"/></svg>
                </div>
              </div>
            </div>

            {/* Bottom Color Palette */}
            <div className="absolute bottom-6 left-6 flex items-center gap-2 px-3 py-2 rounded-xl bg-[#111] border border-white/10 shadow-xl">
              <div className="w-6 h-6 rounded-full border border-purple-500 bg-transparent flex items-center justify-center">
                <div className="w-4 h-4 rounded-full bg-purple-600"></div>
              </div>
              <div className="w-4 h-4 rounded-full bg-green-500 cursor-pointer hover:scale-110 transition-transform"></div>
              <div className="w-4 h-4 rounded-full bg-blue-500 cursor-pointer hover:scale-110 transition-transform"></div>
              <div className="w-4 h-4 rounded-full bg-orange-500 cursor-pointer hover:scale-110 transition-transform"></div>
              <div className="w-4 h-4 rounded-full bg-red-500 cursor-pointer hover:scale-110 transition-transform"></div>
              <div className="w-4 h-4 rounded-full bg-white cursor-pointer hover:scale-110 transition-transform"></div>
              <div className="w-px h-4 bg-white/10 mx-1"></div>
              <div className="w-5 h-5 rounded flex items-center justify-center text-gray-400 hover:text-white cursor-pointer">+</div>
            </div>

            {/* Bottom Right Controls */}
            <div className="absolute bottom-6 right-6 flex items-center gap-2 px-3 py-2 rounded-xl bg-[#111] border border-white/10 text-gray-400 shadow-xl">
              <div className="p-1 hover:bg-white/5 rounded cursor-pointer"><Undo2 className="w-4 h-4" /></div>
              <div className="p-1 hover:bg-white/5 rounded cursor-pointer"><Redo2 className="w-4 h-4" /></div>
              <div className="w-px h-4 bg-white/10 mx-1"></div>
              <div className="p-1 hover:bg-white/5 rounded cursor-pointer"><HelpCircle className="w-4 h-4" /></div>
            </div>

            {/* Canvas Diagram Elements */}
            <div className="absolute inset-0 top-16 pt-10 px-12 pointer-events-none">
              <div className="relative w-full h-full font-['Comic_Sans_MS',cursive]">
                
                {/* User Box */}
                <div className="absolute top-[20%] left-[5%] w-32 h-16 border-2 border-purple-500 rounded-sm flex items-center justify-center text-lg text-white">
                  User
                </div>
                
                {/* Arrow 1 */}
                <svg className="absolute top-[28%] left-[23%] w-20 h-4 overflow-visible" fill="none" stroke="#fff" strokeWidth="2">
                  <path d="M 0 0 L 70 0 L 60 -5 M 70 0 L 60 5" />
                </svg>

                {/* Action Circle */}
                <div className="absolute top-[16%] left-[38%] w-36 h-20 border-2 border-green-500 rounded-full flex items-center justify-center text-lg text-white">
                  Action
                </div>

                {/* Arrow 2 */}
                <svg className="absolute top-[28%] left-[58%] w-16 h-4 overflow-visible" fill="none" stroke="#fff" strokeWidth="2">
                  <path d="M 0 0 L 50 0 L 40 -5 M 50 0 L 40 5" />
                </svg>

                {/* Decision Diamond */}
                <div className="absolute top-[15%] left-[70%] w-32 h-32 border-2 border-orange-500 rotate-45 flex items-center justify-center">
                  <span className="-rotate-45 text-lg text-white">Decision?</span>
                </div>

                {/* Arrow Yes */}
                <svg className="absolute top-[28%] left-[84%] w-16 h-4 overflow-visible" fill="none" stroke="#fff" strokeWidth="2">
                  <text x="20" y="-10" fill="#fff" fontSize="16" className="font-sans">Yes</text>
                  <path d="M 0 0 L 50 0 L 40 -5 M 50 0 L 40 5" />
                </svg>

                {/* Success Box */}
                <div className="absolute top-[20%] right-[2%] w-32 h-16 border-2 border-blue-500 rounded-sm flex items-center justify-center text-lg text-white gap-2">
                  Success 🎉
                </div>

                {/* Arrow No */}
                <svg className="absolute top-[40%] left-[77%] w-4 h-24 overflow-visible" fill="none" stroke="#fff" strokeWidth="2">
                  <text x="15" y="30" fill="#fff" fontSize="16" className="font-sans">No</text>
                  <path d="M 0 0 L 0 70 L -5 60 M 0 70 L 5 60" />
                </svg>

                {/* Try Again Box */}
                <div className="absolute top-[56%] left-[71.5%] w-32 h-16 border-2 border-red-500 rounded-sm flex items-center justify-center text-lg text-white">
                  Try again
                </div>

                {/* Yellow Sticky Note */}
                <div className="absolute top-[42%] left-[10%] w-44 h-44 bg-[#eab308] rotate-[-2deg] rounded-sm p-4 text-black shadow-lg shadow-black/20 font-['Comic_Sans_MS',cursive] text-lg leading-tight flex flex-col justify-between">
                  <div>Let&apos;s improve<br/>this flow!</div>
                  <div className="self-end mt-4">- Sarah</div>
                  
                  {/* Purple cursor near sticky note */}
                  <div className="absolute right-[-10px] top-[20px] text-purple-600 rotate-[-30deg]">
                    <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                      <path d="M4 4l5.3 16 3-6.5L19 10.3z" />
                    </svg>
                  </div>
                </div>

                {/* Cloud & text */}
                <div className="absolute top-[50%] right-[6%] w-36 h-36 border-2 border-blue-400 border-dashed rounded-[50%_50%_50%_50%_/_60%_60%_40%_40%] flex items-center justify-center text-center text-blue-400 rotate-[5deg] text-lg">
                  Great<br/>idea!
                </div>
                {/* Blue cursor near cloud */}
                <div className="absolute bottom-[20%] right-[5%] text-blue-500 rotate-[-15deg]">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-8 h-8">
                    <path d="M4 4l5.3 16 3-6.5L19 10.3z" />
                  </svg>
                </div>

              </div>
            </div>
            
            {/* Soft Purple Glow Effect */}
            <div className="absolute inset-0 bg-gradient-to-tr from-purple-900/10 via-transparent to-blue-900/10 pointer-events-none"></div>
          </div>
        </div>
      </main>

      {/* Footer / Social Proof */}
      <footer className="max-w-7xl mx-auto px-6 py-12 flex flex-col items-center justify-center gap-8 mt-10">
        <div className="text-gray-400 text-sm font-medium tracking-wide text-center">
          Loved by 200k+ creators worldwide
        </div>
        
        {/* Company Logos */}
        <div className="flex flex-wrap items-center justify-center gap-10 md:gap-16 opacity-60 grayscale hover:grayscale-0 transition-all duration-300">
          <div className="text-2xl font-bold font-sans tracking-tighter flex items-center gap-1">
            <span className="text-xl">Google</span>
          </div>
          <div className="text-xl font-bold font-sans flex items-center gap-1.5">
            <LayoutGrid className="w-5 h-5" /> Microsoft
          </div>
          <div className="text-2xl font-bold font-sans">
            amazon
          </div>
          <div className="text-xl font-bold font-sans flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm4.586 14.424c-.18.295-.563.387-.857.207-2.35-1.434-5.305-1.76-8.785-.964-.335.077-.67-.133-.746-.47-.077-.334.132-.67.47-.745 3.808-.87 7.076-.496 9.71 1.115.293.18.386.563.208.857zm1.144-2.553c-.227.368-.7.485-1.07.257-2.687-1.65-6.785-2.13-9.965-1.166-.406.122-.84-.106-.963-.51-.122-.406.106-.84.512-.964 3.65-1.11 8.35-.555 11.43 1.336.37.228.485.702.256 1.072zm.12-2.65C14.66 9.385 8.5 9.145 4.96 10.22c-.482.146-.99-.126-1.137-.607-.145-.48.125-.99.606-1.137 4.14-1.258 10.96-1.004 15.01 1.396.437.26.58.837.32 1.275-.26.438-.836.58-1.274.32z"/></svg>
            Spotify
          </div>
          <div className="text-xl font-bold font-sans flex items-center gap-1.5">
            <span className="w-6 h-6 border-2 rounded border-current flex items-center justify-center text-sm font-black">N</span> Notion
          </div>
          <div className="text-xl font-bold font-sans flex items-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="currentColor" className="w-6 h-6"><path d="M6 3.75L12 7.5L6 11.25L0 7.5L6 3.75zM18 3.75L24 7.5L18 11.25L12 7.5L18 3.75zM6 12.75L12 16.5L6 20.25L0 16.5L6 12.75zM18 12.75L24 16.5L18 20.25L12 16.5L18 12.75zM12 22.5L18 18.75L12 15L6 18.75L12 22.5z"/></svg>
            Dropbox
          </div>
        </div>
      </footer>
      
      <AuthModal />
    </div>
  );
}
