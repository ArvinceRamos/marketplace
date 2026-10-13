import { renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { usePolling } from "./use-polling";

let visibility: DocumentVisibilityState = "visible";

beforeEach(() => {
  vi.useFakeTimers();
  visibility = "visible";
  vi.spyOn(document, "visibilityState", "get").mockImplementation(() => visibility);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function setVisible(next: DocumentVisibilityState) {
  visibility = next;
  document.dispatchEvent(new Event("visibilitychange"));
}

test("polls at once, then every interval", () => {
  const task = vi.fn();
  renderHook(() => usePolling(task, 1000));
  vi.advanceTimersByTime(0);
  expect(task).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(3000);
  expect(task).toHaveBeenCalledTimes(4);
});

test("quick tab switches do not cause extra requests", () => {
  const task = vi.fn();
  renderHook(() => usePolling(task, 1000));
  vi.advanceTimersByTime(0);
  for (let i = 0; i < 5; i++) {
    setVisible("hidden");
    setVisible("visible");
  }
  vi.advanceTimersByTime(999);
  expect(task).toHaveBeenCalledTimes(1);
  vi.advanceTimersByTime(1);
  expect(task).toHaveBeenCalledTimes(2);
});

test("hidden tabs and unmounted pages stop polling", () => {
  const task = vi.fn();
  const { unmount } = renderHook(() => usePolling(task, 1000));
  vi.advanceTimersByTime(0);
  setVisible("hidden");
  vi.advanceTimersByTime(5000);
  expect(task).toHaveBeenCalledTimes(1);
  setVisible("visible"); // a full interval has passed: poll now
  vi.advanceTimersByTime(0);
  expect(task).toHaveBeenCalledTimes(2);
  unmount();
  vi.advanceTimersByTime(5000);
  expect(task).toHaveBeenCalledTimes(2);
});

test("does nothing while disabled", () => {
  const task = vi.fn();
  renderHook(() => usePolling(task, 1000, false));
  vi.advanceTimersByTime(5000);
  expect(task).not.toHaveBeenCalled();
});
