"use client";

import { useReducedMotion } from "motion/react";
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { cn } from "@/lib/utils";

const ITEM = 44; // px per row
const VISIBLE = 5; // rows shown (odd, so one row sits in the middle)
const HEIGHT = ITEM * VISIBLE;
const STEP = 5; // minutes
const pad = (n: number) => String(n).padStart(2, "0");

const HOURS = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = Array.from({ length: 60 / STEP }, (_, i) => i * STEP);

/** Parse "HH:MM"; falls back to 00:00. */
function split(v: string): [number, number] {
  const [h, m] = v.split(":").map(Number);
  return [Number.isFinite(h) ? Math.min(23, Math.max(0, h)) : 0, Number.isFinite(m) ? Math.min(59, Math.max(0, m)) : 0];
}

/**
 * One scroll wheel. Native scroll-snap (y mandatory, each row snaps to the centre) gives the iOS feel;
 * rows fade with distance from the centre. Touch and trackpad/mouse-wheel scroll natively, a mouse
 * can also drag. The selected index is reported once scrolling settles.
 */
function Wheel({ items, selected, onSelect, label, format }: { items: number[]; selected: number; onSelect: (index: number) => void; label: string; format: (n: number) => string }) {
  const reduce = useReducedMotion();
  const el = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState(selected); // fractional scroll position in rows
  const [dragging, setDragging] = useState(false);
  const raf = useRef(0);
  const settle = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const programmatic = useRef(false);
  const drag = useRef<{ y: number; top: number; moved: boolean } | null>(null);
  /** last index this wheel reported itself; the glide effect must not fight the user's own scroll */
  const reported = useRef<number | null>(null);
  const selectedRef = useRef(selected);
  selectedRef.current = selected;
  const onSelectRef = useRef(onSelect);
  onSelectRef.current = onSelect;
  const clamp = useCallback((i: number) => Math.min(items.length - 1, Math.max(0, i)), [items.length]);

  const scrollToIndex = useCallback(
    (i: number, smooth: boolean) => {
      const node = el.current;
      if (!node) return;
      const top = clamp(i) * ITEM;
      // only mark as programmatic when something will actually scroll, otherwise the flag would swallow the next user scroll
      programmatic.current = smooth && Math.abs(node.scrollTop - top) > 1;
      node.scrollTo({ top, behavior: smooth && !reduce ? "smooth" : "auto" });
    },
    [clamp, reduce],
  );

  // first paint: jump straight to the value
  useLayoutEffect(() => {
    if (el.current) {
      el.current.scrollTop = selected * ITEM;
      setPos(selected);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // value changed from outside (shortcut buttons, typing): glide to it
  useEffect(() => {
    const node = el.current;
    if (!node) return;
    if (reported.current === selected) {
      reported.current = null;
      return;
    }
    if (Math.round(node.scrollTop / ITEM) !== selected) scrollToIndex(selected, true);
  }, [selected, scrollToIndex]);

  useEffect(
    () => () => {
      cancelAnimationFrame(raf.current);
      clearTimeout(settle.current);
    },
    [],
  );

  /** scrolling stopped: report the row that snapped into the centre */
  const finish = useCallback(() => {
    const node = el.current;
    if (!node || drag.current) return;
    clearTimeout(settle.current);
    const idx = clamp(Math.round(node.scrollTop / ITEM));
    const fromUser = !programmatic.current;
    programmatic.current = false;
    if (fromUser && idx !== selectedRef.current) {
      reported.current = idx;
      onSelectRef.current(idx);
    }
  }, [clamp]);

  const onScroll = () => {
    const node = el.current;
    if (!node) return;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => setPos(node.scrollTop / ITEM));
    // browsers without "scrollend" fall back to a quiet period
    clearTimeout(settle.current);
    settle.current = setTimeout(finish, 220);
  };

  useEffect(() => {
    const node = el.current;
    node?.addEventListener("scrollend", finish);
    return () => node?.removeEventListener("scrollend", finish);
  }, [finish]);

  // mouse drag (touch scrolls natively)
  const down = (e: PointerEvent<HTMLDivElement>) => {
    if (e.pointerType !== "mouse" || e.button !== 0 || !el.current) return;
    drag.current = { y: e.clientY, top: el.current.scrollTop, moved: false };
    setDragging(true);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !el.current) return;
    const dy = e.clientY - d.y;
    if (Math.abs(dy) > 3) d.moved = true;
    el.current.scrollTop = d.top - dy;
  };
  const up = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !el.current) return;
    drag.current = null;
    setDragging(false);
    e.currentTarget.releasePointerCapture(e.pointerId);
    const idx = clamp(Math.round(el.current.scrollTop / ITEM));
    programmatic.current = false;
    el.current.scrollTo({ top: idx * ITEM, behavior: reduce ? "auto" : "smooth" });
    if (idx !== selected) {
      reported.current = idx;
      onSelect(idx);
    }
  };

  const key = (e: KeyboardEvent) => {
    const d = e.key === "ArrowDown" ? 1 : e.key === "ArrowUp" ? -1 : e.key === "PageDown" ? 3 : e.key === "PageUp" ? -3 : 0;
    if (e.key === "Home" || e.key === "End") {
      e.preventDefault();
      onSelect(e.key === "Home" ? 0 : items.length - 1);
      return;
    }
    if (!d) return;
    e.preventDefault();
    onSelect(clamp(selected + d));
  };

  return (
    <div
      ref={el}
      role="listbox"
      tabIndex={0}
      aria-label={label}
      aria-activedescendant={`${label}-${selected}`}
      onScroll={onScroll}
      onKeyDown={key}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
      style={{ height: HEIGHT, paddingBlock: (HEIGHT - ITEM) / 2, scrollSnapType: dragging ? "none" : "y mandatory", overscrollBehavior: "contain", touchAction: "pan-y" }}
      className={cn("thin-scroll relative flex-1 select-none overflow-y-auto rounded-xl outline-none [scrollbar-width:none] focus-visible:ring-4 focus-visible:ring-ring [&::-webkit-scrollbar]:hidden", dragging ? "cursor-grabbing" : "cursor-grab")}
    >
      {items.map((n, i) => {
        const dist = Math.abs(i - pos);
        return (
          <div
            key={n}
            id={`${label}-${i}`}
            role="option"
            aria-selected={i === selected}
            onClick={() => onSelect(i)}
            style={{
              height: ITEM,
              scrollSnapAlign: "center",
              scrollSnapStop: "always",
              opacity: Math.max(0.16, 1 - dist * 0.36),
              transform: `scale(${Math.max(0.78, 1 - dist * 0.09)})`,
            }}
            className="flex items-center justify-center text-2xl font-bold tabular text-fg"
          >
            {format(n)}
          </div>
        );
      })}
    </div>
  );
}

