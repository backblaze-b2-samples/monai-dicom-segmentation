"use client";

import { useCallback, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useDropzone } from "react-dropzone";
import { FileUp, Loader2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useCreateStudy } from "@/lib/queries";
import {
  DEFAULT_STUDY_MODALITY,
  DEFAULT_STUDY_MODEL,
  MODALITY_OPTIONS,
  SEGMENTATION_MODELS,
} from "@monai-dicom-segmentation/shared";

const MODEL_KEYS = SEGMENTATION_MODELS.map((m) => m.key) as [string, ...string[]];

const schema = z.object({
  label: z.string().min(1, "Give the study a label").max(120),
  modality: z.enum(MODALITY_OPTIONS as [string, ...string[]]),
  model: z.enum(MODEL_KEYS),
});

type FormValues = z.infer<typeof schema>;

const ACCEPT = {
  "application/octet-stream": [".nii", ".nii.gz"],
  "application/gzip": [".nii.gz", ".gz"],
  "application/zip": [".zip"],
};

export function StudyCreateForm() {
  const router = useRouter();
  const createStudy = useCreateStudy();
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    // Safe defaults surfaced as guidance, not autofilled magic values.
    defaultValues: {
      label: "",
      modality: DEFAULT_STUDY_MODALITY,
      model: DEFAULT_STUDY_MODEL,
    },
  });

  const onDrop = useCallback((accepted: File[]) => {
    if (accepted[0]) {
      setFile(accepted[0]);
      setFileError(null);
    }
  }, []);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: ACCEPT,
    multiple: false,
    maxSize: 512 * 1024 * 1024,
  });

  const onSubmit = (values: FormValues) => {
    if (!file) {
      setFileError("Choose a NIfTI (.nii/.nii.gz) or DICOM (.zip) file to ingest");
      return;
    }
    createStudy.mutate(
      { file, label: values.label, modality: values.modality, model: values.model },
      {
        onSuccess: (study) => {
          toast.success(`Study "${study.label}" ingested`);
          router.push(`/studies/${study.id}`);
        },
        onError: (e) => toast.error(`Ingest failed: ${e.message}`),
      }
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Ingest a volume</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-6">
            {/* File dropzone */}
            <div className="space-y-1.5">
              <FormLabel>Imaging volume</FormLabel>
              <div
                {...getRootProps()}
                className={[
                  "flex min-h-40 cursor-pointer flex-col items-center justify-center rounded-md",
                  "border-2 border-dashed px-4 py-8 text-center transition-colors",
                  isDragActive
                    ? "border-primary bg-[var(--accent-subtle)]"
                    : "border-border hover:border-primary/60 hover:bg-muted/60",
                ].join(" ")}
              >
                <input {...getInputProps()} aria-label="Choose an imaging volume" />
                <div className="flex items-center justify-center w-12 h-12 rounded-md bg-muted border border-border">
                  <FileUp className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                </div>
                <p className="mt-3 text-sm font-semibold [overflow-wrap:anywhere]">
                  {file ? file.name : "Drag & drop, or click to choose a file"}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  NIfTI (.nii / .nii.gz) or a .zip of DICOM (.dcm) slices · up to 512 MB
                </p>
              </div>
              {fileError && (
                <p className="text-sm text-destructive">{fileError}</p>
              )}
            </div>

            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Abdominal CT — patient 001" {...field} />
                  </FormControl>
                  <FormDescription>
                    A human-readable name for this study. Tip: include modality and
                    body region so it is easy to find later.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="modality"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Modality</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-60">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {MODALITY_OPTIONS.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Drives intensity normalization. Defaults to CT — the safe choice
                    for the CT bundles below.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="model"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Segmentation model</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger className="w-full max-w-md">
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {SEGMENTATION_MODELS.map((m) => (
                        <SelectItem key={m.key} value={m.key}>
                          {m.name} ({m.modality})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormDescription>
                    Pretrained MONAI zoo bundle. Default is Spleen CT (UNet) — the
                    lightest, most reliable first run on CPU. You can change it later.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        {createStudy.isPending && (
          <Alert>
            <Loader2 className="h-4 w-4 animate-spin" />
            <AlertTitle>Ingesting volume</AlertTitle>
            <AlertDescription>
              <p>
                Uploading your volume and rendering axial preview slices on the
                server. This can take up to a minute for a large volume — keep
                this tab open; you&apos;ll be taken to the study automatically
                when it&apos;s ready.
              </p>
              <div
                role="progressbar"
                aria-label="Ingesting volume"
                className="progress-indeterminate mt-2 h-1 w-full rounded-full"
              />
            </AlertDescription>
          </Alert>
        )}

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.push("/studies")}>
            Cancel
          </Button>
          <Button type="submit" disabled={createStudy.isPending}>
            {createStudy.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {createStudy.isPending ? "Ingesting..." : "Ingest volume"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
