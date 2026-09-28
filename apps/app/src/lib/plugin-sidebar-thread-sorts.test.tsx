// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import type { ExperimentalSidebarThreadSortController } from "@get-bb/plugin-sdk";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectPluginAppRegistrations,
  definePluginApp,
} from "./plugin-app-definition";
import {
  removePluginSlotRegistrations,
  resetPluginSlotStoreForTest,
  setPluginSlotRegistrations,
} from "./plugin-slots";
import { useSidebarThreadSorts } from "./plugin-sidebar-thread-sorts";

afterEach(() => {
  cleanup();
  resetPluginSlotStoreForTest();
});

function loadSorts(
  pluginId: string,
  ids: readonly string[],
): ExperimentalSidebarThreadSortController[] {
  const controllers: ExperimentalSidebarThreadSortController[] = [];
  const collected = collectPluginAppRegistrations(
    definePluginApp((app) => {
      for (const id of ids) {
        controllers.push(
          app.experimental_sidebarThreadSorts.register({
            id,
            title: `${pluginId} ${id}`,
            ...(id === "status" ? { description: "By status" } : {}),
          }),
        );
      }
    }),
  );
  act(() => setPluginSlotRegistrations(pluginId, collected));
  return controllers;
}

describe("useSidebarThreadSorts", () => {
  it("reports registered sorts in plugin-id order and follows published keys", () => {
    const { result } = renderHook(() => useSidebarThreadSorts());
    expect(result.current).toEqual([]);

    const [status] = loadSorts("thread-card", ["status"]);
    loadSorts("a-plugin", ["second", "first"]);
    expect(
      result.current.map(({ key, pluginId, id, title, description }) => ({
        key,
        pluginId,
        id,
        title,
        description,
      })),
    ).toEqual([
      {
        key: "a-plugin:second",
        pluginId: "a-plugin",
        id: "second",
        title: "a-plugin second",
        description: null,
      },
      {
        key: "a-plugin:first",
        pluginId: "a-plugin",
        id: "first",
        title: "a-plugin first",
        description: null,
      },
      {
        key: "thread-card:status",
        pluginId: "thread-card",
        id: "status",
        title: "thread-card status",
        description: "By status",
      },
    ]);
    expect(result.current[2].keys.size).toBe(0);

    act(() =>
      status.setKeys({
        thr_a: { rank: 0, at: 10 },
        thr_b: { rank: 2, at: 5 },
        thr_gone: null,
      }),
    );
    const published = result.current;
    expect([...published[2].keys]).toEqual([
      ["thr_a", { rank: 0, at: 10 }],
      ["thr_b", { rank: 2, at: 5 }],
    ]);

    act(() =>
      status.setKeys({ thr_b: { rank: 2, at: 5 }, thr_a: { rank: 0, at: 10 } }),
    );
    expect(result.current).toBe(published);

    expect(() =>
      status.setKeys({ thr_a: { rank: Number.NaN, at: 0 } }),
    ).toThrow(/"thr_a"\.rank must be a finite number/);
    expect(result.current).toBe(published);
  });

  it("drops a plugin's sorts and keys when it unloads and starts empty after a reload", () => {
    const { result } = renderHook(() => useSidebarThreadSorts());
    const [stale] = loadSorts("thread-card", ["status"]);
    act(() => stale.setKeys({ thr_a: { rank: 0, at: 1 } }));
    expect(result.current[0].keys.get("thr_a")).toEqual({ rank: 0, at: 1 });

    act(() => removePluginSlotRegistrations("thread-card"));
    expect(result.current).toEqual([]);
    act(() => stale.setKeys({ thr_b: { rank: 0, at: 1 } }));
    expect(result.current).toEqual([]);

    const [fresh] = loadSorts("thread-card", ["status"]);
    expect(result.current.map((sort) => sort.key)).toEqual([
      "thread-card:status",
    ]);
    expect(result.current[0].keys.size).toBe(0);
    act(() => stale.setKeys({ thr_c: { rank: 0, at: 1 } }));
    expect(result.current[0].keys.size).toBe(0);
    act(() => fresh.setKeys({ thr_d: { rank: 1, at: 1 } }));
    expect([...result.current[0].keys.keys()]).toEqual(["thr_d"]);
  });
});
