import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { ParsedInvoiceResponse } from '../services/api';
import { setLang } from '../i18n/locale';

/**
 * The promises this screen makes, checked from the outside.
 *
 * Two are about not wasting anyone's time: an invoice read once is not read
 * again, and corrections survive leaving the screen. The rest are about the
 * review itself being possible to get through - lines stay closed until opened,
 * every line that still wants a decision is counted and reachable, and Apply
 * refuses until none are left rather than failing afterwards.
 */

const getInvoiceReview = vi.fn();
const parseInvoice = vi.fn();
const saveInvoiceDraft = vi.fn();
const applyInvoice = vi.fn();
const getProducts = vi.fn();

vi.mock('../services/api', () => ({
    getInvoiceReview: (...args: unknown[]) => getInvoiceReview(...args),
    parseInvoice: (...args: unknown[]) => parseInvoice(...args),
    saveInvoiceDraft: (...args: unknown[]) => saveInvoiceDraft(...args),
    applyInvoice: (...args: unknown[]) => applyInvoice(...args),
    getProducts: (...args: unknown[]) => getProducts(...args),
    getProductByBarcode: vi.fn(),
    createProduct: vi.fn(),
    errorMessage: (_err: unknown, fallback: string) => fallback,
    ApiError: class ApiError extends Error {},
}));

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() },
}));

// The only stub. It reaches for a camera, which jsdom does not have, and no test
// here is about scanning.
vi.mock('../components/BarcodeScanner', () => ({ default: () => null }));

const { default: InvoiceReviewPage } = await import('./InvoiceReviewPage');

const READING: ParsedInvoiceResponse = {
    invoiceId: 5,
    supplierId: 2,
    supplierName: 'Acme Dağıtım',
    supplierFromDocument: null,
    issueDate: '2026-07-01',
    currency: 'TRY',
    totals: { subtotal: 1478, vatTotal: 295.6, grandTotal: 1773.6 },
    totalsCheck: {
        status: 'agrees',
        linesTotal: 1478,
        documentTotal: 1478,
        difference: 0,
        linesMissingTotal: 0,
    },
    parsedAt: '2026-07-31T10:00:00.000Z',
    lines: [
        {
            lineNo: 1,
            code: null,
            description: 'BAKLAVA KABI 500GR',
            barcode: null,
            quantity: 400,
            unit: 'ADET',
            unitPrice: 2.42,
            totalPrice: 968,
            matchedProductId: null,
            matchedProductName: null,
            matchedBrand: null,
            matchedBy: null,
            matchRefusedBecause: null,
            priceMismatch: false,
        },
        {
            lineNo: 2,
            code: null,
            description: 'ÇAY 500G',
            barcode: null,
            quantity: 12,
            unit: 'ADET',
            unitPrice: 42.5,
            totalPrice: 510,
            matchedProductId: null,
            matchedProductName: null,
            matchedBrand: null,
            matchedBy: null,
            matchRefusedBecause: null,
            priceMismatch: false,
        },
    ],
};

/** A line the reviewer has already settled: product chosen, numbers usable. */
const settledLine = (over: Record<string, unknown> = {}) => ({
    uid: 'line-1',
    apply: true,
    productId: 3,
    matchedProductName: 'Baklava Kabı 500gr',
    quantity: 400,
    unitPrice: 2.42,
    applyStock: true,
    applyPrice: true,
    parsedLineNo: 1,
    name: 'BAKLAVA KABI 500GR',
    description: 'BAKLAVA KABI 500GR',
    brand: null,
    barcode: null,
    code: null,
    ...over,
});

const openReviewScreen = () =>
    render(
        <MemoryRouter initialEntries={['/invoices/5/review']}>
            <Routes>
                <Route path="/invoices/:id/review" element={<InvoiceReviewPage />} />
            </Routes>
        </MemoryRouter>
    );

const rowToggle = (title: string) =>
    screen.getByRole('button', { expanded: false, name: new RegExp(title, 'i') });

beforeEach(() => {
    setLang('en');
    vi.clearAllMocks();
    localStorage.clear();
    saveInvoiceDraft.mockResolvedValue({ lines: [], updatedAt: '' });
    getProducts.mockResolvedValue([]);
});

