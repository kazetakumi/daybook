import type { DayMarkState } from "./marksApi";
import "./markButtons.css";

type Props = {
  /** Today's current mark state for this Worker ('present' if unmarked). */
  current: DayMarkState;
  busy: boolean;
  onMark: (target: DayMarkState) => void;
};

/**
 * Inline P / L / O buttons on a Home card (SPEC.md §4) that mark *today*
 * directly for one Worker. Tapping the currently-active button again
 * returns the day to Present (clearing the Mark) — a direct set, not the
 * Cycle pane's tap-to-cycle behaviour. Owned by HomeScreen.tsx, which knows
 * each card's today-state and wires `onMark` to a PUT + local update.
 */
export default function MarkTodayButtons({ current, busy, onMark }: Props) {
  function activeClass(state: DayMarkState): string {
    return current === state ? `mark-active-${state}` : "";
  }

  return (
    <div className="mark-today" role="group" aria-label="Mark today">
      <button
        type="button"
        className={`mark-today-btn ${activeClass("present")}`}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onMark("present");
        }}
      >
        P
      </button>
      <button
        type="button"
        className={`mark-today-btn ${activeClass("leave")}`}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onMark("leave");
        }}
      >
        L
      </button>
      <button
        type="button"
        className={`mark-today-btn ${activeClass("off")}`}
        disabled={busy}
        onClick={(e) => {
          e.stopPropagation();
          onMark("off");
        }}
      >
        O
      </button>
    </div>
  );
}
