import type { BaseLayoutProps } from "fumadocs-ui/layouts/shared";

import { appName, gitConfig } from "./shared";

export function baseOptions(): BaseLayoutProps {
  return {
    nav: {
      title: <span className="font-display text-xl leading-none">{appName}</span>,
    },
    links: [
      { text: "Docs", url: "/docs" },
      { text: "Debugger", url: "https://debugger.danolekh.com", external: true },
    ],
    githubUrl: `https://github.com/${gitConfig.user}/${gitConfig.repo}`,
  };
}
