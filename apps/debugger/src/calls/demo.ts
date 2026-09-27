/* The demo call as a module, for tests. The app loads traces with `loadTrace` (lib/calls.ts). */
import type { CallTrace } from "@danolekh/earshot/trace";

import stadtwerke from "./stadtwerke-zaehlerstand.trace.json";

export const demo: CallTrace = stadtwerke as unknown as CallTrace;
