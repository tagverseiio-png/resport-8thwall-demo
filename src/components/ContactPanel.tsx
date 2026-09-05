import { CalendarCheck, MessageCircle, Phone, RotateCcw, Send, Share2 } from "lucide-react";
import type { ProjectConfig } from "@/models/Project";
import { trackEvent } from "@/ar/analytics";
import { LeadForm } from "./LeadForm";

type ContactPanelProps = {
  project: ProjectConfig;
  sceneId?: string | null;
  source?: "ar" | "preview";
  onRestart: () => void;
};

export function ContactPanel({
  project,
  sceneId = null,
  source = "ar",
  onRestart,
}: ContactPanelProps) {
  const book = (channel: "visit" | "contact" | "call" | "whatsapp" | "share") => {
    trackEvent("booking_click", { project: project.slug, channel, scene: sceneId });
  };
  const share = async () => {
    const data = {
      title: project.name,
      text: `${project.name} — ${project.tagline}`,
      url: project.contact.shareUrl,
    };
    if (navigator.share) {
      try {
        await navigator.share(data);
        book("share");
        return;
      } catch {
        /* user cancelled */
      }
    }
    await navigator.clipboard?.writeText(data.url);
    book("share");
  };

  return (
    <div>
      <p className="font-display text-xl">Interested in this project?</p>
      <p className="mt-2 text-sm text-muted-foreground">
        Our team can walk you through availability, pricing and site visits.
      </p>

      <LeadForm
        projectSlug={project.slug}
        projectName={project.name}
        sceneId={sceneId}
        source={source}
      />

      <a
        href={project.contact.bookVisitUrl}
        target="_blank"
        rel="noreferrer"
        onClick={() => book("visit")}
        className="gold-surface mt-3 flex items-center justify-center gap-2 rounded-full px-6 py-3.5 text-sm font-semibold tracking-[0.14em] uppercase"
      >
        <CalendarCheck className="size-4" />
        Book a site visit
      </a>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <a
          href={project.contact.contactUrl}
          target="_blank"
          rel="noreferrer"
          onClick={() => book("contact")}
          className="flex items-center justify-center gap-2 rounded-full border border-border px-4 py-3 text-sm"
        >
          <Send className="size-4" />
          Contact us
        </a>
        <a
          href={`tel:${project.contact.phone}`}
          onClick={() => book("call")}
          className="flex items-center justify-center gap-2 rounded-full border border-border px-4 py-3 text-sm"
        >
          <Phone className="size-4" />
          Call
        </a>
        <a
          href={project.contact.whatsapp}
          target="_blank"
          rel="noreferrer"
          onClick={() => book("whatsapp")}
          className="flex items-center justify-center gap-2 rounded-full border border-border px-4 py-3 text-sm"
        >
          <MessageCircle className="size-4" />
          WhatsApp
        </a>
        <button
          type="button"
          onClick={share}
          className="flex items-center justify-center gap-2 rounded-full border border-border px-4 py-3 text-sm"
        >
          <Share2 className="size-4" />
          Share
        </button>
      </div>

      <button
        type="button"
        onClick={onRestart}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-full border border-border px-4 py-3 text-sm text-muted-foreground"
      >
        <RotateCcw className="size-4" />
        Restart AR
      </button>
    </div>
  );
}
