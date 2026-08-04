"use client";

import { useState } from "react";
import { ImageOff, Loader2 } from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useSliceUrl } from "@/lib/queries";
import type { Study } from "@monai-dicom-segmentation/shared";

type Kind = "volume" | "overlay";

export function SliceViewer({ study }: { study: Study }) {
  const hasOverlay = study.num_overlay_slices > 0;
  const [kind, setKind] = useState<Kind>("volume");
  const [rawIndex, setRawIndex] = useState(0);

  const count = kind === "volume" ? study.num_volume_slices : study.num_overlay_slices;
  const maxIndex = Math.max(0, count - 1);
  // Derive the effective index so switching to a smaller set (volume<->overlay)
  // never fetches an out-of-range slice — no clamp-in-effect needed.
  const index = Math.min(rawIndex, maxIndex);

  const { data, isFetching, error } = useSliceUrl(study.id, kind, index, {
    enabled: count > 0,
  });

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b border-border py-3 px-5">
        <CardTitle className="card-title">Slice viewer</CardTitle>
        <div className="inline-flex overflow-hidden rounded-md border border-border">
          <Button
            type="button"
            variant={kind === "volume" ? "default" : "ghost"}
            size="sm"
            className="h-7 rounded-none"
            onClick={() => setKind("volume")}
          >
            Volume
          </Button>
          <Button
            type="button"
            variant={kind === "overlay" ? "default" : "ghost"}
            size="sm"
            className="h-7 rounded-none"
            disabled={!hasOverlay}
            onClick={() => setKind("overlay")}
            title={hasOverlay ? undefined : "Run segmentation to see the mask overlay"}
          >
            Overlay
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-5 space-y-4">
        <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border border-border bg-black">
          {count === 0 ? (
            <div className="flex flex-col items-center gap-2 text-muted-foreground">
              <ImageOff className="h-8 w-8" aria-hidden="true" />
              <p className="text-sm">
                {kind === "overlay" ? "No mask yet — run segmentation." : "No previews."}
              </p>
            </div>
          ) : error ? (
            <p className="text-sm text-destructive">Could not load this slice.</p>
          ) : data?.url ? (
            <>
              {/* eslint-disable-next-line @next/next/no-img-element -- presigned, expiring URL */}
              <img
                src={data.url}
                alt={`${kind} slice ${index + 1} of ${count}`}
                className="h-full w-full object-contain"
              />
              {isFetching && (
                <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-white/80" />
              )}
            </>
          ) : (
            <Loader2 className="h-6 w-6 animate-spin text-white/80" />
          )}
        </div>

        <div className="flex items-center gap-3">
          <span className="w-16 shrink-0 font-mono text-xs tabular-nums text-muted-foreground">
            {count === 0 ? "—" : `${index + 1} / ${count}`}
          </span>
          <input
            type="range"
            min={0}
            max={maxIndex}
            value={index}
            disabled={count === 0}
            onChange={(e) => setRawIndex(Number(e.target.value))}
            aria-label="Axial slice"
            className="h-2 w-full cursor-pointer appearance-none rounded-full bg-muted accent-[var(--primary)]"
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Slices are rendered server-side and streamed from B2 via short-lived
          presigned URLs — the browser never holds your credentials.
        </p>
      </CardContent>
    </Card>
  );
}
