import type { Vec3 } from "@/ar/types";

/**
 * Hotspot category — drives marker colour and the card badge.
 * Matches the resort plan: Rooms, Villas, Beach, Pool, Restaurant, Spa,
 * Gallery, Map. Optional so older projects without categories keep working.
 */
export type HotspotType =
  "room" | "villa" | "beach" | "pool" | "restaurant" | "spa" | "gallery" | "map";

export const HOTSPOT_TYPE_LABEL: Record<HotspotType, string> = {
  room: "Room",
  villa: "Villa",
  beach: "Beach",
  pool: "Pool",
  restaurant: "Restaurant",
  spa: "Spa",
  gallery: "Gallery",
  map: "Map",
};

export type HotspotData = {
  id: string;
  label: string;
  title: string;
  description: string;
  /** Model-local position, as a fraction of the project's `realWorldSize`. */
  position: Vec3;
  type?: HotspotType;
  /**
   * Swaps the rendered GLB "scene state" to the project scene with this id
   * when the hotspot is tapped. The world anchor is never touched — only the
   * model under it is replaced.
   */
  sceneId?: string;
  moreUrl?: string;
};
