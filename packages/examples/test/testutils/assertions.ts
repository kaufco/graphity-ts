import { expect } from "vitest";

/**
 * Expects `action` to throw a plain `Error`, the counterpart of Java's `IllegalArgumentException`:
 * neither a `RangeError` nor a `TypeError`.
 */
export function expectArgumentError(action: () => unknown, message?: string | RegExp): void {
  let thrown: unknown;
  try {
    action();
  } catch (e) {
    thrown = e;
  }
  expect(thrown).toBeInstanceOf(Error);
  expect((thrown as Error).constructor).toBe(Error);
  if (message !== undefined) expect((thrown as Error).message).toMatch(message);
}
