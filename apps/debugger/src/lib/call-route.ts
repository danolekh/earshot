/* Where a call opens: a demo call at its own prerendered page, an imported one (kept in this
 * browser) at the one page that reads it by id. */
import type { Moment } from "@danolekh/earshot/review";

import { isImported } from "./imports";

export type CallRoute =
  | { to: "/call/$id/"; params: { id: string }; search: Moment }
  | { to: "/imported/"; search: Moment & { id: string } };

export const callRoute = (id: string, search: Moment = {}): CallRoute =>
  isImported(id)
    ? { to: "/imported/", search: { ...search, id } }
    : { to: "/call/$id/", params: { id }, search };
