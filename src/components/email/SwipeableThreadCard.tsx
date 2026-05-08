import { useRef, useState, useCallback, useEffect } from "react";
import { ThreadCard } from "./ThreadCard";
import type { Thread } from "@/stores/threadStore";
import { Archive, Trash2 } from "lucide-react";
import { useActiveLabel } from "@/hooks/useRouteNavigation";
import { useAccountStore } from "@/stores/accountStore";
import {
  archiveThread,
  trashThread,
  permanentDeleteThread,
} from "@/services/emailActions";
import { deleteThread as deleteThreadFromDb } from "@/services/db/threads";

// ── Tuneable constants ────────────────────────────────────────────────────────
const SWIPE_THRESHOLD  = 120;  // px of raw drag to commit the action
const SWIPE_MAX        = 200;  // absolute max raw travel (pre-resistance)
const SWIPE_DEAD_ZONE  = 12;   // px before pointer gesture is recognised
const DIR_RATIO        = 2.0;  // horizontal must be DIR_RATIO × vertical (pointer)
const WHEEL_DEBOUNCE   = 250;  // ms of silence before "gesture end" fires (absorbs inertia)
const WHEEL_SCALE      = 0.55; // trackpad deltaX → raw pixels multiplier
const WHEEL_DEAD_ZONE  = 18;   // accumulate this many px before the swipe activates
const WHEEL_ANGLE_MIN  = 2.5;  // deltaX must be WHEEL_ANGLE_MIN × deltaY to start

const WHEEL_DAMPING    = 0.60; // smoothing: each event contributes only this fraction

/**
 * Rubber-band resistance:
 *   – below SWIPE_THRESHOLD  → 1:1 with drag (feel snappy and responsive)
 *   – above SWIPE_THRESHOLD  → progressively harder, tapering off at SWIPE_MAX
 */
function rubberBand(raw: number): number {
  const sign = raw < 0 ? -1 : 1;
  const abs  = Math.abs(raw);
  if (abs <= SWIPE_THRESHOLD) return raw;
  const extra = (abs - SWIPE_THRESHOLD) * 0.32;
  return sign * Math.min(SWIPE_MAX, SWIPE_THRESHOLD + extra);
}

// ── Types ─────────────────────────────────────────────────────────────────────
type SwipePhase = "idle" | "dragging" | "snapping" | "exiting";

