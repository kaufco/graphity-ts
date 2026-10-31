import com.kobayami.graphity.BiAdjacentGraph;
import com.kobayami.graphity.Dominators;
import com.kobayami.graphity.Graph;
import com.kobayami.graphity.controlflow.ControlFlow;
import com.kobayami.graphity.controlflow.IteratedDominanceFrontier;
import com.kobayami.graphity.controlflow.Loops;
import com.kobayami.graphity.testutils.ControlFlowGraphs;
import com.kobayami.graphity.testutils.RandomGraphs;
import it.unimi.dsi.fastutil.ints.IntArrayList;
import it.unimi.dsi.fastutil.ints.IntList;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Random;

/**
 * Prints the values that {@code forestIsJavas} ({@code loopsFuzz.test.ts}) and
 * {@code frontiersAreJavas} ({@code controlFlowFuzz.test.ts},
 * {@code iteratedDominanceFrontierFuzz.test.ts}) pin: the length and {@code String.hashCode} of the
 * text dump of the loop forests, dominance frontiers and iterated dominance frontiers that
 * {@code javaDumps.ts} produces on the same graphs, in the format described there. Given a
 * directory, it also writes the three texts into it ({@code loops.java.txt}, {@code df.java.txt},
 * {@code idf.java.txt}), for a diff against the text a {@code JavaStringHash} with
 * {@code keepText} collects.
 * Not part of the build. It needs the test utilities of the Java library, which are not
 * released, so it runs against the sources: from the root of a checkout of
 * https://github.com/kaufco/graphity at the tag 3.0.0, with fastutil 8.5.17 and JSpecify 1.0.0
 * from Maven Central, and JAVA_DUMPS the path of this file:
 *
 * <pre>
 * CP=fastutil-8.5.17.jar:jspecify-1.0.0.jar
 * T=graphity-core/src/testutils/java/com/kobayami/graphity/testutils
 * javac -d /tmp/graphity-classes -cp $CP \
 *     $(find graphity-core/src/main/java graphity-controlflow/src/main/java -name '*.java') \
 *     $T/RandomGraphs.java $T/ControlFlowGraphs.java
 * java -cp /tmp/graphity-classes:$CP $JAVA_DUMPS [dir]
 * </pre>
 */
public class JavaDumps {

  static String join(IntList list) {
    var sb = new StringBuilder();
    for (int i = 0; i < list.size(); i++) {
      if (i > 0) sb.append(',');
      sb.append(list.getInt(i));
    }
    return sb.toString();
  }

  static void loops(StringBuilder sb, String label, Graph graph, IntList entries) {
    var loops = Loops.of(BiAdjacentGraph.of(graph), entries);
    int n = graph.nodeCount();
    sb.append(label).append(" n=").append(n).append(" loops=").append(loops.loopCount())
        .append(" reducible=").append(loops.isReducible()).append('\n');
    for (int l = 0; l < loops.loopCount(); l++) {
      sb.append('L').append(l).append(" h=").append(loops.headerOf(l)).append(" p=")
          .append(loops.parentOf(l)).append(" body=").append(join(loops.bodyOf(l)))
          .append(" entries=").append(join(loops.entriesOf(l))).append('\n');
    }
    sb.append("inner=");
    for (int x = 0; x < n; x++) sb.append(x > 0 ? "," : "").append(loops.innermostLoopOf(x));
    sb.append(" depth=");
    for (int x = 0; x < n; x++) sb.append(x > 0 ? "," : "").append(loops.loopDepthOf(x));
    sb.append('\n');
  }

  static void frontiers(StringBuilder sb, String label, Graph graph, IntList entries) {
    var df = ControlFlow.dominanceFrontiers(Dominators.of(BiAdjacentGraph.of(graph), entries));
    sb.append(label).append(" edges=").append(df.edgeCount()).append('\n');
    for (int x = 0; x < df.nodeCount(); x++) {
      if (df.outDegree(x) > 0) sb.append(x).append(':').append(join(df.outNodes(x))).append('\n');
    }
  }

  static void idf(StringBuilder sb, String label, Graph graph, IntList entries, long querySeed,
      int queries, int maxNodes) {
    int n = graph.nodeCount();
    var idf = IteratedDominanceFrontier.of(Dominators.of(BiAdjacentGraph.of(graph), entries));
    var rnd = new Random(querySeed);
    for (int q = 0; q < queries; q++) {
      var nodes = new IntArrayList();
      int count = 1 + rnd.nextInt(Math.min(maxNodes, n));
      for (int i = 0; i < count; i++) nodes.add(rnd.nextInt(n));
      sb.append(label).append(" q=").append(q).append(" nodes=").append(join(nodes))
          .append(" idf=").append(join(idf.frontierOf(nodes))).append('\n');
    }
  }

