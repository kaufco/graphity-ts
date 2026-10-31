import { describe, expect, it } from "vitest";
import { SmallProgram } from "../src/smallProgram.js";
import { Transposing } from "../src/transposing.js";
import { namesOf } from "./testutils/names.js";

describe("TransposingTest", () => {
  it("transposedReachesTheDependentsOfModel", () => {
    expect(SmallProgram.packageNames()[4]).toBe("model");
    expect(Transposing.affectedByModel().toString()).toBe("[0, 2, 3, 4, 5]");
    expect(namesOf(Transposing.affectedByModel(), SmallProgram.packageNames())).toEqual([
      "app",
      "ui",
      "service",
      "model",
      "storage",
    ]);
  });
});
