import SettingsTitle from "@/components/settings/settings-title.tsx";
import WorkspaceNameForm from "@/features/workspace/components/settings/components/workspace-name-form";
import WorkspaceIcon from "@/features/workspace/components/settings/components/workspace-icon.tsx";
import { useTranslation } from "react-i18next";
import { isBetaPublicSpaces } from "@/lib/config.ts";
import { Divider } from "@mantine/core";
import WorkspaceDefaultPageEditMode from "@/features/workspace/components/settings/components/workspace-default-page-edit-mode.tsx";
import AllowPublicSpaces from "@/features/workspace/components/settings/components/allow-public-spaces.tsx";
import { DocumentTitle } from "@/components/ui/document-title.tsx";
import WorkspaceSettingToggle from "@/features/workspace/components/settings/components/workspace-setting-toggle.tsx";
import useUserRole from "@/hooks/use-user-role.tsx";

export default function WorkspaceSettings() {
  const { t } = useTranslation();
  const { isAdmin } = useUserRole();
  return (
    <>
      <DocumentTitle title="Workspace Settings" />
      <SettingsTitle title={t("General")} />
      <WorkspaceIcon />
      <WorkspaceNameForm />

      {isAdmin && (
        <>
          <Divider my="md" />
          <WorkspaceSettingToggle
            label={t("Allow members to create templates")}
            description={t(
              "Members can add workspace-wide templates. Admins can always manage them.",
            )}
            field="allowMemberTemplates"
            read={(ws) => ws?.settings?.templates?.allowMemberTemplates === true}
          />
          <Divider my="md" />
          <WorkspaceSettingToggle
            label={t("Allow personal spaces")}
            description={t(
              "Every member can create one private space of their own from the profile menu.",
            )}
            field="allowPersonalSpaces"
            read={(ws) => ws?.settings?.spaces?.allowPersonal === true}
          />
        </>
      )}

      {isBetaPublicSpaces() && (
        <>
          <Divider my="md" />
          <AllowPublicSpaces />
        </>
      )}

      <Divider my="md" />
      <WorkspaceDefaultPageEditMode />
    </>
  );
}
