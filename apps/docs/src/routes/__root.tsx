import { createRootRoute, HeadContent, Outlet, Scripts } from "@tanstack/react-router";
import type { SharedProps } from "fumadocs-ui/components/dialog/search";
import { RootProvider } from "fumadocs-ui/provider/tanstack";
import * as React from "react";

// The search dialog (and its index client) loads when someone opens search, not with the page.
const LazySearch = React.lazy(() => import("@/components/search"));
function SearchDialog(props: SharedProps) {
  return (
    <React.Suspense fallback={null}>
      <LazySearch {...props} />
    </React.Suspense>
  );
}

import appCss from "@/styles/app.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf-8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      { title: "earshot: headless voice-agent UI for React" },
      {
        name: "description",
        content:
          "Headless React parts for voice agents: a WebGL orb, visualizers, a word-by-word transcript and a call-review timeline with tool calls, latency and judges.",
      },
      // The link preview (public/og.png, 1200×630).
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "earshot" },
      { property: "og:title", content: "earshot: headless voice-agent UI for React" },
      {
        property: "og:description",
        content:
          "A live orb, a transcript that follows the voice, and a call-review timeline. One call, many skins.",
      },
      { property: "og:url", content: "https://earshot.danolekh.com" },
      { property: "og:image", content: "https://earshot.danolekh.com/og.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://earshot.danolekh.com/og.png" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.svg", type: "image/svg+xml" },
    ],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="flex min-h-screen flex-col">
        <RootProvider search={{ SearchDialog }} theme={{ defaultTheme: "dark" }}>
          <Outlet />
        </RootProvider>
        <Scripts />
      </body>
    </html>
  );
}
