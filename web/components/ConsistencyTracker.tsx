"use client";

import { useEffect, useState } from "react";
import { Store, type ActivityDay } from "@/lib/store";
import Icon from "./Icon";
import styles from "./ConsistencyTracker.module.css";

const DOW = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const SECTION_LABEL: Record<string, string> = {
  RC: "Reading Comp.", CR: "Critical Reasoning", PS: "Problem Solving", DS: "Data Sufficiency",
};
const SECTION_ORDER = ["RC", "CR", "PS", "DS"] as const;
const SECTION_CLASS: Record<string, string> = { RC: "secRC", CR: "secCR", PS: "secPS", DS: "secDS" };

const RANGES = [
  { days: 7, label: "Week" },
  { days: 30, label: "Month" },
  { days: 90, label: "3 Months" },
] as const;

/** Effort tier for a day — drives bar thickness (week view) and heatmap shade. */
function tier(totalMs: number): 0 | 1 | 2 | 3 {
  const min = totalMs / 60000;
  if (min <= 0) return 0;
  if (min < 15) return 1;
  if (min < 45) return 2;
  return 3;
}
const TIER_LABEL = ["No activity", "Light", "Solid session", "Deep work"];

const fmt = (ms: number) => {
  const m = Math.round(ms / 60000);
  if (m <= 0) return "0m";
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h}h ${m % 60}m` : `${h}h`;
};
const dayLabel = (iso: string) =>
  new Date(iso + "T00:00:00").toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

type Day = { date: string; totalMs: number; bySection: ActivityDay };

/** Lay days out as GitHub-style week columns (rows = Sun..Sat), padding the
    first column so each day sits on its real weekday row. */
function toWeekColumns(days: Day[]): (Day | null)[][] {
  if (!days.length) return [];
  const cols: (Day | null)[][] = [];
  let col: (Day | null)[] = [];
  for (let i = 0; i < new Date(days[0].date + "T00:00:00").getDay(); i++) col.push(null);
  for (const d of days) {
    col.push(d);
    if (col.length === 7) { cols.push(col); col = []; }
  }
  if (col.length) {
    while (col.length < 7) col.push(null);
    cols.push(col);
  }
  return cols;
}

/** Month name for a column, only when the month changes (like a calendar axis). */
function monthTicks(cols: (Day | null)[][]): (string | null)[] {
  let last = "";
  return cols.map((col) => {
    const first = col.find(Boolean);
    if (!first) return null;
    const m = new Date(first.date + "T00:00:00").toLocaleDateString(undefined, { month: "short" });
    if (m === last) return null;
    last = m;
    return m;
  });
}

/**
 * Preparation tracker. The range switcher changes the *visualization* to fit
 * the timescale: a week is few enough days to show a per-section breakdown per
 * day (stacked bars), while a month/quarter is about spotting the pattern of
 * showing up (intensity heatmap, paired side-by-side with the effort split).
 */
export default function ConsistencyTracker() {
  const [range, setRange] = useState<number>(7);
  const [days, setDays] = useState<Day[]>([]);
  const [prevDays, setPrevDays] = useState<Day[]>([]);
  const [streak, setStreak] = useState(0);

  useEffect(() => {
    // pull twice the range so the trend can compare against the prior window
    const win = Store.consistency(range * 2);
    setDays(win.slice(range));
    setPrevDays(win.slice(0, range));
    setStreak(Store.streak());
  }, [range]);

  const total = days.reduce((s, d) => s + d.totalMs, 0);
  const prevTotal = prevDays.reduce((s, d) => s + d.totalMs, 0);
  const activeDays = days.filter((d) => d.totalMs > 0).length;
  const best = days.reduce<Day | null>((m, d) => (d.totalMs > (m?.totalMs ?? 0) ? d : m), null);
  const avgActive = activeDays ? total / activeDays : 0;
  const trendPct = prevTotal > 0 ? Math.round(((total - prevTotal) / prevTotal) * 100) : null;
  const todayKey = new Date().toISOString().slice(0, 10);
  const empty = total === 0;

  const bySection = SECTION_ORDER
    .map((s) => ({ key: s, ms: days.reduce((sum, d) => sum + (d.bySection[s] ?? 0), 0) }))
    .filter((s) => s.ms > 0)
    .sort((a, b) => b.ms - a.ms);

  const cols = toWeekColumns(days);
  const ticks = monthTicks(cols);

  /* the middle zone always renders something — returning null here would
     collapse the three-column grid and shift the stats into the wrong column */
  const split = empty ? (
    <div className={styles.splitEmpty}>
      Your section mix shows up here once you start practising.
    </div>
  ) : (
    <div className={styles.split}>
      <div className={styles.splitLabel}>Where the time went</div>
      <div className={styles.splitBar}>
        {bySection.map((s) => (
          <i
            key={s.key}
            className={`${styles.splitSeg} ${styles[SECTION_CLASS[s.key]]}`}
            style={{ width: `${(s.ms / total) * 100}%` }}
            title={`${SECTION_LABEL[s.key]} · ${fmt(s.ms)} (${Math.round((s.ms / total) * 100)}%)`}
          />
        ))}
      </div>
      <div className={styles.splitKeys}>
        {bySection.map((s) => (
          <span key={s.key} className={styles.splitKey}>
            <i className={`${styles.dot} ${styles[SECTION_CLASS[s.key]]}`} />
            {SECTION_LABEL[s.key]}
            <b>{fmt(s.ms)}</b>
          </span>
        ))}
      </div>
    </div>
  );

  const heat = (
    <div className={styles.heatBlock}>
      <div className={styles.heatMonths}>
        {ticks.map((t, i) => (
          <span key={i} className={styles.heatMonth}>{t ?? ""}</span>
        ))}
      </div>
      <div className={styles.heatGrid}>
        <div className={styles.heatRows} aria-hidden="true">
          <span>Mon</span><span>Wed</span><span>Fri</span>
        </div>
        <div className={styles.heat}>
          {cols.map((col, i) => (
            <div key={i} className={styles.heatCol}>
              {col.map((d, j) =>
                d ? (
                  <i
                    key={d.date}
                    className={`${styles.cell} ${styles["h" + tier(d.totalMs)]} ${d.date === todayKey ? styles.cellToday : ""}`}
                    title={`${dayLabel(d.date)} · ${TIER_LABEL[tier(d.totalMs)]}${d.totalMs ? ` · ${fmt(d.totalMs)}` : ""}`}
                  />
                ) : (
                  <i key={j} className={styles.cellVoid} />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
      <div className={styles.heatKey}>
        <span>Less</span>
        <i className={`${styles.cell} ${styles.h0}`} />
        <i className={`${styles.cell} ${styles.h1}`} />
        <i className={`${styles.cell} ${styles.h2}`} />
        <i className={`${styles.cell} ${styles.h3}`} />
        <span>More</span>
      </div>
    </div>
  );

  return (
    <div className={styles.box}>
      <div className={styles.head}>
        <div className={styles.headMain}>
          <div className={styles.title}>Consistency</div>
          <div className={styles.sub}>
            {empty ? (
              "Answer a question to start tracking"
            ) : (
              <>
                <b className={styles.subTotal}>{fmt(total)}</b> invested
                {trendPct !== null && (
                  <span className={trendPct >= 0 ? styles.trendUp : styles.trendDown}>
                    {trendPct >= 0 ? "▲" : "▼"} {Math.abs(trendPct)}%
                  </span>
                )}
              </>
            )}
          </div>
        </div>
        {streak > 0 && (
          <div className={styles.streak} title={`${streak}-day streak — keep it alive`}>
            <Icon name="flame" size={15} />
            <b>{streak}</b>
            <span>day{streak === 1 ? "" : "s"}</span>
          </div>
        )}
      </div>

      <div className={styles.ranges} role="tablist" aria-label="Time range">
        {RANGES.map((r) => (
          <button
            key={r.days}
            type="button"
            role="tab"
            aria-selected={range === r.days}
            className={`${styles.range} ${range === r.days ? styles.rangeOn : ""}`}
            onClick={() => setRange(r.days)}
          >
            {r.label}
          </button>
        ))}
      </div>

      {/* one balanced two-column layout for every range: viz left, split right */}
      <div className={styles.panels}>
        {range === 7 ? (
          <div className={styles.bars}>
            {days.map((d) => {
              const t = tier(d.totalMs);
              const segs = (Object.entries(d.bySection) as [string, number][]).filter(([, ms]) => ms > 0);
              return (
                <div key={d.date} className={styles.barCol}>
                  <span className={styles.barVal}>{d.totalMs ? fmt(d.totalMs) : ""}</span>
                  <div
                    className={`${styles.barTrack} ${styles["t" + t]}`}
                    title={`${dayLabel(d.date)} · ${TIER_LABEL[t]}${d.totalMs ? ` · ${fmt(d.totalMs)}` : ""}`}
                  >
                    {segs.map(([type, ms]) => (
                      <i
                        key={type}
                        className={`${styles.seg} ${styles[SECTION_CLASS[type]]}`}
                        style={{ height: `${(ms / d.totalMs) * 100}%` }}
                      />
                    ))}
                  </div>
                  <span className={`${styles.barDow} ${d.date === todayKey ? styles.today : ""}`}>
                    {DOW[new Date(d.date + "T00:00:00").getDay()][0]}
                  </span>
                </div>
              );
            })}
          </div>
        ) : (
          heat
        )}
        {split}

        <div className={styles.stats}>
          <div className={styles.stat}>
            <b>{activeDays}<small>/{days.length}</small></b>
            <span>Days active</span>
          </div>
          <div className={styles.stat}>
            <b>{best && best.totalMs ? fmt(best.totalMs) : "—"}</b>
            <span>{best && best.totalMs ? `Best · ${DOW[new Date(best.date + "T00:00:00").getDay()]}` : "Best day"}</span>
          </div>
          <div className={styles.stat}>
            <b>{avgActive ? fmt(avgActive) : "—"}</b>
            <span>Avg / active day</span>
          </div>
        </div>
      </div>
    </div>
  );
}
