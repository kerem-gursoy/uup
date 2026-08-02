import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAutosave } from './useAutosave';

/**
 * What is being protected here is somebody's half-finished invoice review. The
 * cases below are the ways that work actually gets lost: a save that never fires,
 * one that fires with stale data, one cancelled by the app going into the
 * background, and one silently swallowed when the network fails.
 */

const DELAY = 1000;

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

/** Lets the debounce elapse and any resulting promises settle. */
const advance = async (ms = DELAY) => {
    await act(async () => {
        vi.advanceTimersByTime(ms);
    });
};

const setVisibility = (state: 'visible' | 'hidden') => {
    Object.defineProperty(document, 'visibilityState', {
        value: state,
        configurable: true,
    });
};

type Props = { value: unknown; enabled: boolean };

const setup = (
    save: (value: unknown, options: { keepalive: boolean }) => Promise<unknown>,
    initial: Props = { value: { n: 0 }, enabled: true }
) =>
    renderHook(
        ({ value, enabled }: Props) =>
            useAutosave({ value, enabled, delay: DELAY, save }),
        { initialProps: initial }
    );

describe('useAutosave', () => {
    it('saves nothing until there is something worth saving', async () => {
        // Opening a screen and reading it must not write a draft, or every
        // invoice anyone glances at acquires one.
        const save = vi.fn().mockResolvedValue(undefined);
        const { result } = setup(save, { value: { n: 0 }, enabled: false });

        await advance();

        expect(save).not.toHaveBeenCalled();
        expect(result.current.status).toBe('idle');
    });

    it('collapses a burst of edits into one save of the latest value', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const { result, rerender } = setup(save);

        rerender({ value: { n: 1 }, enabled: true });
        rerender({ value: { n: 2 }, enabled: true });
        rerender({ value: { n: 3 }, enabled: true });
        expect(save).not.toHaveBeenCalled();

        await advance();

        expect(save).toHaveBeenCalledTimes(1);
        expect(save.mock.calls[0][0]).toEqual({ n: 3 });
        expect(result.current.status).toBe('saved');
    });

    it('reports work as outstanding from the edit, not from the request', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const { result, rerender } = setup(save);

        rerender({ value: { n: 1 }, enabled: true });

        // Still inside the debounce window - nothing has been sent yet, but the
        // reviewer's work is accounted for and the status must say so.
        expect(result.current.status).toBe('saving');

        await advance();
        expect(result.current.status).toBe('saved');
    });

    it('says so when a save fails, and tries again on the next edit', async () => {
        const save = vi
            .fn()
            .mockRejectedValueOnce(new Error('offline'))
            .mockResolvedValue(undefined);
        vi.spyOn(console, 'error').mockImplementation(() => {});
        const { result, rerender } = setup(save);

        rerender({ value: { n: 1 }, enabled: true });
        await advance();

        expect(result.current.status).toBe('failed');

        // The work is still in the page, so the next edit carries it again.
        rerender({ value: { n: 2 }, enabled: true });
        await advance();

        expect(save).toHaveBeenCalledTimes(2);
        expect(save.mock.calls[1][0]).toEqual({ n: 2 });
        expect(result.current.status).toBe('saved');
    });

    it('saves immediately when the app goes into the background', async () => {
        // The case the whole hook exists for: switching apps mid-invoice. The
        // debounce has not elapsed, and on mobile the page may never resume.
        const save = vi.fn().mockResolvedValue(undefined);
        const { rerender } = setup(save);

        rerender({ value: { n: 1 }, enabled: true });

        setVisibility('hidden');
        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
        });

        expect(save).toHaveBeenCalledTimes(1);
        expect(save.mock.calls[0][0]).toEqual({ n: 1 });
        // keepalive, or the browser cancels the request as the page is suspended.
        expect(save.mock.calls[0][1]).toEqual({ keepalive: true });

        setVisibility('visible');
    });

    it('does not save again when the app merely comes back to the foreground', async () => {
        const save = vi.fn().mockResolvedValue(undefined);
        const { rerender } = setup(save);

        rerender({ value: { n: 1 }, enabled: true });
        await advance();
        expect(save).toHaveBeenCalledTimes(1);

        setVisibility('hidden');
        await act(async () => {
            document.dispatchEvent(new Event('visibilitychange'));
        });

        expect(save).toHaveBeenCalledTimes(1);
        setVisibility('visible');
    });

    it('saves on the way out when the screen is navigated away from', async () => {
        // Leaving inside the SPA fires no page event at all - only unmount.
        const save = vi.fn().mockResolvedValue(undefined);
        const { rerender, unmount } = setup(save);

        rerender({ value: { n: 1 }, enabled: true });
        await act(async () => {
            unmount();
        });

        expect(save).toHaveBeenCalledTimes(1);
        expect(save.mock.calls[0][0]).toEqual({ n: 1 });
    });

    it('lets go of work that has been superseded', async () => {
        // Re-reading the invoice replaces every line, so the pending save is
        // about to describe rows that no longer exist.
        const save = vi.fn().mockResolvedValue(undefined);
        const { result, rerender } = setup(save);

        rerender({ value: { n: 1 }, enabled: true });
        act(() => {
            result.current.discard();
        });

        await advance();

        expect(save).not.toHaveBeenCalled();
        expect(result.current.status).toBe('idle');
    });

    it('never has two saves of the same work in flight at once', async () => {
        // Two full copies racing could land out of order and store the older one.
        let inFlight = 0;
        let overlapped = false;
        const save = vi.fn().mockImplementation(async () => {
            inFlight += 1;
            if (inFlight > 1) overlapped = true;
            await new Promise((resolve) => setTimeout(resolve, 50));
            inFlight -= 1;
        });

        const { result, rerender } = setup(save);

        rerender({ value: { n: 1 }, enabled: true });
        await advance();

        // A second edit lands while the first save is still on the wire, and the
        // page is backgrounded before the debounce for it elapses.
        rerender({ value: { n: 2 }, enabled: true });
        act(() => {
            result.current.flush();
        });
        await advance(200);

        expect(overlapped).toBe(false);
        expect(save.mock.calls.at(-1)?.[0]).toEqual({ n: 2 });
    });
});
