import { create } from 'zustand';
import { Shape, ShapeType } from '@repo/shared';

export const MIN_ZOOM = 0.1;
export const MAX_ZOOM = 4;

interface CanvasState {
  shapes: Shape[];
  activeTool: ShapeType;
  strokeColor: string;
  strokeWidth: number;
  // Zoom lives here (reactive, low-frequency: buttons + ctrl/pinch-wheel) so the toolbar's
  // percentage readout and +/- buttons can just bind to the store. Pan does NOT live here —
  // it changes on every plain wheel tick, and routing that through React would mean a
  // re-render per scroll event. Pan is tracked imperatively in InteractionState and only
  // ever touches the canvas directly (see index.ts's wheel handler).
  zoom: number;

  // Actions
  addShape: (shape: Shape) => void;
  updateShape: (id: string, updates: Partial<Shape>) => void;
  setShapes: (shapes: Shape[]) => void;
  setActiveTool: (tool: ShapeType) => void;
  setStrokeColor: (color: string) => void;
  setStrokeWidth: (width: number) => void;
  setZoom: (zoom: number) => void;
}

export const useCanvasStore = create<CanvasState>((set) => ({
  shapes: [],
  activeTool: "select",
  strokeColor: "#a855f7", // default purple
  strokeWidth: 2, // default medium
  zoom: 1,

  addShape: (shape) =>
    set((state) => ({ shapes: [...state.shapes, shape] })),

  updateShape: (id, updates) =>
    set((state) => ({
      shapes: state.shapes.map((s) =>
        s.id === id ? { ...s, ...updates } : s
      )
    })),

  setShapes: (shapes) => set({ shapes }),

  setActiveTool: (tool) => set({ activeTool: tool }),
  setStrokeColor: (color) => set({ strokeColor: color }),
  setStrokeWidth: (width) => set({ strokeWidth: width }),
  setZoom: (zoom) => set({ zoom: Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom)) }),
}));
