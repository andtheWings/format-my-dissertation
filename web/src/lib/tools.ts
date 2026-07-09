import { tool } from "ai";
import { z } from "zod";
import { compileTypst, validatePdf } from "./api";
import { storePdf, storeViolations, getPdf, getStoredExtraction } from "./store";

export function createTools(sessionId: string) {
  const extractDocumentTool = tool({
    description:
      "Get the structural summary of the student's uploaded dissertation: page count, detected headings/sections, fonts, and a preview of the first content chunk. Does NOT return the full text — use get_document_chunks to read specific sections.",
    inputSchema: z.object({}),
    execute: async () => {
      const extraction = getStoredExtraction(sessionId);
      if (!extraction) {
        return {
          error:
            "No document has been extracted yet. Ask the student to upload their dissertation file first.",
        };
      }

      const charsPerChunk = 5000;
      const overlap = 500;
      const chunks = chunkDocument(extraction.raw_text, charsPerChunk, overlap);

      const firstChunk = chunks.length > 0
        ? chunks[0].text.slice(0, 4000)
        : "";

      return {
        page_count: extraction.page_count,
        page_count_estimated: extraction.page_count_estimated,
        detected_fonts: extraction.detected_fonts,
        headings: extraction.headings,
        total_chars: extraction.raw_text.length,
        available_chunks: chunks.length,
        first_chunk: firstChunk,
      };
    },
  });

  const getDocumentChunksTool = tool({
    description:
      "Get specific text chunks from the uploaded dissertation. Use this to read a chapter, section, or page range. Request by chunk index OR by heading name (partial match on heading text). Call extract_document first to see which headings are available and how many chunks exist.",
    inputSchema: z.object({
      start_index: z
        .number()
        .optional()
        .describe("The first chunk index to retrieve (0-based). Use when jumping to a known chunk position."),
      heading: z
        .string()
        .optional()
        .describe("Find chunks by heading name (partial match, case-insensitive). e.g. 'Chapter 1', 'Acknowledgements', 'References'. The tool finds which chunk starts at that heading and returns chunks from there."),
      count: z
        .number()
        .default(3)
        .describe("How many consecutive chunks to return (default 3, max 5)"),
    }),
    execute: async ({ start_index, heading, count }) => {
      const extraction = getStoredExtraction(sessionId);
      if (!extraction) {
        return {
          error:
            "No document has been extracted yet. Ask the student to upload their dissertation file first.",
        };
      }

      const charsPerChunk = 5000;
      const overlap = 500;
      const chunks = chunkDocument(extraction.raw_text, charsPerChunk, overlap);
      const clampedCount = Math.min(count, 5);

      let start: number;

      if (heading) {
        const matches = extraction.headings.filter(
          (h) =>
            h.text.toLowerCase().includes(heading.toLowerCase())
        );
        if (matches.length === 0) {
          return {
            error: `No heading matching "${heading}" found. Available headings: ${extraction.headings.map((h) => h.text).join(", ")}`,
          };
        }

        const match = matches[0];
        const pos = extraction.raw_text.indexOf(match.text);
        if (pos === -1) {
          return {
            error: `Heading "${match.text}" found in metadata but could not be located in document text.`,
          };
        }

        const chunkIdx = chunks.findIndex(
          (c) => pos >= c.start_char && pos < c.end_char
        );
        start = chunkIdx >= 0 ? chunkIdx : 0;

        start = Math.max(0, Math.min(start, chunks.length - 1));
        const end = Math.min(start + clampedCount, chunks.length);

        return {
          heading: {
            text: match.text,
            level: match.level,
            page_number: match.page_number,
          },
          chunks: chunks.slice(start, end).map((c) => ({
            index: c.index,
            text: c.text,
            char_range: [c.start_char, c.end_char],
          })),
          start_index: start,
          total_chunks: chunks.length,
          has_more: end < chunks.length,
        };
      }

      if (start_index === undefined) {
        return {
          error: "Provide either start_index or heading to specify which chunks to retrieve.",
        };
      }

      start = Math.max(0, Math.min(start_index, chunks.length - 1));
      const end = Math.min(start + clampedCount, chunks.length);

      return {
        chunks: chunks.slice(start, end).map((c) => ({
          index: c.index,
          text: c.text,
          char_range: [c.start_char, c.end_char],
        })),
        total_chunks: chunks.length,
        has_more: end < chunks.length,
      };
    },
  });

  const compileTypstTool = tool({
    description:
      "Compile Typst source code into a PDF document. Call this when the template code is ready.",
    inputSchema: z.object({
      typstCode: z
        .string()
        .describe("The complete Typst source code to compile"),
      institutionId: z
        .string()
        .describe("The institution ID (e.g. 'iu')"),
    }),
    execute: async ({ typstCode, institutionId }) => {
      const bracketError = validateBrackets(typstCode);
      if (bracketError) {
        return { error: bracketError };
      }

      const pdfBuffer = await compileTypst(typstCode, institutionId);
      storePdf(sessionId, new Uint8Array(pdfBuffer));
      return {
        success: true,
        pdfSize: new Uint8Array(pdfBuffer).byteLength,
      };
    },
  });

  const validatePdfTool = tool({
    description:
      "Validate a compiled PDF against institution formatting requirements. Call this after compiling to check for violations.",
    inputSchema: z.object({
      institutionId: z
        .string()
        .describe("The institution ID (e.g. 'iu')"),
    }),
    execute: async ({ institutionId }) => {
      const pdfBytes = getPdf(sessionId);
      if (!pdfBytes) {
        return {
          error:
            "No PDF available to validate. Ask the student to compile the document first.",
        };
      }
      try {
        const result = await validatePdf(pdfBytes.buffer as ArrayBuffer, institutionId);
        const violations = result.violations.filter((r) => r.status !== "PASS");
        storeViolations(
          sessionId,
          violations,
          result.pass_count,
          result.fail_count
        );
        return {
          passCount: result.pass_count,
          failCount: result.fail_count,
          violations,
        };
      } catch (e) {
        console.error("[validatePdfTool] execution failed", e);
        throw e;
      }
    },
  });

  const getInstitutionSpecTool = tool({
    description:
      "Read the complete institution formatting specification including all checks, document structure, and constants. Call this to understand submission requirements before generating Typst code.",
    inputSchema: z.object({
      institutionId: z
        .string()
        .describe("The institution ID (e.g. 'iu')"),
    }),
    execute: async ({ institutionId }) => {
      const { fetchInstitutionSpec } = await import("./api");
      const result = await fetchInstitutionSpec(institutionId);
      return result.raw;
    },
  });

  const getTemplateTool = tool({
    description:
      "Read the Typst template files for the institution. Call this to understand the available section components and styles before generating Typst code. Returns all .typ files with paths and contents.",
    inputSchema: z.object({
      institutionId: z
        .string()
        .describe("The institution ID (e.g. 'iu')"),
    }),
    execute: async ({ institutionId }) => {
      const { fetchTemplate } = await import("./api");
      const result = await fetchTemplate(institutionId);
      return {
        entry: result.entry,
        files: result.files.map((f) => ({
          path: f.path,
          firstLine: f.content.split("\n")[0],
          lineCount: f.content.split("\n").length,
        })),
        fullContent: result.files
          .filter((f) => f.content.length < 2000)
          .map((f) => ({ path: f.path, content: f.content })),
      };
    },
  });

  const buildDocumentTool = tool({
    description:
      "Build and compile the full Typst document by combining the LLM's structure with text from stored extraction chunks. Use bare {MARKER} placeholders in typst_structure — do NOT wrap them in #str(), [], or any function call. The backend fetches text, escapes special characters, and wraps in content blocks automatically. Short fields (title, author, dates) should be literal Typst strings, not markers.",
    inputSchema: z.object({
      typst_structure: z
        .string()
        .describe(
          "The complete Typst assembly code (imports + function calls) with bare {MARKER} placeholders where body text goes. Example: body: {ABSTRACT} — NOT body: #str({ABSTRACT}) or body: [{ABSTRACT}]. Short fields should be literal values: title: \"My Title\", author: \"Jane Doe\"."
        ),
      section_chunks: z
        .record(z.array(z.number()))
        .describe(
          "Map of marker names to chunk index arrays. e.g. { ABSTRACT: [4,5], CHAPTER_1: [12,13,14,15] }. Only use markers for long body text. Short values (title, author, committee, dates) go directly in typst_structure as literals."
        ),
      institutionId: z
        .string()
        .describe("The institution ID (e.g. 'iu')"),
    }),
    execute: async ({ typst_structure, section_chunks, institutionId }) => {
      const extraction = getStoredExtraction(sessionId);
      if (!extraction) {
        return {
          error:
            "No document has been extracted yet. Ask the student to upload their dissertation file first.",
        };
      }

      const assembled = assembleDocument(
        typst_structure,
        section_chunks,
        extraction.raw_text
      );

      const bracketError = validateBrackets(assembled);
      if (bracketError) {
        return { error: bracketError };
      }

      const pdfBuffer = await compileTypst(assembled, institutionId);
      storePdf(sessionId, new Uint8Array(pdfBuffer));
      return {
        success: true,
        pdfSize: new Uint8Array(pdfBuffer).byteLength,
      };
    },
  });

  return {
    extract_document: extractDocumentTool,
    get_document_chunks: getDocumentChunksTool,
    compile_typst: compileTypstTool,
    validate_pdf: validatePdfTool,
    get_institution_spec: getInstitutionSpecTool,
    get_template: getTemplateTool,
    build_document: buildDocumentTool,
  };
}

