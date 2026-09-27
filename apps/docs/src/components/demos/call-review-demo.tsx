import type { Conversation } from "@danolekh/earshot/core";

import insurance from "@/calls/alder-mutual-address.json";

import { CallReview } from "../../../registry/earshot/call-review";

export function CallReviewDemo() {
  return (
    <div className="w-full">
      <CallReview
        call={insurance as unknown as Conversation}
        src="/calls/alder-mutual-address.mp3"
        title="Address change, home policy"
        subtitle="Alder Mutual · simulated caller"
        skin="console"
      />
    </div>
  );
}
