// @vitest-environment jsdom

import type { ReactNode } from "react";
import {
  act,
  cleanup,
  fireEvent,
  screen,
  waitFor,
} from "@testing-library/react";
import { createStore, Provider } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import type {
  ExperimentalSidebarThreadSort,
  ExperimentalSidebarThreadSortKey,
} from "@get-bb/plugin-sdk/app";
import { TooltipProvider } from "@/components/ui/tooltip";
import {
  installTestPluginRuntime,
  renderSlot,
} from "@get-bb/plugin-sdk/testing/app";
import { makePluginProject, makeSidebarThread } from "../model/fixtures.js";
import { preferencesReadyAtom } from "../preferences/preferences-sync.js";
import {
  sidebarOrganizationModeAtom,
  sidebarPluginSortAtom,
} from "../preferences/atoms.js";
import { sidebarDragActiveAtom } from "../dnd/useSidebarReorderDnd.js";

installTestPluginRuntime();
const { ProjectList } = await import("./ProjectList.js");
const { resetSidebarDataCacheForTest } =
  await import("../model/use-sidebar-data.js");

afterEach(() => {
  cleanup();
  resetSidebarDataCacheForTest();
});

function Harness({
  children,
  store,
}: {
  children: ReactNode;
  store: ReturnType<typeof createStore>;
}) {
  return (
    <TooltipProvider>
      <Provider store={store}>
        <div data-sidebar="sidebar">{children}</div>
      </Provider>
    </TooltipProvider>
  );
}

function statusSort(
  keys: Record<string, ExperimentalSidebarThreadSortKey>,
): ExperimentalSidebarThreadSort {
  return {
    key: "thread-card:status",
    pluginId: "thread-card",
    id: "status",
    title: "Status",
    description: null,
    keys: new Map(Object.entries(keys)),
  };
}

const THREADS = [
  makeSidebarThread({ id: "thr_a", title: "Card A", latestAttentionAt: 10 }),
  makeSidebarThread({ id: "thr_b", title: "Card B", latestAttentionAt: 20 }),
  makeSidebarThread({ id: "thr_c", title: "Card C", latestAttentionAt: 30 }),
  makeSidebarThread({ id: "thr_d", title: "Card D", latestAttentionAt: 40 }),
];

const BUILT_IN_ORDER = ["Card D", "Card C", "Card B", "Card A"];

function renderList(
  sorts: readonly ExperimentalSidebarThreadSort[],
  threads = THREADS,
) {
  const store = createStore();
  store.set(preferencesReadyAtom(), true);
  store.set(sidebarOrganizationModeAtom, "chronological");
  store.set(sidebarPluginSortAtom, "thread-card:status");
  const slot = renderSlot(
    { component: Harness },
    { children: <ProjectList activeThreadId={null} />, store },
    {
      sidebarThreads: {
        threads,
        projects: [makePluginProject()],
        sections: [],
      },
      experimental_sidebarThreadSorts: sorts,
    },
  );
  return { slot, store };
}

function rowOrder(): string[] {
  return screen
    .getAllByText(/^Card [A-D]$/)
    .map((row) => row.textContent ?? "");
}

