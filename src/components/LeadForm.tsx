import { useState, type FormEvent } from "react";
import { CalendarCheck, CheckCircle2 } from "lucide-react";
import { submitLead } from "@/lib/lead";
import { trackEvent } from "@/ar/analytics";

type LeadFormProps = {
  projectSlug: string;
  projectName: string;
  sceneId: string | null;
  source: "ar" | "preview";
};

/** Plan box: "Book … — lead capture form → serverless function". */
export function LeadForm({ projectSlug, projectName, sceneId, source }: LeadFormProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [interest, setInterest] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "done" | "error">("idle");

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (status === "sending" || status === "done") return;
    setStatus("sending");
    try {
      const result = await submitLead({
        data: {
          projectSlug,
          name,
          phone,
          interest,
          sceneId: sceneId ?? "",
          source,
        },
      });
      if (result.ok) {
        setStatus("done");
        trackEvent("lead_submitted", { project: projectSlug, scene: sceneId });
      } else {
        setStatus("error");
      }
    } catch {
      setStatus("error");
    }
  };

  if (status === "done") {
    return (
      <div className="gold-surface mt-5 flex items-center gap-3 rounded-2xl px-4 py-3.5">
        <CheckCircle2 className="size-5 shrink-0" />
        <p className="text-sm font-medium">
          Request received — our team will call you back about {projectName}.
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="mt-5 rounded-2xl border border-border bg-card/60 p-4">
      <p className="flex items-center gap-2 text-sm font-semibold tracking-wide">
        <CalendarCheck className="size-4 text-primary" />
        Request a callback
      </p>
      <div className="mt-3 space-y-2.5">
        <input
          required
          minLength={2}
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Your name"
          autoComplete="name"
          className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
        />
        <input
          required
          minLength={7}
          maxLength={20}
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          placeholder="Phone / WhatsApp"
          autoComplete="tel"
          inputMode="tel"
          className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
        />
        <input
          maxLength={120}
          value={interest}
          onChange={(e) => setInterest(e.target.value)}
          placeholder="Beach Villa · 12–14 Dec (optional)"
          className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm outline-none placeholder:text-muted-foreground focus:border-primary"
        />
      </div>
      <button
        type="submit"
        disabled={status === "sending"}
        className="gold-surface mt-3 flex w-full items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-semibold tracking-[0.14em] uppercase disabled:opacity-60"
      >
        {status === "sending" ? "Sending…" : "Book a stay"}
      </button>
      {status === "error" ? (
        <p className="mt-2 text-center text-xs text-destructive">
          Could not send — please try WhatsApp below instead.
        </p>
      ) : null}
    </form>
  );
}
