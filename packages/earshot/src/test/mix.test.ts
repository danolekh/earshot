import { describe, expect, it } from "vitest";

import { mixChannels } from "../audio/mix";
import { FakeContext, matrix } from "./fake-audio";

function setup() {
  const context = new FakeContext();
  const element = new EventTarget() as HTMLMediaElement;
  const mix = mixChannels(element, { context: context as unknown as AudioContext });
  return { context, element, mix };
}

describe("mixChannels", () => {
  it("plays the recording as it is while both sides are on", () => {
    const { context, mix } = setup();
    expect(matrix(context)).toEqual([1, 0, 0, 1]);
    mix.set([1, 1]);
    expect(matrix(context)).toEqual([1, 0, 0, 1]);
    expect(context.resumed).toBe(1);
  });

  it("plays a side on its own in both ears", () => {
    const { context, mix } = setup();
    mix.set([1, 0]);
    expect(matrix(context)).toEqual([1, 1, 0, 0]);
    mix.set([0, 1]);
    expect(matrix(context)).toEqual([0, 0, 1, 1]);
    mix.set([0, 0]);
    expect(matrix(context)).toEqual([0, 0, 0, 0]);
  });

  it("sits between the element and the speakers, and goes back to the plain route when disposed", () => {
    const { context, mix } = setup();
    expect(context.source!.out.map((c) => c.to.name)).toEqual(["splitter"]);
    mix.dispose();
    expect(context.source!.out.map((c) => c.to)).toEqual([context.destination]);
  });
});
