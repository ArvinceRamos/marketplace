import { COURIER_LABELS } from "@/lib/deal-options";
import { formatDateTime } from "@/lib/format";
import { SHIPMENT_STEPS, type Shipment } from "@/lib/orders";

/** Courier steps with the time each one happened. Simulated (MockCourier). */
export function Tracking({ shipment }: { shipment: Shipment }) {
  const at = new Map(shipment.events.map((e) => [e.status, e.created_at]));
  return (
    <section aria-labelledby="tracking-heading" className="flex flex-col gap-3">
      <div>
        <h2 id="tracking-heading" className="text-title">
          Tracking
        </h2>
        <p className="text-caption text-fg-muted">
          {COURIER_LABELS[shipment.courier]} · Waybill{" "}
          <span className="font-mono">{shipment.tracking_number}</span> (demo, not a real parcel)
        </p>
      </div>
      <ol className="flex flex-col gap-2">
        {SHIPMENT_STEPS.map((step) => {
          const time = at.get(step.status);
          return (
            <li key={step.status} className="flex items-center gap-3 text-small">
              <span
                aria-hidden
                className={`size-3 shrink-0 rounded-full ${time ? "bg-accent" : "border border-border-strong"}`}
              />
              <span className={time ? "font-medium" : "text-fg-muted"}>{step.label}</span>
              {time ? (
                <span className="ml-auto text-caption text-fg-muted">{formatDateTime(time)}</span>
              ) : (
                <span className="sr-only">(not yet)</span>
              )}
            </li>
          );
        })}
      </ol>
    </section>
  );
}
