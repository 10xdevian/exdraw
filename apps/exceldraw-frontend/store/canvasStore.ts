import { create } from 'zustand';
import { Shape, ShapeType } from '@repo/shared';

interface CanvasState {
  shapes: Shape[];
  activeTool: ShapeType;
  strokeColor: string;
  
  // Actions
  addShape: (shape: Shape) => void;
  updateShape: (id: string, updates: Partial<Shape>) => void;
  setShapes: (shapes: Shape[]) => void;
  setActiveTool: (tool: ShapeType) => void;
  setStrokeColor: (color: string) => void;
}

export const useCanvasStore = create<CanvasState>((set) => ({
  shapes: [],
  activeTool: "rect",
  strokeColor: "#a855f7", // default purple

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
}));
