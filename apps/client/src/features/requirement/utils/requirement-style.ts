const KNOWN_COLORS: Record<string, string> = {
  critical: "red",
  blocker: "red",
  high: "orange",
  medium: "yellow",
  low: "teal",
  draft: "gray",
  proposed: "gray",
  new: "gray",
  todo: "gray",
  "in review": "blue",
  review: "blue",
  "in progress": "blue",
  approved: "green",
  accepted: "green",
  done: "green",
  verified: "green",
  implemented: "green",
  rejected: "red",
  obsolete: "dark",
  deprecated: "dark",
};

const PALETTE = ["blue", "violet", "grape", "cyan", "indigo", "pink", "lime"];

/**
 * Stable Mantine color for a property value, so the same value looks the same
 * in the list, the drawer and the dashboard.
 */
export function propertyColor(value: string | undefined): string {
  const v = (value ?? "").trim().toLowerCase();
  if (!v) return "gray";
  if (KNOWN_COLORS[v]) return KNOWN_COLORS[v];
  let hash = 0;
  for (let i = 0; i < v.length; i++) hash = (hash * 31 + v.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(hash) % PALETTE.length];
}
