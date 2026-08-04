"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Brain,
  MoreVertical,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";

import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { StudyStatusBadge } from "./status-badge";
import {
  useDeleteStudy,
  useRunSegmentation,
  useSliceUrl,
} from "@/lib/queries";
import type { StudySummary } from "@monai-dicom-segmentation/shared";

function Thumbnail({ study }: { study: StudySummary }) {
  const { data } = useSliceUrl(study.id, "volume", 0, {
    enabled: study.num_volume_slices > 0,
  });
  if (data?.url) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- presigned, expiring URL
      <img
        src={data.url}
        alt={`Preview of ${study.label}`}
        className="h-full w-full object-contain bg-black/90"
      />
    );
  }
  return (
    <div className="flex h-full w-full items-center justify-center bg-muted">
      <Brain className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
    </div>
  );
}

export function StudyCard({ study }: { study: StudySummary }) {
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const runSegmentation = useRunSegmentation();
  const deleteStudy = useDeleteStudy();
  const busy = study.status === "processing" || runSegmentation.isPending;

  const onRun = () => {
    runSegmentation.mutate(study.id, {
      onSuccess: () => toast.success(`Segmentation complete for ${study.label}`),
      onError: (e) => toast.error(`Segmentation failed: ${e.message}`),
    });
  };

  const onDelete = () => {
    deleteStudy.mutate(study.id, {
      onSuccess: () => toast.success(`Deleted ${study.label}`),
      onError: (e) => toast.error(`Delete failed: ${e.message}`),
    });
    setConfirmOpen(false);
  };

  return (
    <Card className="card-hover overflow-hidden p-0">
      <Link href={`/studies/${study.id}`} className="block">
        <div className="aspect-square w-full border-b border-border">
          <Thumbnail study={study} />
        </div>
      </Link>
      <div className="flex items-start justify-between gap-2 p-3">
        <div className="min-w-0">
          <Link
            href={`/studies/${study.id}`}
            className="block truncate text-sm font-semibold hover:underline"
            title={study.label}
          >
            {study.label}
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">
            {study.modality} · {study.model}
          </p>
          <div className="mt-2">
            <StudyStatusBadge status={study.status} />
          </div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" aria-label="Study actions">
              <MoreVertical className="h-4 w-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={onRun} disabled={busy}>
              <Play className="h-4 w-4" />
              {study.status === "segmented" ? "Re-run segmentation" : "Run segmentation"}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => router.push(`/studies/${study.id}/edit`)}>
              <Pencil className="h-4 w-4" />
              Edit
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              variant="destructive"
              onSelect={(e) => {
                e.preventDefault();
                setConfirmOpen(true);
              }}
            >
              <Trash2 className="h-4 w-4" />
              Delete
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this study?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <strong>{study.label}</strong> and every
              artifact under its <code>studies/{study.id}/</code> prefix — source
              volume, processed volume, mask, and previews. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
}
