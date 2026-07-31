import { useMemo, useRef, useState } from 'react';
import type { PriceHistoryEntry } from '../services/api';
import { formatDate, formatMoney, formatMoneyShort } from '../lib/format';

/**
 * Cost and selling price over time.
 *
 * Drawn as a step line, not a sloping one: a price does not drift between
 * changes, it holds until someone changes it. Sloping between two entries would
 * claim prices this shop never charged. Each series therefore steps at the date
 * it changed and runs flat to today.
 *
 * Both series are money on one shared axis - never two scales, which would
 * invent a relationship between cost and price that is not in the data.
 *
 * Colours are the validated categorical pair (blue #2563eb, orange #eb6834):
 * all-pairs CVD ΔE 29.9, normal-vision ΔE 38.5, both ≥ 3:1 on white. Status
 * colours (amber, emerald, red) are deliberately absent - here a colour means
 * identity, not good or bad.
 */

const SERIES = {
    sell: { key: 'sell', label: 'Selling price', color: '#2563eb' },
    cost: { key: 'cost', label: 'Cost', color: '#eb6834' },
} as const;

/**
 * Plot geometry. The height budget includes the x-axis band, so the card never
 * grows a nested scrollbar.
 *
 * The viewBox is kept close to the width the card actually gets (~330px on a
 * phone, ~450px on a desktop) because the SVG scales to fit: a viewBox much
 * wider than the render width shrinks the label text with it. At 360 the type
 * lands between about 11px and 15px everywhere it is used.
 */
const VIEW_WIDTH = 360;
const PLOT_HEIGHT = 150;
const PAD = { top: 14, right: 46, bottom: 26, left: 6 };
const VIEW_HEIGHT = PLOT_HEIGHT + PAD.top + PAD.bottom;
const LABEL_SIZE = 11;

/**
 * Grid values a person would actually write down - 100, 250, 500 - instead of
 * whatever the padded domain happens to end on.
 */
function niceTicks(min: number, max: number, count = 3): number[] {
    const rawStep = (max - min) / (count - 1);
    const magnitude = 10 ** Math.floor(Math.log10(rawStep));
    const step =
        [1, 2, 2.5, 5, 10].map((m) => m * magnitude).find((s) => s >= rawStep) ?? magnitude * 10;

    const ticks: number[] = [];
    for (let value = Math.ceil(min / step) * step; value <= max; value += step) {
        ticks.push(Math.round(value));
    }
    return ticks.length >= 2 ? ticks : [min, max];
}

type Point = { time: number; cents: number };
type Track = { label: string; color: string; points: Point[] };

/** Oldest first, and collapsed to one entry per instant. */
const toPoints = (entries: PriceHistoryEntry[]): Point[] =>
    entries
        .map((entry) => ({ time: new Date(entry.effectiveFrom).getTime(), cents: entry.priceCents }))
        .filter((point) => Number.isFinite(point.time))
        .sort((a, b) => a.time - b.time);

