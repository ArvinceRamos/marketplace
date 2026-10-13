import { Suspense } from "react";
import { StatusTabs } from "../status-tabs";
import { DisputesView } from "./disputes-view";

type Props = PageProps<"/admin/disputes">;

const STATUSES = [
  { value: "escalated", label: "Waiting for you" },
  { value: "open", label: "Waiting for seller" },
  { value: "resolved", label: "Resolved" },
];

export default function AdminDisputesPage({ searchParams }: Props) {
  return (
    <Suspense fallback={<p aria-busy="true">Loading…</p>}>
      <Loader searchParams={searchParams} />
    </Suspense>
  );
}

async function Loader({ searchParams }: Pick<Props, "searchParams">) {
  const query = await searchParams;
  const status = STATUSES.find((s) => s.value === query.status)?.value ?? "escalated";
  return (
    <div className="flex flex-col gap-4">
      <StatusTabs base="/admin/disputes" current={status} options={STATUSES} />
      <DisputesView key={status} status={status} />
    </div>
  );
}
