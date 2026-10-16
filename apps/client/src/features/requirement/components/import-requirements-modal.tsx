import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  FileInput,
  Group,
  Modal,
  ScrollArea,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { IconFileSpreadsheet } from "@tabler/icons-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import { useQueryClient } from "@tanstack/react-query";
import { ISpace } from "@/features/space/types/space.types";
import { buildPageUrl } from "@/features/page/page.utils";
import {
  confirmRequirementImport,
  previewRequirementImport,
} from "../services/requirement-service";
import { IImportPreview } from "../types/requirement.types";

const PREVIEW_ROWS = 100;

export default function ImportRequirementsModal({
  opened,
  onClose,
  space,
}: {
  opened: boolean;
  onClose: () => void;
  space: ISpace;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<IImportPreview | null>(null);
  const [pageTitle, setPageTitle] = useState("");
  const [loading, setLoading] = useState(false);

  const errorMessage = (err: unknown, fallback: string) =>
    (err as any)?.response?.data?.message || fallback;

  const handlePreview = async (selected: File | null) => {
    setFile(selected);
    setPreview(null);
    if (!selected) return;
    setLoading(true);
    try {
      const result = await previewRequirementImport(selected, space.id);
      setPreview(result);
      setPageTitle(selected.name.replace(/\.(xlsx|csv)$/i, ""));
    } catch (err) {
      notifications.show({
        message: errorMessage(err, t("Failed to read the file")),
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  const handleConfirm = async () => {
    if (!preview || !pageTitle.trim()) return;
    setLoading(true);
    try {
      const page = await confirmRequirementImport({
        spaceId: space.id,
        pageTitle: pageTitle.trim(),
        rows: preview.rows,
      });
      notifications.show({
        message: t("Imported {{count}} requirements", {
          count: preview.rows.length,
        }),
      });
      qc.invalidateQueries({ queryKey: ["requirements", space.id] });
      qc.invalidateQueries({ queryKey: ["root-sidebar-pages", space.id] });
      onClose();
      navigate(buildPageUrl(space.slug, page.slugId, page.title));
    } catch (err) {
      notifications.show({
        message: errorMessage(err, t("Import failed")),
        color: "red",
      });
    } finally {
      setLoading(false);
    }
  };

  const keptCount = preview?.rows.filter((r) => r.keepKey).length ?? 0;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      size="xl"
      title={t("Import requirements")}
    >
      <Stack gap="sm">
        <Text size="sm" c="dimmed">
          {t(
            "Upload an Excel (.xlsx) or CSV file. The first row must contain headers, including a Title column. Key and Description columns are optional; other columns become properties.",
          )}
        </Text>

        <FileInput
          accept=".xlsx,.csv"
          leftSection={<IconFileSpreadsheet size={16} />}
          placeholder={t("Choose file")}
          value={file}
          onChange={handlePreview}
          disabled={loading}
          clearable
        />

        {preview && (
          <>
            {preview.warnings.length > 0 && (
              <Alert color="yellow" variant="light">
                <Stack gap={2}>
                  {preview.warnings.slice(0, 10).map((w, i) => (
                    <Text key={i} size="sm">
                      {w}
                    </Text>
                  ))}
                </Stack>
              </Alert>
            )}

            <Text size="sm">
              {t(
                "{{count}} requirements found. {{kept}} keep their key, the rest get new keys.",
                { count: preview.rows.length, kept: keptCount },
              )}
            </Text>

            <ScrollArea.Autosize mah={320}>
              <Table withTableBorder verticalSpacing={4}>
                <Table.Thead>
                  <Table.Tr>
                    <Table.Th w={130}>{t("Key")}</Table.Th>
                    <Table.Th>{t("Title")}</Table.Th>
                    {preview.propertyNames.map((n) => (
                      <Table.Th key={n}>{n}</Table.Th>
                    ))}
                  </Table.Tr>
                </Table.Thead>
                <Table.Tbody>
                  {preview.rows.slice(0, PREVIEW_ROWS).map((row, i) => (
                    <Table.Tr key={i}>
                      <Table.Td>
                        {row.keepKey ? (
                          <Badge variant="light" radius="sm" ff="monospace">
                            {row.key}
                          </Badge>
                        ) : (
                          <Badge variant="outline" color="gray" radius="sm">
                            {t("New key")}
                          </Badge>
                        )}
                      </Table.Td>
                      <Table.Td>
                        <Text size="sm">{row.title}</Text>
                      </Table.Td>
                      {preview.propertyNames.map((n) => (
                        <Table.Td key={n}>
                          <Text size="sm">{row.properties?.[n] ?? ""}</Text>
                        </Table.Td>
                      ))}
                    </Table.Tr>
                  ))}
                </Table.Tbody>
              </Table>
            </ScrollArea.Autosize>

            <TextInput
              label={t("Create page")}
              description={t(
                "The requirements are written to a new page in this space.",
              )}
              value={pageTitle}
              onChange={(e) => setPageTitle(e.currentTarget.value)}
              required
            />
          </>
        )}

        <Group justify="flex-end">
          <Button variant="default" onClick={onClose}>
            {t("Cancel")}
          </Button>
          <Button
            onClick={handleConfirm}
            loading={loading}
            disabled={!preview || preview.rows.length === 0 || !pageTitle.trim()}
          >
            {t("Import")}
          </Button>
        </Group>
      </Stack>
    </Modal>
  );
}
