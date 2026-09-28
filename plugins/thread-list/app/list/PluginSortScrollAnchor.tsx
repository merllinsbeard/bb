import { Component, type RefObject } from "react";
import {
  scrollShiftKeepingRows,
  type PluginThreadSortKeys,
} from "../model/plugin-thread-sort.js";
import { useSidebarContentElementRef } from "../ui/sidebar.js";

const THREAD_ROW_SELECTOR = "a[data-sidebar-thread-id]";

type RowTops = Map<string, number>;

function threadRowTops(scroller: HTMLElement, visibleOnly: boolean): RowTops {
  const view = scroller.getBoundingClientRect();
  const tops: RowTops = new Map();
  for (const row of scroller.querySelectorAll<HTMLElement>(
    THREAD_ROW_SELECTOR,
  )) {
    const threadId = row.dataset.sidebarThreadId;
    if (threadId === undefined) continue;
    const box = row.getBoundingClientRect();
    if (visibleOnly && (box.bottom <= view.top || box.top >= view.bottom)) {
      continue;
    }
    tops.set(threadId, box.top - view.top);
  }
  return tops;
}

interface KeepRowsProps {
  keys: PluginThreadSortKeys | null;
  scrollerRef: RefObject<HTMLElement | null> | null;
}

class KeepVisibleRows extends Component<KeepRowsProps> {
  override getSnapshotBeforeUpdate(previous: KeepRowsProps): RowTops | null {
    const scroller = this.props.scrollerRef?.current ?? null;
    if (
      scroller === null ||
      previous.keys === null ||
      this.props.keys === null ||
      previous.keys === this.props.keys
    ) {
      return null;
    }
    return threadRowTops(scroller, true);
  }

  override componentDidUpdate(
    _previous: KeepRowsProps,
    _state: unknown,
    before: RowTops | null,
  ): void {
    const scroller = this.props.scrollerRef?.current ?? null;
    if (before === null || scroller === null) return;
    const shift = scrollShiftKeepingRows(
      before,
      threadRowTops(scroller, false),
    );
    if (shift !== 0) scroller.scrollBy({ top: shift, behavior: "instant" });
  }

  override render(): null {
    return null;
  }
}

export function PluginSortScrollAnchor({
  keys,
}: {
  keys: PluginThreadSortKeys | null;
}) {
  const scrollerRef = useSidebarContentElementRef();
  return <KeepVisibleRows keys={keys} scrollerRef={scrollerRef} />;
}
