"use client";

import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { useUpdateStudy } from "@/lib/queries";
import type { Study } from "@monai-dicom-segmentation/shared";
import { SEGMENTATION_MODELS } from "@monai-dicom-segmentation/shared";

const MODEL_KEYS = SEGMENTATION_MODELS.map((m) => m.key) as [string, ...string[]];

const schema = z.object({
  label: z.string().min(1, "Give the study a label").max(120),
  model: z.enum(MODEL_KEYS),
});

type FormValues = z.infer<typeof schema>;

export function StudyEditForm({ study }: { study: Study }) {
  const router = useRouter();
  const updateStudy = useUpdateStudy();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    // Pre-filled from the manifest — edit forms surface no default-hint.
    defaultValues: { label: study.label, model: study.model },
  });

  const onSubmit = (values: FormValues) => {
    updateStudy.mutate(
      { id: study.id, label: values.label, model: values.model },
      {
        onSuccess: () => {
          toast.success("Study updated");
          router.push(`/studies/${study.id}`);
        },
        onError: (e) => toast.error(`Update failed: ${e.message}`),
      }
    );
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
        <Card>
          <CardHeader className="border-b border-border py-4 px-5">
            <CardTitle className="card-title">Edit study</CardTitle>
          </CardHeader>
          <CardContent className="p-5 space-y-6">
            <FormField
              control={form.control}
              name="label"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Label</FormLabel>
                  <FormControl>
                    <Input {...field} />
                  </FormControl>
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
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
        </Card>

        <div className="flex items-center justify-end gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={() => router.push(`/studies/${study.id}`)}
          >
            Cancel
          </Button>
          <Button type="submit" disabled={updateStudy.isPending}>
            {updateStudy.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {updateStudy.isPending ? "Saving..." : "Save changes"}
          </Button>
        </div>
      </form>
    </Form>
  );
}
