import { createRouter as createTanStackRouter } from "@tanstack/react-router";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    // Pages are prerendered as `<path>/index.html`, which the host serves at `<path>/`.
    trailingSlash: "always",
    defaultPreload: "intent",
    scrollRestoration: true,
  });
}
