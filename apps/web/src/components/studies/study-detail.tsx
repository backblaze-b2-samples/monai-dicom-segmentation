"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowLeft,
  Download,
  Loader2,
  Pencil,
  Play,
  Trash2,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
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
import { SliceViewer } from "./slice-viewer";
import { SegmentationStats } from "./segmentation-stats";
import { getDownloadUrl } from "@/lib/api-client";
import { startBrowserDownload } from "@/lib/browser-download";
import { formatDate } from "@/lib/utils";
import {
  useDeleteStudy,
  useRunSegmentation,
  useStudy,
} from "@/lib/queries";
import type { Study } from "@monai-dicom-segmentation/shared";

function MetaRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 py-1.5">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="text-right text-sm font-medium [overflow-wrap:anywhere]">{value}</dd>
    </div>
  );
}

function Artifacts({ study }: { study: Study }) {
  const download = async (key: string | null, filename: string) => {
    if (!key) return;
    try {
      const { url } = await getDownloadUrl(key);
      startBrowserDownload(url, filename);
    } catch {
      toast.error("Could not fetch a download link");
    }
  };

  const items: { key: string | null; label: string; filename: string }[] = [
    { key: study.source_key, label: "Source volume", filename: study.source_filename },
    { key: study.processed_key, label: "Processed volume", filename: "volume.nii.gz" },
    { key: study.mask_key, label: "Segmentation mask", filename: "segmentation.nii.gz" },
  ];

  return (
    <Card>
      <CardHeader className="border-b border-border py-3 px-5">
        <CardTitle className="card-title">Artifacts on B2</CardTitle>
      </CardHeader>
      <CardContent className="p-3">
        {items.map((item) => (
          <div
            key={item.label}
            className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50"
          >
            <span className="text-sm">{item.label}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-7"
              disabled={!item.key}
              onClick={() => download(item.key, item.filename)}
            >
              <Download className="h-3.5 w-3.5" />
              {item.key ? "Download" : "Not yet"}
            </Button>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

export function StudyDetail({ id }: { id: string }) {
  const router = useRouter();
  const { data: study, isLoading, error, refetch } = useStudy(id);
  const runSegmentation = useRunSegmentation();
  const deleteStudy = useDeleteStudy();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="grid gap-6 lg:grid-cols-2">
        <Skeleton className="aspect-square w-full rounded-lg" />
        <Skeleton className="h-72 w-full rounded-lg" />
      </div>
    );
  }
  if (error || !study) {
    return (
      <ErrorState
        error={error ?? new Error("Study not found")}
        onRetry={() => refetch()}
      />
    );
  }

  const processing = study.status === "processing" || runSegmentation.isPending;

  const onRun = () =>
    runSegmentation.mutate(study.id, {
      onSuccess: () => toast.success("Segmentation complete"),
      onError: (e) => toast.error(`Segmentation failed: ${e.message}`),
    });

  const onDelete = () => {
    deleteStudy.mutate(study.id, {
      onSuccess: () => {
        toast.success(`Deleted ${study.label}`);
        router.push("/studies");
      },
      onError: (e) => toast.error(`Delete failed: ${e.message}`),
    });
    setConfirmOpen(false);
  };

  return (
    <div className="space-y-6">
      <div className="animate-fade-in border-b border-border pb-5">
        <Link
          href="/studies"
          className="mb-3 inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3 w-3" />
          Back to Library
        </Link>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <h1 className="page-title truncate">{study.label}</h1>
              <StudyStatusBadge status={study.status} />
            </div>
            <p className="mt-1.5 text-sm text-muted-foreground">
              {study.modality} · {study.model}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button onClick={onRun} disabled={processing} size="sm">
              {processing ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Play className="h-3.5 w-3.5" />
              )}
              {study.status === "segmented" ? "Re-run" : "Run segmentation"}
            </Button>
            <Button asChild variant="outline" size="sm">
              <Link href={`/studies/${study.id}/edit`}>
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Link>
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setConfirmOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5" />
              Delete
            </Button>
          </div>
        </div>
      </div>

      {study.status === "failed" && study.error && (
        <Alert variant="destructive">
          <AlertTitle>Segmentation failed</AlertTitle>
          <AlertDescription>{study.error}</AlertDescription>
        </Alert>
      )}
      {processing && (
        <Alert>
          <Loader2 className="h-4 w-4 animate-spin" />
          <AlertTitle>Segmentation running</AlertTitle>
          <AlertDescription>
            The MONAI bundle is downloading (first run) and inferring on-device.
            This can take a few minutes on CPU — this view updates automatically.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <div className="animate-fade-in-up stagger-2">
          <SliceViewer study={study} />
        </div>
        <div className="animate-fade-in-up stagger-3 space-y-6">
          <Card>
            <CardHeader className="border-b border-border py-3 px-5">
              <CardTitle className="card-title">Details</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              <dl className="divide-y divide-border">
                <MetaRow label="Source file" value={study.source_filename} />
                <MetaRow label="Format" value={study.source_format} />
                <MetaRow label="Size" value={study.size_human} />
                <MetaRow
                  label="Shape"
                  value={study.shape ? study.shape.join(" × ") : "—"}
                />
                <MetaRow
                  label="Spacing (mm)"
                  value={
                    study.spacing
                      ? study.spacing.map((s) => s.toFixed(2)).join(", ")
                      : "—"
                  }
                />
                <MetaRow label="PHI tags stripped" value={study.phi_tags_stripped} />
                <MetaRow label="Created" value={formatDate(study.created_at)} />
                <MetaRow label="Updated" value={formatDate(study.updated_at)} />
              </dl>
            </CardContent>
          </Card>
          {study.segmentation && <SegmentationStats result={study.segmentation} />}
          <Artifacts study={study} />
        </div>
      </div>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this study?</AlertDialogTitle>
            <AlertDialogDescription>
              This permanently deletes <strong>{study.label}</strong> and every
              artifact under <code>studies/{study.id}/</code>. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={onDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
