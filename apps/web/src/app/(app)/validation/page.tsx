import { getInsights } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { ConfusionMatrix } from "@/components/validation/ConfusionMatrix";

export default async function ValidationPage() {
  const insights = await getInsights();

  return (
    <>
      <PageHeader
        title="Validation"
        subtitle="How well the classifier's guesses match what you actually reported."
      />
      <ConfusionMatrix data={insights.validation} />
    </>
  );
}
