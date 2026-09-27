/* The take: the call debugger's features, one after another, on the Stadtwerke call. `open` runs
 * before filming (pages loaded in real time); `film` is filmed. */
import { finding, pick } from "./debugger.ts";
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

/** A point over the caller's lane at time `t`, where the wheel zooms and pans. */
async function overLanes(film: Film, t: number): Promise<[number, number]> {
  const lane = await film.page.locator(".lane[data-lane=caller]").boundingBox();
  return [await film.xAt(t), lane!.y + lane!.height / 2];
}

/** A 16:9 box around the caller's words as said and as heard, centred on the word said but not
 * heard: what the camera punches in on. */
async function heardAndSaid(film: Film) {
  return film.page.evaluate(() => {
    const top = document.querySelector(".lane[data-lane=caller]")!.getBoundingClientRect();
    const bottom = document.querySelector(".lane[data-lane=turns]")!.getBoundingClientRect();
    // The word said but not heard that's in view (others sit off-screen while zoomed).
    const lane = document.querySelector(".lane[data-lane=said]")!.getBoundingClientRect();
    const w = [...document.querySelectorAll(".lane[data-lane=said] [data-slot=timeline-word][data-mismatch]")]
      .map((el) => el.getBoundingClientRect())
      .find((r) => r.left >= lane.left && r.right <= lane.right);
    if (!w) throw new Error("no word said but not heard in view");
    const h = Math.max(bottom.bottom - top.top + 40, 420);
    const width = (h * 16) / 9;
    return { x: w.left + w.width / 2 - width / 2, y: top.top - 20, w: width, h };
  });
}

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
    await film.moveTo(`tbody tr[data-call="${MAIN}"]`, 900, [0.45, 0.5]);
    await film.hold(700);
    await film.moveTo(`tbody tr[data-call="${MAIN}"]`, 400, [0.2, 0.5]);
    await film.click();
    await film.until("html[data-stage-ready]");
    await film.caption(null);
    await film.hold(400);

    // 2. Every track, while the call plays: both sides, the words, turn-taking, the pipeline.
    await film.caption("Every track on one clock");
    await film.playFrom(10);
    for (const lane of ["caller", "heard", "said", "turns", "agent", "agent-words", "spans"])
      await film.moveTo(`.gutter [data-lane="${lane}"]`, 480, [0.6, 0.5]);
    await film.pause();
    await film.hold(300);

    // 3. Zoom in, the way a person does, until the words can be read.
    await film.caption("Zoom in to the word");
    await film.wheelZoom(await overLanes(film, 16.4), 4.2 / 56.9, 1400);
    await film.hold(600);

    // 4. The turn that ended mid-number (the call opened at it), with its sound.
    const early = finding(MAIN, "early_endpoint");
    await film.caption("The turn ended mid-number");
    await film.play(early.start - 1.2, early.start + 2.2);
    await film.hold(1200);

    // 5. Along to the misheard number, then in close: "null" said, and a gap where it was heard.
    await film.caption("What was said, and what the agent heard");
    const v = await film.view();
    await film.move(await overLanes(film, (v.from + v.to) / 2), 400);
    await film.wheelPan(22.4, 1100);
    await film.hold(300);
    await film.camera(await heardAndSaid(film), 800);
    await film.play(22.8, 25.4);
    await film.hold(700);
    await film.camera(null, 700);

    // 6. The lookup that failed because of it: a span of the pipeline, picked.
    await film.caption("Every span, with what went in and out");
    await film.moveTo("[data-slot=timeline-span][data-status=error]", 700);
    await film.click();
    await film.hold(2400);

    // 7. The whole call again, and where the slow reply's 3.1 s went.
    await focus(film);
    await film.press("0");
    await film.hold(500);
    await pick(film, MAIN, "slow_turn");
    await film.caption("Where the 3.1 s went");
    await film.hold(1600);
    await film.press("z", "Z");
    await film.hold(1600);

    // 8. One side alone: the caller asking if anyone is there, without the agent's reply.
    await film.caption("Listen to one side");
    await film.moveTo('button[aria-label="Solo the caller"]', 700);
    await film.click();
    await film.play(46.3, 48.8);
    await film.click();
    await film.hold(300);
    await film.move([760, 560], 500);

    // 9. Only the tracks you need: the word lanes away and back. (Not the View menu: its exit
    // animation doesn't finish under the recorder's clock, so it would stay on screen.)
    await film.caption("Only the tracks you need");
    await focus(film);
    await film.press("0");
    await film.hold(400);
    await film.press("4");
    await film.hold(1300);
    await film.press("4");
    await film.hold(700);

    // 10. A bad moment becomes a test: failing here, passing on the fixed agent.
    await film.caption("Turn it into a test");
    await film.moveTo('#inspector button:has-text("Save as test case")', 700);
    await film.click();
    await film.until('[role=dialog]:has-text("Save as test case")');
    await film.hold(1400);
    await film.moveTo('[role=dialog] button:text-is("Save")', 600);
    await film.click();
    await film.until('button:has-text("View tests")');
    await film.hold(400);
    await film.moveTo('button:has-text("View tests")', 600);
    await film.click();
    await film.until(`[data-call="${MAIN}-v43"]`);
    await film.caption("Fails on v42, passes on v43");
    await film.hold(2400);

    // 11. The same call from other stacks.
    await film.moveTo('a:has-text("Calls")', 700);
    await film.click();
    await film.until(`tbody tr[data-call="${MAIN}-pipecat"]`);
    await film.caption("From LiveKit, Pipecat or ElevenLabs");
    await film.moveTo(`tbody tr[data-call="${MAIN}-pipecat"]`, 700, [0.25, 0.5]);
    await film.click();
    await film.until("html[data-stage-ready]");
    await film.hold(1400);
    await film.moveTo('a[aria-label="Next call"]', 600);
    await film.click();
    await film.until('button[aria-label^="Recorded on ElevenLabs"]');
    await film.hold(1500);

    // 12. Every key, then the card.
    await focus(film);
    await film.caption("Everything from the keyboard");
    await film.press("?", "?");
    await film.hold(1700);
    await film.press("Escape", "Esc");
    await film.away();
    await film.card({
      title: "earshot",
      subtitle: "A call debugger for voice agents, and the headless React parts it's built from.",
      lines: ["debugger.danolekh.com", "github.com/danolekh/earshot"],
    });
    await film.hold(3600);
  },
};

export const takes: Record<string, Take> = { debugger: debuggerTake };
