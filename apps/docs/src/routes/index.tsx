import { type Conversation, formatTime } from "@danolekh/earshot/core";
import { createFileRoute, Link } from "@tanstack/react-router";
import { HomeLayout } from "fumadocs-ui/layouts/home";

import insurance from "@/calls/alder-mutual-address.json";
import { Playground } from "@/components/playground/playground";
import { baseOptions } from "@/lib/layout.shared";

import { CallReview } from "../../registry/earshot/call-review";

export const Route = createFileRoute("/")({
  component: Home,
});

function Home() {
  return (
    <HomeLayout {...baseOptions()}>
      <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-20 px-5 py-12 md:gap-28 md:py-20">
        <section className="grid gap-6">
          <h1 className="max-w-3xl text-4xl leading-[1.04] font-semibold tracking-[-0.035em] text-balance md:text-6xl">
            Voice-agent UI, <span className="text-fd-primary">in parts.</span>
          </h1>
          <p className="text-fd-muted-foreground max-w-xl text-base text-pretty md:text-lg">
            Headless React parts for the screens around a voice agent: an orb that shows what it's doing, a
            transcript that follows the voice, and a timeline for reviewing the call.
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              to="/docs/$/"
              params={{ _splat: "" }}
              className="bg-fd-primary text-fd-primary-foreground rounded-full px-5 py-2 text-sm font-semibold"
            >
              Read the docs
            </Link>
            <code className="border-fd-border text-fd-muted-foreground rounded-full border px-4 py-2 font-mono text-xs">
              pnpm add @danolekh/earshot @base-ui/react
            </code>
          </div>
        </section>

        <section aria-labelledby="talk" className="grid gap-8">
          <SectionHead id="talk" eyebrow="Live" title="Talk to it">
            Your voice moves it while it listens. Then it thinks, and answers.
          </SectionHead>
          <Playground />
        </section>

        <section aria-labelledby="review" className="grid gap-8">
          <SectionHead id="review" eyebrow="Review" title="Then look back at the call">
            Every word in step with the recording, who spoke when, the tool calls, the waits, the moment the
            caller cut in.
          </SectionHead>
          <CallReview
            call={insurance as unknown as Conversation}
            src="/calls/alder-mutual-address.mp3"
            title="Address change, home policy"
            subtitle={`Alder Mutual · ${formatTime(insurance.duration)} · 4 tool calls`}
            skin="console"
            judges={false}
          />
          <p className="text-fd-muted-foreground text-xs">
            An invented call, spoken by Chatterbox (MIT) and timed word by word by a forced aligner.
          </p>
        </section>

        <section aria-labelledby="debug" className="grid gap-8">
          <SectionHead id="debug" eyebrow="Debug" title="Then find out why it went wrong">
            The same parts, on a call's trace: what the agent heard against what was said, the turn detector's
            decisions, where each reply's wait went, from LiveKit, Pipecat or ElevenLabs.
          </SectionHead>
          <div className="flex flex-wrap items-center gap-3">
            <a
              href="https://debugger.danolekh.com"
              className="bg-fd-primary text-fd-primary-foreground rounded-full px-5 py-2 text-sm font-semibold"
            >
              Open the call debugger
            </a>
            <Link
              to="/docs/$/"
              params={{ _splat: "inspector" }}
              className="border-fd-border rounded-full border px-5 py-2 text-sm font-medium"
            >
              The inspector parts
            </Link>
          </div>
        </section>
      </main>
    </HomeLayout>
  );
}

function SectionHead({
  id,
  eyebrow,
  title,
  children,
}: {
  id: string;
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-2">
      <p className="text-fd-primary font-mono text-xs tracking-[0.08em] uppercase">{eyebrow}</p>
      <h2 id={id} className="text-2xl font-semibold tracking-[-0.025em] md:text-3xl">
        {title}
      </h2>
      <p className="text-fd-muted-foreground max-w-xl text-pretty">{children}</p>
    </div>
  );
}
