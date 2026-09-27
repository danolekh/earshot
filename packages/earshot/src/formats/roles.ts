import type { Role } from "../core/types";

/** Which role a recogniser's speaker label or channel is. By default the first speaker heard is
 * the agent (it answers the phone) and everyone else the user. */
export type RoleMap = Readonly<Record<string, Role>> | ((speaker: string) => Role);

export function roleResolver(map: RoleMap | undefined): (speaker: string | number | undefined) => Role {
  let first: string | undefined;
  return (speaker) => {
    const key = String(speaker ?? "");
    if (typeof map === "function") return map(key);
    if (map?.[key]) return map[key];
    first ??= key;
    return key === first ? "agent" : "user";
  };
}
