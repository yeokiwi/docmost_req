import { atom, PrimitiveAtom, useAtomValue } from "jotai";
import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api-client";

export interface IEntitlements {
  cloud: boolean;
  tier: string;
  features: string[];
}

export const entitlementAtom: PrimitiveAtom<IEntitlements | null> = atom(
  null as IEntitlements | null,
);

async function getEntitlements(): Promise<IEntitlements> {
  const req = await api.post<IEntitlements>("/workspace/entitlements");
  return req.data;
}

export function useEntitlementsQuery(enabled = true) {
  return useQuery({
    queryKey: ["workspace-entitlements"],
    queryFn: getEntitlements,
    enabled,
    staleTime: 5 * 60 * 1000,
  });
}

/** Whether the server reports the feature as available in this build. */
export function useHasFeature(feature: string): boolean {
  const entitlements = useAtomValue(entitlementAtom);
  return !!feature && !!entitlements?.features.includes(feature);
}

/**
 * Text for controls of a feature this build doesn't include. Such controls
 * are normally hidden; this covers the few that stay visible but disabled.
 */
export function useUnavailableLabel(): string {
  return "Not available in this edition";
}
