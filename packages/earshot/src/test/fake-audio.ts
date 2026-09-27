/* Just enough Web Audio to follow a recording's routing in tests (happy-dom has none): each node
 * records what it's connected to, and a gain's value is whatever it was last eased to. Every member
 * is typed, since the module is exported (isolatedDeclarations). */
export class FakeNode {
  out: { to: FakeNode; output: number; input: number }[] = [];
  readonly name: string;
  constructor(name: string) {
    this.name = name;
  }
  connect(to: FakeNode, output = 0, input = 0): void {
    this.out.push({ to, output, input });
  }
  disconnect(to?: FakeNode): void {
    this.out = to ? this.out.filter((c) => c.to !== to) : [];
  }
}

export class FakeGain extends FakeNode {
  gain: { value: number; setTargetAtTime(v: number): void };
  constructor(name: string) {
    super(name);
    const gain = { value: 0, setTargetAtTime: (v: number) => void (gain.value = v) };
    this.gain = gain;
  }
}

export class FakeContext {
  currentTime = 0;
  destination: FakeNode = new FakeNode("speakers");
  resumed = 0;
  gains: FakeGain[] = [];
  source?: FakeNode;
  createMediaElementSource(): FakeNode {
    this.source = new FakeNode("element");
    return this.source;
  }
  createChannelSplitter(): FakeNode {
    return new FakeNode("splitter");
  }
  createChannelMerger(): FakeNode {
    return new FakeNode("merger");
  }
  createGain(): FakeGain {
    const g = new FakeGain("gain");
    this.gains.push(g);
    return g;
  }
  async resume(): Promise<void> {
    this.resumed++;
  }
}

/** How loud each file channel is in each ear: [left→left, left→right, right→left, right→right]. */
export const matrix = (ctx: FakeContext): number[] => ctx.gains.map((g) => g.gain.value);
