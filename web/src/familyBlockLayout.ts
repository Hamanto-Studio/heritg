export interface FamilyBlockInput {
  key: string;
  memberIds: string[];
  familyKeys: string[];
}

export interface FamilyBlockRowInput {
  generation: number;
  blocks: FamilyBlockInput[];
}

export interface FamilyBlockEdge {
  parentId: string;
  childId: string;
}

interface FamilyBlockMetrics {
  horizontalSpacing: number;
  familyGap: number;
}

interface Score {
  intruders: number;
  crossings: number;
  maximumFamilySpan: number;
  totalFamilySpan: number;
  edgeSpan: number;
}

const MAX_EXACT_ROW_BLOCKS = 32;

const scoreValues = (score: Score) => [
  score.intruders,
  score.crossings,
  score.maximumFamilySpan,
  score.totalFamilySpan,
  score.edgeSpan
];

const compareScores = (left: Score, right: Score) => {
  const leftValues = scoreValues(left);
  const rightValues = scoreValues(right);
  for (let index = 0; index < leftValues.length; index += 1) {
    if (leftValues[index] !== rightValues[index]) return leftValues[index] - rightValues[index];
  }
  return 0;
};

const signature = (rows: readonly FamilyBlockRowInput[]) => rows
  .map((row) => row.blocks.map((block) => `${block.key}:${block.memberIds.join(",")}`).join("|"))
  .join("\n");

const blockRanks = (rows: readonly FamilyBlockRowInput[]) => {
  const result = new Map<string, number>();
  rows.forEach((row) => row.blocks.forEach((block, blockIndex) => {
    block.memberIds.forEach((personId) => result.set(personId, blockIndex));
  }));
  return result;
};

const layoutScore = (
  rows: readonly FamilyBlockRowInput[],
  edges: readonly FamilyBlockEdge[]
): Score => {
  let intruders = 0;
  let maximumFamilySpan = 0;
  let totalFamilySpan = 0;
  for (const row of rows) {
    const families = new Map<string, number[]>();
    row.blocks.forEach((block, blockIndex) => block.familyKeys.forEach((familyKey) => {
      const indices = families.get(familyKey) ?? [];
      indices.push(blockIndex);
      families.set(familyKey, indices);
    }));
    for (const [familyKey, indices] of families) {
      if (indices.length < 2) continue;
      const lower = Math.min(...indices);
      const upper = Math.max(...indices);
      const span = upper - lower;
      maximumFamilySpan = Math.max(maximumFamilySpan, span);
      totalFamilySpan += span;
      for (let index = lower; index <= upper; index += 1) {
        if (!row.blocks[index].familyKeys.includes(familyKey)) intruders += 1;
      }
    }
  }

  const ranks = blockRanks(rows);
  const generations = new Map<string, number>();
  rows.forEach((row) => row.blocks.forEach((block) =>
    block.memberIds.forEach((personId) => generations.set(personId, row.generation))
  ));
  const parentsByChild = new Map<string, string[]>();
  edges.forEach((edge) => {
    const parents = parentsByChild.get(edge.childId) ?? [];
    if (!parents.includes(edge.parentId)) parents.push(edge.parentId);
    parentsByChild.set(edge.childId, parents);
  });
  const familyGroups = new Map<string, { parents: string[]; children: string[] }>();
  parentsByChild.forEach((parents, childId) => {
    const orderedParents = [...parents].sort();
    const key = orderedParents.join("\u001f");
    const group = familyGroups.get(key) ?? { parents: orderedParents, children: [] };
    group.children.push(childId);
    familyGroups.set(key, group);
  });
  const families = [...familyGroups.values()].filter((family) =>
    family.parents.every((personId) => ranks.has(personId)) &&
    family.children.every((personId) => ranks.has(personId))
  ).map((family) => ({
    parentGeneration: generations.get(family.parents[0]),
    childGeneration: generations.get(family.children[0]),
    parentRank: family.parents.reduce((sum, personId) => sum + ranks.get(personId)!, 0) /
      family.parents.length,
    childRank: family.children.reduce((sum, personId) => sum + ranks.get(personId)!, 0) /
      family.children.length
  }));
  let crossings = 0;
  let edgeSpan = 0;
  families.forEach((family, familyIndex) => {
    edgeSpan += Math.abs(family.parentRank - family.childRank);
    for (const other of families.slice(familyIndex + 1)) {
      if (family.parentGeneration !== other.parentGeneration ||
          family.childGeneration !== other.childGeneration) continue;
      const parentDifference = family.parentRank - other.parentRank;
      const childDifference = family.childRank - other.childRank;
      if (parentDifference * childDifference < 0) crossings += 1;
    }
  });
  return { intruders, crossings, maximumFamilySpan, totalFamilySpan, edgeSpan };
};

