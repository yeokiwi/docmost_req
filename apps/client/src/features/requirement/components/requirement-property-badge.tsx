import { Badge } from "@mantine/core";
import { propertyColor } from "../utils/requirement-style";

export default function RequirementPropertyBadge({
  value,
}: {
  value: string | undefined;
}) {
  if (!value) return null;
  return (
    <Badge variant="light" size="sm" radius="sm" color={propertyColor(value)}>
      {value}
    </Badge>
  );
}
