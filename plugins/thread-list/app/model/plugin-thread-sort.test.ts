import { describe, expect, it } from "vitest";
import type { ExperimentalSidebarThreadSortKey } from "@get-bb/plugin-sdk/app";
import {
  buildProjectThreadGroups,
  buildSectionThreadList,
  compareByCreatedAtDescending,
  compareStandardThreads,
  type ProjectThreadItem,
  type ThreadComparator,
} from "./project-thread-groups.js";
import { withPluginThreadSortKeys } from "./plugin-thread-sort.js";
import {
  makeSidebarEnvironment,
  makeSidebarThread,
  type SidebarThreadOverrides,
} from "./fixtures.js";
import type { SidebarThread } from "./sidebar-thread.js";

function thread(overrides: SidebarThreadOverrides): SidebarThread {
  return makeSidebarThread({
    projectId: "proj_1",
    lastReadAt: 0,
    latestAttentionAt: 2,
    createdAt: 1,
    updatedAt: 2,
    ...overrides,
  });
}

function keys(
  entries: Record<string, ExperimentalSidebarThreadSortKey>,
): ReadonlyMap<string, ExperimentalSidebarThreadSortKey> {
  return new Map(Object.entries(entries));
}

function ids(items: readonly ProjectThreadItem[]): unknown[] {
  return items.map((item) => {
    switch (item.kind) {
      case "thread":
        return item.node.children.length === 0
          ? item.node.thread.id
          : { id: item.node.thread.id, children: ids(item.node.children) };
      case "environment":
        return {
          env: item.group.environmentId,
          threads: item.group.nodes.map((node) => node.thread.id),
        };
      case "section":
        return { section: item.group.id, items: ids(item.group.items) };
    }
  });
}

const alphaByTitle = ((left, right) =>
  (left.title ?? "").localeCompare(right.title ?? "")) as ThreadComparator;
alphaByTitle.compareItems = (left, right) =>
  itemLabel(left).localeCompare(itemLabel(right));

function itemLabel(item: ProjectThreadItem): string {
  switch (item.kind) {
    case "section":
      return item.group.name;
    case "thread":
      return item.node.thread.title ?? "";
    case "environment":
      return item.group.nodes[0].thread.title ?? "";
  }
}

