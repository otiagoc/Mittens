import { randomBytes } from "crypto";

export function generateSecureToken(prefix: string, lengthBytes = 24): string {
  const randomPart = randomBytes(lengthBytes).toString("hex");
  return `${prefix}_${randomPart}`;
}

export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number
): Promise<T> {
  const timeoutPromise = new Promise<T>((_, reject) =>
    setTimeout(() => reject(new Error("Timeout")), timeoutMs)
  );
  return Promise.race([promise, timeoutPromise]);
}
