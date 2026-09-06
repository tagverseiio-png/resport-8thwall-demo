import type { ProjectConfig } from "@/models/Project";

/**
 * AURELIA RESORT — full-island WebAR project.
 *
 * Mirrors the poster flow: QR → Intro → Camera Permission → Tilt → Surface
 * Detection → Tap to Place → Explore (walk around, hotspots, rooms, dining,
 * beach, map, video, gallery, booking) → iOS Quick Look / 3D preview fallback.
 *
 * Hotspot positions are model-local fractions of `realWorldSize` and must
 * match the nodes in `resort.glb` (see docs/resort-model-pipeline.md).
 * Until resort.glb lands, `ResortPlaceholder` renders the same island layout
 * procedurally so every hotspot still anchors correctly.
 */
export const aureliaResort: ProjectConfig = {
  slug: "aurelia-resort",
  name: "Aurelia Resort",
  developer: "Aurelia Hospitality",
  tagline: "Your Next Getaway in Augmented Reality",
  location: "Private Island, Coral Coast",
  intro:
    "Scan. Explore. Experience. A whole resort, in your space. Walk around, zoom in, and discover rooms, villas, restaurants, beach areas and more — right from your phone.",
  heroImage: "/assets/images/hero.jpg",
  realWorldSize: 1.2,
  modelUrl: "/assets/models/resort.glb",
  /**
   * Swappable scene states. Tapping a hotspot with `sceneId` replaces the
   * rendered GLB at the SAME world anchor — the session and anchor are never
   * reset (plan footer rule).
   */
  scenes: [
    { id: "resort", label: "Resort Island", modelUrl: "/assets/models/resort.glb" },
    { id: "villa", label: "Beach Villa", modelUrl: "/assets/models/villa.glb" },
    { id: "pool", label: "Infinity Pool", modelUrl: "/assets/models/pool.glb" },
  ],
  usdzUrl: "/assets/models/resort.usdz",
  arVideoUrl: "/assets/videos/project-film.mp4",
  stats: [
    { label: "Villas", value: "42" },
    { label: "Suites", value: "68" },
    { label: "Beach", value: "800 m" },
    { label: "Dining", value: "5" },
  ],
  gallery: [
    {
      id: "r1",
      src: "/assets/images/gallery-living.jpg",
      title: "Villa Rooms",
      caption: "Wake up over the water — private deck, plunge pool, direct lagoon access.",
    },
    {
      id: "r2",
      src: "/assets/images/gallery-pool.jpg",
      title: "Infinity Pool",
      caption: "Sunset infinity edge overlooking the ocean.",
    },
    {
      id: "r3",
      src: "/assets/images/gallery-facade.jpg",
      title: "Main Lobby",
      caption: "Open-air arrival pavilion with island views.",
    },
    {
      id: "r4",
      src: "/assets/images/gallery-garden.jpg",
      title: "Private Beach",
      caption: "800 m of white sand with beach club service.",
    },
  ],
  amenities: [
    {
      id: "infinity-pool",
      title: "Infinity Pool",
      description: "Sunset infinity edge with swim-up bar and private cabanas.",
      icon: "pool",
      category: "amenity",
      image: "/assets/images/gallery-pool.jpg",
    },
    {
      id: "private-beach",
      title: "Private Beach",
      description: "800 m of white sand — kayaks, paddleboards, sunset cruises.",
      icon: "beach",
      category: "beach",
      image: "/assets/images/gallery-garden.jpg",
    },
    {
      id: "beach-club",
      title: "Beach Club",
      description: "Daybeds, DJs at sunset, cocktails and barefoot lunches.",
      icon: "bar",
      category: "beach",
    },
    {
      id: "main-restaurant",
      title: "Restaurants & Bars",
      description: "Five venues — overwater fine dining, beach grill, spa café, lobby bar.",
      icon: "restaurant",
      category: "dining",
    },
    {
      id: "spa",
      title: "Spa & Wellness",
      description: "Overwater treatment pavilions, yoga shala, hammam and plunge pools.",
      icon: "spa",
      category: "wellness",
    },
    {
      id: "main-lobby",
      title: "Main Lobby",
      description: "Open-air arrival pavilion — concierge, boutique and gallery.",
      icon: "lobby",
      category: "service",
      image: "/assets/images/gallery-facade.jpg",
    },
    {
      id: "water-sports",
      title: "Beach & Activities",
      description: "Diving centre, sailing, tennis, kids club and island trails.",
      icon: "beach",
      category: "beach",
    },
  ],
  floorPlans: [
    {
      id: "beach-villa",
      name: "Beach Villa",
      area: "1,290 sq ft",
      bedrooms: 1,
      bathrooms: 1,
      balconies: 1,
      description: "Steps from the sand with a private plunge pool and garden shower.",
      image: "/assets/images/floorplan-1bhk.jpg",
      priceFrom: "From $420 / night",
    },
    {
      id: "water-villa",
      name: "Water Villa",
      area: "1,720 sq ft",
      bedrooms: 1,
      bathrooms: 2,
      balconies: 2,
      description: "Overwater villa with glass floor, lagoon ladder and sunset deck.",
      image: "/assets/images/floorplan-2bhk.jpg",
      priceFrom: "From $680 / night",
    },
    {
      id: "resort-suite",
      name: "Resort Suite",
      area: "2,150 sq ft",
      bedrooms: 2,
      bathrooms: 2,
      balconies: 1,
      description: "Family suite in the main residence with lounge and dining terrace.",
      image: "/assets/images/floorplan-3bhk.jpg",
      priceFrom: "From $540 / night",
    },
  ],
  // Only markers backed by a shipped GLB are listed here. Every hotspot
  // without a `sceneId` used to point at island locations that don't exist
  // in resort.glb (spa, restaurants, beach club…) — floating fake markings,
  // so they were removed. The three below are real: two open the villa
  // model, one opens the pool model.
  hotspots: [
    {
      id: "water-villas",
      label: "Water Villas",
      title: "Water Villas",
      description: "Overwater villas with private decks and lagoon access. Tap to step inside.",
      type: "villa",
      sceneId: "villa",
      position: { x: -0.2, y: 0.1, z: 0.42 },
    },
    {
      id: "villa-rooms",
      label: "Villa Rooms",
      title: "Villa Rooms",
      description: "Beach villas with plunge pools and garden showers. Tap to step inside.",
      type: "room",
      sceneId: "villa",
      position: { x: 0.42, y: 0.1, z: 0.02 },
    },
    {
      id: "infinity-pool",
      label: "Infinity Pool",
      title: "Infinity Pool",
      description: "Sunset infinity edge with swim-up bar. Tap to dive in.",
      type: "pool",
      sceneId: "pool",
      position: { x: 0.05, y: 0.08, z: 0.18 },
    },
  ],
  contact: {
    bookVisitUrl: "https://aurelia-resort.example.com/book",
    contactUrl: "https://aurelia-resort.example.com/contact",
    phone: "+10000000000",
    whatsapp: "https://wa.me/10000000000?text=I%27m%20interested%20in%20Aurelia%20Resort",
    shareUrl: "https://aurelia-resort.example.com/ar/aurelia-resort",
  },
};
