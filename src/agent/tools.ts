import { tool, zodSchema } from "ai";
import { z } from "zod";
import { Pool } from "pg";
import { searchKnowledge } from '../rag/pinecone';
import { moveLeadToAppointmentStage, updateLeadPrice, addLeadNote } from '../kommo';

const pool = new Pool({ connectionString: process.env.POSTGRES_URL });

const QUESTION_IDS = ["tipologia", "separacion", "financiacion", "plazo", "decision", "visita"] as const;

const selectSchema = z.object({
  session_id: z.string().describe("El entity_id del lead en Kommo"),
});

const upsertSchema = z.object({
  session_id: z.string(),
  status: z.string().optional(),
  person_name: z.string().optional(),
  project_name: z.string().optional(),
  priority: z.string().optional(),
  tipologia_answer: z.string().optional(),
  tipologia_score: z.number().optional(),
  separacion_answer: z.string().optional(),
  separacion_score: z.number().optional(),
  financiacion_answer: z.string().optional(),
  financiacion_score: z.number().optional(),
  plazo_answer: z.string().optional(),
  plazo_score: z.number().optional(),
  decision_answer: z.string().optional(),
  decision_score: z.number().optional(),
  visita_answer: z.string().optional(),
  visita_score: z.number().optional(),
});

export async function getUserData(sessionId: string) {
  const result = await pool.query(
    `SELECT current_session_id, status, person_name, project_name, priority,
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
  // Calculate score server-side
  const score = QUESTION_IDS.reduce((sum, id) => sum + (row[`${id}_score`] ?? 0), 0);
  return { ...row, score };
}

export const selectUserData = tool({
  description: "Obtener datos actuales del usuario desde la base de datos",
  inputSchema: zodSchema(selectSchema),
  execute: async ({ session_id }, _options) => {
    return getUserData(session_id);
  },
});

export const upsertUserData = tool({
  description: "Crear o actualizar datos del usuario en la base de datos. Para guardar respuestas de calificacion, usa los campos individuales (ej: tipologia_answer, tipologia_score).",
  inputSchema: zodSchema(upsertSchema),
  execute: async (data, _options) => {
    await pool.query(
      `INSERT INTO users (
        current_session_id, status, person_name, project_name, priority,
        tipologia_answer, tipologia_score,
        separacion_answer, separacion_score,
        financiacion_answer, financiacion_score,
        plazo_answer, plazo_score,
        decision_answer, decision_score,
        visita_answer, visita_score
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
      ON CONFLICT (current_session_id) DO UPDATE SET
        status = COALESCE($2, users.status),
        person_name = COALESCE($3, users.person_name),
        project_name = COALESCE($4, users.project_name),
        priority = COALESCE($5, users.priority),
        tipologia_answer = COALESCE($6, users.tipologia_answer),
        tipologia_score = COALESCE($7, users.tipologia_score),
        separacion_answer = COALESCE($8, users.separacion_answer),
        separacion_score = COALESCE($9, users.separacion_score),
        financiacion_answer = COALESCE($10, users.financiacion_answer),
        financiacion_score = COALESCE($11, users.financiacion_score),
        plazo_answer = COALESCE($12, users.plazo_answer),
        plazo_score = COALESCE($13, users.plazo_score),
        decision_answer = COALESCE($14, users.decision_answer),
        decision_score = COALESCE($15, users.decision_score),
        visita_answer = COALESCE($16, users.visita_answer),
        visita_score = COALESCE($17, users.visita_score)`,
      [
        data.session_id, data.status ?? null, data.person_name ?? null, data.project_name ?? null, data.priority ?? null,
        data.tipologia_answer ?? null, data.tipologia_score ?? null,
        data.separacion_answer ?? null, data.separacion_score ?? null,
        data.financiacion_answer ?? null, data.financiacion_score ?? null,
        data.plazo_answer ?? null, data.plazo_score ?? null,
        data.decision_answer ?? null, data.decision_score ?? null,
        data.visita_answer ?? null, data.visita_score ?? null,
      ]
    );
    return { success: true };
  },
});

export const transferLead = tool({
  description: "Transferir el lead a un agente humano de manera silenciosa. Actualiza precio, agrega nota resumen y mueve a etapa correspondiente.",
  inputSchema: zodSchema(z.object({
    session_id: z.string().describe("El entity_id del lead en Kommo"),
    priority: z.enum(["alta", "baja"]).describe("Prioridad del lead: alta para 55+ puntos, baja para menos de 55 puntos"),
    price: z.number().describe("Valor estimado del lead en pesos colombianos segun la tipologia elegida (68m2=348000000, 75m2=380000000)"),
    summary: z.string().describe("Resumen de la conversacion para el agente humano: nombre, tipologia, capacidad financiera, decision, interes general"),
  })),
  execute: async ({ session_id, priority, price, summary }, _options) => {
    console.log(`[Tool] transfer_lead → session_id: ${session_id}, priority: ${priority}, price: ${price}`);
    await moveLeadToAppointmentStage(session_id, priority);
    if (price > 0) {
      await updateLeadPrice(session_id, price);
    }
    await addLeadNote(session_id, summary);
    return { success: true, priority, price };
  },
});

export const searchKnowledgeBase = tool({
  description: 'Buscar información sobre proyectos inmobiliarios, precios, ubicaciones y características',
  inputSchema: zodSchema(z.object({
    query: z.string().describe('La pregunta o tema a buscar en la base de conocimiento')
  })),
  execute: async ({ query }, _options) => {
    const result = await searchKnowledge(query)
    return result || 'No encontré información específica sobre eso.'
  }
});
