import { Shape } from "@repo/shared";
import { useCanvasStore } from "../store/canvasStore";
import { getCenter } from "./ShapeManager";

// Re-centers every connector attached to `movedShapeId` (as sourceId/targetId) on that
// shape's new center. Call this after any move/resize of a shape that might have
// connectors attached — the connector's own x/y/endX/endY are really just a cache of
// where it was last anchored (actual on-screen position is resolved live at render/
// hit-test time via resolveConnectorEndpoints in ShapeManager.ts), but this cache still
// needs to stay in sync since it's what gets persisted and broadcast to other clients.
export function updateConnectorsForShape(movedShapeId: string, onUpdated: (shape: Shape) => void) {
  const store = useCanvasStore.getState();
  const movedShape = store.shapes.find(s => s.id === movedShapeId);
  if (!movedShape) return;
  const center = getCenter(movedShape);

  store.shapes.forEach(shape => {
    if (shape.type !== "connector") return;

    let updated = false;
    const newConnector = { ...shape };

    if (shape.sourceId === movedShapeId) {
      newConnector.x = center.x;
      newConnector.y = center.y;
      updated = true;
    }
    if (shape.targetId === movedShapeId) {
      newConnector.endX = center.x;
      newConnector.endY = center.y;
      updated = true;
    }

    if (updated) {
      store.updateShape(newConnector.id, newConnector);
      onUpdated(newConnector);
    }
  });
}
