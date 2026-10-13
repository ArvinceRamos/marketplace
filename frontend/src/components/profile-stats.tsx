import type { PublicProfile } from "@/lib/catalog-types";

export function formatMonth(iso: string) {
  return new Date(iso).toLocaleDateString("en-PH", { month: "short", year: "numeric", timeZone: "Asia/Manila" });
}

/** At-a-glance strip: rating, items sold, followers, joined. */
export function ProfileStats({ profile }: { profile: PublicProfile }) {
  const rated = profile.rating_count > 0 && profile.rating_average !== null;
  const stats = [
    {
      value: rated ? profile.rating_average!.toFixed(1) : "—",
      star: rated,
      label: rated ? `${profile.rating_count} review${profile.rating_count === 1 ? "" : "s"}` : "No reviews",
    },
    { value: profile.sold_count.toLocaleString("en-PH"), label: "Items sold" },
    { value: profile.follower_count.toLocaleString("en-PH"), label: profile.follower_count === 1 ? "Follower" : "Followers" },
    { value: formatMonth(profile.joined_at), label: "Joined" },
  ];
  return (
    <dl className="grid max-w-2xl grid-cols-4 divide-x divide-border rounded-md border border-border">
      {stats.map((s) => (
        <div key={s.label} className="flex flex-col-reverse items-center gap-0.5 px-1 py-3 text-center sm:px-2">
          <dt className="text-caption text-fg-muted">{s.label}</dt>
          <dd className="text-title font-semibold whitespace-nowrap" data-numeric>
            {s.value}
            {s.star && (
              <span aria-hidden className="text-small text-star">
                {" "}
                ★
              </span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}
