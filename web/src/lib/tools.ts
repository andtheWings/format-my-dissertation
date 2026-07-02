import { tool } from "ai";
import { z } from "zod";
import { extractDocument, compileTypst, validatePdf } from "./api";
import { storePdf, storeViolations, getPdf } from "./store";

export function createTools(sessionId: string) {
  const extractDocumentTool = tool({
    description:
      "Extract text content from an uploaded dissertation file (PDF, DOCX, or LaTeX). Call this when the student uploads a file.",
    inputSchema: z.object({
      fileName: z.string().describe("The name of the uploaded file"),
      fileBytes: z
        .array(z.number())
        .describe("The raw bytes of the file"),
      mimeType: z.string().describe("The MIME type of the file"),
    }),
    execute: async ({ fileName, fileBytes, mimeType }) => {
      const file = new File([new Uint8Array(fileBytes)], fileName, {
        type: mimeType,
      });
      const result = await extractDocument(file);
      return result;
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
      return result.summary;
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
    compile_typst: compileTypstTool,
    validate_pdf: validatePdfTool,
    get_institution_spec: getInstitutionSpecTool,
    get_template: getTemplateTool,
  };
}
