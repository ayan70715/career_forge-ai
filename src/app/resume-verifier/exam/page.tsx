import { Suspense } from "react";
import ExamClient from "./ExamClient";

export const dynamic = "force-dynamic";

function ExamFallback() {
  return (
    <div className="max-w-4xl mx-auto py-12">
      <div className="rounded-xl border border-glass-border/80 bg-surface-1/95 p-8 text-sm text-muted-foreground">
        Loading exam session...
      </div>
    </div>
  );
}

export default function ResumeVerifierExamPage() {
  return (
    <Suspense fallback={<ExamFallback />}>
      <ExamClient />
    </Suspense>
  );
}
