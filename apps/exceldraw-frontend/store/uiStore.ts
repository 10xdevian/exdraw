import { create } from 'zustand';

interface UIState {
  isAuthOpen: boolean;
  authMode: "signin" | "signup";
  setAuthOpen: (isOpen: boolean, mode?: "signin" | "signup") => void;
  
  isViewerPromptOpen: boolean;
  setViewerPromptOpen: (isOpen: boolean) => void;
  
  isDrawingsOpen: boolean;
  setDrawingsOpen: (isOpen: boolean) => void;
}

export const useUIStore = create<UIState>((set) => ({
  isAuthOpen: false,
  authMode: "signin",
  setAuthOpen: (isOpen, mode) => set((state) => ({ 
    isAuthOpen: isOpen, 
    authMode: mode || state.authMode 
  })),
  
  isViewerPromptOpen: false,
  setViewerPromptOpen: (isOpen) => set({ isViewerPromptOpen: isOpen }),
  
  isDrawingsOpen: false,
  setDrawingsOpen: (isOpen) => set({ isDrawingsOpen: isOpen }),
}));
