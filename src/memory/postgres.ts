import { Pool } from "pg";
import type { ModelMessage } from "ai";
import { notifier } from "../notifications/index";

const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

// Create tables on module load
pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    current_session_id TEXT UNIQUE,
    status TEXT,
    person_name TEXT,
    project_name TEXT,
    priority TEXT DEFAULT 'baja',
    tipologia_answer TEXT,
    tipologia_score INTEGER DEFAULT 0,
    separacion_answer TEXT,
    separacion_score INTEGER DEFAULT 0,
    financiacion_answer TEXT,
    financiacion_score INTEGER DEFAULT 0,
    plazo_answer TEXT,
    plazo_score INTEGER DEFAULT 0,
    decision_answer TEXT,
    decision_score INTEGER DEFAULT 0,
    visita_answer TEXT,
    visita_score INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS chat_history (
    id SERIAL PRIMARY KEY,
    session_id TEXT,
    role TEXT,
    content TEXT,
    created_at TIMESTAMP DEFAULT now()
  );
`).catch((err) => notifier.notify({ level: 'error', fn: 'memory/init', message: 'Error creando tablas', error: err }));

export async function getChatHistory(sessionId: string): Promise<ModelMessage[]> {
  const result = await pool.query(
    "SELECT role, content FROM chat_history WHERE session_id = $1 ORDER BY created_at ASC LIMIT 20",
    [sessionId]
  );
  return result.rows.map((row) => ({
    role: row.role as "user" | "assistant",
    content: row.content as string,
  }));
}

export async function saveChatHistory(
  sessionId: string,
  role: "user" | "assistant",
  content: string
): Promise<void> {
  await pool.query(
    "INSERT INTO chat_history (session_id, role, content) VALUES ($1, $2, $3)",
    [sessionId, role, content]
  );
}
