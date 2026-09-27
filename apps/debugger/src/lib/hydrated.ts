/* Whether the page has hydrated. The pages are prerendered without their query string, so what the
 * URL asks for (a filter, a moment) is shown only once the first render has matched the HTML. */
import { useSyncExternalStore } from "react";

const never = () => () => {};

export function useHydrated(): boolean {
  return useSyncExternalStore(
    never,
    () => true,
    () => false,
  );
}
