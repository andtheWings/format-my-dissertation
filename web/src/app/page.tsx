"use client";

import { useState, useCallback } from "react";
import { InstitutionSelector } from "@/components/institution-selector";
import type { InstitutionSummary } from "@/lib/api";
import { ChatPanel } from "@/components/chat-panel";
import { ValidationResults } from "@/components/validation-results";
import { PdfPreview } from "@/components/pdf-preview";

export default function Home() {
  const [institution, setInstitution] = useState<InstitutionSummary | null>(
    null
  );
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [pdfBytes, setPdfBytes] = useState<Uint8Array | null>(null);
  const [violations, setViolations] = useState([]);
  const [passCount, setPassCount] = useState(0);
  const [failCount, setFailCount] = useState(0);
  const [rightTab, setRightTab] = useState<"preview" | "validation">(
    "preview"
  );

  const fetchState = useCallback(async (sid: string) => {
    const res = await fetch(`/api/state?sessionId=${encodeURIComponent(sid)}`);
    if (!res.ok) return;
    const data = await res.json();
    if (data.pdf) {
      const binary = atob(data.pdf);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
      }
      setPdfBytes(bytes);
      setRightTab("preview");
    }
    if (data.violations && data.violations.length > 0) {
      setViolations(data.violations);
      setPassCount(data.passCount);
      setFailCount(data.failCount);
    }
  }, []);

  const handleCompile = useCallback(
    (sid: string) => {
      fetchState(sid);
    },
    [fetchState]
  );

  const handleValidate = useCallback(
    (sid: string) => {
      setRightTab("validation");
      fetchState(sid);
    },
    [fetchState]
  );

  const handleInstitutionSelect = useCallback(
    (inst: InstitutionSummary) => {
      setInstitution(inst);
      const id = `session-${inst.id}-${Date.now()}`;
      setSessionId(id);
      setPdfBytes(null);
      setViolations([]);
      setPassCount(0);
      setFailCount(0);
    },
    []
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex items-center gap-4 border-b px-6 py-3">
        <h1 className="text-lg font-semibold">Format My Dissertation</h1>
        <div className="flex-1" />
        <InstitutionSelector
          onSelect={handleInstitutionSelect}
          selected={institution ?? undefined}
        />
      </header>
      <div className="flex flex-1 overflow-hidden">
        <div className="flex w-1/2 flex-col border-r">
          {institution && sessionId ? (
            <ChatPanel
              key={sessionId}
              institutionId={institution.id}
              sessionId={sessionId}
              onCompile={handleCompile}
              onValidate={handleValidate}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center text-muted-foreground">
              Select an institution to begin
            </div>
          )}
        </div>
        <div className="flex w-1/2 flex-col">
          <div className="flex border-b">
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium ${
                rightTab === "preview"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground"
              }`}
              onClick={() => setRightTab("preview")}
            >
              Preview
            </button>
            <button
              type="button"
              className={`px-4 py-2 text-sm font-medium ${
                rightTab === "validation"
                  ? "border-b-2 border-primary text-primary"
                  : "text-muted-foreground"
              }`}
              onClick={() => setRightTab("validation")}
            >
              Validation
            </button>
          </div>
          <div className="flex-1 overflow-hidden">
            {rightTab === "preview" ? (
              <PdfPreview pdfBytes={pdfBytes} />
            ) : (
              <ValidationResults
                violations={violations}
                passCount={passCount}
                failCount={failCount}
              />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
