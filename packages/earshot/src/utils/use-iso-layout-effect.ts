"use client";
import { useEffect, useLayoutEffect } from "react";

/** `useLayoutEffect` in the browser, where it runs before paint; `useEffect` on the server, where
 * neither runs and the layout one would warn. */
export const useIsoLayoutEffect: typeof useLayoutEffect =
  typeof window === "undefined" ? useEffect : useLayoutEffect;
