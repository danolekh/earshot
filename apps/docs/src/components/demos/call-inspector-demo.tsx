import type { CallTrace } from "@danolekh/earshot/trace";

import stadtwerke from "@/calls/stadtwerke-zaehlerstand.trace.json";

import { CallInspector } from "../../../registry/earshot/call-inspector";

export function CallInspectorDemo() {
  return (
    <div className="w-full">
      <CallInspector
        trace={stadtwerke as unknown as CallTrace}
        src="/calls/stadtwerke-zaehlerstand.mp3"
        title="Meter reading, Stadtwerke Muster"
        skin="console"
      />
    </div>
  );
}
