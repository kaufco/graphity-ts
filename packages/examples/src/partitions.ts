import {
  type Graph,
  Graphs,
  NodePartition,
  type SortedIntView,
} from "@kobayami/graphity";
import { EdgeData } from "./edgeData.js";
import { SmallProgram } from "./smallProgram.js";

/** Grouping the nodes or the edges of a graph, and the graph between the groups. */
export const Partitions = {
  /** Returns the calls grouped by the package of each method. */
  byPackage(): NodePartition {
    return NodePartition.of(
      SmallProgram.calls(),
      SmallProgram.packageOf(),
      SmallProgram.dependencies().nodeCount,
    );
  },

  /** Returns the calls between packages, condensed from the calls between methods. */
  packageCalls(): Graph {
    const calls = SmallProgram.calls();
    const dependencies = SmallProgram.dependencies();
    const packageOf = SmallProgram.packageOf();
    // @start region="of"
    const byPackage = NodePartition.of(calls, packageOf, dependencies.nodeCount);
    const packageCalls = byPackage.condense();
    // packageCalls: app -> [cli, ui, service], ui -> [model], service -> [model, storage]
    // @end
    return packageCalls;
  },

  /** Returns the calls from methods of `service` to methods of `model`. */
  callsFromServiceToModel(): SortedIntView {
    const byPackage = Partitions.byPackage();
    const packageCalls = byPackage.condense();
    const packageNames = SmallProgram.packageNames();
    const service = SmallProgram.nodeOf(packageNames, "service");
    const model = SmallProgram.nodeOf(packageNames, "model");
    // @start region="edgesOf"
    const byPackageCall = Graphs.edgePartition(packageCalls, byPackage);
    const serviceToModel = packageCalls.edgeIndexOf(service, model);
    const behind = byPackageCall.edgesOf(serviceToModel);
    // behind: [5, 7] - the calls load -> parse and save -> format
    // @end
    return behind;
  },

  /** Returns the number of call sites behind each call between packages. */
  callSitesPerPackageCall(): Int32Array {
    const byPackage = Partitions.byPackage();
    const byPackageCall = Graphs.edgePartition(byPackage.condense(), byPackage);
    const siteCount = EdgeData.callSitesPerEdge();
    // @start region="reduce"
    const packageSiteCount = byPackageCall.reduce(
      siteCount,
      0,
      (sum, count) => sum + count,
    );
    // 2 for app -> ui, app -> service, service -> model and service -> storage,
    // 1 for app -> cli and ui -> model
    // @end
    return packageSiteCount;
  },
} as const;
