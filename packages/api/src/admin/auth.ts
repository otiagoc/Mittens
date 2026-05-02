import jwt from "jsonwebtoken";
import type { Context, Next } from "hono";

const JWT_SECRET = process.env.JWT_SECRET ?? "mittens-secret-dev";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD ?? "mittens2024";

export interface AuthPayload {
  role: "admin";
  iat: number;
}

/** Gera um token JWT para o owner */
export function generateToken(): string {
  return jwt.sign({ role: "admin" }, JWT_SECRET, { expiresIn: "7d" });
}

/** Verifica o token JWT */
export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload;
  } catch {
    return null;
  }
}

/** Valida a password do admin */
export function checkPassword(password: string): boolean {
  return password === ADMIN_PASSWORD;
}

/** Middleware Hono — protege rotas que requerem autenticação.
 *  Aceita token via Authorization header OU via query param ?token= (para SSE/EventSource).
 */
export async function authMiddleware(c: Context, next: Next) {
  const authHeader = c.req.header("Authorization");
  const queryToken = c.req.query("token");

  const rawToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice(7)
    : queryToken ?? null;

  if (!rawToken) {
    return c.json({ error: "Não autorizado" }, 401);
  }

  const payload = verifyToken(rawToken);

  if (!payload) {
    return c.json({ error: "Token inválido ou expirado" }, 401);
  }

  await next();
}