function escapeTypstText(text: string): string {
  return text
    .replace(/\\/g, "\\\\")
    .replace(/\$/g, "\\$")
    .replace(/#/g, "\\#")
    .replace(/\[/g, "\\[")
    .replace(/\]/g, "\\]")
    .replace(/^(\*)/gm, "\\$1")
    .replace(/^(_)/gm, "\\$1");
}

function validateBrackets(code: string): string | null {
  const pairs: Array<[string, string, string]> = [
    ["(", ")", "parentheses"],
    ["[", "]", "brackets"],
    ["{", "}", "braces"],
  ];

  const errors: string[] = [];
  const lines = code.split("\n");

  for (const [open, close, name] of pairs) {
    const stack: number[] = [];
    for (let i = 0; i < lines.length; i++) {
      for (const ch of lines[i]) {
        if (ch === open) stack.push(i + 1);
        if (ch === close && stack.length > 0) stack.pop();
      }
    }
    if (stack.length > 0) {
      const lineNums = [...new Set(stack)].sort((a, b) => a - b);
      errors.push(
        `  '${open}${close}' (${name}) unclosed at line${lineNums.length > 1 ? "s" : ""} ${lineNums.join(", ")}`
      );
    }
  }

  if (errors.length > 0) {
    return `Bracket balance check failed — the following delimiters are unclosed:\n${errors.join("\n")}\nFix these and re-submit.`;
  }

  return null;
}

function getChunksFromText(
  rawText: string,
  indices: number[],
  charsPerChunk: number,
  overlap: number
): string {
  const allChunks = chunkDocument(rawText, charsPerChunk, overlap);
  const valid = [...new Set(indices)]
    .filter((i) => i >= 0 && i < allChunks.length)
    .sort((a, b) => a - b);

  const ranges: Array<[number, number]> = [];
  for (const idx of valid) {
    const c = allChunks[idx];
    const last = ranges[ranges.length - 1];
    if (last && c.start_char <= last[1]) {
      last[1] = Math.max(last[1], c.end_char);
    } else {
      ranges.push([c.start_char, c.end_char]);
    }
  }

  return ranges.map(([start, end]) => rawText.slice(start, end)).join("\n\n");
}

function assembleDocument(
  typstStructure: string,
  sectionChunks: Record<string, number[]>,
  rawText: string
): string {
  let result = typstStructure;
  for (const [marker, indices] of Object.entries(sectionChunks)) {
    const chunkText = getChunksFromText(rawText, indices, 5000, 500);
    const escaped = escapeTypstText(chunkText);
    result = result.replace(
      new RegExp(`\\{${marker}\\}`, "g"),
      `[${escaped}]`
    );
  }
  return result;
}

function chunkDocument(
  rawText: string,
  maxChars: number,
  overlap: number
): Array<{ index: number; text: string; start_char: number; end_char: number }> {
  const chunks: Array<{
    index: number;
    text: string;
    start_char: number;
    end_char: number;
  }> = [];

  if (rawText.length <= maxChars) {
    chunks.push({
      index: 0,
      text: rawText,
      start_char: 0,
      end_char: rawText.length,
    });
    return chunks;
  }

  let chunkStart = 0;
  let index = 0;

  while (chunkStart < rawText.length) {
    const targetEnd = Math.min(chunkStart + maxChars, rawText.length);
    let breakPoint = targetEnd;

    const searchRegion = rawText.slice(0, targetEnd);
    const lastPara = searchRegion.lastIndexOf("\n\n");
    if (lastPara > chunkStart) {
      breakPoint = lastPara + 2;
    }

    const chunkEnd = Math.min(breakPoint, rawText.length);
    chunks.push({
      index,
      text: rawText.slice(chunkStart, chunkEnd),
      start_char: chunkStart,
      end_char: chunkEnd,
    });

    chunkStart =
      chunkEnd >= rawText.length - overlap
        ? rawText.length
        : chunkEnd - overlap;
    index++;
  }

  return chunks;
}
