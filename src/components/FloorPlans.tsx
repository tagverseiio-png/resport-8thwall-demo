import { useState } from "react";
import { Bath, BedDouble, Sun } from "lucide-react";
import type { FloorPlan } from "@/models/FloorPlan";

export function FloorPlans({ plans }: { plans: FloorPlan[] }) {
  const [activeId, setActiveId] = useState(plans[0]?.id);
  const active = plans.find((plan) => plan.id === activeId) ?? plans[0];
  if (!active) return null;

  return (
    <div>
      <div className="flex gap-2">
        {plans.map((plan) => (
          <button
            key={plan.id}
            type="button"
            onClick={() => setActiveId(plan.id)}
            className={`flex-1 rounded-xl border px-3 py-2 text-sm transition-colors ${
              plan.id === active.id
                ? "border-primary bg-secondary text-primary"
                : "border-border text-muted-foreground"
            }`}
          >
            {plan.name}
          </button>
        ))}
      </div>

      <figure className="mt-4 overflow-hidden rounded-2xl border border-border bg-card">
        <img
          src={active.image}
          alt={`${active.name} floor plan`}
          loading="lazy"
          width={1024}
          height={1024}
          className="w-full object-cover"
        />
      </figure>

      <div className="mt-4 flex items-center justify-between">
        <div>
          <p className="font-display text-2xl">{active.area}</p>
          {active.priceFrom ? <p className="text-sm text-primary">{active.priceFrom}</p> : null}
        </div>
        <ul className="flex items-center gap-4 text-sm text-muted-foreground">
          <li className="flex items-center gap-1.5">
            <BedDouble className="size-4" />
            {active.bedrooms}
          </li>
          <li className="flex items-center gap-1.5">
            <Bath className="size-4" />
            {active.bathrooms}
          </li>
          <li className="flex items-center gap-1.5">
            <Sun className="size-4" />
            {active.balconies}
          </li>
        </ul>
      </div>
      <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{active.description}</p>
    </div>
  );
}
