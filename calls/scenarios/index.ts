/* Every demo call, with the findings its detectors must make. `node calls/debugger.ts` builds them
 * all, or the ones named. */
import type { ExpectedFinding, Scenario } from "../scenario.ts";
import { expected as paketExpected } from "./paket-rueckruf.expected.ts";
import { paket } from "./paket-rueckruf.ts";
import { expected as praxisExpected } from "./praxis-termin.expected.ts";
import { praxis } from "./praxis-termin.ts";
import { expected as solarExpected } from "./solar-beratung.expected.ts";
import { solar } from "./solar-beratung.ts";
import { expected as stadtwerkeElevenLabsExpected } from "./stadtwerke-zaehlerstand-elevenlabs.expected.ts";
import { expected as stadtwerkePipecatExpected } from "./stadtwerke-zaehlerstand-pipecat.expected.ts";
import { expected as stadtwerkeV43Expected } from "./stadtwerke-zaehlerstand-v43.expected.ts";
import { stadtwerkeV43 } from "./stadtwerke-zaehlerstand-v43.ts";
import { expected as stadtwerkeExpected } from "./stadtwerke-zaehlerstand.expected.ts";
import { stadtwerke } from "./stadtwerke-zaehlerstand.ts";
import { expected as tarifExpected } from "./tarif-wechsel.expected.ts";
import { tarif } from "./tarif-wechsel.ts";
import { expected as versicherungExpected } from "./versicherung-schaden.expected.ts";
import { versicherung } from "./versicherung-schaden.ts";

/** Which stack a call is recorded as: what it keeps of the same call differs, and so does what
 * the detectors can find in it. */
export type Stack = "livekit" | "pipecat" | "elevenlabs";

export interface DemoCall {
  scenario: Scenario;
  expected: readonly ExpectedFinding[];
  /** LiveKit when left out. */
  stack?: Stack;
  /** The call's id, when it isn't the scenario's (the same script on another stack). */
  id?: string;
  /** Agent lines a person disliked (ElevenLabs keeps it). */
  dislike?: readonly string[];
}

export const callId = (c: DemoCall): string => c.id ?? c.scenario.id;

export const CALLS: readonly DemoCall[] = [
  { scenario: stadtwerke, expected: stadtwerkeExpected },
  { scenario: solar, expected: solarExpected },
  { scenario: praxis, expected: praxisExpected },
  { scenario: versicherung, expected: versicherungExpected },
  { scenario: tarif, expected: tarifExpected },
  { scenario: paket, expected: paketExpected },
  { scenario: stadtwerkeV43, expected: stadtwerkeV43Expected },
  // The first call again, as Pipecat and as ElevenLabs Agents would have kept it.
  {
    scenario: stadtwerke,
    stack: "pipecat",
    id: "stadtwerke-zaehlerstand-pipecat",
    expected: stadtwerkePipecatExpected,
  },
  {
    scenario: stadtwerke,
    stack: "elevenlabs",
    id: "stadtwerke-zaehlerstand-elevenlabs",
    expected: stadtwerkeElevenLabsExpected,
    dislike: ["not-found"],
  },
];
