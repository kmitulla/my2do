import React, { useRef } from "react";
import { format } from "date-fns";

// Quick +N day buttons + calendar icon for date picking
// value: Firestore Timestamp | Date | string | null
// onChange: (Date | null) => void
// withTime: if true, shows time picker too (for deadline)
export default function QuickDateButtons({ value, onChange, withTime = false }) {
  const inputRef = useRef(null);

  const toDate = (v) => {
    if (!v) return null;
    if (v?.toDate) return v.toDate();
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d;
  };

  const current = toDate(value);

  const addDays = (n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    d.setHours(9, 0, 0, 0);
    onChange(d);
  };

  const handleInput = (e) => {
    if (!e.target.value) { onChange(null); return; }
    onChange(new Date(e.target.value));
  };

  const toInputVal = (d) => {
    if (!d) return "";
    // datetime-local format: yyyy-MM-ddTHH:mm
    return format(d, "yyyy-MM-dd'T'HH:mm");
  };

  const DAYS = [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <div className="space-y-1.5">
      {/* Quick day buttons */}
      <div className="flex gap-1 flex-wrap">
        {DAYS.map((n) => {
          const label = n === 0 ? "+0" : `+${n}`;
          return (
            <button
              key={n}
              type="button"
              onClick={() => addDays(n)}
              className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-600 transition-all active:scale-95"
            >
              {label}
            </button>
          );
        })}

        {/* Calendar icon button */}
        <button
          type="button"
          onClick={() => inputRef.current?.showPicker?.() || inputRef.current?.click()}
          className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-600 transition-all active:scale-95"
        >
          📅
        </button>

        {/* Clear button if value set */}
        {current && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-red-50 text-red-400 hover:bg-red-100 transition-all active:scale-95"
          >
            ✕
          </button>
        )}
      </div>

      {/* Current value display */}
      {current && (
        <div className="text-[11px] text-indigo-500 font-medium pl-0.5">
          {withTime
            ? format(current, "dd.MM.yyyy HH:mm")
            : format(current, "dd.MM.yyyy")}
        </div>
      )}

      {/* Hidden input for calendar picker */}
      <input
        ref={inputRef}
        type={withTime ? "datetime-local" : "date"}
        value={withTime ? toInputVal(current) : (current ? format(current, "yyyy-MM-dd") : "")}
        onChange={handleInput}
        style={{ position: "absolute", opacity: 0, pointerEvents: "none", width: 1, height: 1 }}
      />
    </div>
  );
}