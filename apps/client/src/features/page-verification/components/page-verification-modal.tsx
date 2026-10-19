import { useEffect, useState } from "react";
import {
  Alert,
  Badge,
  Button,
  Divider,
  Group,
  Modal,
  NumberInput,
  Radio,
  Select,
  Stack,
  Switch,
  Text,
  Textarea,
} from "@mantine/core";
import { IconAlertTriangle, IconShieldCheck } from "@tabler/icons-react";
import { useTranslation } from "react-i18next";
import { CustomAvatar } from "@/components/ui/custom-avatar.tsx";
import { formattedDate } from "@/lib/time.ts";
import {
  usePageVerificationMutation,
  usePageVerificationQuery,
} from "../queries";
import { PeriodUnit, VerificationType } from "../types";
import { STATE_META } from "../state";
import { VerifierSelect } from "./verifier-select";

interface PageVerificationModalProps {
  pageId: string;
  opened: boolean;
  onClose: () => void;
}

export default function PageVerificationModal({
  pageId,
  opened,
  onClose,
}: PageVerificationModalProps) {
  const { t } = useTranslation();
  const { data } = usePageVerificationQuery(pageId, opened);
  const mutation = usePageVerificationMutation(pageId);
  const verification = data?.verification ?? null;
  const perms = data?.permissions;

  const [editing, setEditing] = useState(false);
  const [type, setType] = useState<VerificationType>("expiring");
  const [verifierIds, setVerifierIds] = useState<string[]>([]);
  const [expires, setExpires] = useState(true);
  const [periodAmount, setPeriodAmount] = useState<number>(6);
  const [periodUnit, setPeriodUnit] = useState<PeriodUnit>("month");
  const [rejecting, setRejecting] = useState(false);
  const [comment, setComment] = useState("");

  useEffect(() => {
    if (!opened) {
      setEditing(false);
      setRejecting(false);
      setComment("");
      return;
    }
    if (verification) {
      setType(verification.type);
      setVerifierIds(verification.verifiers.map((v) => v.id));
      setExpires(!!verification.periodAmount);
      setPeriodAmount(verification.periodAmount ?? 6);
      setPeriodUnit(verification.periodUnit ?? "month");
    }
  }, [opened, verification]);

  const showForm = editing || (!verification && perms?.canManage);

  const save = async () => {
    await mutation.mutateAsync({
      kind: "setup",
      data: {
        pageId,
        type,
        verifierIds,
        periodAmount: type === "expiring" && expires ? periodAmount : null,
        periodUnit,
      },
    });
    setEditing(false);
  };

  const unitLabel = (u: PeriodUnit | null, n: number | null) =>
    u ? t(`${n === 1 ? u : `${u}s`}`) : "";

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap="xs">
          <IconShieldCheck size={18} />
          <Text fw={600}>{t("Page verification")}</Text>
        </Group>
      }
      size="lg"
    >
      {!data ? null : showForm ? (
        <Stack>
          <Radio.Group
            label={t("Workflow")}
            value={type}
            onChange={(v) => setType(v as VerificationType)}
          >
            <Stack gap="xs" mt="xs">
              <Radio
                value="expiring"
                label={t("Verification")}
                description={t(
                  "Verifiers confirm the page is accurate. Optionally the verification expires and must be renewed.",
                )}
              />
              <Radio
                value="qms"
                label={t("Approval workflow")}
                description={t(
                  "Editors submit the page for approval; approvers approve or reject it. Edits after approval are flagged.",
                )}
              />
            </Stack>
          </Radio.Group>

          <VerifierSelect
            label={type === "qms" ? t("Approvers") : t("Verifiers")}
            value={verifierIds}
            onChange={setVerifierIds}
            initialUsers={verification?.verifiers}
          />

          {type === "expiring" && (
            <Stack gap="xs">
              <Switch
                label={t("Verification expires")}
                checked={expires}
                onChange={(e) => setExpires(e.currentTarget.checked)}
              />
              {expires && (
                <Group gap="xs" align="flex-end">
                  <NumberInput
                    label={t("Re-verify every")}
                    min={1}
                    max={1000}
                    w={140}
                    value={periodAmount}
                    onChange={(v) => setPeriodAmount(Number(v) || 1)}
                  />
                  <Select
                    w={140}
                    data={[
                      { value: "day", label: t("days") },
                      { value: "week", label: t("weeks") },
                      { value: "month", label: t("months") },
                      { value: "year", label: t("years") },
                    ]}
                    value={periodUnit}
                    onChange={(v) => v && setPeriodUnit(v as PeriodUnit)}
                    allowDeselect={false}
                  />
                </Group>
              )}
            </Stack>
          )}

          {verification && verification.type !== type && (
            <Alert color="yellow" icon={<IconAlertTriangle size={16} />}>
              {t("Changing the workflow resets the current verification state.")}
            </Alert>
          )}

          <Group justify="flex-end">
            {verification && (
              <Button variant="default" onClick={() => setEditing(false)}>
                {t("Cancel")}
              </Button>
            )}
            <Button
              onClick={save}
              disabled={verifierIds.length === 0}
              loading={mutation.isPending}
            >
              {verification ? t("Save") : t("Set up verification")}
            </Button>
          </Group>
        </Stack>
      ) : !verification ? (
        <Text c="dimmed" size="sm">
          {t("This page has no verification.")}
        </Text>
      ) : (
        <Stack>
          <Group justify="space-between">
            <Badge size="lg" variant="light" color={STATE_META[verification.state].color}>
              {t(STATE_META[verification.state].label)}
            </Badge>
            <Text size="xs" c="dimmed">
              {verification.type === "qms"
                ? t("Approval workflow")
                : verification.periodAmount
                  ? t("Re-verify every {{n}} {{unit}}", {
                      n: verification.periodAmount,
                      unit: unitLabel(verification.periodUnit, verification.periodAmount),
                    })
                  : t("Does not expire")}
            </Text>
          </Group>

          <Stack gap={4}>
            {verification.verifiedAt && verification.verifiedBy && (
              <Text size="sm">
                {verification.type === "qms" ? t("Approved by") : t("Verified by")}{" "}
                <b>{verification.verifiedBy.name}</b>{" "}
                {formattedDate(new Date(verification.verifiedAt))}
              </Text>
            )}
            {verification.expiresAt && verification.type === "expiring" && (
              <Text size="sm">
                {verification.state === "expired" ? t("Expired") : t("Expires")}{" "}
                {formattedDate(new Date(verification.expiresAt))}
              </Text>
            )}
            {verification.state === "pending" && verification.requestedBy && (
              <Text size="sm">
                {t("Submitted by")} <b>{verification.requestedBy.name}</b>{" "}
                {formattedDate(new Date(verification.requestedAt))}
              </Text>
            )}
            {verification.state === "rejected" && verification.rejectedBy && (
              <Alert color="red" title={t("Rejected by {{name}}", { name: verification.rejectedBy.name })}>
                {verification.rejectionComment || t("No comment")}
              </Alert>
            )}
            {verification.state === "changed" && (
              <Alert color="orange" icon={<IconAlertTriangle size={16} />}>
                {t("The page was edited after it was approved. Submit it again for approval.")}
              </Alert>
            )}
          </Stack>

          <div>
            <Text size="sm" fw={500} mb={4}>
              {verification.type === "qms" ? t("Approvers") : t("Verifiers")}
            </Text>
            <Group gap="xs">
              {verification.verifiers.map((v) => (
                <Group key={v.id} gap={6}>
                  <CustomAvatar avatarUrl={v.avatarUrl} name={v.name} size={22} />
                  <Text size="sm">{v.name}</Text>
                </Group>
              ))}
            </Group>
          </div>

          {rejecting && (
            <Textarea
              label={t("Reason for rejection")}
              value={comment}
              onChange={(e) => setComment(e.currentTarget.value)}
              autosize
              minRows={2}
              data-autofocus
            />
          )}

          <Divider />

          <Group justify="space-between">
            <Group gap="xs">
              {perms?.canManage && (
                <>
                  <Button variant="subtle" size="xs" onClick={() => setEditing(true)}>
                    {t("Edit settings")}
                  </Button>
                  <Button
                    variant="subtle"
                    color="red"
                    size="xs"
                    onClick={() => mutation.mutate({ kind: "remove" })}
                  >
                    {t("Remove")}
                  </Button>
                </>
              )}
            </Group>
            <Group gap="xs">
              {verification.type === "expiring" && perms?.canVerify && (
                <Button
                  leftSection={<IconShieldCheck size={16} />}
                  loading={mutation.isPending}
                  onClick={() => mutation.mutate({ kind: "verify" })}
                >
                  {verification.state === "unverified" ? t("Verify") : t("Re-verify")}
                </Button>
              )}
              {verification.type === "qms" &&
                verification.state !== "pending" &&
                perms?.canManage && (
                  <Button
                    loading={mutation.isPending}
                    onClick={() => mutation.mutate({ kind: "request" })}
                  >
                    {t("Submit for approval")}
                  </Button>
                )}
              {verification.type === "qms" &&
                verification.state === "pending" &&
                perms?.canVerify &&
                (rejecting ? (
                  <>
                    <Button variant="default" onClick={() => setRejecting(false)}>
                      {t("Cancel")}
                    </Button>
                    <Button
                      color="red"
                      loading={mutation.isPending}
                      onClick={async () => {
                        await mutation.mutateAsync({ kind: "reject", comment });
                        setRejecting(false);
                        setComment("");
                      }}
                    >
                      {t("Reject")}
                    </Button>
                  </>
                ) : (
                  <>
                    <Button variant="default" color="red" onClick={() => setRejecting(true)}>
                      {t("Reject")}
                    </Button>
                    <Button
                      color="green"
                      loading={mutation.isPending}
                      onClick={() => mutation.mutate({ kind: "approve" })}
                    >
                      {t("Approve")}
                    </Button>
                  </>
                ))}
            </Group>
          </Group>
        </Stack>
      )}
    </Modal>
  );
}
