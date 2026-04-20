import { Pool } from "pg";
import { searchKnowledge } from '../rag/pinecone';
import { moveLeadToAppointmentStage, updateLeadPrice, addLeadNote } from '../kommo';
import { notifier } from '../notifications/index';

const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

const QUESTION_IDS = ["tipologia", "separacion", "financiacion", "plazo", "decision", "visita"] as const;

export interface UpsertUserDataArgs {
  session_id: string;
  status?: string;
  person_name?: string;
  project_name?: string;
  tipologia_answer?: string;
  tipologia_score?: number;
  separacion_answer?: string;
  separacion_score?: number;
  financiacion_answer?: string;
  financiacion_score?: number;
  plazo_answer?: string;
  plazo_score?: number;
  decision_answer?: string;
  decision_score?: number;
  visita_answer?: string;
  visita_score?: number;
}

export interface TransferLeadArgs {
  session_id: string;
  priority: "alta" | "baja";
  price: number;
  summary: string;
}

export async function getUserData(sessionId: string) {
  const result = await pool.query(
    `SELECT current_session_id, status, person_name, project_name,
      tipologia_answer, tipologia_score,
      separacion_answer, separacion_score,
      financiacion_answer, financiacion_score,
      plazo_answer, plazo_score,
      decision_answer, decision_score,
      visita_answer, visita_score
    FROM users WHERE current_session_id = $1`,
    [sessionId]
  );
  if (result.rows.length === 0) return null;
  const row = result.rows[0];
  const score = QUESTION_IDS.reduce((sum, id) => sum + (row[`${id}_score`] ?? 0), 0);
  return { ...row, score };
}

export async function selectUserData({ session_id }: { session_id: string }) {
  return getUserData(session_id);
}

export async function upsertUserData(data: UpsertUserDataArgs) {
  await pool.query(
    `INSERT INTO users (
      current_session_id, status, person_name, project_name,
      tipologia_answer, tipologia_score,
      separacion_answer, separacion_score,
      financiacion_answer, financiacion_score,
      plazo_answer, plazo_score,
      decision_answer, decision_score,
      visita_answer, visita_score
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
    ON CONFLICT (current_session_id) DO UPDATE SET
      status = COALESCE($2, users.status),
      person_name = COALESCE($3, users.person_name),
      project_name = COALESCE($4, users.project_name),
      tipologia_answer = COALESCE($5, users.tipologia_answer),
      tipologia_score = COALESCE($6, users.tipologia_score),
      separacion_answer = COALESCE($7, users.separacion_answer),
      separacion_score = COALESCE($8, users.separacion_score),
      financiacion_answer = COALESCE($9, users.financiacion_answer),
      financiacion_score = COALESCE($10, users.financiacion_score),
      plazo_answer = COALESCE($11, users.plazo_answer),
      plazo_score = COALESCE($12, users.plazo_score),
      decision_answer = COALESCE($13, users.decision_answer),
      decision_score = COALESCE($14, users.decision_score),
      visita_answer = COALESCE($15, users.visita_answer),
      visita_score = COALESCE($16, users.visita_score)`,
    [
      data.session_id, data.status ?? null, data.person_name ?? null, data.project_name ?? null,
      data.tipologia_answer ?? null, data.tipologia_score ?? null,
      data.separacion_answer ?? null, data.separacion_score ?? null,
      data.financiacion_answer ?? null, data.financiacion_score ?? null,
      data.plazo_answer ?? null, data.plazo_score ?? null,
      data.decision_answer ?? null, data.decision_score ?? null,
      data.visita_answer ?? null, data.visita_score ?? null,
    ]
  );
  return { success: true };
}

export async function transferLead({ session_id, priority, price, summary }: TransferLeadArgs) {
  await notifier.notify({
    level: 'info',
    fn: 'tool/transfer_lead',
    entityId: session_id,
    message: `Transfiriendo lead | priority: ${priority} | price: ${price}`,
  });
  await moveLeadToAppointmentStage(session_id, priority);
  if (price > 0) {
    await updateLeadPrice(session_id, price);
  }
  await addLeadNote(session_id, summary);
  return { success: true, priority, price };
}

export async function searchKnowledgeBase({ query }: { query: string }) {
  const result = await searchKnowledge(query);
  return result || 'No encontré información específica sobre eso.';
}
