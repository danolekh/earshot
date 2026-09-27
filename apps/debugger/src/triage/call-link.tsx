import type { Moment } from "@danolekh/earshot/review";
/* A link to a call, wherever it opens: a demo call's own page, or the imported-call page by id. */
import { Link, useNavigate } from "@tanstack/react-router";
import type * as React from "react";
import { useCallback } from "react";

import { callRoute } from "@/lib/call-route";

type AnchorProps = Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, "href"> & {
  ref?: React.Ref<HTMLAnchorElement>;
} & { [data: `data-${string}`]: unknown };

export function CallLink({ id, search, ...rest }: { id: string; search?: Moment } & AnchorProps) {
  const route = callRoute(id, search);
  return route.to === "/imported/" ? (
    <Link to="/imported/" search={route.search} {...rest} />
  ) : (
    <Link to="/call/$id/" params={route.params} search={route.search} {...rest} />
  );
}

/** Opens a call, wherever it opens. */
export function useOpenCall(): (id: string, search?: Moment) => void {
  const navigate = useNavigate();
  return useCallback(
    (id, search) => {
      const route = callRoute(id, search);
      void (route.to === "/imported/"
        ? navigate({ to: "/imported/", search: route.search })
        : navigate({ to: "/call/$id/", params: route.params, search: route.search }));
    },
    [navigate],
  );
}
