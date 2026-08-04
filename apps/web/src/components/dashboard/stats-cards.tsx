"use client";

import { Layers, CheckCircle2, HardDrive, Boxes } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { LoadingNotice } from "@/components/common/loading-notice";
import { useStudyStats } from "@/lib/queries";

export function StatsCards() {
  const { data: stats, isLoading, error, refetch } = useStudyStats();

  // Surface fetch failures inline rather than rendering zeros — that lies about
  // the bucket state when the API is simply unreachable.
  if (error) {
    return (
      <Card>
        <CardContent className="p-0">
          <ErrorState error={error} onRetry={() => refetch()} />
        </CardContent>
      </Card>
    );
  }

  const cards = [
    { title: "Studies", value: stats?.total_studies ?? 0, icon: Layers },
    { title: "Segmented", value: stats?.segmented_studies ?? 0, icon: CheckCircle2 },
    { title: "Imaging Data", value: stats?.source_bytes_human ?? "0 B", icon: HardDrive },
    { title: "Artifacts on B2", value: stats?.total_objects ?? 0, icon: Boxes },
  ];

  return (
    <>
      {isLoading && <LoadingNotice className="mb-3" subject="study stats" />}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card, i) => (
          <Card
            key={card.title}
            className={`card-hover animate-fade-in-up stagger-${i + 1}`}
          >
            <CardHeader className="flex flex-row items-center justify-between pt-4 pb-2 px-4 space-y-0">
              <CardTitle className="text-xs font-semibold text-muted-foreground">
                {card.title}
              </CardTitle>
              <div className="stat-icon-wrap">
                <card.icon className="h-4 w-4" />
              </div>
            </CardHeader>
            <CardContent className="pb-5 px-4">
              {isLoading ? (
                <Skeleton className="h-8 w-24" />
              ) : (
                <div className="stat-value">{card.value}</div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>
    </>
  );
}
