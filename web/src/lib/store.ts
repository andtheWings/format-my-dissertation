interface SessionState {
  pdf: Uint8Array | null;
  violations: Array<{
    check_id: string;
    status: string;
    detail: string;
    evidence: Array<{ page: number }>;
  }>;
  passCount: number;
  failCount: number;
}

const store = new Map<string, SessionState>();

function getOrCreate(sessionId: string): SessionState {
  if (!store.has(sessionId)) {
    store.set(sessionId, {
      pdf: null,
      violations: [],
      passCount: 0,
      failCount: 0,
    });
  }
  return store.get(sessionId)!;
}

export function storePdf(sessionId: string, pdf: Uint8Array) {
  getOrCreate(sessionId).pdf = pdf;
}

export function storeViolations(
  sessionId: string,
  violations: SessionState["violations"],
  passCount: number,
  failCount: number
) {
  const state = getOrCreate(sessionId);
  state.violations = violations;
  state.passCount = passCount;
  state.failCount = failCount;
}

export function getPdf(sessionId: string): Uint8Array | null {
  return store.get(sessionId)?.pdf ?? null;
}

export function getState(
  sessionId: string
): { pdf: string | null } & Omit<SessionState, "pdf"> {
  const state = getOrCreate(sessionId);
  return {
    pdf: state.pdf ? Buffer.from(state.pdf).toString("base64") : null,
    violations: state.violations,
    passCount: state.passCount,
    failCount: state.failCount,
  };
}
