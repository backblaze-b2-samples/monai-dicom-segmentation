"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import type { SegmentationResult } from "@monai-dicom-segmentation/shared";

export function SegmentationStats({ result }: { result: SegmentationResult }) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between border-b border-border py-3 px-5">
        <CardTitle className="card-title">Segmentation</CardTitle>
        <Badge variant="secondary" title="Inference device (auto-detected)">
          {result.device.toUpperCase()}
        </Badge>
      </CardHeader>
      <CardContent className="p-0">
        {result.labels.length === 0 ? (
          <p className="p-5 text-sm text-muted-foreground">
            No labels were produced — the model found no target structures in this
            volume.
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/40 hover:bg-muted/40">
                <TableHead className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Structure
                </TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Voxels
                </TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Volume (mL)
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {result.labels.map((label) => (
                <TableRow key={label.label}>
                  <TableCell className="font-medium capitalize">{label.name}</TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums text-muted-foreground">
                    {label.voxels.toLocaleString()}
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs tabular-nums">
                    {label.volume_ml.toLocaleString()}
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
