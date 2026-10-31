// The first program of the README: the dependencies between packages, and a cycle in
// them. A module that runs when it is loaded, as a script does.
import { GraphBuilder, Graphs } from "@kobayami/graphity";

// @start region="program"
// @start region="firstResult"
// The packages are the nodes 0..7, and uses[p] lists the packages that package p uses.
const names = ["app", "cli", "ui", "service", "model", "storage", "json", "util"];
const uses = [[1, 2, 3], [7], [3, 4, 7], [4, 5], [5], [4, 6, 7], [7], []];

// Build the graph: an edge p -> q for every package q that p uses.
const builder = new GraphBuilder();
builder.addNodes(uses.length);
for (let pkg = 0; pkg < uses.length; pkg++) {
  builder.addOutEdges(pkg, uses[pkg]);
}
const dependencies = builder.build();

// Find a cycle.
const cycle = Graphs.findCycle(dependencies);
// cycle: [4, 5] - model and storage use each other
// @end region="firstResult"

// Print the cycle with the names of its packages.
console.log(Array.from(cycle, (pkg) => names[pkg]));
// [ 'model', 'storage' ]
// @end region="program"
