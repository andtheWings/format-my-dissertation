"use client";

import { useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface PdfPreviewProps {
  pdfBytes: Uint8Array | null;
}

export function PdfPreview({ pdfBytes }: PdfPreviewProps) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [pageNumber, setPageNumber] = useState(1);

  if (!pdfBytes) {
    return (
      <div className="flex h-full items-center justify-center text-muted-foreground">
        <p className="text-sm">Compile a PDF to see a preview here</p>
      </div>
    );
  }

  const fileUrl = URL.createObjectURL(
    new Blob([pdfBytes as BlobPart], { type: "application/pdf" })
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b px-4 py-2">
        <p className="text-sm text-muted-foreground">
          Page {pageNumber} of {numPages ?? "?"}
        </p>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={pageNumber <= 1}
            onClick={() => setPageNumber((p) => p - 1)}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={pageNumber >= (numPages ?? 1)}
            onClick={() => setPageNumber((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-4">
        <Document
          file={fileUrl}
          onLoadSuccess={({ numPages: n }) => setNumPages(n)}
          loading={<Skeleton className="h-[800px] w-full" />}
        >
          <Page
            pageNumber={pageNumber}
            width={Math.min(
              typeof window !== "undefined" ? window.innerWidth * 0.45 : 600,
              600
            )}
            renderTextLayer={false}
            renderAnnotationLayer={false}
          />
        </Document>
      </div>
    </div>
  );
}
