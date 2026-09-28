import type { ExperimentalSidebarThreadSortKey } from "@get-bb/plugin-sdk/app";
import { compareCodepoint } from "./compare-codepoint.js";
import type {
  ProjectThreadItem,
  ThreadComparator,
} from "./project-thread-groups.js";
import type { SidebarThread } from "./sidebar-thread.js";

export type PluginThreadSortKeys = ReadonlyMap<
  string,
  ExperimentalSidebarThreadSortKey
>;

function comparePluginSortKeys(
  left: SidebarThread,
  right: SidebarThread,
  keys: PluginThreadSortKeys,
): number {
  const leftKey = keys.get(left.id);
  const rightKey = keys.get(right.id);
  if (leftKey === undefined || rightKey === undefined) {
    if (leftKey === rightKey) return 0;
    return leftKey === undefined ? 1 : -1;
  }
  if (leftKey.rank !== rightKey.rank) {
    return leftKey.rank < rightKey.rank ? -1 : 1;
  }
  if (leftKey.at !== rightKey.at) {
    return leftKey.at > rightKey.at ? -1 : 1;
  }
  return 0;
}

function itemThread(
  item: Exclude<ProjectThreadItem, { kind: "section" }>,
): SidebarThread {
  return item.kind === "thread" ? item.node.thread : item.group.nodes[0].thread;
}

export function withPluginThreadSortKeys(
  base: ThreadComparator,
  keys: PluginThreadSortKeys,
): ThreadComparator {
  const comparator: ThreadComparator = (left, right) => {
    const keyDelta = comparePluginSortKeys(left, right, keys);
    if (keyDelta !== 0) return keyDelta;
    const baseDelta = base(left, right);
    if (baseDelta !== 0) return baseDelta;
    return compareCodepoint(left.id, right.id);
  };
  const compareBaseItems = base.compareItems;
  if (compareBaseItems !== undefined) {
    comparator.compareItems = (left, right) => {
      if (left.kind !== "section" && right.kind !== "section") {
        const keyDelta = comparePluginSortKeys(
          itemThread(left),
          itemThread(right),
          keys,
        );
        if (keyDelta !== 0) return keyDelta;
      }
      return compareBaseItems(left, right);
    };
  }
  return comparator;
}

export function scrollShiftKeepingRows(
  before: ReadonlyMap<string, number>,
  after: ReadonlyMap<string, number>,
): number {
  const votes = new Map<number, number>();
  for (const [threadId, top] of before) {
    const next = after.get(threadId);
    if (next === undefined) continue;
    const shift = Math.round(next - top);
    votes.set(shift, (votes.get(shift) ?? 0) + 1);
  }
  let best = 0;
  let bestVotes = 0;
  for (const [shift, count] of votes) {
    if (
      count > bestVotes ||
      (count === bestVotes && Math.abs(shift) < Math.abs(best))
    ) {
      best = shift;
      bestVotes = count;
    }
  }
  return best;
}
