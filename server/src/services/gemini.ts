import { GoogleGenAI } from "@google/genai";
import { RawGeminiInvoice } from "./invoiceTypes";

const MODEL_NAME = "gemini-2.5-flash";

const PROMPT = `
You are an invoice parser. Read the attached invoice image and extract structured data.
The supplier is already known; do NOT infer or include supplier info.
Return ONLY valid JSON with this exact shape:
{
  "issue_date": string | null,
  "currency": string | null,
  "line_items": [
    {
      "line_no": number | null,
      "code": string | null,
      "description": string,
      "barcode": string | null,
      "quantity": number | null,
      "unit": string | null,
      "unit_price": number | null,
      "total_price": number | null
    }
  ]
}
Use null when a value is missing. Do not include any text outside the JSON.`;

const stripCodeFences = (value: string) => {
  const trimmed = value.trim();
  const withoutStart = trimmed.replace(/^```json\s*/i, "").replace(/^```\s*/i, "");
  return withoutStart.replace(/```$/i, "").trim();
};

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

const logGeminiError = (err: unknown) => {
  const asAny = err as Record<string, unknown>;
  const status = asAny?.response?.status;
  const statusText = asAny?.response?.statusText;
  const data = asAny?.response?.data;
  console.error("[Gemini] request failed", {
    message: asAny?.message ?? String(err),
    status,
    statusText,
    data,
  });
};

export const parseInvoiceWithGemini = async (
  imageBuffer: Buffer,
  mimeType: string
): Promise<RawGeminiInvoice> => {
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

  return {
    supplier_name: invoice.supplier_name ?? null,
    issue_date: invoice.issue_date ?? null,
    currency: invoice.currency ?? null,
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
};
