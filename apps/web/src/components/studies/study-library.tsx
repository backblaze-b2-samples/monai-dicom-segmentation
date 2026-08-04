"use client";

import Link from "next/link";
import { Layers, Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { StudyCard } from "./study-card";
import { useStudies } from "@/lib/queries";

/**
 * The Studies "Library" — a sample-specific asset explorer scoped to the
 * `studies/` prefix (distinct from the full-bucket /files explorer). Lists
 * studies by scanning each `studies/<id>/study.json` manifest on the API side.
 */
export function StudyLibrary() {
  const { data: studies = [], isLoading, error, refetch } = useStudies();

  if (error) {
    return <ErrorState error={error} onRetry={() => refetch()} />;
  }

  if (isLoading) {
    return (
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[4/5] w-full rounded-lg" />
        ))}
      </div>
    );
  }

  if (studies.length === 0) {
    return (
      <EmptyState
        icon={Layers}
        title="No studies yet"
        description="Ingest a DICOM or NIfTI volume to create your first study. Its source, previews, and segmentation artifacts all land under one B2 prefix."
        action={
          <Button asChild size="sm">
            <Link href="/studies/new">
              <Plus className="h-4 w-4" />
              Ingest a volume
            </Link>
          </Button>
        }
      />
    );
  }

  return (
    <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
      {studies.map((study) => (
        <StudyCard key={study.id} study={study} />
      ))}
    </div>
  );
}
