import { describe, expect, it } from "vitest";
import { fitWithin, shrinkPhoto, UPLOAD_MAX_EDGE } from "./shrink-photo";

describe("fitWithin", () => {
  it("scales the long edge down to the limit", () => {
    expect(fitWithin(4000, 3000)).toEqual({ width: UPLOAD_MAX_EDGE, height: 1500 });
    expect(fitWithin(3000, 6000)).toEqual({ width: 1000, height: UPLOAD_MAX_EDGE });
  });
  it("never scales up", () => {
    expect(fitWithin(800, 600)).toEqual({ width: 800, height: 600 });
  });
});

describe("shrinkPhoto", () => {
  it("returns the original when the browser can't decode it", async () => {
    const file = new File(["not really a photo"], "a.jpg", { type: "image/jpeg" });
    expect(await shrinkPhoto(file)).toBe(file);
  });
});
