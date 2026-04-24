import React, { useId } from "react";
import { format } from "date-fns";

// Quick +N day buttons + calendar icon for date picking
// value: Firestore Timestamp | Date | string | null
// onChange: (Date | null) => void
// withTime: if true, shows datetime-local (for deadline)
export default function QuickDateButtons({ value, onChange, withTime = false }) {
  const inputId = useId();

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
    return format(d, "yyyy-MM-dd'T'HH:mm");
  };

  const DAYS = [0, 1, 2, 3, 4, 5, 6, 7];

  return (
    <div className="space-y-1.5">
      <div className="flex gap-1 flex-wrap items-center">
        {DAYS.map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => addDays(n)}
            className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-600 transition-all active:scale-95"
          >
            {n === 0 ? "+0" : `+${n}`}
          </button>
        ))}

        {/* Calendar picker: label wraps a visible input so click works in iframes */}
        <label
          htmlFor={inputId}
          className="px-2 py-1 rounded-lg text-[11px] font-semibold bg-slate-100 text-slate-600 hover:bg-indigo-100 hover:text-indigo-600 transition-all active:scale-95 cursor-pointer select-none"
        >
          📅
          <input
            id={inputId}
            type={withTime ? "datetime-local" : "date"}
            value={withTime ? toInputVal(current) : (current ? format(current, "yyyy-MM-dd") : "")}
            onChange={handleInput}
            style={{ position: "absolute", opacity: 0, width: 0, height: 0, pointerEvents: "none" }}
          />
        </label>

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

      {current && (
        <div className="text-[11px] text-indigo-500 font-medium pl-0.5">
          {withTime ? format(current, "dd.MM.yyyy HH:mm") : format(current, "dd.MM.yyyy")}
        </div>
      )}
    </div>
  );
}