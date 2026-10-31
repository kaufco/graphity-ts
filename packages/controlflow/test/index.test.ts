/** The public surface of the package: the three types of graphity-controlflow and nothing else. */

import { describe, expect, it } from "vitest";
import * as controlflow from "../src/index.js";

describe("@kobayami/graphity-controlflow", () => {
  it("exports the public types of graphity-controlflow only", () => {
    expect(Object.keys(controlflow).sort()).toEqual(["ControlFlow", "IteratedDominanceFrontier", "Loops"]);
  });
});
