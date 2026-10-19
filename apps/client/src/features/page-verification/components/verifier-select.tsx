import { useEffect, useMemo, useState } from "react";
import { useDebouncedValue } from "@mantine/hooks";
import { Group, MultiSelect, MultiSelectProps, Text } from "@mantine/core";
import { useTranslation } from "react-i18next";
import { useWorkspaceMembersQuery } from "@/features/workspace/queries/workspace-query.ts";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { IVerificationUser } from "../types";

type Option = { value: string; label: string; avatarUrl?: string; email?: string };

const renderOption: MultiSelectProps["renderOption"] = ({ option }) => (
  <Group gap="sm" wrap="nowrap">
    <CustomAvatar avatarUrl={option?.["avatarUrl"]} name={option.label} size={28} />
    <div>
      <Text size="sm" lineClamp={1}>
        {option.label}
      </Text>
      <Text size="xs" opacity={0.5}>
        {option?.["email"]}
      </Text>
    </div>
  </Group>
);

interface VerifierSelectProps {
  value: string[];
  onChange: (ids: string[]) => void;
  initialUsers?: IVerificationUser[];
  label?: string;
}

export function VerifierSelect({
  value,
  onChange,
  initialUsers = [],
  label,
}: VerifierSelectProps) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const { data: users } = useWorkspaceMembersQuery({ query: debounced, limit: 50 });
  const [known, setKnown] = useState<Map<string, Option>>(new Map());

  useEffect(() => {
    setKnown((prev) => {
      const next = new Map(prev);
      for (const u of initialUsers) {
        next.set(u.id, { value: u.id, label: u.name, avatarUrl: u.avatarUrl, email: u.email });
      }
      for (const u of users?.items ?? []) {
        next.set(u.id, { value: u.id, label: u.name, avatarUrl: u.avatarUrl, email: u.email });
      }
      return next;
    });
  }, [users, initialUsers]);

  const data = useMemo(() => [...known.values()], [known]);

  return (
    <MultiSelect
      label={label ?? t("Verifiers")}
      placeholder={t("Search for users")}
      data={data}
      value={value}
      onChange={onChange}
      renderOption={renderOption}
      searchable
      searchValue={search}
      onSearchChange={setSearch}
      hidePickedOptions
      clearable
      maxValues={20}
      nothingFoundMessage={t("No user found")}
      comboboxProps={{ withinPortal: true }}
    />
  );
}
