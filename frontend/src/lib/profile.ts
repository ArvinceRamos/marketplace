export type Me = {
  id: string;
  email: string | null;
  username: string;
  display_name: string | null;
  bio: string | null;
  avatar_path: string | null;
  avatar_url: string | null;
  city_id: number | null;
  age_confirmed: boolean;
  created_at: string;
  /** Restricted by a moderator: can only finish open orders. */
  restricted: boolean;
  /** From the signed token; for showing the Admin link only (the API checks again). */
  is_admin: boolean;
};
