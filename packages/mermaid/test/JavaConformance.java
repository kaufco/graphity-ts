import com.kobayami.graphity.Graph;
import com.kobayami.graphity.GraphBuilder;
import com.kobayami.graphity.NodePartition;
import com.kobayami.graphity.mermaid.MermaidWriter;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.List;
import java.util.Random;
import java.util.function.Supplier;

/**
 * Prints the digest that {@code javaConformance.test.ts} pins: the SHA-256 of the Mermaid text of
 * 3000 random graphs and configurations, drawn by the same generator with the same calls in the
 * same order as the test. It draws the same values as the generator of the DOT package, the DOT
 * attributes included, so that both write the same graphs. Not part of the build; run it with
 * Java 17 or newer against the released jars of Graphity 3.0.0 and their dependencies, from Maven
 * Central:
 *
 * <pre>
 * CP=graphity-core-3.0.0.jar:graphity-mermaid-3.0.0.jar:fastutil-8.5.17.jar:jspecify-1.0.0.jar
 * java -cp $CP packages/mermaid/test/JavaConformance.java
 * </pre>
 */
public class JavaConformance {

  static final String[] FRAGMENTS = {
    "a", "Z", "\"", "\\", "\n", "\r", "\r\n", "&", "&amp;", "\u0000", "#", "%", "%%", ":", ";",
    "<", ">", "`", "direction", "Direction", " ", "\t", "\u3000", "\u00a0", "\ufeff", "\u001c",
    "\u0085", "\u2007", "\uD83D\uDE00", "{", "}", "[", "|", "'"
  };
  static final String[] GRAPH_ATTRIBUTES = {"label", "rankdir", "URL", "xlabel", "Label", "fontname"};
  static final String[] ATTRIBUTES = {
    "label", "shape", "xlabel", "headlabel", "taillabel", "color", "URL", "tooltip", "LABEL"
  };
  static final String[] CLASSES = {"hot", "End", "_x1", "STYLE", "c"};
  static final String[] STYLES = {"fill:#f96", "stroke:red,stroke-width:2px", "color:blue", "\u00a0x"};
  static final MermaidWriter.Shape[] SHAPES = MermaidWriter.Shape.values();
  static final MermaidWriter.Direction[] DIRECTIONS = MermaidWriter.Direction.values();

  record Attributes(List<String[]> entries, boolean removeLabel) {}

  static String text(Random r) {
    var text = new StringBuilder();
    for (int i = 0, k = r.nextInt(5); i < k; i++) {
      text.append(FRAGMENTS[r.nextInt(FRAGMENTS.length)]);
    }
    return text.toString();
  }

  static String nullableText(Random r) {
    return r.nextInt(4) == 0 ? null : text(r);
  }

  static Attributes attributes(Random r) {
    List<String[]> entries = new ArrayList<>();
    for (int i = 0, k = r.nextInt(3); i < k; i++) {
      String name = ATTRIBUTES[r.nextInt(ATTRIBUTES.length)];
      entries.add(new String[] {name, text(r)});
    }
    return new Attributes(entries, r.nextInt(5) == 0);
  }

  /** A value per ID, or {@code null} for no hook, with a coin flip first. */
  static <T> List<T> maybe(Random r, int count, Supplier<T> draw) {
    if (!r.nextBoolean()) return null;
    List<T> values = new ArrayList<>();
    for (int i = 0; i < count; i++) values.add(draw.get());
    return values;
  }

  static String writeCase(int seed) {
    var r = new Random(seed);
    int n = r.nextInt(10);
    var builder = new GraphBuilder();
    builder.addNodes(n);
    for (int i = 0, m = n == 0 ? 0 : r.nextInt(3 * n + 1); i < m; i++) {
      int source = r.nextInt(n);
      builder.addEdge(source, r.nextInt(n));
    }
    Graph graph = builder.build();
    int e = graph.edgeCount();
    boolean undirected = r.nextBoolean();
    List<Boolean> include = maybe(r, n, () -> r.nextInt(4) != 0);
    NodePartition partition = null;
    List<String> clusterLabels = new ArrayList<>();
    if (r.nextBoolean()) {
      int groupCount = r.nextInt(4) + 1;
      int[] groupOf = new int[n];
      for (int v = 0; v < n; v++) groupOf[v] = r.nextInt(groupCount + 1) - 1;
      for (int c = 0; c < groupCount; c++) clusterLabels.add(nullableText(r));
      partition = NodePartition.of(graph, groupOf, groupCount);
    }
    List<String> nodeLabels = maybe(r, n, () -> nullableText(r));
    List<String> edgeLabels = maybe(r, e, () -> nullableText(r));
    // The DOT attributes, drawn as by the generator of the DOT package and not written here.
    for (int i = 0, k = r.nextInt(3); i < k; i++) {
      r.nextInt(GRAPH_ATTRIBUTES.length);
      text(r);
    }
    maybe(r, n, () -> attributes(r));
    maybe(r, e, () -> attributes(r));
    var direction = DIRECTIONS[r.nextInt(4)];
    List<MermaidWriter.Shape> shapes = maybe(r, n, () -> {
      int shape = r.nextInt(11);
      return shape < 9 ? SHAPES[shape] : null;
    });
    List<String[]> classDefs = new ArrayList<>();
    for (int i = 0, k = r.nextInt(3); i < k; i++) {
      String name = CLASSES[r.nextInt(CLASSES.length)];
      classDefs.add(new String[] {name, STYLES[r.nextInt(STYLES.length)]});
    }
    List<String> nodeClasses =
        maybe(r, n, () -> r.nextInt(3) == 0 ? null : CLASSES[r.nextInt(CLASSES.length)]);
    List<String> edgeStyles =
        maybe(r, e, () -> r.nextInt(3) == 0 ? null : STYLES[r.nextInt(STYLES.length)]);

    var mermaid = MermaidWriter.of(graph);
    if (undirected) mermaid.undirected();
    if (include != null) mermaid.nodeFilter(include::get);
    if (partition != null) mermaid.clusters(partition, clusterLabels::get);
    if (nodeLabels != null) mermaid.nodeLabel(nodeLabels::get);
    if (edgeLabels != null) mermaid.edgeLabel(edgeLabels::get);
    mermaid.direction(direction);
    if (shapes != null) mermaid.nodeShape(shapes::get);
    for (String[] entry : classDefs) mermaid.classDef(entry[0], entry[1]);
    if (nodeClasses != null) mermaid.nodeClass(nodeClasses::get);
    if (edgeStyles != null) mermaid.edgeStyle(edgeStyles::get);
    return "=== " + seed + "\n" + mermaid.writeToString();
  }

  public static void main(String[] args) throws Exception {
    var digest = MessageDigest.getInstance("SHA-256");
    for (int seed = 0; seed < 3000; seed++) {
      digest.update(writeCase(seed).getBytes(StandardCharsets.UTF_8));
    }
    System.out.println(HexFormat.of().formatHex(digest.digest()));
  }
}
