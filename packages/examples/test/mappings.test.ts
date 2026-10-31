import { describe, expect, it } from "vitest";
import { Mappings } from "../src/mappings.js";
import { printedBy } from "./testutils/console.js";
import { edgesByName } from "./testutils/edges.js";

describe("MappingsTest", () => {
  it("subgraphKeepsTheMethodsThatLoadReachesWithTheirNames", () => {
    const loading = Mappings.loading();
    expect(loading.names).toEqual(["load", "parse", "read"]);
    expect(edgesByName(loading.graph, loading.names)).toEqual(["load -> parse", "load -> read", "parse -> parse"]);
  });

  it("edgeMappingCarriesTheCallSitesOverToTheSubgraph", () => {
    const loading = Mappings.loading();
    const graph = loading.graph;
    const names = loading.names;
    expect(loading.siteCount).toHaveLength(graph.edgeCount);
    const counted: string[] = [];
    graph.forEachEdge((caller, callee, edge) => counted.push(`${names[caller]} -> ${names[callee]}: ${loading.siteCount[edge]}`));
    expect(counted.sort()).toEqual(["load -> parse: 1", "load -> read: 1", "parse -> parse: 2"]);
  });

  it("transposedEdgeMappingPrintsTheCallersOfParseWithTheirCallSites", async () => {
    expect(await printedBy(() => Mappings.callersOfParse())).toEqual(["load: 1", "parse: 2"]);
  });
});