export default function PriceChart({ history }: { history: PriceHistoryEntry[] }) {
    const [hoverTime, setHoverTime] = useState<number | null>(null);
    const svgRef = useRef<SVGSVGElement | null>(null);

    // The right edge of the axis is "now", read once when the chart mounts.
    // Reading the clock while rendering would make render impure and the axis
    // would creep on every re-render.
    const [now] = useState(() => Date.now());

    const model = useMemo(() => {
        const cost = toPoints(history.filter((entry) => entry.kind === 'COST'));
        const sell = toPoints(history.filter((entry) => entry.kind === 'SELL'));

        // Selling price first, so it takes categorical slot 1 and stays the
        // series a reader looks at first.
        const candidates: Array<Track | null> = [
            sell.length ? { label: SERIES.sell.label, color: SERIES.sell.color, points: sell } : null,
            cost.length ? { label: SERIES.cost.label, color: SERIES.cost.color, points: cost } : null,
        ];
        const tracks = candidates.filter((track): track is Track => track !== null);

        if (tracks.length === 0) return null;

        const allPoints = tracks.flatMap((track) => track.points);
        const firstTime = Math.min(...allPoints.map((point) => point.time));

        // A single change on a single day has no width to plot, so give the axis a
        // day of span and let the flat line read as "unchanged".
        const minTime = firstTime === now ? firstTime - 86_400_000 : firstTime;

        const values = allPoints.map((point) => point.cents);
        const lowest = Math.min(...values);
        const highest = Math.max(...values);
        // Headroom above and below so lines never sit on the frame; a flat series
        // gets an arbitrary band so it lands mid-plot instead of on an edge.
        const spread = highest - lowest || Math.max(highest * 0.2, 100);
        const minValue = Math.max(0, lowest - spread * 0.25);
        const maxValue = highest + spread * 0.25;

        // "Today" stops short of the right edge rather than sitting on it. A price
        // changed today has no width to draw - extending its line would claim it
        // applied earlier than it did - so the breathing room is what makes that
        // point read as the current value instead of a stray dot on the frame.
        const plotWidth = (VIEW_WIDTH - PAD.left - PAD.right) * 0.93;

        const x = (time: number) =>
            PAD.left + ((time - minTime) / Math.max(1, now - minTime)) * plotWidth;
        const y = (cents: number) =>
            PAD.top +
            PLOT_HEIGHT -
            ((cents - minValue) / Math.max(1, maxValue - minValue)) * PLOT_HEIGHT;

        return { tracks, minTime, minValue, maxValue, x, y };
    }, [history, now]);

    if (!model) return null;

    const { tracks, minTime, minValue, maxValue, x, y } = model;

    /** Value of a series at a given moment: the last change at or before it. */
    const valueAt = (points: Point[], time: number): number | null => {
        let current: number | null = null;
        for (const point of points) {
            if (point.time <= time) current = point.cents;
            else break;
        }
        return current ?? points[0]?.cents ?? null;
    };

    // Step path: hold the previous value, then jump at the change date.
    const stepPath = (points: Point[]) => {
        const segments = [`M ${x(points[0].time)} ${y(points[0].cents)}`];
        for (let i = 1; i < points.length; i++) {
            segments.push(`L ${x(points[i].time)} ${y(points[i - 1].cents)}`);
            segments.push(`L ${x(points[i].time)} ${y(points[i].cents)}`);
        }
        // Still in force today.
        segments.push(`L ${x(now)} ${y(points[points.length - 1].cents)}`);
        return segments.join(' ');
    };

    const gridValues = niceTicks(minValue, maxValue);

    const handlePointer = (event: React.PointerEvent<SVGSVGElement>) => {
        const svg = svgRef.current;
        if (!svg) return;

        const bounds = svg.getBoundingClientRect();
        const ratio = (event.clientX - bounds.left) / bounds.width;
        const viewX = ratio * VIEW_WIDTH;
        const plotWidth = (VIEW_WIDTH - PAD.left - PAD.right) * 0.93;
        const clamped = Math.min(1, Math.max(0, (viewX - PAD.left) / plotWidth));

        setHoverTime(minTime + clamped * (now - minTime));
    };

    const hoverX = hoverTime === null ? null : x(hoverTime);

    return (
        <figure className="m-0">
            {/* Legend: identity is never carried by colour alone. */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mb-2">
                {tracks.map((track) => (
                    <span key={track.label} className="inline-flex items-center gap-1.5 text-sm text-slate-600">
                        <span
                            aria-hidden="true"
                            className="w-3 h-0.5 rounded-full"
                            style={{ backgroundColor: track.color }}
                        />
                        {track.label}
                    </span>
                ))}
            </div>

            <div className="relative">
                <svg
                    ref={svgRef}
                    viewBox={`0 0 ${VIEW_WIDTH} ${VIEW_HEIGHT}`}
                    className="w-full h-auto touch-none"
                    role="img"
                    aria-label={`${tracks.map((t) => t.label).join(' and ')} over time. The full figures are listed below the chart.`}
                    onPointerMove={handlePointer}
                    onPointerDown={handlePointer}
                    onPointerLeave={() => setHoverTime(null)}
                >
                    {/* Recessive solid hairlines, one shade off the surface. */}
                    {gridValues.map((value) => (
                        <g key={value}>
                            <line
                                x1={PAD.left}
                                x2={VIEW_WIDTH - PAD.right}
                                y1={y(value)}
                                y2={y(value)}
                                stroke="#e2e8f0"
                                strokeWidth="1"
                            />
                            <text
                                x={VIEW_WIDTH - PAD.right + 6}
                                y={y(value) + 4}
                                className="fill-slate-500"
                                style={{ fontSize: LABEL_SIZE, fontVariantNumeric: 'tabular-nums' }}
                            >
                                {formatMoneyShort(value)}
                            </text>
                        </g>
                    ))}

                    <text
                        x={PAD.left}
                        y={VIEW_HEIGHT - 7}
                        className="fill-slate-500"
                        style={{ fontSize: LABEL_SIZE }}
                    >
                        {formatDate(new Date(minTime))}
                    </text>
                    <text
                        x={x(now)}
                        y={VIEW_HEIGHT - 7}
                        textAnchor="middle"
                        className="fill-slate-500"
                        style={{ fontSize: LABEL_SIZE }}
                    >
                        Today
                    </text>

                    {hoverX !== null && (
                        <line
                            x1={hoverX}
                            x2={hoverX}
                            y1={PAD.top}
                            y2={PAD.top + PLOT_HEIGHT}
                            stroke="#94a3b8"
                            strokeWidth="1"
                        />
                    )}

                    {tracks.map((track) => (
                        <path
                            key={track.label}
                            d={stepPath(track.points)}
                            fill="none"
                            stroke={track.color}
                            strokeWidth="2" vectorEffect="non-scaling-stroke"
                            strokeLinejoin="round"
                            strokeLinecap="round"
                        />
                    ))}

                    {/* Markers carry a 2px surface ring so overlapping points stay
                        readable without drawing a border around them. */}
                    {tracks.map((track) =>
                        track.points.map((point) => (
                            <circle
                                key={`${track.label}-${point.time}`}
                                cx={x(point.time)}
                                cy={y(point.cents)}
                                r="4.5"
                                fill={track.color}
                                stroke="#ffffff"
                                strokeWidth="2"
                            />
                        ))
                    )}

                    {/* Only the current value is labelled: a number on every point
                        would be unreadable, and the list below has them all. */}
                    {tracks.map((track) => {
                        const last = track.points[track.points.length - 1];
                        return (
                            <circle
                                key={`${track.label}-now`}
                                cx={x(now)}
                                cy={y(last.cents)}
                                r="4.5"
                                fill={track.color}
                                stroke="#ffffff"
                                strokeWidth="2"
                            />
                        );
                    })}

                    {hoverX !== null &&
                        tracks.map((track) => {
                            const value = valueAt(track.points, hoverTime!);
                            if (value === null) return null;
                            return (
                                <circle
                                    key={`${track.label}-hover`}
                                    cx={hoverX}
                                    cy={y(value)}
                                    r="6"
                                    fill={track.color}
                                    stroke="#ffffff"
                                    strokeWidth="2"
                                />
                            );
                        })}
                </svg>

                {hoverTime !== null && (
                    <div
                        className="absolute -top-1 bg-white border border-slate-200 rounded-xl shadow-lg px-2.5 py-1.5 pointer-events-none text-xs whitespace-nowrap"
                        // Flips to the other side of the crosshair past the
                        // halfway mark, so it never runs off the card.
                        style={
                            (hoverX ?? 0) / VIEW_WIDTH > 0.5
                                ? { right: `${(1 - (hoverX ?? 0) / VIEW_WIDTH) * 100 + 3}%` }
                                : { left: `${((hoverX ?? 0) / VIEW_WIDTH) * 100 + 3}%` }
                        }
                    >
                        <p className="text-slate-500 mb-0.5">{formatDate(new Date(hoverTime))}</p>
                        {tracks.map((track) => {
                            const value = valueAt(track.points, hoverTime);
                            return (
                                <p key={track.label} className="flex items-center gap-2 text-slate-900">
                                    <span
                                        aria-hidden="true"
                                        className="w-2 h-2 rounded-full shrink-0"
                                        style={{ backgroundColor: track.color }}
                                    />
                                    <span className="font-semibold tabular-nums">
                                        {value === null ? '—' : formatMoney(value)}
                                    </span>
                                </p>
                            );
                        })}
                    </div>
                )}
            </div>

            <figcaption className="text-sm text-slate-500 mt-1">
                A price holds until you change it, so the line steps rather than slopes.
            </figcaption>
        </figure>
    );
}