afterEach(() => {
    // Explicit because vitest is not running with globals, so the library's own
    // automatic cleanup never registers and each render would stack on the last.
    cleanup();
    vi.useRealTimers();
});

describe('opening an invoice for review', () => {
    it('reads the document when nobody has read it yet', async () => {
        getInvoiceReview.mockResolvedValue({ parsed: null, draft: null });
        parseInvoice.mockResolvedValue(READING);

        openReviewScreen();

        expect(await screen.findByText('BAKLAVA KABI 500GR')).toBeDefined();
        expect(parseInvoice).toHaveBeenCalledTimes(1);
        // Without the refresh flag - this is a first reading, not a re-reading.
        expect(parseInvoice).toHaveBeenCalledWith(5);
    });

    it('does not read it again when it has been read before', async () => {
        // Before the reading was stored, coming back to this screen meant waiting
        // out another model call for an answer that could not have changed.
        getInvoiceReview.mockResolvedValue({ parsed: READING, draft: null });

        openReviewScreen();

        expect(await screen.findByText('BAKLAVA KABI 500GR')).toBeDefined();
        expect(parseInvoice).not.toHaveBeenCalled();
    });

    it('brings back the corrections rather than the document', async () => {
        getInvoiceReview.mockResolvedValue({
            parsed: READING,
            // The reviewer counted 399, whatever the invoice says.
            draft: {
                updatedAt: '2026-07-31T10:05:00.000Z',
                lines: [settledLine({ quantity: 399 })],
            },
        });

        openReviewScreen();

        await screen.findByText('BAKLAVA KABI 500GR');
        expect(screen.getByText(/399/)).toBeDefined();
        expect(parseInvoice).not.toHaveBeenCalled();
        expect(screen.getByText('Changes restored')).toBeDefined();
    });

    it('falls back to the document when the stored draft makes no sense', async () => {
        getInvoiceReview.mockResolvedValue({
            parsed: READING,
            draft: { updatedAt: '2026-07-31T10:05:00.000Z', lines: ['not a line'] },
        });

        openReviewScreen();

        await screen.findByText('BAKLAVA KABI 500GR');
        expect(screen.getByText(/400/)).toBeDefined();
        expect(screen.queryByText('Changes restored')).toBeNull();
    });
});

