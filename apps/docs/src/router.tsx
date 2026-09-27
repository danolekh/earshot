import { createRouter as createTanStackRouter, type ErrorComponentProps } from "@tanstack/react-router";

import { NotFound } from "@/components/not-found";

import { routeTree } from "./routeTree.gen";

export function getRouter() {
  return createTanStackRouter({
    routeTree,
    // Every page is a prerendered `<path>/index.html`, which the host serves at `<path>/`. Links
    // and the address bar use the same form, so a reload never lands on a different URL.
    trailingSlash: "always",
    defaultPreload: "intent",
    scrollRestoration: true,
    defaultNotFoundComponent: NotFound,
    defaultErrorComponent: RouteError,
  });
}

const STALE =
  /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch/i;

/** A tab opened before a deploy asks for code the deploy replaced; one reload fetches the new
 * build. Anything else, or a second failure, shows the error. */
function RouteError({ error }: ErrorComponentProps) {
  const message = error instanceof Error ? error.message : String(error);
  if (typeof window !== "undefined" && STALE.test(message)) {
    const key = `reloaded:${location.pathname}`;
    if (!sessionStorage.getItem(key)) {
      sessionStorage.setItem(key, "1");
      location.reload();
      return null;
    }
  }
  return (
    <div className="mx-auto flex max-w-md flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
      <h1 className="font-display text-3xl">This page didn't load</h1>
      <p className="text-fd-muted-foreground text-sm">{message}</p>
      <a
        href={typeof window !== "undefined" ? location.href : "/"}
        className="text-fd-primary text-sm underline"
      >
        Try again
      </a>
    </div>
  );
}
