import { Group, Switch, Text } from "@mantine/core";
import { useAtom } from "jotai";
import { useState } from "react";
import { notifications } from "@mantine/notifications";
import { workspaceAtom } from "@/features/user/atoms/current-user-atom.ts";
import { updateWorkspace } from "@/features/workspace/services/workspace-service.ts";
import { IWorkspace } from "@/features/workspace/types/workspace.types.ts";

interface WorkspaceSettingToggleProps {
  label: string;
  description: string;
  /** field sent to /workspace/update */
  field: keyof IWorkspace;
  /** reads the current value from the workspace */
  read: (workspace: IWorkspace | null) => boolean;
}

// A labelled on/off switch bound to one workspace setting.
export default function WorkspaceSettingToggle({
  label,
  description,
  field,
  read,
}: WorkspaceSettingToggleProps) {
  const [workspace, setWorkspace] = useAtom(workspaceAtom);
  const [checked, setChecked] = useState(read(workspace));

  const handleChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const value = event.currentTarget.checked;
    setChecked(value);
    try {
      const updated = await updateWorkspace({ [field]: value } as any);
      setWorkspace(updated);
    } catch (err) {
      setChecked(!value);
      notifications.show({
        message: err?.response?.data?.message,
        color: "red",
      });
    }
  };

  return (
    <Group justify="space-between" wrap="nowrap" gap="xl">
      <div>
        <Text size="md">{label}</Text>
        <Text size="sm" c="dimmed">
          {description}
        </Text>
      </div>
      <Switch checked={checked} onChange={handleChange} aria-label={label} />
    </Group>
  );
}
