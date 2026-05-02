import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import * as schema from "./schema.js";

const url = process.env.TURSO_DATABASE_URL ?? "file:./local.db";
const authToken = process.env.TURSO_AUTH_TOKEN;

const libsqlClient = createClient({ url, authToken });

export const db = drizzle(libsqlClient, { schema });
export type DB = typeof db;