const cloneRows = (rows: readonly FamilyBlockRowInput[]): FamilyBlockRowInput[] => rows.map((row) => ({
  generation: row.generation,
  blocks: row.blocks.map((block) => ({
    key: block.key,
    memberIds: [...block.memberIds],
    familyKeys: [...block.familyKeys]
  }))
}));

const moved = (blocks: readonly FamilyBlockInput[], from: number, to: number) => {
  const result = [...blocks];
  const [block] = result.splice(from, 1);
  result.splice(to, 0, block);
  return result;
};

const movedRange = (
  blocks: readonly FamilyBlockInput[],
  from: number,
  length: number,
  to: number
) => {
  const result = [...blocks];
  const values = result.splice(from, length);
  result.splice(to, 0, ...values);
  return result;
};

const improveOrder = (rows: FamilyBlockRowInput[], edges: readonly FamilyBlockEdge[]) => {
  const initialRanks = rows.map((row) => new Map(
    row.blocks.map((block, index) => [block.key, index])
  ));
  const preservesFamilyOrder = (row: FamilyBlockRowInput, rowIndex: number) => {
    for (let left = 0; left < row.blocks.length; left += 1) {
      for (let right = left + 1; right < row.blocks.length; right += 1) {
        const leftBlock = row.blocks[left];
        const rightBlock = row.blocks[right];
        if (!leftBlock.familyKeys.some((key) => rightBlock.familyKeys.includes(key))) continue;
        if (initialRanks[rowIndex].get(leftBlock.key)! > initialRanks[rowIndex].get(rightBlock.key)!) {
          return false;
        }
      }
    }
    return true;
  };
  let currentScore = layoutScore(rows, edges);
  for (let pass = 0; pass < 8; pass += 1) {
    const currentSignature = signature(rows);
    let best: { rows: FamilyBlockRowInput[]; score: Score; signature: string } | undefined;
    rows.forEach((row, rowIndex) => {
      if (row.blocks.length > MAX_EXACT_ROW_BLOCKS) return;
      for (let from = 0; from < row.blocks.length; from += 1) {
        for (let to = 0; to < row.blocks.length; to += 1) {
          if (from === to) continue;
          const candidate = cloneRows(rows);
          candidate[rowIndex].blocks = moved(candidate[rowIndex].blocks, from, to);
          if (!preservesFamilyOrder(candidate[rowIndex], rowIndex)) continue;
          const score = layoutScore(candidate, edges);
          if (compareScores(score, currentScore) >= 0) continue;
          const candidateSignature = signature(candidate);
          if (!best || compareScores(score, best.score) < 0 ||
              (compareScores(score, best.score) === 0 && candidateSignature < best.signature)) {
            best = { rows: candidate, score, signature: candidateSignature };
          }
        }
      }
      const ranges = new Map<string, { from: number; length: number }>();
      const familyIndices = new Map<string, number[]>();
      row.blocks.forEach((block, blockIndex) => block.familyKeys.forEach((familyKey) => {
        const indices = familyIndices.get(familyKey) ?? [];
        indices.push(blockIndex);
        familyIndices.set(familyKey, indices);
      }));
      familyIndices.forEach((indices) => {
        let start = 0;
        while (start < indices.length) {
          let end = start;
          while (end + 1 < indices.length && indices[end + 1] === indices[end] + 1) end += 1;
          const length = indices[end] - indices[start] + 1;
          if (length > 1 && length < row.blocks.length) {
            ranges.set(`${indices[start]}:${length}`, { from: indices[start], length });
          }
          start = end + 1;
        }
      });
      ranges.forEach(({ from, length }) => {
        for (let to = 0; to <= row.blocks.length - length; to += 1) {
          const candidate = cloneRows(rows);
          candidate[rowIndex].blocks = movedRange(
            candidate[rowIndex].blocks, from, length, to
          );
          if (!preservesFamilyOrder(candidate[rowIndex], rowIndex)) continue;
          const candidateSignature = signature(candidate);
          if (candidateSignature === currentSignature) continue;
          const score = layoutScore(candidate, edges);
          if (compareScores(score, currentScore) >= 0) continue;
          if (!best || compareScores(score, best.score) < 0 ||
              (compareScores(score, best.score) === 0 && candidateSignature < best.signature)) {
            best = { rows: candidate, score, signature: candidateSignature };
          }
        }
      });
    });
    if (!best) break;
    rows.splice(0, rows.length, ...best.rows);
    currentScore = best.score;
  }
};

