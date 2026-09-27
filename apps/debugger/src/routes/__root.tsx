import { createRootRoute, HeadContent, Outlet, Scripts, ScriptOnce } from "@tanstack/react-router";

import { Toaster } from "@/components/ui/sonner";
import { FIRST_PAINT_SCRIPT } from "@/lib/first-paint";

// Imported, not linked by `?url`: the client build names the file, and Start links that one.
import "@/styles/app.css";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { name: "color-scheme", content: "dark light" },
      { title: "Call debugger · earshot" },
      {
        name: "description",
        content:
          "One voice-agent call on one clock: both sides' audio, what the agent heard against what was said, the turn detector's decisions, the pipeline's spans, and what went wrong.",
      },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "earshot" },
      { property: "og:title", content: "Call debugger · earshot" },
      {
        property: "og:description",
        content:
          "Why did this voice-agent call go wrong? Both sides' audio, what the agent heard, the turn detector and the pipeline, on one clock. Open source.",
      },
      { property: "og:url", content: "https://debugger.danolekh.com" },
      { property: "og:image", content: "https://debugger.danolekh.com/og.png" },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://debugger.danolekh.com/og.png" },
    ],
    links: [{ rel: "icon", href: "/favicon.svg", type: "image/svg+xml" }],
  }),
  component: RootComponent,
});

function RootComponent() {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <head>
        <ScriptOnce>{FIRST_PAINT_SCRIPT}</ScriptOnce>
        <HeadContent />
      </head>
      <body>
        <Outlet />
        {/* Here, not in a page: "Saved to Tests" outlives the call it was saved from. */}
        <Toaster position="bottom-left" />
        <Scripts />
      </body>
    </html>
  );
}
