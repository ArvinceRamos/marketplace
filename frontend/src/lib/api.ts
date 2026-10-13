import { env } from "@/lib/env";
import { createClient } from "@/lib/supabase/client";

export type ApiErrorBody = {
  error: { code: string; message: string; fields: Record<string, string> | null };
};

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public fields: Record<string, string> | null = null,
  ) {
    super(message);
  }
}

/**
 * Call the FastAPI backend from the browser. When signed in, the user's access
 * token is sent; the API verifies it and never trusts IDs from the request.
 */
export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data } = await createClient().auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  // FormData (photo uploads) sets its own multipart Content-Type with a boundary.
  if (typeof init.body === "string") headers.set("Content-Type", "application/json");

  let res: Response;
  try {
    res = await fetch(`${env.apiBaseUrl}/api/v1${path}`, { ...init, headers });
  } catch {
    throw new ApiError(
      0,
      "network",
      "Can't reach the server. It may be starting up. Try again in a minute.",
    );
  }
  if (res.status === 204) return undefined as T;
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiError(
      res.status,
      err?.code ?? "error",
      err?.message ?? "Something went wrong. Please try again.",
      err?.fields ?? null,
    );
  }
  return body as T;
}
