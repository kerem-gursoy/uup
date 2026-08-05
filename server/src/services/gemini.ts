import { GenerateContentResponse, GoogleGenAI, Type } from "@google/genai";
import { ParseUsage, RawGeminiInvoice } from "./invoiceTypes.js";

const MODEL_NAME = "gemini-2.5-flash";

/**
 * What one reading of one invoice cost, and the shape of it.
 *
 * Nothing acts on this - there is no budget, no cap, and no thinkingConfig set
 * anywhere in this file. That is deliberate: this shop is nowhere near a limit
 * worth defending against, and capping the model's thinking to save a fraction
 * of a lira would be trading accuracy on a task where being wrong writes bad
 * numbers into a cost history.
 *
 * It is recorded because the alternative is not knowing. thoughtsTokens in
 * particular bills at the output rate and is invisible in the response body, so
 * without this line the real cost of a reading is unobservable. If it ever does
 * get out of hand, the numbers to make that decision with will already be here.
 */
export type GeminiInvoiceReading = {
  invoice: RawGeminiInvoice;
  usage: ParseUsage | null;
};

/**
 * The invoices this shop actually receives are Turkish, so the prompt names the
 * Turkish column headings and, above all, spells out how Turkish writes numbers.
 *
 * That last part is not cosmetic. invoiceApply does Math.round(unitPrice * 100),
 * so a "1.234,56" read as one-point-two-three-four writes a cost of 123 kuruş
 * instead of ₺1234.56 and nothing downstream would notice.
 */
const PROMPT = `
You are an invoice parser. Read the attached invoice image and extract structured data.
The supplier is already known; do NOT infer or include supplier info.

READING A TURKISH INVOICE
The invoice is usually Turkish. Columns are typically headed:
  Sıra / S.No / No                          -> line_no
  Stok Kodu / Kod / Ürün Kodu / Mal Kodu    -> code
  Malın Cinsi / Cinsi / Açıklama /
    Mal ve Hizmet Açıklaması / Ürün Adı     -> description
  Barkod / GTIN / EAN                       -> barcode
  Miktar / Mik. / Adet                      -> quantity
  Birim / Br.                               -> unit   (Adet, Kg, Lt, Paket, Koli, Kutu, Metre)
  Birim Fiyat / B. Fiyat / Fiyat            -> unit_price   (for ONE unit, excluding VAT)
  Tutar / Toplam Tutar                      -> total_price  (the row total, excluding VAT)

WHICH ROWS ARE LINE ITEMS
Return one entry per goods row only. Do NOT return summary, tax, discount or
delivery rows. Skip rows such as:
  KDV, KDV Tutarı, KDV Oranı, KDV Matrahı, VAT
  Ara Toplam, Toplam, Genel Toplam, Ödenecek Tutar, Vergiler Dahil Toplam
  İskonto, İndirim, Discount
  Tevkifat, Stopaj, ÖTV, Damga Vergisi
  Nakliye, Kargo, Navlun, Hizmet Bedeli, Ambalaj
  "Yalnız ... Türk Lirası" (the total written out in words)
  Notlar, Açıklamalar, İrsaliye bilgileri, IBAN and bank details, page headers
  and footers, e-Arşiv / e-Fatura reference blocks, QR or barcode captions
If a discount is a COLUMN on a goods row, keep the row and report unit_price
exactly as printed in the Birim Fiyat column.

TEXT FIELDS
Copy description, unit and code VERBATIM, exactly as printed, in the invoice's
own language, keeping its spelling, capitalisation and Turkish letters
(ç ğ ı İ ö ş ü). Do NOT translate them into English. Do NOT expand
abbreviations, fix spelling, change case or reorder words. If a description is
printed across two lines, join the lines with a single space.

NUMBERS - THIS MATTERS MORE THAN ANYTHING ELSE HERE
Turkish invoices use "." for thousands and "," for decimals. Read them that way:
  "1.234,56" is one thousand two hundred thirty-four and 56/100 -> 1234.56
  "1.234"    is one thousand two hundred thirty-four            -> 1234
  "0,85"     is eighty-five hundredths                          -> 0.85
  "12,5"     is twelve and a half                               -> 12.5
Emit every number as a JSON number written the en-US way: 1234.56, 1234, 0.85.
Never emit a number as a string. Never keep a thousands separator. Never keep a
decimal comma. Quantity may itself be fractional (1,5 Kg -> 1.5).
If a figure is unreadable or absent, emit null. Do not guess, and do not compute
a missing figure from the others.

DATE
issue_date is the invoice's own issue date (Fatura Tarihi / Düzenleme Tarihi),
as "YYYY-MM-DD". Turkish invoices print dd.mm.yyyy or dd/mm/yyyy: THE DAY COMES
FIRST, so "05.03.2026" is 2026-03-05, not 2026-05-03. Ignore any payment due
date (Vade Tarihi) and any delivery note date (İrsaliye Tarihi).

CURRENCY
currency is the ISO 4217 code. "TL", "₺", "TRL" and "Türk Lirası" are all "TRY".
"$" and "USD" are "USD"; "€" and "EUR" are "EUR". Use null if none is shown.

THE INVOICE'S OWN TOTALS
Read these from the summary block, exactly as printed. They are NOT line items
and must not appear in line_items. Do not compute any of them yourself - if a
figure is not printed on the document, emit null.
  Ara Toplam / Mal Hizmet Toplam Tutarı / Toplam        -> subtotal
    (the goods total BEFORE VAT)
  KDV / KDV Tutarı / Hesaplanan KDV                     -> vat_total
  Genel Toplam / Ödenecek Tutar / Vergiler Dahil Toplam -> grand_total
These are checked against the sum of the lines you return, which is how a line
you missed gets noticed. Accuracy here matters as much as the lines themselves.

Return only the JSON object matching the given schema.`;