describe('getting through the lines', () => {
    it('starts with every line closed', async () => {
        // The screen used to render every field of every line at once. Closed
        // rows are the whole reason it is now possible to see how much is left.
        getInvoiceReview.mockResolvedValue({ parsed: READING, draft: null });

        openReviewScreen();
        await screen.findByText('BAKLAVA KABI 500GR');

        expect(screen.getAllByRole('button', { expanded: false })).toHaveLength(2);
        expect(screen.queryByRole('button', { expanded: true })).toBeNull();
        // Nothing to type into until a row is opened.
        expect(screen.queryByLabelText(/How many came in/i)).toBeNull();
    });

    it('opens one line at a time', async () => {
        getInvoiceReview.mockResolvedValue({ parsed: READING, draft: null });

        openReviewScreen();
        await screen.findByText('BAKLAVA KABI 500GR');

        fireEvent.click(rowToggle('BAKLAVA KABI 500GR'));
        expect(screen.getByLabelText(/How many came in/i)).toBeDefined();

        fireEvent.click(rowToggle('ÇAY 500G'));
        // The first has closed rather than both standing open.
        expect(screen.getAllByRole('button', { expanded: true })).toHaveLength(1);
    });

    it('will not apply while a line still needs a product, and says which', async () => {
        // Nothing is auto-matched, so a freshly read invoice needs a product on
        // every line. That used to surface as a toast after pressing Apply,
        // naming a count and no lines.
        getInvoiceReview.mockResolvedValue({ parsed: READING, draft: null });

        openReviewScreen();
        await screen.findByText('BAKLAVA KABI 500GR');

        expect(screen.getByRole('button', { name: /Apply invoice/i })).toHaveProperty(
            'disabled',
            true
        );
        expect(screen.getByText('2 lines still need you')).toBeDefined();
        expect(applyInvoice).not.toHaveBeenCalled();
    });

    it('narrows to just the lines that still need a decision', async () => {
        getInvoiceReview.mockResolvedValue({
            parsed: READING,
            draft: {
                updatedAt: '2026-07-31T10:05:00.000Z',
                lines: [
                    settledLine(),
                    settledLine({
                        uid: 'line-2',
                        productId: null,
                        matchedProductName: null,
                        name: 'ÇAY 500G',
                    }),
                ],
            },
        });

        openReviewScreen();
        await screen.findByText('BAKLAVA KABI 500GR');

        const filters = screen.getByRole('group', { name: /Show which lines/i });
        fireEvent.click(within(filters).getByRole('button', { name: /Needs you/i }));

        // Scoped to the lines section: the "How this works" card is a list too.
        const list = within(
            screen.getByRole('region', { name: /Invoice lines/i })
        ).getByRole('list');
        expect(within(list).queryByText('BAKLAVA KABI 500GR')).toBeNull();
        expect(within(list).getByText('ÇAY 500G')).toBeDefined();
    });

    it('lets a line be left out instead of resolved, and that unblocks Apply', async () => {
        // The escape hatch for a line nobody can settle tonight: leaving it out
        // must count as dealing with it.
        getInvoiceReview.mockResolvedValue({
            parsed: READING,
            draft: {
                updatedAt: '2026-07-31T10:05:00.000Z',
                lines: [
                    settledLine(),
                    settledLine({
                        uid: 'line-2',
                        productId: null,
                        matchedProductName: null,
                        name: 'ÇAY 500G',
                    }),
                ],
            },
        });

        openReviewScreen();
        await screen.findByText('ÇAY 500G');

        expect(screen.getByRole('button', { name: /Apply invoice/i })).toHaveProperty(
            'disabled',
            true
        );

        fireEvent.click(screen.getByLabelText(/Include ÇAY 500G/i));

        await waitFor(() =>
            expect(screen.getByRole('button', { name: /Apply invoice/i })).toHaveProperty(
                'disabled',
                false
            )
        );
        // Asserted on the whole summary because <T> renders the count as its own
        // element, so the sentence is split across nodes in the DOM.
        expect(document.getElementById('apply-summary')?.textContent).toBe(
            '1 line will be applied'
        );
    });

    it('leaves out every outstanding line at once, and that unblocks Apply', async () => {
        // The tail of a long invoice - delivery charges, pallets, things the shop
        // does not stock - is dealt with by leaving it out, and unticking each one
        // by hand is the slowest part of the screen.
        getInvoiceReview.mockResolvedValue({
            parsed: READING,
            draft: {
                updatedAt: '2026-07-31T10:05:00.000Z',
                lines: [
                    settledLine(),
                    settledLine({
                        uid: 'line-2',
                        productId: null,
                        matchedProductName: null,
                        name: 'ÇAY 500G',
                    }),
                ],
            },
        });

        openReviewScreen();
        await screen.findByText('ÇAY 500G');

        expect(screen.getByRole('button', { name: /Apply invoice/i })).toHaveProperty(
            'disabled',
            true
        );

        fireEvent.click(screen.getByRole('button', { name: /Leave out the 1 line/i }));

        await waitFor(() =>
            expect(screen.getByRole('button', { name: /Apply invoice/i })).toHaveProperty(
                'disabled',
                false
            )
        );
        // Left out counts as settled, but it is not applied: the line the reviewer
        // did settle is still the only one that will write anything.
        expect(screen.getByText('2 of 2 settled')).toBeDefined();
        expect(document.getElementById('apply-summary')?.textContent).toBe(
            '1 line will be applied'
        );
    });

    it('puts them back if that was not what was meant', async () => {
        // A bulk action with no way back is one people are right to be afraid of.
        getInvoiceReview.mockResolvedValue({ parsed: READING, draft: null });

        openReviewScreen();
        await screen.findByText('BAKLAVA KABI 500GR');

        fireEvent.click(screen.getByRole('button', { name: /Leave out the 2 lines/i }));
        await waitFor(() => expect(screen.getByText('2 of 2 settled')).toBeDefined());

        const undo = vi.mocked(toast.success).mock.calls.at(-1)?.[1]?.action;
        expect(undo).toBeDefined();

        await act(async () => {
            (undo as { onClick: (event: unknown) => void }).onClick({});
        });

        expect(screen.getByText('0 of 2 settled')).toBeDefined();
        expect(screen.getByText('2 lines still need you')).toBeDefined();
    });

    it('saves leaving lines out, the same as any other correction', async () => {
        // It edits the review like anything else does. Were it not to count as an
        // edit, a reviewer who did this and left would come back to find the whole
        // tail waiting for them again.
        vi.useFakeTimers({ shouldAdvanceTime: true });
        getInvoiceReview.mockResolvedValue({ parsed: READING, draft: null });

        openReviewScreen();
        await screen.findByText('BAKLAVA KABI 500GR');

        fireEvent.click(screen.getByRole('button', { name: /Leave out the 2 lines/i }));

        await act(async () => {
            vi.advanceTimersByTime(1200);
        });

        await waitFor(() => expect(saveInvoiceDraft).toHaveBeenCalled());
        const draft = saveInvoiceDraft.mock.calls.at(-1)![1];
        expect(draft.lines.map((line: { apply: boolean }) => line.apply)).toEqual([false, false]);
    });

    it('tracks how much of the invoice is settled', async () => {
        getInvoiceReview.mockResolvedValue({
            parsed: READING,
            draft: {
                updatedAt: '2026-07-31T10:05:00.000Z',
                lines: [
                    settledLine(),
                    settledLine({
                        uid: 'line-2',
                        productId: null,
                        matchedProductName: null,
                        name: 'ÇAY 500G',
                    }),
                ],
            },
        });

        openReviewScreen();
        await screen.findByText('ÇAY 500G');

        expect(screen.getByText('1 of 2 settled')).toBeDefined();
        expect(screen.getByRole('progressbar')).toHaveProperty('ariaValueNow', '1');
    });
});

