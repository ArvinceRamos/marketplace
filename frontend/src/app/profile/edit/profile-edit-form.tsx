"use client";

import { useRouter } from "next/navigation";
import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from "react";
import { Avatar } from "@/components/catalog/avatar";
import { Button, ButtonLink } from "@/components/ui/button";
import { FormAlert, SelectField, TextArea, TextField } from "@/components/ui/field";
import { LoadError } from "@/components/ui/load-error";
import { ApiError, apiFetch } from "@/lib/api";
import type { Location } from "@/lib/catalog-types";
import type { Me } from "@/lib/profile";
import { checkPhoto, PHOTO_ACCEPT } from "@/lib/selling";
import { shrinkPhoto } from "@/lib/shrink-photo";
import { forgetMe } from "@/lib/use-me";

type FieldName = "username" | "display_name" | "bio" | "city_id";
type Fields = Partial<Record<FieldName, string>>;

// Friendly text per field; the API's validation wording is for developers.
const FIELD_MESSAGES: Record<FieldName, string> = {
  username: "Use 3–30 lowercase letters, numbers, dots, or underscores.",
  display_name: "Use 1–50 characters.",
  bio: "Use up to 500 characters.",
  city_id: "Choose a city from the list.",
};

function friendlyFields(apiFields: Record<string, string>): Fields {
  const out: Fields = {};
  for (const name of Object.keys(FIELD_MESSAGES) as FieldName[]) {
    if (apiFields[name]) out[name] = FIELD_MESSAGES[name];
  }
  return out;
}

const errorText = (e: unknown, fallback: string) => (e instanceof ApiError ? e.message : fallback);

export function ProfileEditForm() {
  const [me, setMe] = useState<Me | null>(null);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  // Runs again when this page becomes visible after navigating away.
  useEffect(() => {
    let active = true;
    Promise.all([apiFetch<Me>("/me"), apiFetch<Location[]>("/locations")])
      .then(([data, places]) => {
        if (!active) return;
        setMe(data);
        setLocations(places);
      })
      .catch((e: unknown) => active && setLoadError(errorText(e, "Could not load your profile.")));
    return () => {
      active = false;
    };
  }, [attempt]);

  // Pages stay mounted (hidden) after navigation. Reset when hidden, so account data
  // isn't kept after logging out.
  useLayoutEffect(
    () => () => {
      setMe(null);
      setLoadError(null);
    },
    [],
  );

  if (!me) {
    if (!loadError) return <p aria-busy="true">Loading…</p>;
    return (
      <LoadError
        message={loadError}
        onRetry={() => {
          setLoadError(null);
          setAttempt((n) => n + 1);
        }}
      />
    );
  }
  // Keyed by user, so the form starts fresh from the loaded profile.
  return <EditForm key={me.id} me={me} locations={locations} onAvatar={setMe} />;
}

