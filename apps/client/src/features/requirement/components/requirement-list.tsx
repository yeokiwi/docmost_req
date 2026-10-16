import { useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Group,
  Menu,
  Pagination,
  SegmentedControl,
  Stack,
  Table,
  Text,
  TextInput,
} from "@mantine/core";
import { useDebouncedValue } from "@mantine/hooks";
import {
  IconDownload,
  IconFileSpreadsheet,
  IconSearch,
  IconUpload,
} from "@tabler/icons-react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { notifications } from "@mantine/notifications";
import { ISpace } from "@/features/space/types/space.types";
import { buildPageUrl } from "@/features/page/page.utils";
import NoTableResults from "@/components/common/no-table-results";
import {
  useRequirementSettingsQuery,
  useRequirementsQuery,
} from "../queries/requirement-query";
import { exportRequirements } from "../services/requirement-service";
import { textToProperties } from "../utils/requirement-filter";
import {
  IRequirementFilter,
  RequirementCoverage,
} from "../types/requirement.types";
import RequirementDetailDrawer from "./requirement-detail-drawer";
import ImportRequirementsModal from "./import-requirements-modal";

const PAGE_SIZE = 50;

export default function RequirementList({
  space,
  canEdit,
}: {
  space: ISpace;
  canEdit: boolean;
}) {
  const { t } = useTranslation();
  const [text, setText] = useState("");
  const [propertiesText, setPropertiesText] = useState("");
  const [coverage, setCoverage] = useState<RequirementCoverage>("any");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [importOpened, setImportOpened] = useState(false);
  const [debouncedText] = useDebouncedValue(text, 300);
  const [debouncedProps] = useDebouncedValue(propertiesText, 300);

  const properties = textToProperties(debouncedProps);
  const filter: IRequirementFilter = {
    text: debouncedText.trim() || undefined,
    properties: Object.keys(properties).length ? properties : undefined,
    coverage,
  };

  const { data: settings } = useRequirementSettingsQuery(space.id);
  const { data, isLoading } = useRequirementsQuery({
    spaceId: space.id,
    filter,
    limit: PAGE_SIZE,
    offset: (page - 1) * PAGE_SIZE,
  });

  const columns = (settings?.propertySchema ?? []).map((d) => d.name);
  const totalPages = Math.max(1, Math.ceil((data?.total ?? 0) / PAGE_SIZE));

  const handleExport = async (format: "xlsx" | "csv") => {
    try {
      await exportRequirements({ spaceId: space.id, format, filter });
    } catch (err) {
      notifications.show({
        message: t("Export failed"),
        color: "red",
      });
    }
  };

  return (
    <Stack gap="sm">
      {!settings && (
        <Alert color="blue" variant="light">
          {t(
            "Set a requirement key prefix in space settings to start defining requirements.",
          )}
        </Alert>
      )}

      <Group justify="space-between" align="flex-end">
        <Group align="flex-end">
          <TextInput
            size="sm"
            leftSection={<IconSearch size={16} />}
            placeholder={t("Search by key or text")}
            value={text}
            onChange={(e) => {
              setText(e.currentTarget.value);
              setPage(1);
            }}
          />
          <TextInput
            size="sm"
            placeholder="Priority=High, Status=Approved"
            value={propertiesText}
            onChange={(e) => {
              setPropertiesText(e.currentTarget.value);
              setPage(1);
            }}
          />
          <SegmentedControl
            size="sm"
            value={coverage}
            onChange={(v) => {
              setCoverage(v as RequirementCoverage);
              setPage(1);
            }}
            data={[
              { value: "any", label: t("All") },
              { value: "covered", label: t("Covered") },
              { value: "uncovered", label: t("Not covered") },
            ]}
          />
        </Group>

        <Group gap="xs">
          {canEdit && settings && (
            <Button
              variant="default"
              size="sm"
              leftSection={<IconUpload size={16} />}
              onClick={() => setImportOpened(true)}
            >
              {t("Import")}
            </Button>
          )}
          <Menu position="bottom-end" withinPortal>
            <Menu.Target>
              <Button
                variant="default"
                size="sm"
                leftSection={<IconDownload size={16} />}
              >
                {t("Export")}
              </Button>
            </Menu.Target>
            <Menu.Dropdown>
              <Menu.Item
                leftSection={<IconFileSpreadsheet size={16} />}
                onClick={() => handleExport("xlsx")}
              >
                {t("Excel (.xlsx)")}
              </Menu.Item>
              <Menu.Item
                leftSection={<IconFileSpreadsheet size={16} />}
                onClick={() => handleExport("csv")}
              >
                {t("CSV (.csv)")}
              </Menu.Item>
            </Menu.Dropdown>
          </Menu>
        </Group>
      </Group>

      {data?.truncated && (
        <Text size="xs" c="dimmed">
          {t("Showing the first {{count}} matches. Refine the filter.", {
            count: data.total,
          })}
        </Text>
      )}

      <Table.ScrollContainer minWidth={700}>
        <Table highlightOnHover verticalSpacing="xs">
          <Table.Thead>
            <Table.Tr>
              <Table.Th w={120}>{t("Key")}</Table.Th>
              <Table.Th>{t("Title")}</Table.Th>
              {columns.map((c) => (
                <Table.Th key={c}>{c}</Table.Th>
              ))}
              <Table.Th w={120}>{t("Depends on")}</Table.Th>
              <Table.Th w={100}>{t("References")}</Table.Th>
              <Table.Th>{t("Page")}</Table.Th>
            </Table.Tr>
          </Table.Thead>
          <Table.Tbody>
            {data?.items.length ? (
              data.items.map((r) => (
                <Table.Tr
                  key={r.id}
                  style={{ cursor: "pointer" }}
                  onClick={() => setSelected(r.key)}
                >
                  <Table.Td>
                    <Badge
                      variant="light"
                      radius="sm"
                      ff="monospace"
                      color={r.isConflict ? "red" : "blue"}
                    >
                      {r.key}
                    </Badge>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" lineClamp={2}>
                      {r.title || t("Untitled")}
                    </Text>
                  </Table.Td>
                  {columns.map((c) => (
                    <Table.Td key={c}>
                      <Text size="sm">{r.properties?.[c] ?? ""}</Text>
                    </Table.Td>
                  ))}
                  <Table.Td>
                    <Text size="xs" ff="monospace">
                      {r.dependsOn?.join(", ")}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text size="sm" c={r.referenceCount ? undefined : "red"}>
                      {r.referenceCount}
                    </Text>
                  </Table.Td>
                  <Table.Td>
                    <Text
                      size="sm"
                      component={Link}
                      to={buildPageUrl(space.slug, r.pageSlugId, r.pageTitle)}
                      onClick={(e) => e.stopPropagation()}
                      c="dimmed"
                      td="underline"
                    >
                      {r.pageTitle || t("Untitled")}
                    </Text>
                  </Table.Td>
                </Table.Tr>
              ))
            ) : (
              <NoTableResults colSpan={5 + columns.length} />
            )}
          </Table.Tbody>
        </Table>
      </Table.ScrollContainer>

      {!isLoading && totalPages > 1 && (
        <Group justify="flex-end">
          <Pagination
            size="sm"
            total={totalPages}
            value={page}
            onChange={setPage}
          />
        </Group>
      )}

      {selected && (
        <RequirementDetailDrawer
          opened={!!selected}
          onClose={() => setSelected(null)}
          spaceId={space.id}
          requirementKey={selected}
        />
      )}

      {importOpened && (
        <ImportRequirementsModal
          opened={importOpened}
          onClose={() => setImportOpened(false)}
          space={space}
        />
      )}
    </Stack>
  );
}
