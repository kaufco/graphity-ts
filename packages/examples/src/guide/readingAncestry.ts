import { Ancestry, PreorderAncestry } from "@kobayami/graphity";
import { SmallFamily } from "../smallFamily.js";

/** Parents and depths. */
export interface Parents {
  readonly parentOfGreta: number;
  readonly generationOfGreta: number;
  readonly parentOfAda: number;
  readonly generations: Int32Array;
}

/** Lowest common ancestors. */
export interface Common {
  readonly gretaAndIda: number;
  readonly gretaAndEmil: number;
  readonly hugoAndGreta: number;
  readonly doraAndHugo: number;
}

/** Ancestor tests. */
export interface Tests {
  readonly benIsAncestor: boolean;
  readonly cleoIsAncestor: boolean;
  readonly hugoIsAncestor: boolean;
  readonly fastBenIsAncestor: boolean;
}

/** Subtrees. */
export interface Subtrees {
  readonly subtreeOfBen: Int32Array;
  readonly subtreeSizeOfBen: number;
  readonly preorder: Int32Array;
  readonly positionOfCleo: number;
}

/** Parents, generations, ancestors and descendants in the family tree. */
export const ReadingAncestry = {
  /**
   * Returns the parent and generation of Greta, the parent of Ada and every generation.
   */
  parents(): Parents {
    const family = SmallFamily.tree();
    const ada = SmallFamily.personOf("Ada");
    const greta = SmallFamily.personOf("Greta");
    // @start region="parentOf"
    const ancestry = Ancestry.of(family);
    const parent = ancestry.parentOf(greta);      // 3 - Dora
    const generation = ancestry.depthOf(greta);   // 3 - three generations below Ada
    const parentOfAda = ancestry.parentOf(ada);   // -1 - Ada is the root

    // The generation of every person, by node ID.
    const generations = new Int32Array(family.nodeCount);
    for (let person = 0; person < generations.length; person++) {
      generations[person] = ancestry.depthOf(person);
    }
    // generations: [0, 1, 1, 2, 2, 2, 3, 3, 3, 3] - Ada in 0, Greta, Hugo, Ida and
    // Jonas in 3
    // @end
    return {
      parentOfGreta: parent,
      generationOfGreta: generation,
      parentOfAda,
      generations,
    };
  },

  /** Returns the lowest common ancestors of four pairs. */
  common(): Common {
    const family = SmallFamily.tree();
    const dora = SmallFamily.personOf("Dora");
    const emil = SmallFamily.personOf("Emil");
    const greta = SmallFamily.personOf("Greta");
    const hugo = SmallFamily.personOf("Hugo");
    const ida = SmallFamily.personOf("Ida");
    // @start region="lowestCommonAncestor"
    const ancestry = Ancestry.of(family);
    // 0 - Ada
    const commonOfSecondCousins = ancestry.lowestCommonAncestorOf(greta, ida);
    // 1 - Ben
    const commonOfUncleAndNiece = ancestry.lowestCommonAncestorOf(greta, emil);
    // 3 - Dora
    const commonOfSiblings = ancestry.lowestCommonAncestorOf(hugo, greta);
    // 3 - Dora herself
    const commonOfMotherAndSon = ancestry.lowestCommonAncestorOf(dora, hugo);
    // @end
    return {
      gretaAndIda: commonOfSecondCousins,
      gretaAndEmil: commonOfUncleAndNiece,
      hugoAndGreta: commonOfSiblings,
      doraAndHugo: commonOfMotherAndSon,
    };
  },

  /** Returns some ancestor tests, with Ancestry and with PreorderAncestry. */
  tests(): Tests {
    const family = SmallFamily.tree();
    const ben = SmallFamily.personOf("Ben");
    const cleo = SmallFamily.personOf("Cleo");
    const hugo = SmallFamily.personOf("Hugo");
    // @start region="isAncestorOf"
    const ancestry = Ancestry.of(family);
    const benIsAncestor = ancestry.isAncestorOf(ben, hugo);     // true - his grandfather
    const cleoIsAncestor = ancestry.isAncestorOf(cleo, hugo);   // false - his great-aunt
    const hugoIsAncestor = ancestry.isAncestorOf(hugo, hugo);   // true - his own ancestor

    // For many tests, the index with the preorder answers each one in constant time.
    const index = PreorderAncestry.of(ancestry);
    const fastBenIsAncestor = index.isAncestorOf(ben, hugo);   // true
    // @end
    return { benIsAncestor, cleoIsAncestor, hugoIsAncestor, fastBenIsAncestor };
  },

  /** Returns the subtree of Ben and the preorder of the family. */
  subtrees(): Subtrees {
    const family = SmallFamily.tree();
    const ben = SmallFamily.personOf("Ben");
    const cleo = SmallFamily.personOf("Cleo");
    // @start region="subtreeOf"
    const index = PreorderAncestry.of(Ancestry.of(family));
    // [1, 3, 6, 7, 4] - Ben, Dora, Greta, Hugo, Emil
    const subtree = index.subtreeOf(ben);
    const size = index.subtreeSizeOf(ben);   // 5 - Ben included

    // The whole family in preorder, and where Cleo stands in it.
    const order = index.preorder;
    // order: [0, 1, 3, 6, 7, 4, 2, 5, 8, 9] - Ada, then the subtree of Ben, then that of
    // Cleo

    // 6 - after Ada and Ben's subtree
    const positionOfCleo = index.preorderIndexOf(cleo);
    // @end
    return {
      subtreeOfBen: subtree,
      subtreeSizeOfBen: size,
      preorder: order,
      positionOfCleo,
    };
  },
} as const;