  /** The loop forests of the {@code LoopsFuzzTest} graphs (seeds 0..149) and nine larger ones. */
  static String loopsDump() {
    var sb = new StringBuilder();
    for (long seed = 0; seed < 150; seed++) {
      Graph graph;
      IntList entries;
      if (seed % 3 != 2) {
        graph = ControlFlowGraphs.anyControlFlowGraph(seed).graph();
        entries = IntList.of(0);
      } else {
        graph = RandomGraphs.anyGraph(seed).graph();
        var rnd = new Random(seed);
        var list = new IntArrayList();
        for (int i = 0, c = 1 + rnd.nextInt(3); i < c; i++) {
          list.add(rnd.nextInt(graph.nodeCount()));
        }
        entries = list;
      }
      loops(sb, "seed=" + seed, graph, entries);
    }
    for (long s = 0; s < 4; s++) {
      loops(sb, "irreducible(5000,400," + s + ")", ControlFlowGraphs.irreducible(5000, 400, s),
          IntList.of(0));
      loops(sb, "gnm(3000,6000," + s + ")", RandomGraphs.gnm(3000, 6000, s), IntList.of(0, 5, 17));
    }
    loops(sb, "structured(20000,7)", ControlFlowGraphs.structured(20000, 7), IntList.of(0));
    return sb.toString();
  }

  /** The frontiers of the {@code ControlFlowFuzzTest} graphs (seeds 0..119) and two larger ones. */
  static String frontiersDump() {
    var sb = new StringBuilder();
    for (long seed = 0; seed < 120; seed++) {
      Graph graph;
      IntList entries;
      if (seed % 2 == 0) {
        graph = ControlFlowGraphs.anyControlFlowGraph(seed).graph();
        entries = IntList.of(0);
      } else {
        graph = RandomGraphs.anyGraph(seed).graph();
        int n = graph.nodeCount();
        var rnd = new Random(seed * 17 + 5);
        var list = new IntArrayList();
        int count = rnd.nextInt(10) == 0 ? 0 : 1 + rnd.nextInt(3);
        for (int i = 0; i < count; i++) list.add(rnd.nextInt(n));
        entries = list;
      }
      frontiers(sb, "seed=" + seed, graph, entries);
    }
    for (long s = 0; s < 2; s++) {
      frontiers(sb, "irreducible(3000,300," + s + ")", ControlFlowGraphs.irreducible(3000, 300, s),
          IntList.of(0));
    }
    return sb.toString();
  }

  /**
   * The {@code IteratedDominanceFrontierFuzzTest} queries (seeds 0..99) and 50 queries each on two
   * larger graphs.
   */
  static String idfDump() {
    var sb = new StringBuilder();
    for (long seed = 0; seed < 100; seed++) {
      Graph graph;
      IntList entries;
      if (seed % 2 == 0) {
        graph = ControlFlowGraphs.anyControlFlowGraph(seed).graph();
        entries = IntList.of(0);
      } else {
        graph = RandomGraphs.anyGraph(seed).graph();
        var r = new Random(seed);
        entries = IntList.of(r.nextInt(graph.nodeCount()), r.nextInt(graph.nodeCount()));
      }
      idf(sb, "seed=" + seed, graph, entries, seed * 13 + 7, 20, 8);
    }
    for (long s = 0; s < 2; s++) {
      idf(sb, "irreducible(5000,400," + s + ")", ControlFlowGraphs.irreducible(5000, 400, s),
          IntList.of(0), 99 + s, 50, 20);
    }
    return sb.toString();
  }

  public static void main(String[] args) throws Exception {
    String loops = loopsDump();
    String df = frontiersDump();
    String idf = idfDump();
    System.out.println("loops length=" + loops.length() + " hash=" + loops.hashCode());
    System.out.println("df length=" + df.length() + " hash=" + df.hashCode());
    System.out.println("idf length=" + idf.length() + " hash=" + idf.hashCode());
    if (args.length > 0) {
      Path dir = Path.of(args[0]);
      Files.writeString(dir.resolve("loops.java.txt"), loops);
      Files.writeString(dir.resolve("df.java.txt"), df);
      Files.writeString(dir.resolve("idf.java.txt"), idf);
    }
  }
}
