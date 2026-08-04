"use client";

import Link from "next/link";
import { ArrowRight, Layers } from "lucide-react";
import { Card, CardAction, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ErrorState } from "@/components/ui/error-state";
import { StudyStatusBadge } from "@/components/studies/status-badge";
import { useStudies } from "@/lib/queries";
import { formatDate } from "@/lib/utils";

export function RecentStudies() {
  const { data: studies = [], isLoading, error, refetch } = useStudies();
  const recent = studies.slice(0, 8);

  return (
    <Card>
      <CardHeader className="border-b border-border py-4 px-5">
        <CardTitle className="card-title">Recent Studies</CardTitle>
        <CardAction className="self-center">
          <Link
            href="/studies"
            className="inline-flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
          >
            View all
            <ArrowRight className="h-3 w-3" />
          </Link>
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {isLoading ? (
          <div className="p-4 space-y-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full" />
            ))}
          </div>
        ) : error ? (
          <ErrorState error={error} onRetry={() => refetch()} />
        ) : recent.length === 0 ? (
          <EmptyState
            icon={Layers}
            title="No studies yet"
            description="Ingest a volume to get started."
          />
        ) : (
          <Table className="table-fixed">
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="w-[44%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Study
                </TableHead>
                <TableHead className="w-[16%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Modality
                </TableHead>
                <TableHead className="w-[22%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Status
                </TableHead>
                <TableHead className="w-[18%] text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Created
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recent.map((study) => (
                <TableRow key={study.id} className="table-row-hover">
                  <TableCell className="font-medium">
                    <Link
                      href={`/studies/${study.id}`}
                      className="block truncate rounded-sm underline-offset-4 hover:underline"
                      title={study.label}
                    >
                      {study.label}
                    </Link>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {study.modality}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <StudyStatusBadge status={study.status} />
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatDate(study.created_at)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
    </Card>
  );
}
