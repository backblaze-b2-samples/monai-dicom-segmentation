"use client";

import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { StudyEditForm } from "./study-edit-form";
import { useStudy } from "@/lib/queries";

export function StudyEditView({ id }: { id: string }) {
  const { data: study, isLoading, error, refetch } = useStudy(id);

  if (isLoading) {
    return <Skeleton className="h-80 w-full rounded-lg" />;
  }
  if (error || !study) {
    return (
      <ErrorState
        error={error ?? new Error("Study not found")}
        onRetry={() => refetch()}
      />
    );
  }
  return <StudyEditForm study={study} />;
}
