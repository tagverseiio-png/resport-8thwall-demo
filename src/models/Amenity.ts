export type AmenityIcon =
  | "pool"
  | "gym"
  | "clubhouse"
  | "play"
  | "garden"
  | "parking"
  | "security"
  | "beach"
  | "spa"
  | "restaurant"
  | "bar"
  | "villa"
  | "lobby"
  | "map";

export type AmenityCategory = "stay" | "dining" | "wellness" | "beach" | "amenity" | "service";

export type Amenity = {
  id: string;
  title: string;
  description: string;
  icon: AmenityIcon;
  image?: string;
  /** Resort grouping: dining / beach / wellness / stay. Defaults to "amenity". */
  category?: AmenityCategory;
};
