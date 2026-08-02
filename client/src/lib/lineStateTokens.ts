import type { LineState } from './invoiceReview';

/**
 * The one place a line's state is turned into colour.
 *
 * Three things draw a line's state and they must never disagree: the chip beside
 * its title, the rail down the side of its row, and that line's slice of the
 * progress bar at the top of the screen. Reading all three from here is what
 * makes "the amber one" a sentence about the same colour wherever it is said.
 *
 * `bar` is a block of flat colour carrying no text, so it takes the 3:1 a
 * graphical object owes its background rather than the 4.5:1 of the chip, which
 * carries words - which is why these are the 600s and not the 400s a status
 * colour is usually reached for. Green against amber is the one pair a red-green
 * reader cannot separate, so colour is never asked to work alone here: the same
 * state is always also a named, icon-bearing chip beside the line's title.
 */
export const lineStateTokens: Record<LineState, { bar: string; chip: string }> = {
    ready: { bar: 'bg-emerald-600', chip: 'bg-emerald-50 text-emerald-800' },
    attention: { bar: 'bg-amber-600', chip: 'bg-amber-100 text-amber-900' },
    // Left out is settled, not wrong, so it stays quiet: it is the one bar that
    // should read as absence, and it only has to be told from the empty track.
    excluded: { bar: 'bg-slate-300', chip: 'bg-slate-100 text-slate-600' },
};
