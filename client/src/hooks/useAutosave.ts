import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Keeping unfinished work, for a screen where losing it is expensive.
 *
 * Written for the invoice review screen, where the alternative to saving is not
 * "type it again" but "photograph the invoice again and pay for a second
 * reading". The hard part is not the debounce - it is that the moment work is
 * most likely to be lost, the app going into the background, is also the moment
 * an ordinary request gets cancelled. Hence the keepalive flush below.
 */

export type AutosaveStatus =
    /** Nothing outstanding: either untouched, or deliberately let go. */
    | 'idle'
    /** Something has changed and is on its way to the server. */
    | 'saving'
    /** Everything changed so far is stored. */
    | 'saved'
    /** The last attempt did not get there. The work is still in the page. */
    | 'failed';

/** The last value whose fate is known, and what became of it. */
type Settled<T> = { value: T; result: 'saved' | 'failed' | 'discarded' };

export function useAutosave<T>({
    value,
    enabled,
    delay = 1000,
    save,
}: {
    value: T;
    /**
     * Whether `value` is worth storing yet. Left to the caller because only it
     * knows the difference between state the user produced and state the screen
     * derived on load - saving the latter would write a draft on every visit,
     * including the ones where nobody touched anything.
     */
    enabled: boolean;
    delay?: number;
    /** `keepalive` is set for the flush fired as the page goes away. */
    save: (value: T, options: { keepalive: boolean }) => Promise<unknown>;
}): {
    status: AutosaveStatus;
    /** Store what is outstanding now, rather than when the timer says so. */
    flush: () => void;
    /** Let go of what is outstanding - for work that has just been superseded. */
    discard: () => void;
} {
    const [settled, setSettled] = useState<Settled<T> | null>(null);

    // Refs, not state, for everything the timer and the listeners read: they must
    // see the newest value without being torn down and rebuilt on every keystroke.
    const latest = useRef(value);
    const saver = useRef(save);
    const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
    /** True from the moment `value` changes until that value is on the server. */
    const unsaved = useRef(false);
    /** Saves run one at a time - see `run`. */
    const chain = useRef<Promise<void>>(Promise.resolve());

    useEffect(() => {
        saver.current = save;
    }, [save]);

    const clearTimer = useCallback(() => {
        if (timer.current !== null) {
            clearTimeout(timer.current);
            timer.current = null;
        }
    }, []);

    /**
     * Every save sends a full copy of the work, so two of them in flight at once
     * could land out of order and leave the older copy stored. Chaining rather
     * than skipping means a save asked for mid-flight still happens, and happens
     * with whatever the newest state is by the time its turn comes.
     */
    const run = useCallback(
        (keepalive: boolean): Promise<void> => {
            clearTimer();
            if (!unsaved.current) return chain.current;

            const next = chain.current.then(async () => {
                // An earlier link in the chain may already have stored this.
                if (!unsaved.current) return;

                const snapshot = latest.current;
                unsaved.current = false;

                try {
                    await saver.current(snapshot, { keepalive });
                    setSettled({ value: snapshot, result: 'saved' });
                } catch (error) {
                    // The work is still in the page, so this is recoverable: the
                    // next change, or the next flush, tries again. Retrying on a
                    // timer here would hammer a server that is already failing.
                    unsaved.current = true;
                    setSettled({ value: snapshot, result: 'failed' });
                    console.error('Autosave failed:', error);
                }
            });

            chain.current = next;
            return next;
        },
        [clearTimer]
    );

    // Debounce. Restarting the timer on every change is what keeps a burst of
    // typing down to a single request.
    useEffect(() => {
        if (!enabled) return;

        latest.current = value;
        unsaved.current = true;

        timer.current = setTimeout(() => {
            timer.current = null;
            void run(false);
        }, delay);

        return clearTimer;
    }, [value, enabled, delay, run, clearTimer]);

    /**
     * The case this hook exists for: the app going into the background, the tab
     * being closed, the phone locking.
     *
     * `visibilitychange` is the one that fires reliably on mobile - `pagehide`
     * and `beforeunload` are skipped outright when iOS suspends an app - so it
     * carries the real weight, with `pagehide` covering a desktop tab close.
     * Both flush with keepalive, so the request outlives the page that sent it.
     */
    useEffect(() => {
        const onVisibilityChange = () => {
            if (document.visibilityState === 'hidden') void run(true);
        };
        const onPageHide = () => void run(true);

        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('pagehide', onPageHide);

        return () => {
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('pagehide', onPageHide);
        };
    }, [run]);

    // Navigating away inside the app unmounts this screen without any of the
    // events above firing, so a pending save has to be let go here too. Declared
    // after the debounce effect so it runs once that has cleared the timer.
    useEffect(() => () => void run(false), [run]);

    const discard = useCallback(() => {
        clearTimer();
        unsaved.current = false;
        setSettled({ value: latest.current, result: 'discarded' });
    }, [clearTimer]);

    const flush = useCallback(() => void run(false), [run]);

    /**
     * Derived rather than stored, which is what keeps "saving" honest: any value
     * this hook has not heard back about is, by definition, still on its way. It
     * also means the status cannot be left stranded by a save whose result
     * arrived after the value had already moved on.
     */
    const status: AutosaveStatus = !enabled
        ? 'idle'
        : settled !== null && Object.is(settled.value, value)
          ? settled.result === 'discarded'
              ? 'idle'
              : settled.result
          : 'saving';

    return { status, flush, discard };
}
