import { describe, expect, it } from "vitest";
import { DataOnNodesAndEdges } from "../src/dataOnNodesAndEdges.js";
import { SmallProgram } from "../src/smallProgram.js";
import { edgesByName } from "./testutils/edges.js";

const DATA = DataOnNodesAndEdges.callData();

describe("DataOnNodesAndEdgesTest", () => {
  it("methodsHoldTheNameAndThePackageOfEachMethodByNodeId", () => {
    const packageNames = SmallProgram.packageNames();
    const packageOf = SmallProgram.packageOf();
    expect(DATA.names).toEqual(SmallProgram.methodNames());
    expect(DATA.packages).toHaveLength(packageOf.length);
    for (let node = 0; node < packageOf.length; node++) {
      expect(DATA.packages[node], DATA.names[node]).toBe(packageNames[packageOf[node]]);
    }
  });

  it("siteCountIsTwoForRunToShowAndParseToParse", () => {
    const calls = SmallProgram.calls();
    const names = SmallProgram.methodNames();
    expect(DATA.siteCount).toHaveLength(calls.edgeCount);
    calls.forEachEdge((caller, callee, edge) => {
      const call = `${names[caller]} -> ${names[callee]}`;
      const expected = call === "run -> show" || call === "parse -> parse" ? 2 : 1;
      expect(DATA.siteCount[edge], call).toBe(expected);
    });
  });

  it("theSubgraphOfLoadTakesTheMethodsAndTheCallSitesAlong", () => {
    const loading = DATA.loading;
    const names = DATA.loadingNames;
    expect(names).toEqual(["load", "parse", "read"]);
    expect(edgesByName(loading, names)).toEqual(["load -> parse", "load -> read", "parse -> parse"]);
    expect(DATA.loadingSiteCount).toHaveLength(loading.edgeCount);
    const counted: string[] = [];
    loading.forEachEdge((caller, callee, edge) =>
      counted.push(`${names[caller]} -> ${names[callee]}: ${DATA.loadingSiteCount[edge]}`),
    );
    expect(counted.sort()).toEqual(["load -> parse: 1", "load -> read: 1", "parse -> parse: 2"]);
  });
});
