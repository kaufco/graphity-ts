import { format } from "node:util";
import { vi } from "vitest";

/**
 * Returns the lines that `action` prints with `console.log`, as Node.js prints them, which the
 * examples print to as Java's print to a `PrintStream`.
 */
export async function printedBy(action: () => unknown): Promise<string[]> {
  const lines: string[] = [];
  const log = vi.spyOn(console, "log").mockImplementation((...values: unknown[]) => {
    lines.push(format(...values));
  });
  try {
    await action();
  } finally {
    log.mockRestore();
  }
  return lines;
}
