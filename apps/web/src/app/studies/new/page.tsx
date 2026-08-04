import { StudyCreateForm } from "@/components/studies/study-create-form";

export default function NewStudyPage() {
  return (
    <div className="space-y-8">
      <div className="animate-fade-in border-b border-border pb-5">
        <h1 className="page-title">Ingest a volume</h1>
        <p className="mt-1.5 max-w-prose text-sm text-muted-foreground text-pretty">
          Upload a DICOM or NIfTI volume. It lands in B2 under its own study
          prefix, PHI is stripped from DICOM, and axial previews are rendered on
          ingest. Run segmentation afterwards from the study page.
        </p>
      </div>
      <div className="animate-fade-in-up stagger-2 max-w-3xl">
        <StudyCreateForm />
      </div>
    </div>
  );
}