const needsFamilyGap = (left: FamilyBlockInput, right: FamilyBlockInput) => {
  if (left.memberIds.length > 1 || right.memberIds.length > 1) return true;
  if (left.familyKeys.length === 0 || right.familyKeys.length === 0) return true;
  return !left.familyKeys.some((key) => right.familyKeys.includes(key));
};

export const descendantFootprintShift = ({
  baseSeparation,
  currentCenter,
  currentChildBlockSizes,
  currentLeft,
  familyGap,
  previousCenter,
  previousChildBlockSizes,
  previousRight
}: {
  baseSeparation: number;
  currentCenter: number;
  currentChildBlockSizes: readonly number[];
  currentLeft: number;
  familyGap: number;
  previousCenter: number;
  previousChildBlockSizes: readonly number[];
  previousRight: number;
}) => {
  const needsShift = previousChildBlockSizes.some((size) => size > 1) &&
    currentChildBlockSizes.length > 1 && currentChildBlockSizes.every((size) => size === 1) &&
    currentLeft < previousCenter;
  if (!needsShift) return undefined;
  return Math.min(
    currentCenter - baseSeparation,
    currentLeft - familyGap - (previousRight - previousCenter)
  );
};

const projectedCenters = (targets: readonly number[], separations: readonly number[]) => {
  const offsets = targets.map((_, index) => index === 0 ? 0 : separations.slice(1, index + 1)
    .reduce((sum, value) => sum + value, 0));
  const pools = targets.map((target, index) => ({
    first: index,
    last: index,
    weight: 1,
    value: target - offsets[index]
  }));
  for (let index = 0; index < pools.length - 1;) {
    if (pools[index].value <= pools[index + 1].value) {
      index += 1;
      continue;
    }
    const left = pools[index];
    const right = pools[index + 1];
    const weight = left.weight + right.weight;
    pools.splice(index, 2, {
      first: left.first,
      last: right.last,
      weight,
      value: (left.value * left.weight + right.value * right.weight) / weight
    });
    if (index > 0) index -= 1;
  }
  const values = Array<number>(targets.length);
  pools.forEach((pool) => {
    for (let index = pool.first; index <= pool.last; index += 1) values[index] = pool.value;
  });
  return values.map((value, index) => value + offsets[index]);
};