interface SwipeableThreadCardProps {
  thread: Thread;
  isSelected: boolean;
  onClick: (thread: Thread) => void;
  onContextMenu?: (e: React.MouseEvent, threadId: string) => void;
  category?: string;
  showCategoryBadge?: boolean;
  hasFollowUp?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────
export function SwipeableThreadCard(props: SwipeableThreadCardProps) {
  const { thread } = props;
  const activeLabel    = useActiveLabel();
  const activeAccountId = useAccountStore((s) => s.activeAccountId);

  const [translateX, setTranslateX] = useState(0);
  const [phase,      setPhase]      = useState<SwipePhase>("idle");
  const [exitDir,    setExitDir]    = useState<"left" | "right">("left");
  const [collapsed,  setCollapsed]  = useState(false);

  // Refs for non-stale access inside event handlers / timeouts
  const rawX        = useRef(0);           // accumulated raw drag distance
  const phaseRef    = useRef<SwipePhase>("idle");
  const startX      = useRef(0);
  const startY      = useRef(0);
  const isScroll    = useRef<boolean | null>(null);
  const cardDivRef    = useRef<HTMLDivElement>(null);
  const wrapperRef    = useRef<HTMLDivElement>(null);
  const wheelTimer    = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Wheel-specific state (all refs — no re-renders inside the handler)
  const wheelActive   = useRef(false);   // has the gesture crossed the dead zone?
  const wheelAccum    = useRef(0);       // raw deltaX accumulator (pre-activation)

  // Keep phaseRef in sync
  useEffect(() => { phaseRef.current = phase; }, [phase]);

  const isTrashView     = activeLabel === "trash";
  const isTrashViewRef  = useRef(isTrashView);
  useEffect(() => { isTrashViewRef.current = isTrashView; }, [isTrashView]);

  // ── Snap back when another thread is selected ─────────────────────────────
  useEffect(() => {
    if (!props.isSelected && rawX.current !== 0 && phaseRef.current !== "exiting" && !wheelActive.current) {
      rawX.current = 0;
      setTranslateX(0);
      setPhase("snapping");
      const t = setTimeout(() => setPhase("idle"), 350);
      return () => clearTimeout(t);
    }
  }, [props.isSelected]); // intentionally only on selection change

  // ── Email action ──────────────────────────────────────────────────────────
  const executeAction = useCallback(
    async (dir: "left" | "right") => {
      if (!activeAccountId) return;
      if (dir === "left") {
        if (isTrashViewRef.current) {
          await permanentDeleteThread(activeAccountId, thread.id, []);
          await deleteThreadFromDb(activeAccountId, thread.id);
        } else {
          await trashThread(activeAccountId, thread.id, []);
        }
      } else {
        await archiveThread(activeAccountId, thread.id, []);
      }
    },
    [activeAccountId, thread.id],
  );

  // ── Shared release logic (used by both pointer and wheel) ─────────────────
  // Uses a ref so the wheel closure is always up-to-date without re-attaching.
  const executeActionRef = useRef(executeAction);
  useEffect(() => { executeActionRef.current = executeAction; }, [executeAction]);

  const doRelease = useCallback((currentRaw: number) => {
    if (phaseRef.current === "exiting") return;

    if (Math.abs(currentRaw) >= SWIPE_THRESHOLD) {
      const dir = currentRaw < 0 ? "left" : "right";

      // No archive swipe inside trash view
      if (dir === "right" && isTrashViewRef.current) {
        rawX.current = 0;
        setTranslateX(0);
        setPhase("snapping");
        setTimeout(() => setPhase("idle"), 350);
        return;
      }

      setExitDir(dir);
      setPhase("exiting");
      setTimeout(() => {
        setCollapsed(true);
        rawX.current = 0;
        setTimeout(() => executeActionRef.current(dir), 60);
      }, 290);
    } else {
      rawX.current = 0;
      setTranslateX(0);
      setPhase("snapping");
      setTimeout(() => setPhase("idle"), 350);
    }
  }, []); // stable — reads everything via refs

  const doReleaseRef = useRef(doRelease);
  useEffect(() => { doReleaseRef.current = doRelease; }, [doRelease]);

  // ── Trackpad wheel handler ─────────────────────────────────────────────────
  useEffect(() => {
    const el = cardDivRef.current;
    if (!el) return;

    const resetWheel = () => {
      wheelActive.current  = false;
      wheelAccum.current   = 0;
    };

    const onWheel = (e: WheelEvent) => {
      // ① Angle lock — ignore diagonals and vertical-dominant events
      //    Skip the check once the gesture is latched so inertia can't disengage it.
      const angle = Math.abs(e.deltaX) / (Math.abs(e.deltaY) + 0.1);
      if (!wheelActive.current && angle < WHEEL_ANGLE_MIN) return;

      // ② Dead zone — accumulate before activating
      if (!wheelActive.current) {
        wheelAccum.current += e.deltaX;
        if (Math.abs(wheelAccum.current) < WHEEL_DEAD_ZONE) return;
        // Threshold crossed → activate and seed rawX with what we've accumulated
        wheelActive.current = true;
        rawX.current = -(wheelAccum.current * WHEEL_SCALE);
      }

      e.preventDefault();
      e.stopPropagation();

      // ③ Damping + dynamic resistance
      // We keep 1:1 movement for the first 50px to feel "sticky" and intentional,
      // then taper off to 0.2 resistance as we approach SWIPE_MAX.
      let resistance = 1.0;
      if (Math.abs(rawX.current) > 50) {
        resistance = Math.max(0.2, 1 - Math.abs(rawX.current) / SWIPE_MAX);
      }
      rawX.current = Math.max(
        -(SWIPE_MAX * 2),
        Math.min(SWIPE_MAX * 2, rawX.current - e.deltaX * WHEEL_SCALE * WHEEL_DAMPING * resistance),
      );

      // ④ Latch — once past WHEEL_LATCH_PX we mark the gesture locked-in
      //    (the angle check above is already bypassed once wheelActive is true)
      setTranslateX(rubberBand(rawX.current));
      setPhase("dragging");

      // ⑤ Debounce — fires WHEEL_DEBOUNCE ms after the last event (absorbs inertia)
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
      const snap = rawX.current;
      wheelTimer.current = setTimeout(() => {
        doReleaseRef.current(snap);
        resetWheel();
      }, WHEEL_DEBOUNCE);
    };

    el.addEventListener("wheel", onWheel, { passive: false });
    return () => {
      el.removeEventListener("wheel", onWheel);
      if (wheelTimer.current) clearTimeout(wheelTimer.current);
    };
  }, []); // attach once — inner logic uses refs only

  // ── Pointer (mouse / touch) handlers ─────────────────────────────────────
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    startX.current = e.clientX;
    startY.current = e.clientY;
    rawX.current   = 0;
    isScroll.current = null;
  }, []);

  const onPointerMove = useCallback(
    (e: React.PointerEvent) => {
      const dx = e.clientX - startX.current;
      const dy = e.clientY - startY.current;

      if (isScroll.current === null && (Math.abs(dx) > SWIPE_DEAD_ZONE || Math.abs(dy) > SWIPE_DEAD_ZONE)) {
        isScroll.current = Math.abs(dy) * DIR_RATIO > Math.abs(dx);
      }
      if (isScroll.current) return;

      if (Math.abs(dx) > SWIPE_DEAD_ZONE) {
        e.stopPropagation();
        const capped = isTrashView
          ? Math.max(-(SWIPE_MAX * 2), Math.min(0, dx))
          : Math.max(-(SWIPE_MAX * 2), Math.min(SWIPE_MAX * 2, dx));
        rawX.current = capped;
        setTranslateX(rubberBand(capped));
        setPhase("dragging");
      }
    },
    [isTrashView],
  );

  const snapBack = useCallback(() => {
    // Never interrupt a live wheel gesture — the debounce timer owns the release.
    if (phaseRef.current === "exiting" || wheelActive.current) return;
    rawX.current = 0;
    setTranslateX(0);
    setPhase("snapping");
    isScroll.current = null;
    setTimeout(() => setPhase("idle"), 350);
  }, []);

  const onPointerUp = useCallback(() => {
    if (isScroll.current === true) {
      rawX.current = 0;
      setTranslateX(0);
      setPhase("idle");
      return;
    }
    doReleaseRef.current(rawX.current);
  }, []);

  // ── Render values ─────────────────────────────────────────────────────────
  const isDragging   = phase === "dragging";
  const leftReveal   = Math.min(1, Math.max(0, -translateX / SWIPE_THRESHOLD));
  const rightReveal  = Math.min(1, Math.max(0, translateX  / SWIPE_THRESHOLD));

  const cardStyle: React.CSSProperties = {
    transform:
      phase === "exiting"
        ? exitDir === "left" ? "translateX(-110%) translateZ(0)" : "translateX(110%) translateZ(0)"
        : `translateX(${translateX}px) translateZ(0)`,
    transition:
      isDragging       ? "none"
      : phase === "exiting" ? "transform 290ms cubic-bezier(0.4,0,0.8,0.2)"
      : "transform 350ms cubic-bezier(0.34,1.56,0.64,1)",
    position: "relative",
    zIndex: 1,
    willChange: "transform",
    touchAction: "pan-y",
    cursor: isDragging ? "grabbing" : undefined,
    // Disable inner pointer events while dragging so buttons/links don't interfere
    pointerEvents: isDragging ? "none" : undefined,
  };

  return (
    <div
      ref={wrapperRef}
      style={{
        overflow: "hidden",
        maxHeight: collapsed ? "0px" : "300px",
        transition: collapsed ? "max-height 240ms ease-in" : undefined,
      }}
    >
      <div style={{ position: "relative" }}>

        {/* Left reveal — Trash */}
        <div
          aria-hidden
          style={{
            position: "absolute", inset: 0,
            display: "flex", alignItems: "center", justifyContent: "flex-end",
            paddingRight: "28px",
            background: "linear-gradient(to left, #7f1d1d 0%, #dc2626 60%, #ef4444 100%)",
            opacity: leftReveal,
            transition: isDragging ? "none" : "opacity 150ms ease",
          }}
        >
          <div style={{
            display: "flex", flexDirection: "column", alignItems: "center",
            gap: "4px", color: "white",
            transform: `scale(${0.65 + leftReveal * 0.35})`,
            transition: isDragging ? "none" : "transform 150ms ease",
          }}>
            <Trash2 size={20} strokeWidth={2.5} />
            <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
              {isTrashView ? "Delete" : "Trash"}
            </span>
          </div>
        </div>

        {/* Right reveal — Archive (not shown in Trash) */}
        {!isTrashView && (
          <div
            aria-hidden
            style={{
              position: "absolute", inset: 0,
              display: "flex", alignItems: "center", justifyContent: "flex-start",
              paddingLeft: "28px",
              background: "linear-gradient(to right, #064e3b 0%, #059669 60%, #10b981 100%)",
              opacity: rightReveal,
              transition: isDragging ? "none" : "opacity 150ms ease",
            }}
          >
            <div style={{
              display: "flex", flexDirection: "column", alignItems: "center",
              gap: "4px", color: "white",
              transform: `scale(${0.65 + rightReveal * 0.35})`,
              transition: isDragging ? "none" : "transform 150ms ease",
            }}>
              <Archive size={20} strokeWidth={2.5} />
              <span style={{ fontSize: "10px", fontWeight: 700, letterSpacing: "0.06em", textTransform: "uppercase" }}>
                Archive
              </span>
            </div>
          </div>
        )}

        {/* Card */}
        <div
          ref={cardDivRef}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={snapBack}
          onPointerCancel={snapBack}
          style={cardStyle}
        >
          <ThreadCard {...props} />
        </div>

      </div>
    </div>
  );
}
