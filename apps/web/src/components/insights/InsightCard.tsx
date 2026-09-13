import type { ReactNode } from "react";
import { Card } from "@/components/ui/Card";

export function InsightCard({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <Card>
      <h3 className="text-base font-semibold text-ink">{title}</h3>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-4">{children}</div>
    </Card>
  );
}
