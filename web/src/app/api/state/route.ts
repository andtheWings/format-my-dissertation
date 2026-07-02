import { getState, getPdf } from "@/lib/store";

export async function GET(req: Request) {
  const { searchParams } = new URL(req.url);
  const sessionId = searchParams.get("sessionId");
  const format = searchParams.get("format");

  if (!sessionId) {
    return Response.json({ error: "Missing sessionId" }, { status: 400 });
  }

  if (format === "pdf") {
    const pdf = getPdf(sessionId);
    if (!pdf) {
      return Response.json({ error: "No PDF stored" }, { status: 404 });
    }
    return new Response(Buffer.from(pdf), {
      headers: { "Content-Type": "application/pdf" },
    });
  }

  return Response.json(getState(sessionId));
}
