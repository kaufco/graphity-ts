/** The aggregate package: every export of the four packages, the same objects, and nothing else. */

import * as controlflow from "@kobayami/graphity-controlflow";
import * as core from "@kobayami/graphity-core";
import * as dot from "@kobayami/graphity-dot";
import * as mermaid from "@kobayami/graphity-mermaid";
import { describe, expect, it } from "vitest";
import * as graphity from "../src/index.js";

describe("@kobayami/graphity", () => {
  it("exports what the four packages export, as the same objects", () => {
    const parts: Record<string, unknown>[] = [core, controlflow, dot, mermaid];
    const expected = new Map<string, unknown>();
    for (const part of parts) {
      for (const [name, value] of Object.entries(part)) {
        expect(expected.has(name), name).toBe(false);
        expected.set(name, value);
      }
    }
    expect(Object.keys(graphity).sort()).toEqual([...expected.keys()].sort());
    for (const [name, value] of Object.entries(graphity)) expect(value, name).toBe(expected.get(name));
  });
});
