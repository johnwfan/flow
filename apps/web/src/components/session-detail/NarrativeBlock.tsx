import { Card } from "@/components/ui/Card";

export function NarrativeBlock({ narrative }: { narrative: string | null }) {
  if (!narrative) return null;

  return (
    <Card className="bg-accent-soft/40">
      <p className="font-serif text-lg leading-relaxed text-ink">{narrative}</p>
    </Card>
  );
}