describe('working on the review', () => {
    it('stores a correction against the reading it was made from', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        getInvoiceReview.mockResolvedValue({
            parsed: READING,
            draft: { updatedAt: '2026-07-31T10:05:00.000Z', lines: [settledLine()] },
        });

        openReviewScreen();
        await screen.findByText('BAKLAVA KABI 500GR');

        fireEvent.click(rowToggle('BAKLAVA KABI 500GR'));
        const quantity = screen.getByLabelText(/How many came in/i);

        await act(async () => {
            fireEvent.change(quantity, { target: { value: '399' } });
        });

        // Nothing sent yet - the debounce is what keeps a burst of typing down to
        // one request.
        expect(saveInvoiceDraft).not.toHaveBeenCalled();

        await act(async () => {
            vi.advanceTimersByTime(1200);
        });

        await waitFor(() => expect(saveInvoiceDraft).toHaveBeenCalled());

        const [invoiceId, draft] = saveInvoiceDraft.mock.calls[0];
        expect(invoiceId).toBe(5);
        // The fingerprint that lets the server refuse this if the document has
        // been read again in the meantime.
        expect(draft.parsedAt).toBe(READING.parsedAt);
        expect(draft.lines[0].quantity).toBe(399);
    });

    it('writes nothing for a visit where nobody changed anything', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        getInvoiceReview.mockResolvedValue({ parsed: READING, draft: null });

        openReviewScreen();
        await screen.findByText('BAKLAVA KABI 500GR');

        // Opening a line to read it is not editing it.
        fireEvent.click(rowToggle('BAKLAVA KABI 500GR'));

        await act(async () => {
            vi.advanceTimersByTime(3000);
        });

        expect(saveInvoiceDraft).not.toHaveBeenCalled();
    });

    it('spells out what applying a line will do to the shop', async () => {
        // "Update stock" names a setting; "Add 400 to what you have on the shelf"
        // names the consequence, which is the thing being decided.
        getInvoiceReview.mockResolvedValue({
            parsed: READING,
            draft: { updatedAt: '2026-07-31T10:05:00.000Z', lines: [settledLine()] },
        });

        openReviewScreen();
        await screen.findByText('BAKLAVA KABI 500GR');
        fireEvent.click(rowToggle('BAKLAVA KABI 500GR'));

        expect(screen.getByText(/Add 400 to what you have on the shelf/i)).toBeDefined();
        expect(screen.getByText(/Record .* as the new cost of one/i)).toBeDefined();
    });
});

