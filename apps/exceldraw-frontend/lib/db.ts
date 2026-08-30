import { openDB, DBSchema } from 'idb';
import { Shape } from '@repo/shared';

interface ExcaldrawDB extends DBSchema {
  shapes: {
    key: string;
    value: Shape & { roomId: string };
    indexes: { 'by-room': string };
  };
  metadata: {
    key: string;
    value: { roomId: string; lastSequenceNumber: number };
  };
}

const DB_NAME = 'excaldraw-local';
const DB_VERSION = 1;

export async function getDB() {
  return openDB<ExcaldrawDB>(DB_NAME, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains('shapes')) {
        const store = db.createObjectStore('shapes', { keyPath: 'id' });
        store.createIndex('by-room', 'roomId');
      }
      if (!db.objectStoreNames.contains('metadata')) {
        db.createObjectStore('metadata', { keyPath: 'roomId' });
      }
    },
  });
}

export async function getShapesFromDB(roomId: string): Promise<Shape[]> {
  const db = await getDB();
  return db.getAllFromIndex('shapes', 'by-room', roomId);
}

export async function saveShapeToDB(roomId: string, shape: Shape) {
  const db = await getDB();
  await db.put('shapes', { ...shape, roomId });
}

export async function saveShapesToDB(roomId: string, shapes: Shape[]) {
  const db = await getDB();
  const tx = db.transaction('shapes', 'readwrite');
  for (const shape of shapes) {
    tx.store.put({ ...shape, roomId });
  }
  await tx.done;
}

export async function getLastSequenceNumber(roomId: string): Promise<number> {
  const db = await getDB();
  const meta = await db.get('metadata', roomId);
  return meta?.lastSequenceNumber || 0;
}

export async function setLastSequenceNumber(roomId: string, seq: number) {
  const db = await getDB();
  await db.put('metadata', { roomId, lastSequenceNumber: seq });
}