/**
 * Declaring the numeric fields as NUMBER is the strongest guarantee available
 * that a formatted string never reaches Math.round: it is enforced when the
 * response is decoded, not just asked for in prose.
 */
const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    issue_date: { type: Type.STRING, nullable: true, description: "YYYY-MM-DD" },
    currency: { type: Type.STRING, nullable: true, description: "ISO 4217, e.g. TRY" },
    subtotal: {
      type: Type.NUMBER,
      nullable: true,
      description: "Goods total before VAT, as printed (Ara Toplam)",
    },
    vat_total: {
      type: Type.NUMBER,
      nullable: true,
      description: "VAT amount, as printed (KDV Tutarı)",
    },
    grand_total: {
      type: Type.NUMBER,
      nullable: true,
      description: "Payable total including VAT, as printed (Genel Toplam)",
    },
    line_items: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          line_no: { type: Type.INTEGER, nullable: true },
          code: { type: Type.STRING, nullable: true },
          description: { type: Type.STRING },
          barcode: { type: Type.STRING, nullable: true },
          quantity: { type: Type.NUMBER, nullable: true },
          unit: { type: Type.STRING, nullable: true },
          unit_price: { type: Type.NUMBER, nullable: true },
          total_price: { type: Type.NUMBER, nullable: true },
        },
        required: ["description"],
        propertyOrdering: [
          "line_no",
          "code",
          "description",
          "barcode",
          "quantity",
          "unit",
          "unit_price",
          "total_price",
        ],
      },
    },
  },
  required: ["line_items"],
  propertyOrdering: [
    "issue_date",
    "currency",
    "subtotal",
    "vat_total",
    "grand_total",
    "line_items",
  ],
};

