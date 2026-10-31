/**
 * Assertions for the error distinction of the port: a `RangeError` stands for Java's
 * `IndexOutOfBoundsException`, a plain `Error` for `IllegalArgumentException`,
 * `IllegalStateException` and the others.
 */

import { expect } from "vitest";

function thrown(action: () => unknown): unknown {
  try {
    action();
  } catch (e) {
    return e;
  }
  throw new Error("expected an error, but none was thrown");
}

/** Expects `action` to throw a `RangeError` (Java: `IndexOutOfBoundsException`). */
export function expectIndexError(action: () => unknown, message?: string | RegExp): void {
  const e = thrown(action);
  expect(e).toBeInstanceOf(RangeError);
  if (message !== undefined) expect((e as Error).message).toMatch(message);
}

/**
 * Expects `action` to throw a plain `Error` (Java: `IllegalArgumentException`,
 * `IllegalStateException`, `NoSuchElementException`, `IOException`) - neither a `RangeError` nor a
 * `TypeError`, which would stand for Java's `NullPointerException` or `ClassCastException`.
 */
export function expectArgumentError(action: () => unknown, message?: string | RegExp): void {
  const e = thrown(action);
  expect(e).toBeInstanceOf(Error);
  expect((e as Error).constructor).toBe(Error);
  if (message !== undefined) expect((e as Error).message).toMatch(message);
}

/** The values of an int list or view as a plain array, for `toEqual`. */
export function ints(values: Iterable<number> | ArrayLike<number>): number[] {
  return Array.from(values as Iterable<number>);
}
