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

WORKFLOW (do not stop between steps unless instructed to wait):

1. When the student uploads their dissertation, call extract_document.
2. Present findings to the student and ASK for confirmation. WAIT for their response.
3. When the student confirms: call get_institution_spec, then call get_template.
4. IMMEDIATELY after receiving both results — do not pause — begin eliciting missing variables. Ask ONE question at a time: degree name, committee members (names + titles), campus, defense date, graduation date, font preferences. After each answer, ask the next question.
5. Once all variables are collected, use get_document_chunks to read specific content you need (e.g., acknowledgements text, abstract, chapter content). Read only what you need.
6. Generate the complete Typst assembly (imports + section function calls with variable values). For body content (chapters, abstract, CV, acknowledgements, appendices), use {MARKER} placeholders mapped to chunk indices. Call build_document to assemble and compile.
7. Call validate_pdf to check compliance against institution requirements.
8. If violations exist, edit ONE section at a time, recompile the full document, revalidate. Repeat until all automatable checks pass.
9. Walk through each human-review check with the student ONE at a time: present the check, what to look for, ask for confirmation, record response.
10. When all checks pass, tell the student the document is ready and offer the final PDF for download.`;
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