/**
 * The three things this screen learned to say. Each one exists because the
 * alternative is a number going quietly wrong: a line nobody noticed was
 * missing, a case counted as a piece, or a product filled in for a reason
 * nobody can see.
 */
describe('what the screen says about the reading itself', () => {
    const withCheck = (over: Partial<ParsedInvoiceResponse['totalsCheck']>) => ({
        ...READING,
        totalsCheck: { ...READING.totalsCheck, ...over },
    });

    it('says so when the lines do not add up to the printed total', async () => {
        // The only signal that can exist for a line the reading dropped: the row
        // is not there to be wrong, so only the arithmetic can notice.
        getInvoiceReview.mockResolvedValue({
            parsed: withCheck({ status: 'disagrees', linesTotal: 1478, documentTotal: 1598, difference: 120 }),
            draft: null,
        });

        openReviewScreen();

        expect(await screen.findByText(/do not add up to the invoice total/i)).toBeDefined();
        expect(screen.getByText(/missing/i)).toBeDefined();
    });

    it('stays quiet when the lines account for the total', async () => {
        getInvoiceReview.mockResolvedValue({ parsed: READING, draft: null });

        openReviewScreen();
        await screen.findByText('BAKLAVA KABI 500GR');

        expect(screen.queryByText(/do not add up to the invoice total/i)).toBeNull();
    });

    it('stays quiet when it could not check', async () => {
        // "Unknown" must never be dressed up as either answer.
        getInvoiceReview.mockResolvedValue({
            parsed: withCheck({ status: 'unknown', documentTotal: null, difference: null }),
            draft: null,
        });

        openReviewScreen();
        await screen.findByText('BAKLAVA KABI 500GR');

        expect(screen.queryByText(/do not add up to the invoice total/i)).toBeNull();
    });

    it('says why a line was matched, so a filled-in product is not a mystery', async () => {
        getInvoiceReview.mockResolvedValue({
            parsed: READING,
            draft: {
                updatedAt: '2026-07-31T10:05:00.000Z',
                lines: [settledLine({ matchedBy: 'supplierCode' })],
            },
        });

        openReviewScreen();
        await screen.findByText('BAKLAVA KABI 500GR');
        fireEvent.click(rowToggle('BAKLAVA KABI 500GR'));

        expect(screen.getByText(/from an invoice you applied before/i)).toBeDefined();
    });

    it('explains a refusal to match rather than looking like it never tried', async () => {
        getInvoiceReview.mockResolvedValue({
            parsed: READING,
            draft: {
                updatedAt: '2026-07-31T10:05:00.000Z',
                lines: [settledLine({ productId: null, matchRefusedBecause: 'conflict' })],
            },
        });

        openReviewScreen();
        await screen.findByText('BAKLAVA KABI 500GR');
        fireEvent.click(rowToggle('BAKLAVA KABI 500GR'));

        expect(screen.getByText(/point at different products/i)).toBeDefined();
    });

    it('will not let a case-packed line be applied until somebody confirms it', async () => {
        /*
         * "5 KOLI" is a whole number, so every other check passes it and applying
         * adds 5 to the shelf when 120 arrived. The line has to block, and Apply
         * has to stay shut while it does.
         */
        getInvoiceReview.mockResolvedValue({
            parsed: READING,
            draft: {
                updatedAt: '2026-07-31T10:05:00.000Z',
                lines: [settledLine({ unit: 'KOLI', quantity: 5 })],
            },
        });

        openReviewScreen();
        await screen.findByText('BAKLAVA KABI 500GR');

        expect(screen.getByRole('button', { name: /Apply invoice/i })).toHaveProperty(
            'disabled',
            true
        );

        fireEvent.click(rowToggle('BAKLAVA KABI 500GR'));
        expect(screen.getByText(/counts this in KOLI, not single items/i)).toBeDefined();

        // Confirming is the reviewer's act, and it is what unblocks Apply.
        fireEvent.click(
            screen.getByLabelText(/number above is how many single items arrived/i)
        );

        await waitFor(() => {
            expect(screen.getByRole('button', { name: /Apply invoice/i })).toHaveProperty(
                'disabled',
                false
            );
        });
    });
});