const stripCodeFences = (value: string) => {
  const trimmed = value.trim();
  const withoutStart = trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
  return withoutStart.replace(/```$/i, "").trim();
};

/**
 * The response schema should make the string branch unreachable, but it is kept
 * as the backstop for a response that arrives without one.
 *
 * Deliberately NOT taught to read "1.234,56": Number() gives NaN for it, which
 * becomes null, which shows the review screen a blank field for someone to fill
 * in. A blank a human completes is a better outcome than a plausible wrong
 * number written into a cost history.
 */
const toNullableNumber = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const num = Number(value);
    return Number.isFinite(num) ? num : null;
  }
  return null;
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : {};

const logGeminiError = (err: unknown) => {
  const response = asRecord(asRecord(err).response);

  console.error("[Gemini] request failed", {
    message: asRecord(err).message ?? String(err),
    status: response.status,
    statusText: response.statusText,
    data: response.data,
  });
};

const toTokenCount = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null;

/** The token counts the response carries, or null when it reported none. */
const readUsage = (result: GenerateContentResponse): ParseUsage | null => {
  const usage = result.usageMetadata;
  if (!usage) return null;

  return {
    promptTokens: toTokenCount(usage.promptTokenCount),
    outputTokens: toTokenCount(usage.candidatesTokenCount),
    thoughtsTokens: toTokenCount(usage.thoughtsTokenCount),
    totalTokens: toTokenCount(usage.totalTokenCount),
  };
};

export const parseInvoiceWithGemini = async (
  imageBuffer: Buffer,
  mimeType: string
): Promise<GeminiInvoiceReading> => {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not configured");
  }

  const genAI = new GoogleGenAI({ apiKey });

  let result;
  try {
    result = await genAI.models.generateContent({
      model: MODEL_NAME,
      contents: [
        {
          role: "user",
          parts: [
            { text: PROMPT },
            { inlineData: { data: imageBuffer.toString("base64"), mimeType } },
          ],
        },
      ],
      config: {
        responseMimeType: "application/json",
        responseSchema: RESPONSE_SCHEMA,
        // This is extraction, not writing: the same invoice has to read the same
        // way twice, or a re-parse would silently disagree with what was applied.
        temperature: 0,
        // No thinkingConfig on purpose - see GeminiInvoiceReading above. The
        // model is left to spend whatever it needs on a page of Turkish numbers.
      },
    });
  } catch (err) {
    logGeminiError(err);
    throw new Error("Gemini generation failed");
  }

  const responseTextRaw = result.text ?? "";
  if (!responseTextRaw.trim()) {
    console.error("[Gemini] empty response text", { candidates: result?.candidates?.length ?? 0 });
    throw new Error("Gemini returned empty response");
  }

  const responseText = stripCodeFences(responseTextRaw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch (err) {
    console.error("[Gemini] failed to parse JSON response", { responseText });
    throw new Error("Failed to parse Gemini response as JSON");
  }

  const invoice = parsed as Partial<RawGeminiInvoice>;
  const lineItems = Array.isArray(invoice.line_items) ? invoice.line_items : [];

  const usage = readUsage(result);
  console.log("[Gemini] invoice read", {
    model: MODEL_NAME,
    lines: lineItems.length,
    promptTokens: usage?.promptTokens ?? null,
    outputTokens: usage?.outputTokens ?? null,
    thoughtsTokens: usage?.thoughtsTokens ?? null,
    totalTokens: usage?.totalTokens ?? null,
  });

  const reading: RawGeminiInvoice = {
    supplier_name: invoice.supplier_name ?? null,
    issue_date: invoice.issue_date ?? null,
    currency: invoice.currency ?? null,
    subtotal: toNullableNumber(invoice.subtotal),
    vat_total: toNullableNumber(invoice.vat_total),
    grand_total: toNullableNumber(invoice.grand_total),
    line_items: lineItems.map((item) => ({
      line_no: toNullableNumber(item?.line_no) ?? null,
      code: item?.code ?? null,
      description: typeof item?.description === "string" ? item.description : "",
      barcode: item?.barcode ?? null,
      quantity: toNullableNumber(item?.quantity),
      unit: item?.unit ?? null,
      unit_price: toNullableNumber(item?.unit_price),
      total_price: toNullableNumber(item?.total_price),
    })),
  };

  return { invoice: reading, usage };
};
