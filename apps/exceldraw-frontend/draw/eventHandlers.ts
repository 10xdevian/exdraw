import { Shape, CanvasEvent } from "@repo/shared";
import { useCanvasStore, MIN_ZOOM, MAX_ZOOM } from "../store/canvasStore";
import { InteractionState } from "./InteractionState";
import { getCenter, getBoundingBox, hitTestHandle, findHitShape, getContainedShapeIds, scaleContainedShape } from "./ShapeManager";
import { generateId, throttle, clearCanvas } from "./utils";
import { saveShapeToDB, deleteShapeFromDB, deleteShapesFromDB } from "../lib/db";
import { toWorld } from "./viewport";
import { updateConnectorsForShape as syncConnectorsForShape } from "./connectors";
import { createTextEditing } from "./textEditing";

export function createEventHandlers(
  canvas: HTMLCanvasElement,
  ctx: CanvasRenderingContext2D,
  roomId: string,
  state: InteractionState,
  sendEvent: (action: CanvasEvent["action"], payload: any) => void
) {
  const throttledUpdateBroadcast = throttle((shape: Shape) => {
    sendEvent("SHAPE_UPDATE", shape);
  }, 50);

  // Every mouse event carries SCREEN coordinates (event.clientX/Y); every shape lives in
  // WORLD coordinates. This is the one conversion point all handlers below go through —
  // see viewport.ts for why panning/zooming means these are no longer the same thing.
  const worldPoint = (clientX: number, clientY: number) => {
    const zoom = useCanvasStore.getState().zoom;
    return toWorld(clientX, clientY, canvas, { panX: state.panX, panY: state.panY, zoom });
  };

  const currentViewport = () => ({ panX: state.panX, panY: state.panY, zoom: useCanvasStore.getState().zoom });

  const updateConnectorsForShape = (movedShapeId: string) => syncConnectorsForShape(movedShapeId, throttledUpdateBroadcast);

  const { spawnTextInput } = createTextEditing({ canvas, ctx, roomId, state, sendEvent });

  const handleDoubleClick = (event: MouseEvent) => {
    const store = useCanvasStore.getState();
    if (store.activeTool !== "select") return;

    const world = worldPoint(event.clientX, event.clientY);
    const hitShape = findHitShape(world.x, world.y, store.shapes, s => s.type === "text", store.zoom);

    // Position the edit box at the shape's own origin, not wherever the double-click
    // landed. The original text stays drawn on the canvas, unchanged, until editing
    // finishes — placing the textarea at the click point (often mid- or end-of-string,
    // never the shape's actual top-left) left the old rendered text sitting in one spot
    // and a second, empty-looking editable box floating elsewhere: it read as "a new
    // text area opened" rather than "the existing one became editable."
    if (hitShape) spawnTextInput(hitShape.x, hitShape.y, hitShape);
  };

  const handleMouseDown = (event: MouseEvent) => {
    // The canvas itself isn't a focusable element. Per the HTML spec, a mousedown whose
    // target isn't focusable runs a default action AFTER our listener that blurs whatever
    // currently has focus — including the <textarea> the text tool creates and focuses
    // synchronously right here in this same handler. Without this, spawnTextInput's input
    // is focused for a single tick and then immediately un-focused by the browser itself,
    // which fires our onblur → finishEditing → the shape never actually gets created.
    event.preventDefault();

    const store = useCanvasStore.getState();
    const world = worldPoint(event.clientX, event.clientY);
    state.startX = world.x;
    state.startY = world.y;

    if (store.activeTool === "text") {
       spawnTextInput(state.startX, state.startY);
       return;
    }

    if (store.activeTool === "select") {
      const sortedShapes = [...store.shapes].sort((a, b) => (a.sequenceNumber || 0) - (b.sequenceNumber || 0));
      
      for (const id of state.selectedIds) {
         const shape = store.shapes.find(s => s.id === id);
         if (shape) {
           const handle = hitTestHandle(state.startX, state.startY, shape, store.zoom);
           if (handle) {
             state.isDrawingOrDragging = true;
             state.activeHandle = handle;
             state.currentShapeId = shape.id;
             state.originalShapeData = { ...shape };
             state.containedOriginalData = new Map(
               getContainedShapeIds(shape, store.shapes).map(id => {
                 const contained = store.shapes.find(s => s.id === id)!;
                 return [id, { ...contained }] as const;
               })
             );
             return;
           }
         }
      }

      const hitShape = findHitShape(state.startX, state.startY, sortedShapes, undefined, store.zoom);

      if (hitShape) {
        if (!state.selectedIds.has(hitShape.id)) {
          state.selectedIds.clear();
          state.selectedIds.add(hitShape.id);
        }
        state.isDrawingOrDragging = true;
        state.activeHandle = "body";
        state.currentShapeId = hitShape.id;
        state.dragOffset = { x: state.startX, y: state.startY };
        state.containedOriginalData = new Map(
          getContainedShapeIds(hitShape, store.shapes).map(id => {
            const contained = store.shapes.find(s => s.id === id)!;
            return [id, { ...contained }] as const;
          })
        );
      } else {
        state.selectedIds.clear();
      }
      clearCanvas(store.shapes, state.selectedIds, canvas, ctx, currentViewport());
      return;
    }

    state.isDrawingOrDragging = true;
    state.currentShapeId = generateId();

    const newShape: Shape = {
      id: state.currentShapeId,
      type: store.activeTool,
      x: state.startX,
      y: state.startY,
      width: 0,
      height: 0,
      strokeColor: store.strokeColor,
      strokeWidth: store.strokeWidth,
    };
    if (store.activeTool === "line" || store.activeTool === "arrow") {
      newShape.endX = state.startX;
      newShape.endY = state.startY;
    }

    store.addShape(newShape);
    sendEvent("SHAPE_ADD", newShape);
  };

  const handleMouseMove = (event: MouseEvent) => {
    if (!state.isDrawingOrDragging || !state.currentShapeId) return;

    const store = useCanvasStore.getState();
    const currentShape = store.shapes.find(s => s.id === state.currentShapeId);
    if (!currentShape) return;
    const world = worldPoint(event.clientX, event.clientY);

    if (store.activeTool === "select") {
      if (state.activeHandle === "body") {
        const deltaX = world.x - state.dragOffset.x;
        const deltaY = world.y - state.dragOffset.y;
        state.dragOffset = { x: world.x, y: world.y };

        // Everything nested inside the dragged shape (snapshotted at drag-start) rides
        // along by the same incremental delta as the shapes actually being dragged.
        const idsToMove = new Set([...state.selectedIds, ...state.containedOriginalData.keys()]);

        idsToMove.forEach(id => {
          const shape = store.shapes.find(s => s.id === id);
          if (shape) {
            const updates: Partial<Shape> = { x: shape.x + deltaX, y: shape.y + deltaY };
            if (shape.type === "line" || shape.type === "connector" || shape.type === "arrow") {
               updates.endX = (shape.endX ?? shape.x) + deltaX;
               updates.endY = (shape.endY ?? shape.y) + deltaY;
            }
            store.updateShape(id, updates);

            const updatedShape = store.shapes.find(s => s.id === id);
            if (updatedShape) {
               throttledUpdateBroadcast(updatedShape);
               updateConnectorsForShape(id);
            }
          }
        });
      } else if (state.activeHandle && state.originalShapeData) {
        const deltaX = world.x - state.startX;
        const deltaY = world.y - state.startY;
        let updates: Partial<Shape> = {};

        if (state.originalShapeData.type === "line" || state.originalShapeData.type === "connector" || state.originalShapeData.type === "arrow") {
           const snapTarget = findHitShape(world.x, world.y, store.shapes, s =>
              s.id !== state.currentShapeId && (s.type === "rect" || s.type === "circle" || s.type === "diamond"),
              store.zoom
           );
           const snapCenter = snapTarget ? getCenter(snapTarget) : null;
           if (state.activeHandle === "start") {
             updates = { x: snapCenter ? snapCenter.x : state.originalShapeData.x + deltaX, y: snapCenter ? snapCenter.y : state.originalShapeData.y + deltaY };
           } else if (state.activeHandle === "end") {
             updates = { endX: snapCenter ? snapCenter.x : (state.originalShapeData.endX ?? state.originalShapeData.x) + deltaX, endY: snapCenter ? snapCenter.y : (state.originalShapeData.endY ?? state.originalShapeData.y) + deltaY };
           }
        } else {
           const { x, y, width, height } = state.originalShapeData;
           let newX = x;
           let newY = y;
           let newW = width;
           let newH = height;

           if (state.activeHandle.includes("n")) { newY = y + deltaY; newH = height - deltaY; }
           if (state.activeHandle.includes("s")) { newH = height + deltaY; }
           if (state.activeHandle.includes("w")) { newX = x + deltaX; newW = width - deltaX; }
           if (state.activeHandle.includes("e")) { newW = width + deltaX; }
           
           updates = { x: newX, y: newY, width: newW, height: newH };

           // Scale everything nested inside this shape (snapshotted at drag-start) by the
           // same proportion the container itself just changed by, anchored to its new
           // top-left — resizing the container resizes its contents, not just the outline.
           if (state.containedOriginalData.size > 0) {
              const origContainerBox = { minX: x, minY: y, w: width, h: height };
              const newContainerBox = { minX: newX, minY: newY, w: newW, h: newH };
              state.containedOriginalData.forEach((origShape, id) => {
                 store.updateShape(id, scaleContainedShape(origShape, origContainerBox, newContainerBox));
                 const updatedContained = store.shapes.find(s => s.id === id);
                 if (updatedContained) {
                    throttledUpdateBroadcast(updatedContained);
                    updateConnectorsForShape(id);
                 }
              });
           }
        }

        store.updateShape(state.currentShapeId, updates);
        const updatedShape = store.shapes.find(s => s.id === state.currentShapeId);
        if (updatedShape) {
          throttledUpdateBroadcast(updatedShape);
          updateConnectorsForShape(state.currentShapeId);
        }
      }
      return;
    }

    const width = world.x - state.startX;
    const height = world.y - state.startY;

    if (currentShape.type === "line" || currentShape.type === "arrow") {
      const snapTarget = findHitShape(world.x, world.y, store.shapes, s =>
         s.id !== state.currentShapeId && (s.type === "rect" || s.type === "circle" || s.type === "diamond"),
         store.zoom
      );
      const snapCenter = snapTarget ? getCenter(snapTarget) : null;
      store.updateShape(state.currentShapeId, {
         endX: snapCenter ? snapCenter.x : world.x,
         endY: snapCenter ? snapCenter.y : world.y
      });
    } else {
      store.updateShape(state.currentShapeId, { width, height });
    }
    
    const updatedShape = store.shapes.find(s => s.id === state.currentShapeId);
    if (updatedShape) throttledUpdateBroadcast(updatedShape);
  };

  const handleMouseUp = async (event: MouseEvent) => {
    if (!state.isDrawingOrDragging || !state.currentShapeId) return;
    state.isDrawingOrDragging = false;
    const store = useCanvasStore.getState();
    let finishedShape = store.shapes.find(s => s.id === state.currentShapeId);
    
    if (finishedShape) {
      if (store.activeTool === "select") {
        if (state.activeHandle === "start" || state.activeHandle === "end") {
           const ptX = state.activeHandle === "start" ? finishedShape.x : (finishedShape.endX ?? finishedShape.x);
           const ptY = state.activeHandle === "start" ? finishedShape.y : (finishedShape.endY ?? finishedShape.y);
           const finishedShapeId = finishedShape.id;

           const hitTarget = findHitShape(ptX, ptY, store.shapes, s =>
              s.id !== finishedShapeId && (s.type === "rect" || s.type === "circle" || s.type === "diamond"),
              store.zoom
           );


           if (hitTarget) {
             const c = getCenter(hitTarget);
             store.updateShape(finishedShape.id, {
                type: "connector",
                ...(state.activeHandle === "start" ? { sourceId: hitTarget.id, x: c.x, y: c.y } : { targetId: hitTarget.id, endX: c.x, endY: c.y })
             });
           } else {
             const isStart = state.activeHandle === "start";
             const stillHasOther = isStart ? !!finishedShape.targetId : !!finishedShape.sourceId;
             store.updateShape(finishedShape.id, {
                ...(isStart ? { sourceId: undefined } : { targetId: undefined }),
                type: stillHasOther ? "connector" : "line"
             });
           }
           finishedShape = store.shapes.find(s => s.id === state.currentShapeId) || finishedShape;
        }

        if (state.activeHandle && state.activeHandle !== "body" && state.activeHandle !== "start" && state.activeHandle !== "end") {
           const { minX, minY, w, h } = getBoundingBox(finishedShape);
           store.updateShape(finishedShape.id, { x: minX, y: minY, width: w, height: h });
           finishedShape = store.shapes.find(s => s.id === state.currentShapeId) || finishedShape;
        }

        // Persist the container itself/selection, plus anything that rode along nested
        // inside it (see getContainedShapeIds / containedOriginalData) — both the drag
        // and the resize path only mutated the store in-memory; this is what actually
        // saves and broadcasts those moved/rescaled contents.
        const idsToPersist = new Set([...state.selectedIds, ...state.containedOriginalData.keys()]);
        for (const id of idsToPersist) {
           const shape = store.shapes.find(s => s.id === id);
           if (shape) {
             sendEvent("SHAPE_UPDATE", shape);
             await saveShapeToDB(roomId, shape);
             if (shape.type !== "connector") {
                store.shapes.forEach(async conn => {
                  if (conn.type === "connector" && (conn.sourceId === id || conn.targetId === id)) {
                    sendEvent("SHAPE_UPDATE", conn);
                    await saveShapeToDB(roomId, conn);
                  }
                });
             }
           }
        }
        state.containedOriginalData = new Map();
      } else {
        if (finishedShape.type === "line" || finishedShape.type === "arrow") {
           const finishedShapeId = finishedShape.id;
           const isAnchorCandidate = (s: Shape) =>
              s.id !== finishedShapeId && (s.type === "rect" || s.type === "circle" || s.type === "diamond");
           const world = worldPoint(event.clientX, event.clientY);
           const sourceShape = findHitShape(state.startX, state.startY, store.shapes, isAnchorCandidate, store.zoom);
           const targetShape = findHitShape(world.x, world.y, store.shapes, isAnchorCandidate, store.zoom);
           if (sourceShape && targetShape && sourceShape.id !== targetShape.id) {
             const sc = getCenter(sourceShape);
             const tc = getCenter(targetShape);
             store.updateShape(finishedShape.id, {
               type: "connector",
               sourceId: sourceShape.id,
               targetId: targetShape.id,
               x: sc.x,
               y: sc.y,
               endX: tc.x,
               endY: tc.y
             });
           } else if (sourceShape || targetShape) {
              const connectedShape = sourceShape || targetShape;
              const c = getCenter(connectedShape!);
              const isSource = !!sourceShape;
              store.updateShape(finishedShape.id, {
                 type: "connector",
                 ...(isSource ? { sourceId: connectedShape!.id, x: c.x, y: c.y } : { targetId: connectedShape!.id, endX: c.x, endY: c.y })
              });
           }
           finishedShape = store.shapes.find(s => s.id === state.currentShapeId) || finishedShape;
        }

        if (finishedShape.type !== "line" && finishedShape.type !== "connector" && finishedShape.type !== "arrow") {
           const { minX, minY, w, h } = getBoundingBox(finishedShape);
           store.updateShape(finishedShape.id, { x: minX, y: minY, width: w, height: h });
           finishedShape = store.shapes.find(s => s.id === state.currentShapeId) || finishedShape;
        }

        if (finishedShape) {
          sendEvent("SHAPE_UPDATE", finishedShape);
          await saveShapeToDB(roomId, finishedShape);
          if (store.activeTool !== "pencil" && store.activeTool !== "eraser") {
            store.setActiveTool("select");
          }
        }
      }
    }
    
    state.activeHandle = null;
    state.currentShapeId = null;
    state.originalShapeData = null;
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    // This listener is bound on `window`, so it also sees every keystroke typed into the
    // text tool's floating <textarea> (keydown bubbles there too). Without this guard,
    // Backspace/Delete while editing text — the shape is almost always still "selected"
    // from the click/double-click that opened it — deletes the whole shape mid-edit
    // instead of removing a character, and Ctrl/Cmd+A hijacks the browser's native
    // select-all-text-in-input into this app's select-all-shapes shortcut.
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === "TEXTAREA" || target.tagName === "INPUT" || target.isContentEditable)) {
      return;
    }

    if ((e.key === "Backspace" || e.key === "Delete") && state.selectedIds.size > 0) {
       const store = useCanvasStore.getState();
       if (state.selectedIds.size === 1) {
         const id = Array.from(state.selectedIds)[0];
         if (!id) return;
         sendEvent("SHAPE_DELETE", { id });
         const newShapes = store.shapes.filter(s => s.id !== id);
         store.setShapes(newShapes);
         deleteShapeFromDB(roomId, id);
       } else {
         const ids = Array.from(state.selectedIds);
         sendEvent("SHAPES_DELETE", { ids });
         const newShapes = store.shapes.filter(s => !state.selectedIds.has(s.id));
         store.setShapes(newShapes);
         deleteShapesFromDB(roomId, ids);
       }
       state.selectedIds.clear();
       clearCanvas(useCanvasStore.getState().shapes, state.selectedIds, canvas, ctx, currentViewport());
    }
    if ((e.metaKey || e.ctrlKey) && e.key === "a") {
       e.preventDefault();
       const store = useCanvasStore.getState();
       state.selectedIds = new Set(store.shapes.map(s => s.id));
       clearCanvas(store.shapes, state.selectedIds, canvas, ctx, currentViewport());
    }
  };

  // Plain wheel/trackpad-scroll pans; Ctrl/Cmd+wheel (also how Chrome/Firefox report a
  // trackpad pinch gesture) zooms, anchored so the world point under the cursor stays
  // under the cursor — the standard "zoom toward the mouse" feel, not zoom-toward-origin.
  const handleWheel = (event: WheelEvent) => {
    event.preventDefault();
    const store = useCanvasStore.getState();

    if (event.ctrlKey || event.metaKey) {
      const oldZoom = store.zoom;
      const zoomFactor = Math.exp(-event.deltaY * 0.01);
      const newZoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, oldZoom * zoomFactor));
      if (newZoom === oldZoom) return;

      const rect = canvas.getBoundingClientRect();
      const worldBefore = worldPoint(event.clientX, event.clientY);
      state.panX = (event.clientX - rect.left) - worldBefore.x * newZoom;
      state.panY = (event.clientY - rect.top) - worldBefore.y * newZoom;

      store.setZoom(newZoom); // reactive, for the toolbar's % readout
      clearCanvas(store.shapes, state.selectedIds, canvas, ctx, { panX: state.panX, panY: state.panY, zoom: newZoom });
    } else {
      state.panX -= event.deltaX;
      state.panY -= event.deltaY;
      clearCanvas(store.shapes, state.selectedIds, canvas, ctx, currentViewport());
    }
  };

  return {
    handleMouseDown,
    handleMouseMove,
    handleMouseUp,
    handleKeyDown,
    handleDoubleClick,
    handleWheel,
  };
}
