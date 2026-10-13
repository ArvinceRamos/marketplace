import { Suspense } from "react";
import { StatusTabs } from "../status-tabs";
import { ReportsView } from "./reports-view";

type Props = PageProps<"/admin/reports">;

const STATUSES = [
  { value: "open", label: "Open" },
  { value: "reviewing", label: "Reviewing" },
  { value: "actioned", label: "Actioned" },
  { value: "dismissed", label: "Dismissed" },
];

export default function AdminReportsPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<p aria-busy="true">Loading…</p>}>
      <Loader searchParams={searchParams} />
    </Suspense>
  );
}

async function Loader({ searchParams }: Pick<Props, "searchParams">) {
  const query = await searchParams;
  const status = STATUSES.find((s) => s.value === query.status)?.value ?? "open";
  return (
    <div className="flex flex-col gap-4">
      <StatusTabs base="/admin/reports" current={status} options={STATUSES} />
      <ReportsView key={status} status={status} />
    </div>
  );
}
