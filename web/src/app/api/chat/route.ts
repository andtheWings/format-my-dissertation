import {
  streamText,
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

  return `You are a dissertation formatting assistant.

SUBMISSION REQUIREMENTS:
${specSummary}

TEMPLATE FILES AVAILABLE:
${templateIndex}
Entry point: template.typ

Session ID: ${sessionId}

You have access to five tools: extract_document, get_institution_spec, get_template, compile_typst, and validate_pdf.

WORKFLOW:
1. Ask the student to upload their dissertation
2. Call extract_document to get the content
3. Call get_institution_spec to review all formatting rules for the institution
4. Call get_template to read the Typst template files and understand the available section components
5. Elicit missing variables from the student (degree, committee members, campus, defense date, font preferences)
6. Generate the full Typst document using the template and call compile_typst
7. Call validate_pdf to check compliance against institution requirements
8. Edit ONE section at a time, recompile the full document, revalidate — repeat until all automatable checks pass
9. Walk through each human-review check with the student one at a time:
   - Present the check description and what to look for
   - Ask the student to confirm the item is correct or flag issues
   - Record their response before moving to the next check
10. When all checks pass, offer the final PDF for download`;
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
  });

  return createUIMessageStreamResponse({
    stream: toUIMessageStream({ stream: result.stream }),
  });
}
