/**
 * Parses "Priority=High, Status=Approved" into a property map.
 */
export function textToProperties(text: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const part of (text ?? "").split(",")) {
    const index = part.indexOf("=");
    if (index <= 0) continue;
    const name = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (name && value) out[name] = value;
  }
  return out;
}

export function propertiesToText(
  properties: Record<string, string> | undefined,
): string {
  return Object.entries(properties ?? {})
    .map(([name, value]) => `${name}=${value}`)
    .join(", ");
}
