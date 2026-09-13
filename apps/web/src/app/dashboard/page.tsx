import { getSessions } from "@/lib/api";
import { PageHeader } from "@/components/layout/PageHeader";
import { SessionList } from "@/components/dashboard/SessionList";

export default async function DashboardPage() {
  const sessions = await getSessions();

  return (
    <>
      <PageHeader title="Sessions" subtitle="Your focus history, newest first." />
      <SessionList sessions={sessions} />
    </>
  );
}
