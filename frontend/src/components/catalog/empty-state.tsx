import type { ReactNode } from "react";

export function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body?: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-md border border-dashed border-border-strong px-6 py-12 text-center">
      <h2 className="text-title">{title}</h2>
      {body && <p className="max-w-md text-small text-fg-muted">{body}</p>}
      {action}
    </div>
  );
}
