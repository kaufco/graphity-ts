import { Components } from "@kobayami/graphity";
import { SmallProgram } from "../smallProgram.js";

/** The build order, and a comparison of two packages in it. */
export interface Order {
  readonly buildOrder: string[][];
  readonly jsonBeforeUi: boolean;
}

/**
 * The packages in an order in which each comes after the packages it uses, despite a
 * cycle.
 */
export const OrderingDespiteCycles = {
  /** Returns the packages grouped by SCC, in the order of the SCC IDs. */
  buildOrder(): Order {
    const dependencies = SmallProgram.dependencies();
    const names = SmallProgram.packageNames();
    const json = SmallProgram.nodeOf(names, "json");
    const ui = SmallProgram.nodeOf(names, "ui");
    // @start region="buildOrder"
    // model and storage use each other.
    const sccs = Components.sccsOf(dependencies);

    // The SCCs in the order of their IDs: each after the SCCs it uses.
    const buildOrder: string[][] = [];
    for (let scc = 0; scc < sccs.sccCount; scc++) {
      buildOrder.push(Array.from(sccs.nodesOf(scc), (p) => names[p]));
    }
    // buildOrder: [[util], [cli], [json], [model, storage], [service], [ui], [app]]

    // Which of two packages comes first? Compare their SCC IDs.
    const jsonBeforeUi = sccs.sccOf(json) < sccs.sccOf(ui);   // true
    // @end
    return { buildOrder, jsonBeforeUi };
  },
} as const;
