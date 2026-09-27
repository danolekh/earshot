import type { Conversation } from "@danolekh/earshot/core";
import { useEffect, useState } from "react";

import insurance from "@/calls/alder-mutual-address.json";
import booking from "@/calls/physio-brandl-termin.json";

import { CallReview, type CallReviewProps } from "../../../registry/earshot/call-review";

const SKINS = [
  {
    id: "console",
    label: "Console",
    orb: { colors: ["#f4ffd6", "#b6f03a", "#2f6b12"] },
  },
  {
    id: "warm",
    label: "Contact centre",
    orb: { colors: ["#fff3e6", "#ffa25c", "#c2410c"] },
  },
  {
    id: "indigo",
    label: "Front desk",
    orb: { colors: ["#f2f2fd", "#8d91fe", "#3b3fd6"] },
  },
  { id: "xray", label: "X-ray", orb: { colors: ["#ffffff", "#cccccc", "#777777"] } },
] as const satisfies readonly { id: string; label: string; orb: CallReviewProps["orb"] }[];

const CALLS = {
  insurance: {
    call: insurance as unknown as Conversation,
    src: "/calls/alder-mutual-address.mp3",
    title: "Address change, home policy",
    subtitle: "Alder Mutual · simulated caller · 4 tool calls",
    lang: "en",
  },
  booking: {
    call: booking as unknown as Conversation,
    src: "/calls/physio-brandl-termin.mp3",
    title: "Terminbuchung, Thomas Huber",
    subtitle: "Physiotherapie Brandl · heute, 09:14",
    lang: "de",
  },
} as const;

/** One call, many skins: the same markup restyled by CSS alone. */
export function SkinSwitcher() {
  const [skin, setSkin] = useState<(typeof SKINS)[number]["id"]>("console");
  const [which, setWhich] = useState<keyof typeof CALLS>("insurance");
  // `?skin=warm&call=booking` opens on that pair: for links, screenshots and the promo recorder.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const s = SKINS.find((x) => x.id === q.get("skin"));
    // oxlint-disable-next-line react/set-state-in-effect -- the URL is only readable in the browser
    if (s) setSkin(s.id);
    const c = q.get("call");
    if (c === "insurance" || c === "booking") setWhich(c);
  }, []);
  const current = SKINS.find((s) => s.id === skin)!;
  const c = CALLS[which];
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <fieldset aria-label="Skin" className="border-fd-border m-0 flex rounded-lg border p-0.5 text-sm">
          {SKINS.map((s) => (
            <button
              key={s.id}
              type="button"
              aria-pressed={s.id === skin}
              onClick={() => setSkin(s.id)}
              className="aria-pressed:bg-fd-accent aria-pressed:text-fd-foreground text-fd-muted-foreground rounded-md px-3 py-1.5"
            >
              {s.label}
            </button>
          ))}
        </fieldset>
        <fieldset aria-label="Call" className="border-fd-border m-0 flex rounded-lg border p-0.5 text-sm">
          {(["insurance", "booking"] as const).map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={k === which}
              onClick={() => setWhich(k)}
              className="aria-pressed:bg-fd-accent aria-pressed:text-fd-foreground text-fd-muted-foreground rounded-md px-3 py-1.5"
            >
              {k === "insurance" ? "English · insurance" : "Deutsch · Physio"}
            </button>
          ))}
        </fieldset>
      </div>
      <CallReview
        key={which}
        call={c.call}
        src={c.src}
        title={c.title}
        subtitle={c.subtitle}
        lang={c.lang}
        skin={skin}
        orb={current.orb}
      />
      <p className="text-fd-muted-foreground text-xs">
        Invented calls, spoken by macOS voices and timed word by word with whisper.cpp. The skins are CSS
        only; the markup doesn't change.
      </p>
    </div>
  );
}
