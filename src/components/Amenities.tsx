import {
  Baby,
  BedDouble,
  Car,
  ConciergeBell,
  Dumbbell,
  Leaf,
  Map as MapIcon,
  Martini,
  ShieldCheck,
  Sofa,
  Sparkles,
  Umbrella,
  UtensilsCrossed,
  Waves,
} from "lucide-react";
import type { Amenity, AmenityIcon } from "@/models/Amenity";

const ICONS: Record<AmenityIcon, typeof Waves> = {
  pool: Waves,
  gym: Dumbbell,
  clubhouse: Sofa,
  play: Baby,
  garden: Leaf,
  parking: Car,
  security: ShieldCheck,
  beach: Umbrella,
  spa: Sparkles,
  restaurant: UtensilsCrossed,
  bar: Martini,
  villa: BedDouble,
  lobby: ConciergeBell,
  map: MapIcon,
};

export function Amenities({ amenities }: { amenities: Amenity[] }) {
  return (
    <ul className="space-y-3">
      {amenities.map((amenity) => {
        const Icon = ICONS[amenity.icon];
        return (
          <li
            key={amenity.id}
            className="flex items-start gap-3 rounded-2xl border border-border bg-card/60 p-3"
          >
            {amenity.image ? (
              <img
                src={amenity.image}
                alt={amenity.title}
                loading="lazy"
                width={1280}
                height={853}
                className="size-16 shrink-0 rounded-xl object-cover"
              />
            ) : (
              <span className="flex size-16 shrink-0 items-center justify-center rounded-xl bg-secondary text-primary">
                <Icon className="size-6" />
              </span>
            )}
            <div className="min-w-0">
              <h3 className="text-base font-medium">{amenity.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {amenity.description}
              </p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
