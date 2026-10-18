import { useEffect, useRef, useState } from "react";
import {
  Badge,
  Group,
  Loader,
  ScrollArea,
  Stack,
  Text,
  TextInput,
  UnstyledButton,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import clsx from "clsx";
import { useTranslation } from "react-i18next";
import classes from "@/features/editor/components/requirement/requirement.module.css";
import {
  IKeySearchItem,
  listRequirements,
  searchRequirementKeys,
} from "../services/requirement-service";
import { IRequirement, IRequirementType } from "../types/requirement.types";

export type InsertChoice =
  | { kind: "next" }
  | { kind: "type"; type: IRequirementType }
  | { kind: "define"; key: string }
  | { kind: "link"; key: string; spaceId?: string };

/** The type whose prefix `key` uses (longest prefix wins). */
export function matchRequirementType(
  key: string,
  types: IRequirementType[],
): IRequirementType | null {
  const upper = key.toUpperCase();
  let best: IRequirementType | null = null;
  for (const type of types) {
    if (!upper.startsWith(type.keyPrefix)) continue;
    if (!/^\d+$/.test(upper.slice(type.keyPrefix.length))) continue;
    if (!best || type.keyPrefix.length > best.keyPrefix.length) best = type;
  }
  return best;
}

type Option = {
  choice: InsertChoice;
  label: string;
  hint: string;
  title?: string;
  color?: string;
};

/**
 * Alt+Shift+R: type a key. An existing key inserts a link to it; a new key
 * (or the space's next key) inserts a definition.
 */
export default function InsertRequirementDialog({
  spaceId,
  nextKey,
  types = [],
  lockKeys = false,
  defaultPrefix = null,
  onSelect,
}: {
  spaceId: string | undefined;
  nextKey: string | null;
  types?: IRequirementType[];
  lockKeys?: boolean;
  defaultPrefix?: string | null;
  onSelect: (choice: InsertChoice) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debounced] = useDebouncedValue(query, 200);
  const [matches, setMatches] = useState<IRequirement[]>([]);
  // the same key in other spaces the user belongs to
  const [elsewhere, setElsewhere] = useState<IKeySearchItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!spaceId) return;
    let cancelled = false;
    setLoading(true);
    listRequirements({
      spaceId,
      filter: debounced.trim() ? { text: debounced.trim() } : undefined,
      limit: 8,
    })
      .then((res) => {
        if (!cancelled) setMatches(res.items.filter((r) => !r.isConflict));
      })
      .catch(() => !cancelled && setMatches([]))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, [spaceId, debounced]);

  useEffect(() => {
    const q = debounced.trim();
    if (!q) {
      setElsewhere([]);
      return;
    }
    let cancelled = false;
    searchRequirementKeys({ query: q, spaceId, limit: 10 })
      .then((items) => {
        if (!cancelled) setElsewhere(items.filter((i) => i.spaceId !== spaceId));
      })
      .catch(() => !cancelled && setElsewhere([]));
    return () => {
      cancelled = true;
    };
  }, [spaceId, debounced]);

  useEffect(() => setActive(0), [debounced]);
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const typed = query.trim().toUpperCase();
  const typedType = typed ? matchRequirementType(typed, types) : null;
  const allowedByDefault =
    !!defaultPrefix &&
    typed.startsWith(defaultPrefix) &&
    /^\d+$/.test(typed.slice(defaultPrefix.length));
  // with locked keys a new key must belong to a type (or the space prefix);
  // only complain once the key looks finished (ends with a number)
  const lockedOut = lockKeys && !!typed && !typedType && !allowedByDefault;
  const showLockError = lockedOut && /\d$/.test(typed);
  const invalid = /[/\\]/.test(typed);
  const exact = matches.some((m) => m.key === typed);

  const options: Option[] = [];
  if (typed && !exact && !invalid && !lockedOut) {
    options.push({
      choice: { kind: "define", key: typed },
      label: typed,
      hint: t("Create"),
      title: typedType?.name,
      color: typedType?.color,
    });
  }
  if (!typed && nextKey) {
    options.push({
      choice: { kind: "next" },
      label: nextKey,
      hint: t("Create"),
    });
  }
  // the next key of each type that matches what was typed so far
  for (const type of types) {
    if (typed && !type.keyPrefix.startsWith(typed) && !typed.startsWith(type.keyPrefix)) {
      continue;
    }
    if (typedType && typedType.id === type.id && typed !== type.keyPrefix) continue;
    options.push({
      choice: { kind: "type", type },
      label: `${type.keyPrefix}${String(type.nextSeq).padStart(type.keyPadding, "0")}`,
      hint: t("Create"),
      title: type.name,
      color: type.color,
    });
  }
  for (const m of matches) {
    options.push({
      choice: { kind: "link", key: m.key },
      label: m.key,
      hint: t("Link"),
      title: m.title,
    });
  }
  for (const m of elsewhere) {
    options.push({
      choice: { kind: "link", key: m.key, spaceId: m.spaceId },
      label: m.key,
      hint: t("Link"),
      title: `(${t("in space {{name}}", { name: m.spaceName })}) ${m.title}`,
    });
  }

  return (
    <Stack gap={6}>
      <TextInput
        ref={inputRef}
        size="sm"
        placeholder={t("Enter requirement key")}
        value={query}
        error={
          invalid
            ? t("A key cannot contain / or \\")
            : showLockError
              ? t("Keys are locked: use the prefix of a requirement type")
              : undefined
        }
        rightSection={loading ? <Loader size={12} /> : null}
        ff="monospace"
        onChange={(e) => setQuery(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "ArrowDown") {
            e.preventDefault();
            setActive((i) => Math.min(i + 1, options.length - 1));
          } else if (e.key === "ArrowUp") {
            e.preventDefault();
            setActive((i) => Math.max(i - 1, 0));
          } else if (e.key === "Enter") {
            e.preventDefault();
            if (options[active]) onSelect(options[active].choice);
          }
        }}
      />
      <Text size="xs" c="dimmed">
        {t(
          "Type a new key to define a requirement, or an existing key to link to it.",
        )}
      </Text>
      <ScrollArea.Autosize mah={280}>
        {options.map((o, index) => (
          <UnstyledButton
            key={`${o.choice.kind}:${o.label}:${"spaceId" in o.choice ? (o.choice.spaceId ?? "") : ""}`}
            className={clsx(
              classes.pickerItem,
              index === active && classes.pickerItemActive,
            )}
            onMouseEnter={() => setActive(index)}
            onClick={() => onSelect(o.choice)}
          >
            <Group gap="xs" wrap="nowrap">
              <Badge
                size="xs"
                radius="sm"
                variant={o.choice.kind === "link" ? "outline" : "filled"}
                w={52}
              >
                {o.hint}
              </Badge>
              <Text size="sm" ff="monospace" fw={600}>
                {o.label}
              </Text>
              {o.title &&
                (o.color ? (
                  <Badge size="xs" radius="sm" variant="light" color={o.color}>
                    {o.title}
                  </Badge>
                ) : (
                  <Text size="sm" c="dimmed" truncate>
                    {o.title}
                  </Text>
                ))}
            </Group>
          </UnstyledButton>
        ))}
      </ScrollArea.Autosize>
    </Stack>
  );
}