describe("sorting the thread list by a plugin sort", () => {
  it("orders rows by the plugin keys and falls back while the provider is absent", async () => {
    const { slot, store } = renderList([]);
    await waitFor(() => expect(rowOrder()).toEqual(BUILT_IN_ORDER));

    await slot.behavior.experimental_setSidebarThreadSorts([
      statusSort({
        thr_a: { rank: 0, at: 5 },
        thr_c: { rank: 1, at: 9 },
        thr_b: { rank: 0, at: 7 },
      }),
    ]);
    await waitFor(() =>
      expect(rowOrder()).toEqual(["Card B", "Card A", "Card C", "Card D"]),
    );

    await slot.behavior.experimental_setSidebarThreadSorts([]);
    await waitFor(() => expect(rowOrder()).toEqual(BUILT_IN_ORDER));
    expect(store.get(sidebarPluginSortAtom)).toBe("thread-card:status");
  });

  it("uses the built-in sort when the saved plugin sort is not selected", async () => {
    const { store } = renderList([statusSort({ thr_a: { rank: 0, at: 0 } })]);
    await waitFor(() => expect(rowOrder()[0]).toBe("Card A"));
    act(() => store.set(sidebarPluginSortAtom, null));
    await waitFor(() => expect(rowOrder()).toEqual(BUILT_IN_ORDER));
  });

  it("keeps Pinned in its manual order, children included", async () => {
    renderList(
      [
        statusSort({
          thr_pin_b: { rank: 0, at: 0 },
          thr_child_old: { rank: 0, at: 0 },
        }),
      ],
      [
        makeSidebarThread({
          id: "thr_pin_a",
          title: "Pin A",
          pinnedAt: 1,
          pinSortKey: "a0",
        }),
        makeSidebarThread({
          id: "thr_pin_b",
          title: "Pin B",
          pinnedAt: 2,
          pinSortKey: "a1",
        }),
        makeSidebarThread({
          id: "thr_child_old",
          title: "Pin child old",
          parentThreadId: "thr_pin_a",
          latestAttentionAt: 5,
        }),
        makeSidebarThread({
          id: "thr_child_new",
          title: "Pin child new",
          parentThreadId: "thr_pin_a",
          latestAttentionAt: 50,
        }),
      ],
    );
    await waitFor(() =>
      expect(
        screen.getAllByText(/^Pin /).map((row) => row.textContent),
      ).toEqual(["Pin A", "Pin child new", "Pin child old", "Pin B"]),
    );
  });

  it("holds the order during a drag and applies new keys when it ends", async () => {
    const { slot, store } = renderList([
      statusSort({ thr_a: { rank: 0, at: 0 } }),
    ]);
    await waitFor(() =>
      expect(rowOrder()).toEqual(["Card A", "Card D", "Card C", "Card B"]),
    );

    act(() => store.set(sidebarDragActiveAtom, true));
    await slot.behavior.experimental_setSidebarThreadSorts([
      statusSort({ thr_b: { rank: 0, at: 0 } }),
    ]);
    expect(rowOrder()).toEqual(["Card A", "Card D", "Card C", "Card B"]);

    act(() => store.set(sidebarDragActiveAtom, false));
    await waitFor(() =>
      expect(rowOrder()).toEqual(["Card B", "Card D", "Card C", "Card A"]),
    );
  });

  it("holds the order while a pointer is down in the sidebar", async () => {
    const { slot } = renderList([statusSort({ thr_a: { rank: 0, at: 0 } })]);
    await waitFor(() => expect(rowOrder()[0]).toBe("Card A"));

    fireEvent.pointerDown(screen.getByText("Card C"));
    await slot.behavior.experimental_setSidebarThreadSorts([
      statusSort({ thr_c: { rank: 0, at: 0 } }),
    ]);
    expect(rowOrder()[0]).toBe("Card A");

    fireEvent.pointerUp(window);
    await waitFor(() =>
      expect(rowOrder()).toEqual(["Card C", "Card D", "Card B", "Card A"]),
    );
  });

  it("holds the order while keyboard focus is in the sidebar", async () => {
    const { slot } = renderList([statusSort({ thr_a: { rank: 0, at: 0 } })]);
    await waitFor(() => expect(rowOrder()[0]).toBe("Card A"));

    const field = document.createElement("input");
    document.querySelector('[data-sidebar="sidebar"]')!.append(field);
    act(() => field.focus());
    await slot.behavior.experimental_setSidebarThreadSorts([
      statusSort({ thr_c: { rank: 0, at: 0 } }),
    ]);
    expect(rowOrder()[0]).toBe("Card A");

    act(() => field.blur());
    await waitFor(() => expect(rowOrder()[0]).toBe("Card C"));
    field.remove();
  });
});