export const arrangeFamilyBlocks = (
  inputRows: readonly FamilyBlockRowInput[],
  edges: readonly FamilyBlockEdge[],
  metrics: FamilyBlockMetrics
) => {
  const rows = cloneRows(inputRows);
  improveOrder(rows, edges);
  const positions = new Map<string, number>();
  const blockCenter = (block: FamilyBlockInput) => block.memberIds
    .map((personId) => positions.get(personId) ?? 0)
    .reduce((sum, value) => sum + value, 0) / block.memberIds.length;
  const setBlockCenter = (block: FamilyBlockInput, center: number) => {
    const width = (block.memberIds.length - 1) * metrics.horizontalSpacing;
    block.memberIds.forEach((personId, index) =>
      positions.set(personId, center - width / 2 + index * metrics.horizontalSpacing)
    );
  };
  const baseRowSeparations = (row: FamilyBlockRowInput) => row.blocks.map((block, index) => {
    if (index === 0) return 0;
    const previous = row.blocks[index - 1];
    return (previous.memberIds.length + block.memberIds.length) * metrics.horizontalSpacing / 2 +
      (needsFamilyGap(previous, block) ? metrics.familyGap : 0);
  });

  rows.forEach((row) => {
    const separations = baseRowSeparations(row);
    const centers = separations.map((_, index) => separations.slice(1, index + 1)
      .reduce((sum, value) => sum + value, 0));
    const midpoint = (centers[0] + centers.at(-1)!) / 2;
    row.blocks.forEach((block, index) => setBlockCenter(block, centers[index] - midpoint));
  });

  const incident = new Map<string, string[]>();
  const childrenByParent = new Map<string, string[]>();
  const blockByPerson = new Map<string, FamilyBlockInput>();
  rows.forEach((row) => row.blocks.forEach((block) =>
    block.memberIds.forEach((personId) => blockByPerson.set(personId, block))
  ));
  const append = (from: string, to: string) => {
    const values = incident.get(from) ?? [];
    if (!values.includes(to)) values.push(to);
    incident.set(from, values);
  };
  edges.forEach((edge) => {
    append(edge.parentId, edge.childId);
    append(edge.childId, edge.parentId);
    const children = childrenByParent.get(edge.parentId) ?? [];
    if (!children.includes(edge.childId)) children.push(edge.childId);
    childrenByParent.set(edge.parentId, children);
  });
  const blockHalfWidth = (block: FamilyBlockInput) =>
    (block.memberIds.length - 1) * metrics.horizontalSpacing / 2;
  const directChildBlocks = (block: FamilyBlockInput) => new Set(block.memberIds.flatMap((personId) =>
    (childrenByParent.get(personId) ?? []).flatMap((childId) => {
      const childBlock = blockByPerson.get(childId);
      return childBlock ? [childBlock] : [];
    })
  ));
  const blockFootprint = (block: FamilyBlockInput) => {
    const center = blockCenter(block);
    let left = center - blockHalfWidth(block);
    let right = center + blockHalfWidth(block);
    directChildBlocks(block).forEach((childBlock) => {
      const childCenter = blockCenter(childBlock);
      const childHalfWidth = blockHalfWidth(childBlock);
      left = Math.min(left, childCenter - childHalfWidth);
      right = Math.max(right, childCenter + childHalfWidth);
    });
    return { center, left, right };
  };
  for (let iteration = 0; iteration < 10; iteration += 1) {
    const orderedRows = iteration % 2 === 0 ? rows : [...rows].reverse();
    for (const row of orderedRows) {
      const targets = row.blocks.map((block) => {
        const width = (block.memberIds.length - 1) * metrics.horizontalSpacing;
        const anchors = block.memberIds.flatMap((personId, index) =>
          (incident.get(personId) ?? []).flatMap((adjacentId) => {
            const adjacent = positions.get(adjacentId);
            return adjacent === undefined
              ? [] : [adjacent + width / 2 - index * metrics.horizontalSpacing];
          })
        );
        return anchors.length > 0
          ? anchors.reduce((sum, value) => sum + value, 0) / anchors.length
          : blockCenter(block);
      });
      const centers = projectedCenters(targets, baseRowSeparations(row));
      row.blocks.forEach((block, index) => setBlockCenter(block, centers[index]));
    }
  }
  [...rows].reverse().forEach((row) => {
    const baseSeparations = baseRowSeparations(row);
    let propagateSpacing = false;
    for (let index = row.blocks.length - 1; index > 0; index -= 1) {
      const previousBlock = row.blocks[index - 1];
      const currentBlock = row.blocks[index];
      const previous = blockFootprint(previousBlock);
      const current = blockFootprint(currentBlock);
      const previousChildren = [...directChildBlocks(previousBlock)];
      const currentChildren = [...directChildBlocks(currentBlock)];
      const footprintCenter = previousBlock.memberIds.length > 1 &&
        currentBlock.memberIds.length > 1 && needsFamilyGap(previousBlock, currentBlock) &&
        previousChildren.every((block) => blockCenter(block) < previous.center)
        ? descendantFootprintShift({
            baseSeparation: baseSeparations[index],
            currentCenter: current.center,
            currentChildBlockSizes: currentChildren.map((block) => block.memberIds.length),
            currentLeft: current.left,
            familyGap: metrics.familyGap,
            previousCenter: previous.center,
            previousChildBlockSizes: previousChildren.map((block) => block.memberIds.length),
            previousRight: previous.right
          })
        : undefined;
      const needsFootprintShift = footprintCenter !== undefined;
      if (!needsFootprintShift && !propagateSpacing) continue;
      const maximumCenter = needsFootprintShift
        ? footprintCenter
        : current.center - baseSeparations[index];
      propagateSpacing = previous.center > maximumCenter;
      if (propagateSpacing) setBlockCenter(previousBlock, maximumCenter);
    }
  });

  const parentsByChild = new Map<string, string[]>();
  edges.forEach((edge) => {
    const parents = parentsByChild.get(edge.childId) ?? [];
    parents.push(edge.parentId);
    parentsByChild.set(edge.childId, parents);
  });
  rows.forEach((row) => row.blocks.forEach((block) => {
    if (block.memberIds.length !== 2) return;
    const anchors = block.memberIds.map((personId) => (parentsByChild.get(personId) ?? [])
      .map((parentId) => positions.get(parentId))
      .filter((value): value is number => value !== undefined));
    if (anchors.some((values) => values.length === 0)) return;
    const centers = anchors.map((values) => values.reduce((sum, value) => sum + value, 0) / values.length);
    if (centers[0] <= centers[1]) return;
    const first = positions.get(block.memberIds[0])!;
    positions.set(block.memberIds[0], positions.get(block.memberIds[1])!);
    positions.set(block.memberIds[1], first);
  }));

  const values = [...positions.values()];
  const offset = (Math.min(...values) + Math.max(...values)) / 2;
  positions.forEach((value, personId) => positions.set(personId, value - offset));
  return { rows, positions, score: layoutScore(rows, edges) };
};
