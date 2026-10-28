import { act, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: { apiBaseUrl: "http://api.test" } }));

import {
  CHECK_EVERY_MS,
  GIVE_UP_AFTER_MS,
  resetAutoRetryForTests,
  useServerWake,
} from "./use-server-wake";

let ready = false;
const fetchMock = vi.fn(async () => {
  if (!ready) throw new TypeError("network");
  return new Response('{"status":"ok"}', { status: 200 });
});

beforeEach(() => {
  vi.useFakeTimers();
  ready = false;
  fetchMock.mockClear();
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(document, "visibilityState", "get").mockReturnValue("visible");
  resetAutoRetryForTests();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const tick = (ms: number) => act(() => vi.advanceTimersByTimeAsync(ms));

test("checks the ready endpoint and retries once the server answers", async () => {
  const retry = vi.fn();
  const { result } = renderHook(() => useServerWake(retry));
  await tick(0);
  expect(fetchMock).toHaveBeenCalledWith("http://api.test/api/v1/health/ready", expect.anything());
  expect(retry).not.toHaveBeenCalled();
  expect(result.current).toBe("waking");

  ready = true;
  await tick(CHECK_EVERY_MS);
  expect(retry).toHaveBeenCalledOnce();
});

test("gives up when the server stays down", async () => {
  const retry = vi.fn();
  const { result } = renderHook(() => useServerWake(retry));
  await tick(GIVE_UP_AFTER_MS + CHECK_EVERY_MS);
  expect(retry).not.toHaveBeenCalled();
  expect(result.current).toBe("failed");
  const calls = fetchMock.mock.calls.length;
  await tick(CHECK_EVERY_MS * 3);
  expect(fetchMock.mock.calls.length).toBe(calls); // stopped checking
});

test("does not loop when the page fails again right after a retry", async () => {
  ready = true;
  const first = vi.fn();
  renderHook(() => useServerWake(first));
  await tick(0);
  expect(first).toHaveBeenCalledOnce();

  // The retried page failed again, so a new error screen mounts.
  const second = vi.fn();
  const { result } = renderHook(() => useServerWake(second));
  await tick(0);
  expect(second).not.toHaveBeenCalled();
  expect(result.current).toBe("failed");
});
