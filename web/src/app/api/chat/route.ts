import {
  streamText,
  stepCountIs,
  UIMessage,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createTools } from "@/lib/tools";
import { fetchInstitutionSpec, fetchTemplate } from "@/lib/api";

const DEFAULT_BASE_URL = "https://reallms.rescloud.iu.edu/direct/v1";
const DEFAULT_MODEL = "gemma-4-31B-it";

async function buildSystemPrompt(
  institutionId: string,
  sessionId: string
): Promise<string> {
  let specSummary = "";
  let templateIndex = "";

  try {
    const spec = await fetchInstitutionSpec(institutionId);
    const structure = spec.summary.document_structure;
    const constants = spec.summary.constants;
    specSummary = `Institution: ${spec.summary.institution}
Required sections: ${JSON.stringify(structure)}
Constants: ${JSON.stringify(constants)}
Checks: ${spec.summary.check_count.automated} automated, ${spec.summary.check_count.human} human-review`;
  } catch {
    specSummary = `Institution: ${institutionId}`;
  }

  try {
    const tmpl = await fetchTemplate(institutionId);
    templateIndex = tmpl.files
      .map((f) => `  ${f.path} (${f.content.split("\n").length} lines)`)
      .join("\n");
  } catch {
    templateIndex = "(template not available)";
  }

  return `You are a dissertation formatting assistant. Follow the workflow below IN ORDER. After completing each step, go IMMEDIATELY to the next step — do not stop or wait for the student unless the step explicitly says to.

SUBMISSION REQUIREMENTS:
${specSummary}

TEMPLATE FILES AVAILABLE:
${templateIndex}
Entry point: template.typ

Session ID: ${sessionId}

You have access to seven tools: extract_document, get_document_chunks, get_institution_spec, get_template, build_document, compile_typst, and validate_pdf.

CRITICAL SYNTAX RULES:
- build_document markers: use bare {MARKER} — NEVER use #str({MARKER}) or [{MARKER}]. The backend wraps in content blocks automatically. Example: body: {CH1} is correct. body: #str({CH1}) is WRONG.
- Do NOT paste full dissertation text into typst_structure. All body text goes through {MARKER} placeholders backed by section_chunks.
- Reuse template values: do not recalculate. If the template has #let iu-line-spacing = 2.0, write leading: 0.65em — NOT leading: 0.65em + 2.0.
- Keep function calls on one line with proper closing: #section-name(param: value). Always close parentheses, brackets, and braces.

WORKFLOW (do not stop between steps unless instructed to wait):

1. When the student uploads their dissertation, call extract_document.
2. Present detected headings and page count briefly. Only ask for confirmation if something looks wrong or you're unsure about section boundaries. Otherwise, assume the extraction is correct and proceed.
3. Call get_institution_spec for full formatting rules, then call get_template for all Typst template files.
4. Infer as many variables as you can from the extracted document (degree, committee, campus, dates, fonts). Only ask about variables you CANNOT determine from the text. Present your inferred values — if they look correct, proceed without waiting for confirmation. Do NOT ask about optional sections (copyright, dedication, lists) — include them if the document has content for them.
5. Use get_document_chunks to peek at content. Identify which chunk ranges map to which sections. Read only enough to confirm boundaries.
6. Build the full Typst assembly with {MARKER} placeholders for all body text (abstract, chapters, acknowledgements, CV, appendices). Call build_document to assemble and compile. Do NOT use compile_typst for the initial assembly — use build_document.
7. Call validate_pdf. If violations exist, fix the relevant section in typst_structure and re-submit build_document. Do one fix at a time, recompile, revalidate until all automatable checks pass.
8. Walk through each human-review check ONE at a time: present the check, what to look for, ask for confirmation, record response.
9. When all checks pass, tell the student the document is ready.`;
}

export async function POST(req: Request) {
  const {
    messages,
    institutionId,
    sessionId,
  }: { messages: UIMessage[]; institutionId: string; sessionId: string } =
    await req.json();

  const baseURL = process.env.LLM_BASE_URL ?? DEFAULT_BASE_URL;
  const model = process.env.LLM_MODEL ?? DEFAULT_MODEL;
  const apiKey = process.env.LLM_API_KEY ?? "";

  const provider = createOpenAICompatible({
    name: "llm",
    baseURL,
    apiKey,
  });

  const systemPrompt = await buildSystemPrompt(institutionId, sessionId);

  const result = streamText({
    model: provider(model),
    messages: await convertToModelMessages(messages),
    system: systemPrompt,
    tools: createTools(sessionId),
    stopWhen: stepCountIs(10),
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
