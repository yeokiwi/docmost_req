/**
 * Permalink to a requirement: opens the space's requirements page with the
 * requirement's detail panel shown.
 */
export function buildRequirementPath(spaceSlug: string, key: string): string {
  return `/s/${spaceSlug}/requirements?tab=list&req=${encodeURIComponent(key)}`;
}

export function buildRequirementUrl(spaceSlug: string, key: string): string {
  return `${window.location.origin}${buildRequirementPath(spaceSlug, key)}`;
}
