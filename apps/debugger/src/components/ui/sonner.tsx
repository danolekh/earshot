/* shadcn's sonner Toaster, without next-themes: the theme comes from the app's own store. */
import type * as React from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

import { theme as storedTheme } from "@/lib/stored";

function Toaster(props: ToasterProps) {
  const [theme] = storedTheme.use();
  return (
    <Sonner
      theme={theme}
      className="toaster group"
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--border)",
          "--border-radius": "var(--radius)",
        } as React.CSSProperties
      }
      {...props}
    />
  );
}

export { Toaster };
