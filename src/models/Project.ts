import type { Amenity } from "./Amenity";
import type { FloorPlan } from "./FloorPlan";
import type { HotspotData } from "./Hotspot";

export type GalleryItem = {
  id: string;
  src: string;
  title: string;
  caption?: string;
};

export type ProjectScene = {
  id: string;
  label: string;
  modelUrl: string;
};

export type ContactLinks = {
  bookVisitUrl: string;
  contactUrl: string;
  phone: string;
  whatsapp: string;
  shareUrl: string;
};

export type ProjectConfig = {
  slug: string;
  name: string;
  developer: string;
  tagline: string;
  location: string;
  intro: string;
  heroImage: string;
  heroVideo?: string;
  /** Real-world footprint of the model in metres, used for placement scale. */
  realWorldSize: number;
  modelUrl: string;
  /**
   * Swappable GLB "scene states" rendered at the SAME anchor when a hotspot
   * with `sceneId` is tapped (plan: Rooms → villa, Amenities → pool).
   * Empty/omitted = single-model project; `modelUrl` is the default scene.
   */
  scenes?: ProjectScene[];
  /**
   * Static .usdz for iOS AR Quick Look — the only route to real ARKit world
   * tracking from Safari. Must be a real URL (blob: does not work with rel="ar")
   * served as `model/vnd.usd+zip`. Build it with `npm run build:usdz`.
   */
  usdzUrl?: string;
  /** Spatially anchored AR video (mapped onto a plane in the scene). */
  arVideoUrl?: string;
  stats: { label: string; value: string }[];
  gallery: GalleryItem[];
  amenities: Amenity[];
  floorPlans: FloorPlan[];
  hotspots: HotspotData[];
  contact: ContactLinks;
  audioUrl?: string;
};
