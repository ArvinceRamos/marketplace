// Share a page: the phone's share sheet when there is one, otherwise copy the link.

export type ShareResult = "shared" | "copied" | "failed";

export async function shareLink(url: string, title: string): Promise<ShareResult> {
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share({ url, title });
      return "shared";
    } catch (e) {
      // The person closed the sheet: not an error, and no fallback needed.
      if (e instanceof DOMException && e.name === "AbortError") return "shared";
    }
  }
  try {
    await navigator.clipboard.writeText(url);
    return "copied";
  } catch {
    return "failed";
  }
}
