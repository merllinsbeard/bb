import { useMemo, useSyncExternalStore } from "react";
import type { ExperimentalSidebarThreadSort } from "@get-bb/plugin-sdk";
import {
  usePluginSlots,
  type ExperimentalSidebarThreadSortSlot,
} from "./plugin-slots";

const EMPTY_SORTS: readonly ExperimentalSidebarThreadSort[] = [];

const sortBySlot = new WeakMap<
  ExperimentalSidebarThreadSortSlot,
  ExperimentalSidebarThreadSort
>();

function toSidebarThreadSort(
  slot: ExperimentalSidebarThreadSortSlot,
): ExperimentalSidebarThreadSort {
  const keys = slot.runtime.getSnapshot();
  const cached = sortBySlot.get(slot);
  if (cached !== undefined && cached.keys === keys) return cached;
  const sort: ExperimentalSidebarThreadSort = {
    key: `${slot.pluginId}:${slot.id}`,
    pluginId: slot.pluginId,
    id: slot.id,
    title: slot.title,
    description: slot.description ?? null,
    keys,
  };
  sortBySlot.set(slot, sort);
  return sort;
}

function createSidebarThreadSortsStore(
  slots: readonly ExperimentalSidebarThreadSortSlot[],
) {
  let snapshot = EMPTY_SORTS;
  return {
    subscribe(listener: () => void): () => void {
      const unsubscribes = slots.map((slot) =>
        slot.runtime.subscribe(listener),
      );
      return () => {
        for (const unsubscribe of unsubscribes) unsubscribe();
      };
    },
    getSnapshot(): readonly ExperimentalSidebarThreadSort[] {
      if (slots.length === 0) return EMPTY_SORTS;
      const next = slots.map(toSidebarThreadSort);
      if (
        next.length === snapshot.length &&
        next.every((sort, index) => sort === snapshot[index])
      ) {
        return snapshot;
      }
      snapshot = next;
      return snapshot;
    },
  };
}

export function useSidebarThreadSorts(): readonly ExperimentalSidebarThreadSort[] {
  const slots = usePluginSlots().experimentalSidebarThreadSorts;
  const store = useMemo(() => createSidebarThreadSortsStore(slots), [slots]);
  return useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot,
  );
}
