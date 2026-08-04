import { AlertTriangle, CheckCircle2, CircleDashed, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import type { StudyStatus } from "@monai-dicom-segmentation/shared";

type BadgeVariant = "default" | "secondary" | "destructive" | "outline";

const STATUS_META: Record<
  StudyStatus,
  { label: string; variant: BadgeVariant; icon: typeof CircleDashed; spin?: boolean }
> = {
  uploaded: { label: "Uploaded", variant: "secondary", icon: CircleDashed },
  processing: { label: "Processing", variant: "outline", icon: Loader2, spin: true },
  segmented: { label: "Segmented", variant: "default", icon: CheckCircle2 },
  failed: { label: "Failed", variant: "destructive", icon: AlertTriangle },
};

export function StudyStatusBadge({ status }: { status: StudyStatus }) {
  const meta = STATUS_META[status];
  const Icon = meta.icon;
  return (
    <Badge variant={meta.variant}>
      <Icon className={meta.spin ? "animate-spin" : ""} aria-hidden="true" />
      {meta.label}
    </Badge>
  );
}