/**
 * iOS-style time wheel: hours 00–23 and minutes in 5-minute steps in two snapping columns,
 * with a highlight band across the centre row. `value` / `onChange` use "HH:MM" (24-hour).
 */
export function TimeWheelPicker({ value, onChange, hoursLabel, minutesLabel }: { value: string; onChange: (v: string) => void; hoursLabel: string; minutesLabel: string }) {
  const [h, m] = split(value);
  const minuteIndex = Math.min(MINUTES.length - 1, Math.round(m / STEP));
  return (
    <div className="relative rounded-2xl border border-border bg-subtle px-2" style={{ height: HEIGHT }}>
      {/* centre highlight band */}
      <div className="pointer-events-none absolute inset-x-2 top-1/2 -translate-y-1/2 rounded-xl border border-primary/40 bg-primary-soft" style={{ height: ITEM }} aria-hidden />
      <div className="relative flex items-stretch gap-1">
        <Wheel items={HOURS} selected={h} onSelect={(i) => onChange(`${pad(HOURS[i])}:${pad(m)}`)} label={hoursLabel} format={pad} />
        <div className="pointer-events-none flex items-center text-2xl font-bold text-primary" style={{ height: HEIGHT }} aria-hidden>
          :
        </div>
        <Wheel items={MINUTES} selected={minuteIndex} onSelect={(i) => onChange(`${pad(h)}:${pad(MINUTES[i])}`)} label={minutesLabel} format={pad} />
      </div>
      {/* fade rows into the surface at the top and bottom */}
      <div className="pointer-events-none absolute inset-x-0 top-0 h-12 rounded-t-2xl bg-gradient-to-b from-subtle to-transparent" aria-hidden />
      <div className="pointer-events-none absolute inset-x-0 bottom-0 h-12 rounded-b-2xl bg-gradient-to-t from-subtle to-transparent" aria-hidden />
    </div>
  );
}
