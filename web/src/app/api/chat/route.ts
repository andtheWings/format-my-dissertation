import {
  streamText,
  UIMessage,
  convertToModelMessages,
  createUIMessageStreamResponse,
  toUIMessageStream,
} from "ai";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { createTools } from "@/lib/tools";

const DEFAULT_BASE_URL = "https://reallms.rescloud.iu.edu/direct/v1";
const DEFAULT_MODEL = "gemma-4-31B-it";

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

  const systemPrompt = `You are a dissertation formatting assistant.
The selected institution ID is: ${institutionId}.
The current session ID is: ${sessionId}.

You have access to tools for extracting documents, compiling Typst code, and validating PDFs.
Use them to help the student format their dissertation.

WORKFLOW:
1. Ask the student to upload their dissertation
2. Use extract_document to extract text from the uploaded file
3. Review the extracted content with the student
4. Ask about missing information (degree, committee, defense date)
5. Generate Typst code section by section using compile_typst
6. Validate the PDF using validate_pdf
7. Fix violations iteratively until all pass`;

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
