import { useEffect, useState } from "react";
import { useAtomValue } from "jotai";
import { experimental_useSidebarThreadSorts } from "@get-bb/plugin-sdk/app";
import { sidebarDragActiveAtom } from "../dnd/useSidebarReorderDnd.js";
import type { PluginThreadSortKeys } from "../model/plugin-thread-sort.js";
import { sidebarPluginSortAtom } from "../preferences/atoms.js";

const SIDEBAR_SELECTOR = '[data-sidebar="sidebar"]';

function useSidebarPointerHeld(enabled: boolean): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const press = (event: PointerEvent) => {
      if (
        event.target instanceof Element &&
        event.target.closest(SIDEBAR_SELECTOR) !== null
      ) {
        setHeld(true);
      }
    };
    const release = () => setHeld(false);
    document.addEventListener("pointerdown", press, true);
    window.addEventListener("pointerup", release, true);
    window.addEventListener("pointercancel", release, true);
    window.addEventListener("blur", release);
    return () => {
      document.removeEventListener("pointerdown", press, true);
      window.removeEventListener("pointerup", release, true);
      window.removeEventListener("pointercancel", release, true);
      window.removeEventListener("blur", release);
      setHeld(false);
    };
  }, [enabled]);
  return enabled && held;
}

function isInSidebar(target: EventTarget | null): target is Element {
  return target instanceof Element && target.closest(SIDEBAR_SELECTOR) !== null;
}

function useSidebarKeyboardFocus(enabled: boolean): boolean {
  const [held, setHeld] = useState(false);
  useEffect(() => {
    if (!enabled) return;
    const enter = (event: FocusEvent) => {
      const target = event.target;
      setHeld(isInSidebar(target) && target.matches(":focus-visible"));
    };
    const leave = (event: FocusEvent) => {
      if (!isInSidebar(event.relatedTarget)) setHeld(false);
    };
    const release = () => setHeld(false);
    document.addEventListener("focusin", enter, true);
    document.addEventListener("focusout", leave, true);
    window.addEventListener("blur", release);
    return () => {
      document.removeEventListener("focusin", enter, true);
      document.removeEventListener("focusout", leave, true);
      window.removeEventListener("blur", release);
      setHeld(false);
    };
  }, [enabled]);
  return enabled && held;
}

function useHeldWhile<T>(value: T, frozen: boolean): T {
  const [held, setHeld] = useState(value);
  if (!frozen && held !== value) {
    setHeld(value);
  }
  return frozen ? held : value;
}

export function usePluginThreadSortKeys(
  renameActive: boolean,
): PluginThreadSortKeys | null {
  const selectedKey = useAtomValue(sidebarPluginSortAtom);
  const sorts = experimental_useSidebarThreadSorts();
  const liveKeys =
    selectedKey === null
      ? null
      : (sorts.find((sort) => sort.key === selectedKey)?.keys ?? null);
  const dragActive = useAtomValue(sidebarDragActiveAtom);
  const pointerHeld = useSidebarPointerHeld(liveKeys !== null);
  const keyboardFocus = useSidebarKeyboardFocus(liveKeys !== null);
  return useHeldWhile(
    liveKeys,
    dragActive || pointerHeld || keyboardFocus || renameActive,
  );
}
