import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { BreathingBreak } from "@/components/break/BreathingBreak";

export default function BreakPage() {
  return (
    <>
      <PageHeader title="Take a break" subtitle="A guided 2-minute breathing exercise, with voice." />
      <Card>
        <BreathingBreak />
      </Card>
    </>
  );
}
