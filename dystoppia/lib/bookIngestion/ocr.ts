import type { OcrAdapter, OcrPageResult } from "./types";

// Azure Document Intelligence adapter.
// Env vars expected (same convention used elsewhere in the project):
//   AZURE_DI_ENDPOINT = https://<your-resource>.cognitiveservices.azure.com
//   AZURE_DI_KEY      = <resource key>
// When unconfigured, isConfigured() returns false and the router fails with a clear error
// instead of silently producing empty pages.

const DI_API_VERSION = "2024-11-30";
const DI_MODEL = "prebuilt-read";

export function createAzureDocumentIntelligenceAdapter(): OcrAdapter {
  return {
    isConfigured(): boolean {
      return Boolean(process.env.AZURE_DI_ENDPOINT?.trim() && process.env.AZURE_DI_KEY?.trim());
    },

    async extractPage(bytes: Uint8Array, mimeType: string): Promise<OcrPageResult> {
      const endpoint = process.env.AZURE_DI_ENDPOINT!.replace(/\/+$/, "");
      const key = process.env.AZURE_DI_KEY!;
      const analyzeUrl =
        `${endpoint}/documentintelligence/documentModels/${DI_MODEL}:analyze?api-version=${DI_API_VERSION}`;

      const submit = await fetch(analyzeUrl, {
        method: "POST",
        headers: {
          "Ocp-Apim-Subscription-Key": key,
          "Content-Type": mimeType,
        },
        body: bytes as unknown as BodyInit,
      });

      if (!submit.ok) {
        const body = await submit.text();
        throw new Error(`azure_di_submit_failed: ${submit.status} ${body.slice(0, 200)}`);
      }

      const opLoc = submit.headers.get("operation-location");
      if (!opLoc) throw new Error("azure_di_no_operation_location");

      const result = await pollOperation(opLoc, key);
      return toPageResult(result);
    },
  };
}

interface DiAnalyzeResult {
  status?: string;
  analyzeResult?: {
    content?: string;
    pages?: Array<{ words?: Array<{ confidence?: number }> }>;
  };
}

async function pollOperation(opLoc: string, key: string): Promise<DiAnalyzeResult> {
  const deadline = Date.now() + 60_000;
  while (Date.now() < deadline) {
    const res = await fetch(opLoc, { headers: { "Ocp-Apim-Subscription-Key": key } });
    if (!res.ok) throw new Error(`azure_di_poll_failed: ${res.status}`);
    const body = (await res.json()) as DiAnalyzeResult;
    if (body.status === "succeeded") return body;
    if (body.status === "failed") throw new Error("azure_di_analyze_failed");
    await delay(750);
  }
  throw new Error("azure_di_timeout");
}

function toPageResult(result: DiAnalyzeResult): OcrPageResult {
  const content = result.analyzeResult?.content ?? "";
  const words = result.analyzeResult?.pages?.flatMap((p) => p.words ?? []) ?? [];
  const confidences = words.map((w) => w.confidence).filter((c): c is number => typeof c === "number");
  const avg = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : undefined;
  return { text: content.replace(/\s+/g, " ").trim(), confidence: avg };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