describe("withPluginThreadSortKeys", () => {
  it("orders by rank ascending, then at descending, and puts unkeyed threads last", () => {
    const threads = [
      thread({ id: "thr_unkeyed_new", createdAt: 90 }),
      thread({ id: "thr_rank1", createdAt: 10 }),
      thread({ id: "thr_rank0_old", createdAt: 20 }),
      thread({ id: "thr_rank0_new", createdAt: 30 }),
      thread({ id: "thr_unkeyed_old", createdAt: 5 }),
    ];
    const comparator = withPluginThreadSortKeys(
      compareByCreatedAtDescending,
      keys({
        thr_rank1: { rank: 1, at: 500 },
        thr_rank0_old: { rank: 0, at: 100 },
        thr_rank0_new: { rank: 0, at: 200 },
      }),
    );

    expect(ids(buildProjectThreadGroups(threads, comparator))).toEqual([
      "thr_rank0_new",
      "thr_rank0_old",
      "thr_rank1",
      "thr_unkeyed_new",
      "thr_unkeyed_old",
    ]);
  });

  it("falls back to the built-in comparator, then id, when keys tie", () => {
    const threads = [
      thread({ id: "thr_b", createdAt: 10 }),
      thread({ id: "thr_c", createdAt: 30 }),
      thread({ id: "thr_a", createdAt: 10 }),
    ];
    const tied = { rank: 2, at: 7 };
    const comparator = withPluginThreadSortKeys(
      compareByCreatedAtDescending,
      keys({ thr_a: tied, thr_b: tied, thr_c: tied }),
    );

    expect(ids(buildProjectThreadGroups(threads, comparator))).toEqual([
      "thr_c",
      "thr_a",
      "thr_b",
    ]);
  });

  it("keeps the built-in order when the provider publishes no keys", () => {
    const threads = [
      thread({ id: "thr_old", latestAttentionAt: 10 }),
      thread({ id: "thr_new", latestAttentionAt: 30 }),
      thread({ id: "thr_mid", latestAttentionAt: 20 }),
    ];

    expect(
      ids(
        buildProjectThreadGroups(
          threads,
          withPluginThreadSortKeys(compareStandardThreads, new Map()),
        ),
      ),
    ).toEqual(ids(buildProjectThreadGroups(threads, compareStandardThreads)));
  });

  it("sorts nested children by the same keys under their parent", () => {
    const threads = [
      thread({ id: "thr_parent", createdAt: 1 }),
      thread({ id: "thr_other_root", createdAt: 2 }),
      thread({ id: "thr_child_a", parentThreadId: "thr_parent", createdAt: 3 }),
      thread({ id: "thr_child_b", parentThreadId: "thr_parent", createdAt: 4 }),
      thread({ id: "thr_child_c", parentThreadId: "thr_parent", createdAt: 5 }),
    ];
    const comparator = withPluginThreadSortKeys(
      compareByCreatedAtDescending,
      keys({
        thr_parent: { rank: 0, at: 1 },
        thr_child_a: { rank: 0, at: 1 },
        thr_child_c: { rank: 3, at: 1 },
      }),
    );

    expect(ids(buildProjectThreadGroups(threads, comparator))).toEqual([
      {
        id: "thr_parent",
        children: ["thr_child_a", "thr_child_c", "thr_child_b"],
      },
      "thr_other_root",
    ]);
  });

  it("keeps worktree groups together and places them by their best-keyed thread", () => {
    const worktree = makeSidebarEnvironment({
      id: "env_worktree",
      isWorktree: true,
    });
    const threads = [
      thread({ id: "thr_loose", createdAt: 50 }),
      thread({ id: "thr_env_a", environment: worktree, createdAt: 10 }),
      thread({ id: "thr_env_b", environment: worktree, createdAt: 20 }),
    ];
    const comparator = withPluginThreadSortKeys(
      compareByCreatedAtDescending,
      keys({
        thr_loose: { rank: 1, at: 0 },
        thr_env_a: { rank: 0, at: 0 },
        thr_env_b: { rank: 2, at: 0 },
      }),
    );

    expect(ids(buildProjectThreadGroups(threads, comparator))).toEqual([
      { env: "env_worktree", threads: ["thr_env_a", "thr_env_b"] },
      "thr_loose",
    ]);
  });

  it("orders threads inside sections without reordering the sections under an alphabetical base", () => {
    const threads = [
      thread({ id: "thr_z", title: "Zeta", sectionId: "sec_b" }),
      thread({ id: "thr_a", title: "Alpha", sectionId: "sec_b" }),
      thread({ id: "thr_n", title: "Nu", sectionId: "sec_a" }),
      thread({ id: "thr_m", title: "Mu", sectionId: "sec_a" }),
      thread({ id: "thr_loose_b", title: "Beta" }),
      thread({ id: "thr_loose_y", title: "Ypsilon" }),
    ];
    const sections = [
      { id: "sec_b", name: "Bison" },
      { id: "sec_a", name: "Aardvark" },
    ];
    const comparator = withPluginThreadSortKeys(
      alphaByTitle,
      keys({
        thr_z: { rank: 0, at: 0 },
        thr_loose_y: { rank: 0, at: 0 },
      }),
    );

    expect(ids(buildSectionThreadList(threads, comparator, sections))).toEqual([
      { section: "sec_a", items: ["thr_m", "thr_n"] },
      { section: "sec_b", items: ["thr_z", "thr_a"] },
      "thr_loose_y",
      "thr_loose_b",
    ]);
  });
});
