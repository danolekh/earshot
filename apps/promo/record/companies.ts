/* The company cuts: each one a call from the stack the company runs (or reads), opened at the
 * finding that matters most to them, a second finding, and a closing card with the link to that
 * moment. The words that go with each are in ~/growth/outreach/2026-09-27-<slug>/. PolyAI, Coval
 * and Cekura were dropped on 2026-09-27: no role open to someone in Europe. */
export interface Company {
  slug: string;
  company: string;
  /** "For the <team> at <company>". */
  team: string;
  call: string;
  lead: string;
  then: string;
}

export const COMPANIES: readonly Company[] = [
  {
    slug: "telli",
    company: "telli",
    team: "engineering team",
    call: "stadtwerke-zaehlerstand",
    lead: "early_endpoint",
    then: "slow_turn",
  },
  {
    slug: "elevenlabs",
    company: "ElevenLabs",
    team: "Agents team",
    call: "stadtwerke-zaehlerstand-elevenlabs",
    lead: "slow_turn",
    then: "heard_vs_said",
  },
  {
    slug: "livekit",
    company: "LiveKit",
    team: "Agents team",
    call: "praxis-termin",
    lead: "false_interruption",
    then: "agent_did_not_stop",
  },
  {
    slug: "cognigy",
    company: "Cognigy",
    team: "AI Innovation team",
    call: "stadtwerke-zaehlerstand",
    lead: "heard_vs_said",
    then: "tool_error",
  },
  {
    slug: "parloa",
    company: "Parloa",
    team: "frontend platform team",
    call: "stadtwerke-zaehlerstand",
    lead: "heard_vs_said",
    then: "slow_turn",
  },
  {
    slug: "fonio",
    company: "fonio",
    team: "team",
    call: "stadtwerke-zaehlerstand",
    lead: "dead_air",
    then: "heard_vs_said",
  },
  {
    slug: "synthflow",
    company: "Synthflow",
    team: "engineering team",
    call: "tarif-wechsel",
    lead: "dead_air",
    then: "slow_turn",
  },
  {
    slug: "pipecat",
    company: "Daily",
    team: "Pipecat team",
    call: "stadtwerke-zaehlerstand-pipecat",
    lead: "early_endpoint",
    then: "slow_turn",
  },
  {
    slug: "roark",
    company: "Roark",
    team: "team",
    call: "stadtwerke-zaehlerstand",
    lead: "early_endpoint",
    then: "heard_vs_said",
  },
  {
    slug: "hamming",
    company: "Hamming",
    team: "team",
    call: "stadtwerke-zaehlerstand",
    lead: "tool_error",
    then: "slow_turn",
  },
];
