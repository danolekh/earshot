import { useEffect, useRef } from "react";

/** The call debugger's film (apps/promo), in the page's theme: a cut for each, one shown by CSS. A
 * theme switch while it plays pauses the cut that's hidden, so its sound doesn't carry on. Nothing
 * loads before play but the poster. */
export function Film() {
  const dark = useRef<HTMLVideoElement>(null);
  const light = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    const observer = new MutationObserver(() => {
      for (const video of [dark.current, light.current])
        if (video && !video.paused && video.offsetParent === null) video.pause();
    });
    observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const cut = (theme: "dark" | "light") => ({
    src: `/videos/debugger-${theme}-1600.mp4`,
    poster: `/videos/debugger-${theme}-poster.webp`,
    controls: true,
    playsInline: true,
    preload: "none",
    width: 1600,
    height: 900,
    "aria-label": "The call debugger, filmed on a synthetic call",
  });
  const frame = "border-fd-border aspect-video w-full rounded-xl border bg-black";
  return (
    <>
      {/* The captions are in the picture, and the call's words are on screen in its transcript. */}
      {/* oxlint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={light} {...cut("light")} className={`${frame} dark:hidden`} />
      {/* oxlint-disable-next-line jsx-a11y/media-has-caption */}
      <video ref={dark} {...cut("dark")} className={`${frame} hidden dark:block`} />
    </>
  );
}
