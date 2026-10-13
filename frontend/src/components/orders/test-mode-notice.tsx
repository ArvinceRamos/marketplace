/** Shown on every page that involves money (TRANSACTIONS_DESIGN: test mode only). */
export function TestModeNotice({ className = "" }: { className?: string }) {
  return (
    <p
      className={`rounded-sm border border-warning bg-warning-soft px-3 py-2 text-small text-fg ${className}`}
    >
      <strong className="font-semibold">Test mode — no real money.</strong> Payments, payouts, and
      tracking are simulated. Never enter real card or bank details anywhere on this site.
    </p>
  );
}
