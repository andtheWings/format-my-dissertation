"use client";

import { useRef, useEffect, useState, useCallback } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import type { UIMessage } from "ai";
import { ChatMessage } from "./chat-message";
import { FileUpload } from "./file-upload";
import { Button } from "@/components/ui/button";
import { extractDocument } from "@/lib/api";

interface ChatPanelProps {
  institutionId: string;
  sessionId: string;
  onCompile: (sessionId: string) => void;
  onValidate: (sessionId: string) => void;
}

function messagesHavePendingTool(
  messages: UIMessage[],
  prevLen: number
): boolean {
  for (let i = prevLen; i < messages.length; i++) {
    for (const part of messages[i].parts) {
      if (
        typeof part.type === "string" &&
        part.type.startsWith("tool-") &&
        "state" in part &&
        typeof part.state === "string" &&
        part.state !== "output-available" &&
        part.state !== "output-error" &&
        part.state !== "output-denied" &&
        part.state !== "done"
      ) {
        return true;
      }
    }
  }
  return false;
}

function messagesHaveNewToolOutput(
  messages: UIMessage[],
  prevLen: number
): { compile: boolean; validate: boolean } {
  const result = { compile: false, validate: false };
  for (let i = prevLen; i < messages.length; i++) {
    for (const part of messages[i].parts) {
      if (part.type === "tool-compile_typst" && "state" in part) {
        if (part.state === "output-available") result.compile = true;
      }
      if (part.type === "tool-validate_pdf" && "state" in part) {
        if (part.state === "output-available") result.validate = true;
      }
    }
  }
  return result;
}

export function ChatPanel({
  institutionId,
  sessionId,
  onCompile,
  onValidate,
}: ChatPanelProps) {
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      body: { institutionId, sessionId },
    }),
  });

  const [input, setInput] = useState("");
  const [extracting, setExtracting] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const prevMsgLen = useRef(0);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    const prev = prevMsgLen.current;
    const newTools = messagesHaveNewToolOutput(messages, prev);
    if (newTools.compile) onCompile(sessionId);
    if (newTools.validate) onValidate(sessionId);
    prevMsgLen.current = messages.length;
  }, [messages, onCompile, onValidate]);

  const isLoading =
    status === "streaming" ||
    status === "submitted" ||
    messagesHavePendingTool(messages, prevMsgLen.current);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    const text = input;
    setInput("");
    sendMessage({ text });
  }

  const handleFileSelected = useCallback(
    async (file: File) => {
      setExtracting(true);
      try {
        const result = await extractDocument(file);
        const preview =
          result.content.length > 500
            ? result.content.slice(0, 500) + "..."
            : result.content;
        sendMessage({
          text: `I've uploaded my dissertation: ${file.name}\n\nExtracted content preview:\n${preview}\n\nFull content metadata: ${JSON.stringify(result.metadata)}`,
        });
      } catch (err) {
        sendMessage({
          text: `I tried to upload ${file.name} (${file.type}) but there was an error extracting it.`,
        });
      } finally {
        setExtracting(false);
      }
    },
    [sendMessage]
  );

  return (
    <div className="flex h-full flex-col">
      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.length === 0 && (
          <div className="flex h-full items-center justify-center text-muted-foreground">
            <p className="text-sm">
              Upload your dissertation to get started, or ask a question
            </p>
          </div>
        )}
        {messages.map((msg) => (
          <ChatMessage key={msg.id} message={msg} />
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="rounded-lg bg-muted px-4 py-2 text-foreground">
              <span className="animate-pulse text-sm">
                {extracting ? "Extracting document..." : "Thinking..."}
              </span>
            </div>
          </div>
        )}
        {error && (
          <div className="text-sm text-destructive">
            Error: {error.message}
          </div>
        )}
        <div ref={bottomRef} />
      </div>
      <div className="border-t p-4">
        <FileUpload onFileSelected={handleFileSelected} disabled={isLoading} />
        <form onSubmit={handleSubmit} className="mt-3">
          <div className="flex gap-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Type your message..."
              className="flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              rows={2}
              disabled={isLoading}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmit(e);
                }
              }}
            />
            <Button type="submit" disabled={isLoading || !input.trim()}>
              {isLoading ? "..." : "Send"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
