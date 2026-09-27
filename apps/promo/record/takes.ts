/* The takes: the main film of the call debugger, and a short cut for each company pitched
 * (companies.ts). `open` runs before filming (pages loaded in real time); `film` is filmed. */
import { COMPANIES, type Company } from "./companies.ts";
import { BEATS, beat, deepLink, finding, stackOf } from "./debugger.ts";
import type { Film } from "./film.ts";

export interface Take {
  /** Themes it can be filmed in; the first is the default. */
  themes: readonly ("dark" | "light")[];
  open: (film: Film) => Promise<void>;
  film: (film: Film) => Promise<void>;
}

const MAIN = "stadtwerke-zaehlerstand";

/** Keys reach the debugger only with focus inside it. */
const focus = (film: Film) => film.page.focus("main");

const debuggerTake: Take = {
  themes: ["dark", "light"],
  async open(film) {
    await film.warm([`/call/${MAIN}/`, `/call/${MAIN}-pipecat/`, `/call/${MAIN}-elevenlabs/`, "/tests/"]);
    await film.goto("/");
  },
  async film(film) {
    // 1. The list, worst first.
    await film.hold(400);
    await film.caption("Find the bad call");
    await film.hold(1300);
    await film.moveTo(`tbody tr[data-call="${MAIN}"]`, 900, [0.25, 0.5]);
    await film.hold(250);
    await film.click();
    await film.until("html[data-stage-ready]");
    await film.caption(null);
    await film.hold(500);

    // 2. One call on one clock.
    await film.caption("One call, one clock");
    await film.hold(2200);

    // 3-5. The turn cut short (the call opens at it), then `]` to the next finding (what it heard,
    // against what was said), the failed lookup and the wait, picked from the list.
    const early = finding(MAIN, "early_endpoint");
    await film.caption("The turn ended mid-number");
    await film.hold(600);
    await film.play(early.start - 2.2, early.start + 2.0);
    await film.hold(1200);
    await focus(film);
    await film.press("]");
    const heard = finding(MAIN, "heard_vs_said");
    await film.caption(BEATS.heard_vs_said!.caption);
    await film.hold(700);
    await film.play(heard.start - 0.2, heard.start + 2.6);
    await film.hold(1600);
    await beat(film, MAIN, "tool_error");
    await beat(film, MAIN, "slow_turn", "Where the 3.1 s went");

    // 6. A bad moment becomes a test: failing here, passing on the fixed agent.
    await film.caption("Turn it into a test");
    await film.moveTo('#inspector button:has-text("Save as test case")', 700);
    await film.click();
    await film.until('[role=dialog]:has-text("Save as test case")');
    await film.hold(1600);
    await film.moveTo('[role=dialog] button:text-is("Save")', 650);
    await film.click();
    await film.until('button:has-text("View tests")');
    await film.hold(500);
    await film.moveTo('button:has-text("View tests")', 600);
    await film.click();
    await film.until(`[data-call="${MAIN}-v43"]`);
    await film.caption("Fails on v42, passes on v43");
    await film.hold(2600);

    // 7. The same call from other stacks.
    await film.moveTo('a:has-text("Calls")', 700);
    await film.click();
    await film.until(`tbody tr[data-call="${MAIN}-pipecat"]`);
    await film.caption("From LiveKit, Pipecat or ElevenLabs");
    await film.moveTo(`tbody tr[data-call="${MAIN}-pipecat"]`, 700, [0.25, 0.5]);
    await film.click();
    await film.until("html[data-stage-ready]");
    await film.hold(1500);
    await film.moveTo('a[aria-label="Next call"]', 600);
    await film.click();
    await film.until('button[aria-label^="Recorded on ElevenLabs"]');
    await film.hold(1600);

    // 8. The card.
    await film.away();
    await film.card({
      title: "earshot",
      subtitle: "A call debugger for voice agents, and the headless React parts it's built from.",
      lines: ["debugger.danolekh.com", "github.com/danolekh/earshot"],
    });
    await film.hold(3600);
  },
};

function companyTake(c: Company): Take {
  // Fails here, not half-way through a render, if a call lacks the finding its cut is built on.
  finding(c.call, c.lead);
  finding(c.call, c.then);
  return {
    themes: ["dark"],
    async open(film) {
      await film.goto(`/call/${c.call}/`);
    },
    async film(film) {
      await film.hold(300);
      await film.caption(`For the ${c.team} at ${c.company}`);
      await film.hold(2000);
      await film.caption(`A ${stackOf(c.call)} call, in German`);
      await film.hold(1600);
      await focus(film);
      await beat(film, c.call, c.lead);
      await beat(film, c.call, c.then);
      await film.away();
      await film.card({
        eyebrow: `For the ${c.team} at ${c.company}`,
        title: "earshot",
        subtitle: "A call debugger for voice agents. Open source.",
        lines: ["debugger.danolekh.com", `danolekh.com/b/${c.slug}`],
      });
      await film.hold(3200);
    },
  };
}

export const takes: Record<string, Take> = {
  debugger: debuggerTake,
  ...Object.fromEntries(COMPANIES.map((c) => [`for-${c.slug}`, companyTake(c)])),
};

/** Where each company's cut opens, for its pitch page and message. */
export const links = Object.fromEntries(
  COMPANIES.map((c) => [c.slug, deepLink(c.call, finding(c.call, c.lead))]),
);
