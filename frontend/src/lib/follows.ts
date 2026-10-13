// Following sellers (docs/API_SPECIFICATION.md "Follows").
import type { Person } from "@/lib/social";

export type FollowedSeller = Person & { followed_at: string };

export const followPath = (username: string) => `/users/${encodeURIComponent(username)}/follow`;

export function followerText(count: number): string {
  return count === 1 ? "1 follower" : `${count.toLocaleString("en-PH")} followers`;
}
