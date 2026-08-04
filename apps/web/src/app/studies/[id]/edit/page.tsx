import { StudyEditView } from "@/components/studies/study-edit-view";

export default async function EditStudyPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Edit study</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground">
          Update the label or switch the segmentation model, then re-run from the
          study page.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2 max-w-3xl">
        <StudyEditView id={id} />
      </div>
    </div>
  );
}
