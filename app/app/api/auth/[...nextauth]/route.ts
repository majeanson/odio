// NextAuth v5 — route handler
// All auth logic lives in lib/auth.ts; this file just re-exports the handlers.

import { handlers } from "@/lib/auth";

export const { GET, POST } = handlers;
