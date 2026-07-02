const RUST_SERVICE_URL =
  process.env.RUST_SERVICE_URL ?? "http://localhost:4000";

export interface InstitutionSummary {
  id: string;
  name: string;
  ui_config: { name: string; logo: string } | null;
}

export async function fetchInstitutions(): Promise<InstitutionSummary[]> {
  const res = await fetch(`${RUST_SERVICE_URL}/institutions`);
  if (!res.ok) throw new Error(`Failed to fetch institutions: ${res.status}`);
  return res.json();
}

export async function extractDocument(
  file: File
): Promise<{ content: string; metadata: Record<string, unknown> }> {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch(`${RUST_SERVICE_URL}/extract`, {
    method: "POST",
    body: form,
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Extract failed: ${res.status}`);
  }
  return res.json();
}

export async function compileTypst(
  typstCode: string,
  institutionId: string
): Promise<ArrayBuffer> {
  const res = await fetch(
    `${RUST_SERVICE_URL}/compile?institution=${institutionId}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ typst_code: typstCode }),
    }
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Compile failed: ${res.status}`);
  }
  return res.arrayBuffer();
}

export interface Violation {
  check_id: string;
  status: string;
  detail: string;
  evidence: Array<{ page: number }>;
}

export interface ValidationResult {
  results: Violation[];
  pass_count: number;
  fail_count: number;
  error_count: number;
}

export async function validatePdf(
  pdfBytes: ArrayBuffer,
  institutionId: string
): Promise<ValidationResult> {
  const res = await fetch(`${RUST_SERVICE_URL}/validate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      pdf_bytes: Array.from(new Uint8Array(pdfBytes)),
      institution_id: institutionId,
    }),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Validate failed: ${res.status}`);
  }
  return res.json();
}

export interface SpecSummary {
  institution: string;
  document_structure: unknown;
  constants: unknown;
  check_count: { automated: number; human: number };
}

export interface SpecResponse {
  raw: unknown;
  summary: SpecSummary;
}

export async function fetchInstitutionSpec(
  institutionId: string
): Promise<SpecResponse> {
  const res = await fetch(
    `${RUST_SERVICE_URL}/institutions/${encodeURIComponent(institutionId)}/spec`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Spec fetch failed: ${res.status}`);
  }
  return res.json();
}

export interface TemplateFile {
  path: string;
  content: string;
}

export interface TemplateResponse {
  files: TemplateFile[];
  entry: string;
}

export async function fetchTemplate(
  institutionId: string
): Promise<TemplateResponse> {
  const res = await fetch(
    `${RUST_SERVICE_URL}/institutions/${encodeURIComponent(institutionId)}/template`
  );
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(err.error ?? `Template fetch failed: ${res.status}`);
  }
  return res.json();
}
