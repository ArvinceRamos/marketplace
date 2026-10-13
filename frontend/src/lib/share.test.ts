import { afterEach, expect, test, vi } from "vitest";
import { shareLink } from "./share";

afterEach(() => vi.unstubAllGlobals());

test("uses the share sheet when there is one", async () => {
  const share = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { share, clipboard: { writeText: vi.fn() } });
  expect(await shareLink("https://x.test/listing/1", "Phone")).toBe("shared");
  expect(share).toHaveBeenCalledWith({ url: "https://x.test/listing/1", title: "Phone" });
});

test("copies the link otherwise", async () => {
  const writeText = vi.fn().mockResolvedValue(undefined);
  vi.stubGlobal("navigator", { clipboard: { writeText } });
  expect(await shareLink("https://x.test/a", "A")).toBe("copied");
  expect(writeText).toHaveBeenCalledWith("https://x.test/a");
});

test("reports failure when neither works", async () => {
  vi.stubGlobal("navigator", { clipboard: { writeText: vi.fn().mockRejectedValue(new Error("no")) } });
  expect(await shareLink("https://x.test/a", "A")).toBe("failed");
});