function EditForm({ me, locations, onAvatar }: { me: Me; locations: Location[]; onAvatar: (me: Me) => void }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(me.display_name ?? "");
  const [username, setUsername] = useState(me.username);
  const [cityId, setCityId] = useState(me.city_id ? String(me.city_id) : "");
  const [bio, setBio] = useState(me.bio ?? "");
  const [fields, setFields] = useState<Fields>({});
  const [alert, setAlert] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const city = locations.find((l) => String(l.id) === cityId);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setFields({});
    setAlert(null);
    try {
      await apiFetch<Me>("/me", {
        method: "PATCH",
        body: JSON.stringify({
          username,
          display_name: displayName.trim() || null,
          bio,
          city_id: cityId ? Number(cityId) : null,
        }),
      });
      forgetMe();
      router.push("/profile");
    } catch (e) {
      if (e instanceof ApiError && e.code === "username_taken") {
        setFields({ username: e.message });
      } else if (e instanceof ApiError && e.fields) {
        setFields(friendlyFields(e.fields));
        setAlert("Please fix the highlighted fields.");
      } else {
        setAlert(errorText(e, "Could not save. Please try again."));
      }
      setPending(false);
    }
  }

  return (
    <div className="grid items-start gap-10 lg:grid-cols-[minmax(0,35rem)_17.5rem]">
      <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
        <div className="flex flex-col gap-1">
          <ButtonLink href="/profile" variant="ghost" size="sm" className="self-start px-0">
            <span aria-hidden>←</span> Your profile
          </ButtonLink>
          <h1 className="text-heading lg:text-display">Edit profile</h1>
        </div>
        <FormAlert message={alert} />

        <AvatarField me={me} onChange={onAvatar} />

        <TextField
          label="Display name"
          name="display_name"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          maxLength={50}
          error={fields.display_name}
        />

        <div className="flex flex-col gap-1">
          <label htmlFor="field-username" className="text-small font-medium text-fg">
            Username
          </label>
          <div className="flex min-h-11 items-stretch overflow-hidden rounded-sm border border-border-strong focus-within:border-accent focus-within:outline-1 focus-within:outline-accent has-[[aria-invalid=true]]:border-danger">
            <span aria-hidden className="grid place-items-center border-r border-border bg-ink-50 px-3 text-body text-fg-muted">
              @
            </span>
            <input
              id="field-username"
              name="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              required
              aria-invalid={fields.username ? true : undefined}
              aria-describedby={fields.username ? "field-username-error" : "field-username-hint"}
              className="min-w-0 flex-1 bg-surface px-3 text-body text-fg outline-none"
            />
          </div>
          {fields.username ? (
            <p id="field-username-error" className="text-caption text-danger">
              {fields.username}
            </p>
          ) : (
            <p id="field-username-hint" className="text-caption text-fg-muted">
              3–30 characters: lowercase letters, numbers, dots, underscores. Your link: /seller/
              {username.trim().toLowerCase() || "…"}
            </p>
          )}
        </div>

        <SelectField
          label="City"
          name="city_id"
          value={cityId}
          onChange={(e) => setCityId(e.target.value)}
          hint="Shown on your profile so buyers know where you meet up."
          error={fields.city_id}
        >
          <option value="">Choose your city</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.city}, {l.province}
            </option>
          ))}
        </SelectField>

        <div className="flex flex-col gap-1">
          <TextArea
            label="Bio"
            name="bio"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            hint="Up to 500 characters. Don't share your phone number or address."
            error={fields.bio}
          />
          <p className="self-end text-caption text-fg-muted" aria-live="polite" data-numeric>
            {bio.length} / 500
          </p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:flex">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <ButtonLink href="/profile" variant="secondary">
            Cancel
          </ButtonLink>
        </div>
      </form>

      {/* Desktop: how buyers will see you. */}
      <aside aria-label="Preview" className="sticky top-[calc(var(--header-height)+1.5rem)] hidden flex-col gap-2 lg:flex">
        <p className="text-caption font-medium text-fg-muted">How buyers see you</p>
        <div className="flex flex-col gap-3 rounded-md border border-border p-4">
          <div className="flex items-center gap-3">
            <Avatar name={displayName || username} url={me.avatar_url} />
            <span className="flex min-w-0 flex-col">
              <span className="truncate text-small font-medium">{displayName.trim() || username}</span>
              <span className="truncate text-caption text-fg-muted">
                {[`@${username.trim().toLowerCase()}`, city?.city].filter(Boolean).join(" · ")}
              </span>
            </span>
          </div>
          {bio.trim() && <p className="text-small whitespace-pre-line">{bio.trim()}</p>}
        </div>
      </aside>
    </div>
  );
}

/** Profile photo: saved right away (its own request), separate from the form's Save. */
function AvatarField({ me, onChange }: { me: Me; onChange: (me: Me) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const name = me.display_name ?? me.username;

  async function upload(file: File) {
    const problem = checkPhoto(file);
    if (problem) {
      setError(problem);
      return;
    }
    setBusy(true);
    setError(null);
    setStatus("Uploading…");
    try {
      const body = new FormData();
      body.append("file", await shrinkPhoto(file));
      onChange(await apiFetch<Me>("/me/avatar", { method: "PUT", body }));
      forgetMe();
      setStatus("Photo saved.");
    } catch (e) {
      setError(errorText(e, "The photo could not be uploaded."));
      setStatus(null);
    } finally {
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  async function remove() {
    setBusy(true);
    setError(null);
    try {
      onChange(await apiFetch<Me>("/me/avatar", { method: "DELETE" }));
      forgetMe();
      setStatus("Photo removed.");
    } catch (e) {
      setError(errorText(e, "Could not remove the photo."));
    } finally {
      setBusy(false);
    }
  }

  return (
    <fieldset id="avatar" className="flex scroll-mt-24 flex-col gap-2">
      <legend className="mb-1 text-small font-medium text-fg">Profile photo</legend>
      <div className="flex flex-wrap items-center gap-3">
        <Avatar name={name} url={me.avatar_url} size={64} />
        <input
          ref={input}
          type="file"
          accept={PHOTO_ACCEPT}
          className="sr-only"
          id="avatar-file"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void upload(file);
          }}
        />
        <Button variant="secondary" disabled={busy} onClick={() => input.current?.click()}>
          {me.avatar_url ? "Change photo" : "Add photo"}
        </Button>
        {me.avatar_url && (
          <Button variant="ghost" disabled={busy} onClick={remove}>
            Remove
          </Button>
        )}
      </div>
      <p className="text-caption text-fg-muted">JPEG, PNG, or WebP, up to 8 MB. Cropped to a square and shown as a circle.</p>
      <p aria-live="polite" className="text-caption text-success">
        {status}
      </p>
      {error && (
        <p role="alert" className="text-caption text-danger">
          {error}
        </p>
      )}
    </fieldset>
  );
}
