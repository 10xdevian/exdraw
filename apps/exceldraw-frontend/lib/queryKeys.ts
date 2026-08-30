export const viewerKeys = {
  all: ["viewers"] as const,
  room: (roomId: string) => [...viewerKeys.all, roomId] as const,
};
