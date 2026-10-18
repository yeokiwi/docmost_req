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
import { listRequirements } from "../services/requirement-service";
import { IRequirement } from "../types/requirement.types";

export type InsertChoice =
  | { kind: "next" }
  | { kind: "define"; key: string }
  | { kind: "link"; key: string };

type Option = { choice: InsertChoice; label: string; hint: string; title?: string };

/**
 * Alt+Shift+R: type a key. An existing key inserts a link to it; a new key
 * (or the space's next key) inserts a definition.
 */
export default function InsertRequirementDialog({
  spaceId,
  nextKey,
  onSelect,
}: {
  spaceId: string | undefined;
  nextKey: string | null;
  onSelect: (choice: InsertChoice) => void;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [debounced] = useDebouncedValue(query, 200);
  const [matches, setMatches] = useState<IRequirement[]>([]);
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

  useEffect(() => setActive(0), [debounced]);
  useEffect(() => {
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const typed = query.trim().toUpperCase();
  const invalid = /[/\\]/.test(typed);
  const exact = matches.some((m) => m.key === typed);

  const options: Option[] = [];
  if (typed && !exact && !invalid) {
    options.push({
      choice: { kind: "define", key: typed },
      label: typed,
      hint: t("Create"),
    });
  }
  if (!typed && nextKey) {
    options.push({
      choice: { kind: "next" },
      label: nextKey,
      hint: t("Create"),
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

  return (
    <Stack gap={6}>
      <TextInput
        ref={inputRef}
        size="sm"
        placeholder={t("Enter requirement key")}
        value={query}
        error={invalid ? t("A key cannot contain / or \\") : undefined}
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
            key={`${o.choice.kind}:${o.label}`}
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
              {o.title && (
                <Text size="sm" c="dimmed" truncate>
                  {o.title}
                </Text>
              )}
            </Group>
          </UnstyledButton>
        ))}
      </ScrollArea.Autosize>
    </Stack>
  );
}
