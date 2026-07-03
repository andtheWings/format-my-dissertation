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
      "Get specific text chunks from the uploaded dissertation. Use this to read a chapter, section, or page range. Request by chunk index after calling extract_document to see how many chunks are available.",
    inputSchema: z.object({
      start_index: z
        .number()
        .describe("The first chunk index to retrieve (0-based)"),
      count: z
        .number()
        .default(3)
        .describe("How many consecutive chunks to return (default 3, max 5)"),
    }),
    execute: async ({ start_index, count }) => {
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

      const start = Math.max(0, Math.min(start_index, chunks.length - 1));
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
      const result = await validatePdf(pdfBytes.buffer as ArrayBuffer, institutionId);
      const violations = result.results.filter((r) => r.status !== "pass");
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

  return {
    extract_document: extractDocumentTool,
    get_document_chunks: getDocumentChunksTool,
    compile_typst: compileTypstTool,
    validate_pdf: validatePdfTool,
    get_institution_spec: getInstitutionSpecTool,
    get_template: getTemplateTool,
  };
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
