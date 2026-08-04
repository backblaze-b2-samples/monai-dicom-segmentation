import Link from "next/link";
import { Plus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { StudyLibrary } from "@/components/studies/study-library";

export default function StudiesPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in flex flex-wrap items-start justify-between gap-4 border-b border-border pb-5">
        <div className="min-w-0">
          <h1 className="page-title">Studies</h1>
          <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
            Your imaging studies. Each one is a source volume plus its derived
            artifacts — processed volume, segmentation mask, and previews — under a
            single B2 prefix.
          </p>
        </div>
        <Button asChild size="sm" className="h-8 shrink-0">
          <Link href="/studies/new">
            <Plus aria-hidden="true" className="h-3.5 w-3.5" />
            Ingest volume
          </Link>
        </Button>
      </div>
      <div className="animate-fade-in-up stagger-2">
        <StudyLibrary />
      </div>
    </div>
  );
}
