import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ParsedInvoiceResponse } from '../services/api';
import { setLang } from '../i18n/locale';

/**
 * The behaviour this screen is judged on: opening an invoice that has been
 * opened before must not cost another reading, and must not cost the reviewer
 * the corrections they already made.
 *
 * Both are only visible from the outside - the page either issues a parse or it
 * does not, and either shows the reviewer's numbers or the document's - so they
 * are checked here rather than against the pieces underneath.
 */

const getInvoiceReview = vi.fn();
const parseInvoice = vi.fn();
const saveInvoiceDraft = vi.fn();
const applyInvoice = vi.fn();

vi.mock('../services/api', () => ({
    getInvoiceReview: (...args: unknown[]) => getInvoiceReview(...args),
    parseInvoice: (...args: unknown[]) => parseInvoice(...args),
    saveInvoiceDraft: (...args: unknown[]) => saveInvoiceDraft(...args),
    applyInvoice: (...args: unknown[]) => applyInvoice(...args),
    errorMessage: (_err: unknown, fallback: string) => fallback,
}));

vi.mock('sonner', () => ({
    toast: { success: vi.fn(), error: vi.fn() },
}));

// Stubbed to its inputs and its one output. The real line component pulls in the
// camera stack, and none of that is what these tests are about.
vi.mock('../components/InvoiceLineItem', () => ({
    default: ({
        line,
        index,
        onChange,
    }: {
        line: { description: string; quantity: number | null };
        index: number;
        onChange: (index: number, updates: { quantity: number | null }) => void;
    }) => (
        <div>
            <span>{line.description}</span>
            <input
                aria-label={`quantity ${index}`}
                value={line.quantity ?? ''}
                onChange={(event) =>
                    onChange(index, { quantity: Number(event.target.value) })
                }
            />
        </div>
    ),
}));

const { default: InvoiceReviewPage } = await import('./InvoiceReviewPage');

const READING: ParsedInvoiceResponse = {
    invoiceId: 5,
    supplierId: 2,
    supplierName: 'Acme Dağıtım',
    supplierFromDocument: null,
    issueDate: '2026-07-01',
    currency: 'TRY',
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
            matchScore: 0,
            priceMismatch: false,
        },
    ],
};

const openReviewScreen = () =>
    render(
        <MemoryRouter initialEntries={['/invoices/5/review']}>
            <Routes>
                <Route path="/invoices/:id/review" element={<InvoiceReviewPage />} />
            </Routes>
        </MemoryRouter>
    );

beforeEach(() => {
    setLang('en');
    vi.clearAllMocks();
    saveInvoiceDraft.mockResolvedValue({ lines: [], updatedAt: '' });
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
        // The whole point. Before the reading was stored, coming back to this
        // screen meant waiting out another model call for an answer that could
        // not have changed.
        getInvoiceReview.mockResolvedValue({ parsed: READING, draft: null });

        openReviewScreen();

        expect(await screen.findByText('BAKLAVA KABI 500GR')).toBeDefined();
        expect(parseInvoice).not.toHaveBeenCalled();
    });

    it('brings back the corrections rather than the document', async () => {
        getInvoiceReview.mockResolvedValue({
            parsed: READING,
            draft: {
                updatedAt: '2026-07-31T10:05:00.000Z',
                lines: [
                    {
                        apply: true,
                        productId: 3,
                        // The reviewer counted 399, whatever the invoice says.
                        quantity: 399,
                        unitPrice: 2.42,
                        applyStock: true,
                        applyPrice: true,
                        parsedLineNo: 1,
                        name: 'BAKLAVA KABI 500GR',
                        description: 'BAKLAVA KABI 500GR',
                        brand: null,
                        barcode: null,
                        code: null,
                    },
                ],
            },
        });

        openReviewScreen();

        const quantity = (await screen.findByLabelText(
            'quantity 0'
        )) as HTMLInputElement;
        expect(quantity.value).toBe('399');
        expect(parseInvoice).not.toHaveBeenCalled();
        expect(screen.getByText('Changes restored')).toBeDefined();
    });

    it('falls back to the document when the stored draft makes no sense', async () => {
        getInvoiceReview.mockResolvedValue({
            parsed: READING,
            draft: { updatedAt: '2026-07-31T10:05:00.000Z', lines: ['not a line'] },
        });

        openReviewScreen();

        const quantity = (await screen.findByLabelText(
            'quantity 0'
        )) as HTMLInputElement;
        expect(quantity.value).toBe('400');
        expect(screen.queryByText('Changes restored')).toBeNull();
    });
});

describe('working on the review', () => {
    it('stores a correction against the reading it was made from', async () => {
        vi.useFakeTimers({ shouldAdvanceTime: true });
        getInvoiceReview.mockResolvedValue({ parsed: READING, draft: null });

        openReviewScreen();

        const quantity = (await screen.findByLabelText(
            'quantity 0'
        )) as HTMLInputElement;

        await act(async () => {
            fireEvent.change(quantity, { target: { value: '399' } });
        });

        // Nothing should have been sent yet - the debounce is what keeps a burst
        // of typing down to one request.
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

        await act(async () => {
            vi.advanceTimersByTime(3000);
        });

        expect(saveInvoiceDraft).not.toHaveBeenCalled();
    });
});
