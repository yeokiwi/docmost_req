import { useEffect, useState } from "react";
import {
  ActionIcon,
  Badge,
  Button,
  Code,
  CopyButton,
  Divider,
  Group,
  Menu,
  Modal,
  PasswordInput,
  Stack,
  Switch,
  Table,
  Text,
  TextInput,
  Title,
  Tooltip,
} from "@mantine/core";
import { modals } from "@mantine/modals";
import { notifications } from "@mantine/notifications";
import { IconCheck, IconCopy, IconDots, IconPlus } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import SettingsTitle from "@/components/settings/settings-title.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import WorkspaceSettingToggle from "@/features/workspace/components/settings/components/workspace-setting-toggle.tsx";
import {
  ISsoProvider,
  SsoProviderInput,
  testSsoProvider,
  useDeleteSsoProviderMutation,
  useSaveSsoProviderMutation,
  useSsoProvidersQuery,
} from "@/features/sso/sso-api.ts";

const EMPTY: SsoProviderInput = {
  name: "",
  oidcIssuer: "",
  oidcClientId: "",
  oidcClientSecret: "",
  allowSignup: false,
  isEnabled: true,
  groupSync: false,
};

function ProviderModal({
  provider,
  opened,
  onClose,
}: {
  provider: ISsoProvider | null;
  opened: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [form, setForm] = useState<SsoProviderInput>(EMPTY);
  const save = useSaveSsoProviderMutation();

  useEffect(() => {
    if (!opened) return;
    setForm(
      provider
        ? {
            name: provider.name,
            oidcIssuer: provider.oidcIssuer,
            oidcClientId: provider.oidcClientId,
            oidcClientSecret: "",
            allowSignup: provider.allowSignup,
            isEnabled: provider.isEnabled,
            groupSync: provider.groupSync,
          }
        : EMPTY,
    );
  }, [opened, provider]);

  const set = <K extends keyof SsoProviderInput>(k: K, v: SsoProviderInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const submit = async () => {
    const data = { ...form };
    if (provider && !data.oidcClientSecret) delete data.oidcClientSecret;
    await save.mutateAsync({ ...data, providerId: provider?.id });
    onClose();
  };

  const valid =
    form.name.trim() &&
    form.oidcIssuer.trim() &&
    form.oidcClientId.trim() &&
    (provider || form.oidcClientSecret);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="lg"
      title={provider ? t("Edit OpenID Connect provider") : t("Add OpenID Connect provider")}
    >
      <Stack>
        <TextInput
          label={t("Display name")}
          description={t('Shown on the login page as "Continue with …"')}
          placeholder="Keycloak"
          value={form.name}
          onChange={(e) => set("name", e.currentTarget.value)}
          required
          data-autofocus
        />
        <TextInput
          label={t("Issuer URL")}
          description={t("The provider's issuer; /.well-known/openid-configuration must be reachable from the server.")}
          placeholder="https://idp.example.com/realms/company"
          value={form.oidcIssuer}
          onChange={(e) => set("oidcIssuer", e.currentTarget.value)}
          required
        />
        <TextInput
          label={t("Client ID")}
          value={form.oidcClientId}
          onChange={(e) => set("oidcClientId", e.currentTarget.value)}
          required
        />
        <PasswordInput
          label={t("Client secret")}
          placeholder={provider ? t("Leave empty to keep the current secret") : ""}
          value={form.oidcClientSecret}
          onChange={(e) => set("oidcClientSecret", e.currentTarget.value)}
          required={!provider}
        />
        {provider && (
          <div>
            <Text size="sm" fw={500}>
              {t("Redirect URI")}
            </Text>
            <Text size="xs" c="dimmed" mb={4}>
              {t("Register this callback URL with the identity provider.")}
            </Text>
            <Group gap="xs" wrap="nowrap">
              <Code style={{ flex: 1, wordBreak: "break-all" }}>{provider.redirectUri}</Code>
              <CopyButton value={provider.redirectUri}>
                {({ copied, copy }) => (
                  <ActionIcon variant="default" onClick={copy} aria-label={t("Copy")}>
                    {copied ? <IconCheck size={14} /> : <IconCopy size={14} />}
                  </ActionIcon>
                )}
              </CopyButton>
            </Group>
          </div>
        )}
        <Switch
          label={t("Enabled")}
          checked={form.isEnabled}
          onChange={(e) => set("isEnabled", e.currentTarget.checked)}
        />
        <Switch
          label={t("Allow sign-up")}
          description={t(
            "Create an account on first sign-in for people without one (approved email domains only). Invited people can always join.",
          )}
          checked={form.allowSignup}
          onChange={(e) => set("allowSignup", e.currentTarget.checked)}
        />
        <Switch
          label={t("Group sync")}
          description={t(
            'Add members to Docmost groups whose names match the "groups" claim. Membership is only added, never removed.',
          )}
          checked={form.groupSync}
          onChange={(e) => set("groupSync", e.currentTarget.checked)}
        />
        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button onClick={submit} loading={save.isPending} disabled={!valid}>
            {t("Save")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}

export default function Security() {
  const { t } = useTranslation();
  const { data: providers } = useSsoProvidersQuery();
  const deleteMutation = useDeleteSsoProviderMutation();
  const [editing, setEditing] = useState<ISsoProvider | null>(null);
  const [opened, setOpened] = useState(false);

  const open = (p: ISsoProvider | null) => {
    setEditing(p);
    setOpened(true);
  };

  const test = async (p: ISsoProvider) => {
    try {
      const res = await testSsoProvider(p.id);
      notifications.show({ message: t("Connected to {{issuer}}", { issuer: res.issuer }) });
    } catch (err: any) {
      notifications.show({ message: err?.response?.data?.message, color: "red" });
    }
  };

  const confirmDelete = (p: ISsoProvider) =>
    modals.openConfirmModal({
      title: t("Delete SSO provider"),
      children: (
        <Text size="sm">
          {t("People will no longer be able to sign in with {{name}}.", { name: p.name })}
        </Text>
      ),
      centered: true,
      labels: { confirm: t("Delete"), cancel: t("Cancel") },
      confirmProps: { color: "red" },
      onConfirm: () => deleteMutation.mutate(p.id),
    });

  const hasActive = (providers ?? []).some((p) => p.isEnabled);

  return (
    <>
      <DocumentTitle title={t("Security & SSO")} />
      <SettingsTitle title={t("Security & SSO")} />

      <Group justify="space-between" mb="xs">
        <Title order={4}>{t("Single sign-on (OpenID Connect)")}</Title>
        <Button size="xs" leftSection={<IconPlus size={14} />} onClick={() => open(null)}>
          {t("Add provider")}
        </Button>
      </Group>
      <Text size="sm" c="dimmed" mb="md">
        {t("Works with Keycloak, Authentik, Azure AD / Entra ID, Okta, Google Workspace and other OpenID Connect providers.")}
      </Text>

      <Table verticalSpacing="sm">
        <Table.Thead>
          <Table.Tr>
            <Table.Th>{t("Name")}</Table.Th>
            <Table.Th>{t("Issuer")}</Table.Th>
            <Table.Th>{t("Status")}</Table.Th>
            <Table.Th />
          </Table.Tr>
        </Table.Thead>
        <Table.Tbody>
          {(providers ?? []).map((p) => (
            <Table.Tr key={p.id}>
              <Table.Td>
                <Text size="sm" fw={500}>
                  {p.name}
                </Text>
              </Table.Td>
              <Table.Td>
                <Text size="sm" c="dimmed" truncate maw={300}>
                  {p.oidcIssuer}
                </Text>
              </Table.Td>
              <Table.Td>
                <Group gap={4}>
                  <Badge size="sm" variant="light" color={p.isEnabled ? "green" : "gray"}>
                    {p.isEnabled ? t("Enabled") : t("Disabled")}
                  </Badge>
                  {p.allowSignup && (
                    <Tooltip label={t("New accounts are created on first sign-in")} withArrow>
                      <Badge size="sm" variant="light">{t("Sign-up")}</Badge>
                    </Tooltip>
                  )}
                  {p.groupSync && <Badge size="sm" variant="light">{t("Group sync")}</Badge>}
                </Group>
              </Table.Td>
              <Table.Td>
                <Menu position="bottom-end" withinPortal>
                  <Menu.Target>
                    <ActionIcon variant="subtle" color="gray" aria-label={t("Provider actions")}>
                      <IconDots size={16} />
                    </ActionIcon>
                  </Menu.Target>
                  <Menu.Dropdown>
                    <Menu.Item onClick={() => open(p)}>{t("Edit")}</Menu.Item>
                    <Menu.Item onClick={() => test(p)}>{t("Test connection")}</Menu.Item>
                    <Menu.Item color="red" onClick={() => confirmDelete(p)}>
                      {t("Delete")}
                    </Menu.Item>
                  </Menu.Dropdown>
                </Menu>
              </Table.Td>
            </Table.Tr>
          ))}
        </Table.Tbody>
      </Table>
      {providers?.length === 0 && (
        <Text size="sm" c="dimmed" mt="sm">
          {t("No providers yet.")}
        </Text>
      )}

      <Divider my="xl" />

      <Stack gap="lg">
        {hasActive && (
          <WorkspaceSettingToggle
            label={t("Enforce SSO")}
            description={t("Disable password sign-in. Everyone must use an SSO provider.")}
            field="enforceSso"
            read={(ws) => ws?.enforceSso === true}
          />
        )}
        <WorkspaceSettingToggle
          label={t("Require two-factor authentication")}
          description={t(
            "Members signing in with a password must set up two-factor authentication at their next sign-in.",
          )}
          field="enforceMfa"
          read={(ws) => ws?.enforceMfa === true}
        />
      </Stack>

      <ProviderModal provider={editing} opened={opened} onClose={() => setOpened(false)} />
    </>
  );
}
