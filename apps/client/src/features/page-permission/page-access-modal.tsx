import { useEffect, useMemo, useState } from "react";
import {
  ActionIcon,
  Alert,
  Anchor,
  Button,
  Divider,
  Group,
  Modal,
  MultiSelect,
  ScrollArea,
  Select,
  Stack,
  Switch,
  Text,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import { IconLock, IconUsersGroup, IconX } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { Link, useParams } from "react-router-dom";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { useGetGroupsQuery } from "@/features/group/queries/group-query.ts";
import { buildPageUrl } from "@/features/page/page.utils.ts";
import { VerifierSelect } from "@/features/page-verification/components/verifier-select.tsx";
import {
  PageRole,
  usePageAccessMutation,
  usePageAccessQuery,
  usePagePermissionMembersQuery,
} from "./page-permission.ts";

interface PageAccessModalProps {
  pageId: string;
  opened: boolean;
  onClose: () => void;
}

function GroupSelect({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { t } = useTranslation();
  const [search, setSearch] = useState("");
  const [debounced] = useDebouncedValue(search, 300);
  const { data } = useGetGroupsQuery({ query: debounced, limit: 50 } as any);
  const options = useMemo(
    () => (data?.items ?? []).map((g: any) => ({ value: g.id, label: g.name })),
    [data],
  );
  return (
    <MultiSelect
      label={t("Groups")}
      placeholder={t("Search for groups")}
      data={options}
      value={value}
      onChange={onChange}
      searchable
      searchValue={search}
      onSearchChange={setSearch}
      hidePickedOptions
      clearable
      nothingFoundMessage={t("No group found")}
    />
  );
}

export default function PageAccessModal({ pageId, opened, onClose }: PageAccessModalProps) {
  const { t } = useTranslation();
  const { spaceSlug } = useParams();
  const { data: info } = usePageAccessQuery(pageId, opened);
  const restricted = info?.restricted ?? false;
  const { data: members } = usePagePermissionMembersQuery(pageId, opened && restricted);
  const mutation = usePageAccessMutation(pageId);
  const canManage = info?.permissions.canManage ?? false;

  const [userIds, setUserIds] = useState<string[]>([]);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [role, setRole] = useState<PageRole>("reader");

  useEffect(() => {
    if (!opened) {
      setUserIds([]);
      setGroupIds([]);
      setRole("reader");
    }
  }, [opened]);

  const roleOptions = [
    { value: "reader", label: t("Can view") },
    { value: "writer", label: t("Can edit") },
  ];

  const add = async () => {
    await mutation.mutateAsync({ kind: "add", userIds, groupIds, role });
    setUserIds([]);
    setGroupIds([]);
  };

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={
        <Group gap="xs">
          <IconLock size={18} />
          <Text fw={600}>{t("Page access")}</Text>
        </Group>
      }
    >
      {!info ? null : (
        <Stack>
          {info.inheritedFrom && (
            <Alert color="blue" icon={<IconLock size={16} />}>
              {t("Access is limited by a restricted parent page:")}{" "}
              <Anchor
                component={Link}
                to={buildPageUrl(spaceSlug, info.inheritedFrom.slugId, info.inheritedFrom.title)}
                onClick={onClose}
              >
                {info.inheritedFrom.title || t("Untitled")}
              </Anchor>
              . {t("Only people with access there can open this page.")}
            </Alert>
          )}

          <Switch
            checked={restricted}
            disabled={!canManage || mutation.isPending}
            onChange={(e) =>
              mutation.mutate({ kind: e.currentTarget.checked ? "restrict" : "unrestrict" })
            }
            label={t("Restrict access to this page")}
            description={
              restricted
                ? t("Only the people and groups below can open this page and its sub-pages.")
                : t("Everyone with access to the space can open this page.")
            }
          />

          {restricted && (
            <>
              {canManage && (
                <Stack gap="xs">
                  <Divider label={t("Add people")} labelPosition="left" />
                  <VerifierSelect
                    label={t("People")}
                    value={userIds}
                    onChange={setUserIds}
                  />
                  <GroupSelect value={groupIds} onChange={setGroupIds} />
                  <Group justify="flex-end" gap="xs">
                    <Select
                      data={roleOptions}
                      value={role}
                      onChange={(v) => v && setRole(v as PageRole)}
                      allowDeselect={false}
                      w={140}
                    />
                    <Button
                      onClick={add}
                      disabled={userIds.length + groupIds.length === 0}
                      loading={mutation.isPending}
                    >
                      {t("Add")}
                    </Button>
                  </Group>
                </Stack>
              )}

              <Divider label={t("Who has access")} labelPosition="left" />
              <ScrollArea.Autosize mah={300}>
                <Stack gap="xs">
                  {(members?.items ?? []).map((m) => (
                    <Group key={`${m.type}-${m.id}`} justify="space-between" wrap="nowrap">
                      <Group gap="sm" wrap="nowrap" style={{ minWidth: 0 }}>
                        {m.type === "group" ? (
                          <IconUsersGroup size={24} />
                        ) : (
                          <CustomAvatar avatarUrl={m.avatarUrl} name={m.name} size={28} />
                        )}
                        <div style={{ minWidth: 0 }}>
                          <Text size="sm" truncate>
                            {m.name}
                          </Text>
                          <Text size="xs" c="dimmed" truncate>
                            {m.type === "group"
                              ? t("{{count}} members", { count: m.memberCount ?? 0 })
                              : m.email}
                          </Text>
                        </div>
                      </Group>
                      <Group gap={4} wrap="nowrap">
                        <Select
                          size="xs"
                          w={110}
                          data={roleOptions}
                          value={m.role}
                          disabled={!canManage}
                          allowDeselect={false}
                          onChange={(v) =>
                            v &&
                            mutation.mutate({
                              kind: "role",
                              role: v as PageRole,
                              ...(m.type === "user" ? { userId: m.id } : { groupId: m.id }),
                            })
                          }
                        />
                        {canManage && (
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            aria-label={t("Remove")}
                            onClick={() =>
                              mutation.mutate({
                                kind: "remove",
                                ...(m.type === "user" ? { userId: m.id } : { groupId: m.id }),
                              })
                            }
                          >
                            <IconX size={14} />
                          </ActionIcon>
                        )}
                      </Group>
                    </Group>
                  ))}
                </Stack>
              </ScrollArea.Autosize>
            </>
          )}
        </Stack>
      )}
    </Modal>
  );
}
