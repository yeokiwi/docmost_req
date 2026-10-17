import { Badge, BadgeProps } from "@mantine/core";

// UI-GEN-006: keys render as a monospace lozenge everywhere; deleted/missing keys are struck through in red.
export default function RequirementKey({
  value,
  missing,
  conflict,
  onClick,
  ...rest
}: {
  value: string;
  missing?: boolean;
  conflict?: boolean;
  onClick?: () => void;
} & Omit<BadgeProps, "color" | "variant">) {
  return (
    <Badge
      variant="light"
      radius="sm"
      ff="monospace"
      tt="none"
      color={missing || conflict ? "red" : "blue"}
      td={missing ? "line-through" : undefined}
      style={{ cursor: onClick ? "pointer" : undefined }}
      onClick={onClick}
      {...rest}
    >
      {value}
    </Badge>
  );
}

export type StatusKind = "covered" | "uncovered" | "duplicate";

const STATUS: Record<StatusKind, { color: string; label: string }> = {
  covered: { color: "green", label: "Covered" },
  uncovered: { color: "red", label: "Not covered" },
  duplicate: { color: "orange", label: "Duplicate" },
};

// Status is conveyed by text as well as colour (UI-GEN-005).
export function StatusLozenge({
  kind,
  label,
}: {
  kind: StatusKind;
  label: string;
}) {
  return (
    <Badge variant="light" size="sm" radius="sm" color={STATUS[kind].color}>
      {label}
    </Badge>
  );
}
