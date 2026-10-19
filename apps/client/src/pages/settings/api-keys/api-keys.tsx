import { useState } from "react";
import {
  ActionIcon,
  Alert,
  Button,
  Code,
  CopyButton,
  Group,
  Modal,
  Select,
  Stack,
  Table,
  Text,
  TextInput,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { IconCheck, IconCopy, IconKey, IconTrash } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import {
  IApiKey,
  useApiKeysQuery,
  useCreateApiKeyMutation,
  useRevokeApiKeyMutation,
} from "@/features/api-key/api-key.ts";
import { formattedDate } from "@/lib/time.ts";
import WorkspaceSettingToggle from "@/features/workspace/components/settings/components/workspace-setting-toggle.tsx";

const EXPIRY_OPTIONS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "365", label: "1 year" },
  { value: "never", label: "No expiry" },
];

function CreateApiKeyModal({ opened, onClose }: { opened: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState("");
  const [expiry, setExpiry] = useState("90");
  const [token, setToken] = useState<string | null>(null);
  const createMutation = useCreateApiKeyMutation();

  const close = () => {
    setName("");
    setExpiry("90");
    setToken(null);
    onClose();
  };

  const create = async () => {
    const expiresAt =
      expiry === "never"
        ? undefined
        : new Date(Date.now() + Number(expiry) * 86_400_000).toISOString();
    const res = await createMutation.mutateAsync({ name: name.trim(), expiresAt });
    setToken(res.token);
  };

  return (
    <Modal opened={opened} onClose={close} title={t("Create API key")} size="lg">
      {token ? (
        <Stack>
          <Alert color="yellow">
            {t("Copy this key now. It will not be shown again.")}
          </Alert>
          <Group wrap="nowrap" align="flex-start">
            <Code block style={{ flex: 1, wordBreak: "break-all", whiteSpace: "pre-wrap" }}>
              {token}
            </Code>
            <CopyButton value={token}>
              {({ copied, copy }) => (
                <Tooltip label={copied ? t("Copied") : t("Copy")} withArrow>
                  <ActionIcon variant="default" onClick={copy} aria-label={t("Copy")}>
                    {copied ? <IconCheck size={16} /> : <IconCopy size={16} />}
                  </ActionIcon>
                </Tooltip>
              )}
            </CopyButton>
          </Group>
          <Text size="sm" c="dimmed">
            {t("Send it as a bearer token:")} <Code>Authorization: Bearer &lt;key&gt;</Code>
          </Text>
          <Group justify="flex-end">
            <Button onClick={close}>{t("Done")}</Button>
          </Group>
        </Stack>
      ) : (
        <Stack>
          <TextInput
            label={t("Name")}
            placeholder={t("e.g. CI export script")}
            value={name}
            onChange={(e) => setName(e.currentTarget.value)}
            required
            data-autofocus
          />
          <Select
            label={t("Expires")}
            data={EXPIRY_OPTIONS.map((o) => ({ ...o, label: t(o.label) }))}
            value={expiry}
            onChange={(v) => v && setExpiry(v as string)}
            allowDeselect={false}
          />
          <Group justify="flex-end">
            <Button variant="default" onClick={close}>
              {t("Cancel")}
            </Button>
            <Button onClick={create} disabled={!name.trim()} loading={createMutation.isPending}>
              {t("Create")}
            </Button>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}

export default function ApiKeys({ adminView = false }: { adminView?: boolean }) {
  const { t } = useTranslation();
  const { data, isLoading } = useApiKeysQuery(adminView);
  const revokeMutation = useRevokeApiKeyMutation();
  const [createOpened, setCreateOpened] = useState(false);
  const items = data?.items ?? [];
  const title = adminView ? t("API management") : t("API keys");

  const confirmRevoke = (key: IApiKey) =>
    modals.openConfirmModal({
      title: t("Revoke API key"),
      children: (
        <Text size="sm">
          {t("Applications using {{name}} will stop working immediately.", {
            name: key.name,
          })}
        </Text>
      ),
      centered: true,
      labels: { confirm: t("Revoke"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => revokeMutation.mutate(key.id),
    });

  const isExpired = (k: IApiKey) =>
    !!k.expiresAt && new Date(k.expiresAt).getTime() < Date.now();

  return (
    <>
      <DocumentTitle title={title} />
      <SettingsTitle title={title} />

      {adminView && (
        <>
          <WorkspaceSettingToggle
            label={t("Restrict API access to admins")}
            description={t(
              "Only workspace owners and admins can create and use API keys.",
            )}
            field="restrictApiToAdmins"
            read={(ws) => ws?.settings?.api?.restrictToAdmins === true}
          />
          <Text fw={500} mt="xl" mb="xs">
            {t("All API keys in this workspace")}
          </Text>
        </>
      )}

      {!adminView && (
        <Group justify="space-between" mb="md">
          <Text size="sm" c="dimmed">
            {t("API keys act on your behalf with your permissions.")}
          </Text>
          <Button leftSection={<IconKey size={16} />} onClick={() => setCreateOpened(true)}>
            {t("Create API key")}
          </Button>
        </Group>
      )}

      <Table.ScrollContainer minWidth={600}>
        <Table verticalSpacing="sm">
          <Table.Thead>
            <Table.Tr>
              <Table.Th>{t("Name")}</Table.Th>
              {adminView && <Table.Th>{t("Owner")}</Table.Th>}
              <Table.Th>{t("Created")}</Table.Th>
              <Table.Th>{t("Last used")}</Table.Th>
              <Table.Th>{t("Expires")}</Table.Th>
              <Table.Th />
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {items.map((k) => (
              <Table.Tr key={k.id}>
                <Table.Td>
                  <Text size="sm" fw={500}>
                    {k.name}
                  </Text>
                </Table.Td>
                {adminView && (
                  <Table.Td>
                    <Group gap={6} wrap="nowrap">
                      <CustomAvatar avatarUrl={k.creatorAvatarUrl} name={k.creatorName} size={22} />
                      <Text size="sm">{k.creatorName}</Text>
                    </Group>
                  </Table.Td>
                )}
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {formattedDate(new Date(k.createdAt))}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c="dimmed">
                    {k.lastUsedAt ? formattedDate(new Date(k.lastUsedAt)) : t("Never")}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Text size="sm" c={isExpired(k) ? "red" : "dimmed"}>
                    {k.expiresAt
                      ? `${formattedDate(new Date(k.expiresAt))}${isExpired(k) ? ` (${t("expired")})` : ""}`
                      : t("Never")}
                  </Text>
                </Table.Td>
                <Table.Td>
                  <Tooltip label={t("Revoke")} withArrow>
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      onClick={() => confirmRevoke(k)}
                      aria-label={t("Revoke")}
                    >
                      <IconTrash size={16} />
                    </ActionIcon>
                  </Tooltip>
                </Table.Td>
              </Table.Tr>
            ))}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>
      {!isLoading && items.length === 0 && (
        <Text c="dimmed" size="sm" mt="md">
          {t("No API keys yet.")}
        </Text>
      )}

      <CreateApiKeyModal opened={createOpened} onClose={() => setCreateOpened(false)} />
    </>
  );
}
