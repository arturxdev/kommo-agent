import { buildSystemPrompt } from "./prompts";
import { selectUserData, upsertUserData, getUserData, searchKnowledgeBase, transferLead } from "./tools";
import { getChatHistory, saveChatHistory } from "../memory/postgres";

const responseSchema = {
  name: "agent_response",
  strict: false,
  schema: {
    type: "object",
    properties: {
      messages: {
        type: "array",
        items: { type: "string", maxLength: 256 },
        minItems: 1,
        maxItems: 5,
      },
    },
    required: ["messages"],
    additionalProperties: false,
  },
};

function buildTools() {
  return [
    {
      type: "function",
      function: {
        name: "select_user_data",
        description: "Obtener datos actuales del usuario desde la base de datos",
        parameters: {
          type: "object",
          properties: {
            session_id: { type: "string", description: "El entity_id del lead en Kommo" },
          },
          required: ["session_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "upsert_user_data",
        description: "Crear o actualizar datos del usuario. Para guardar respuestas de calificacion, usa los campos individuales (ej: tipologia_answer, tipologia_score).",
        parameters: {
          type: "object",
          properties: {
            session_id: { type: "string", description: "El entity_id del lead en Kommo" },
            status: { type: "string", description: "Estado del lead" },
            person_name: { type: "string", description: "Nombre del usuario" },
            project_name: { type: "string", description: "Proyecto de interes" },
            priority: { type: "string", enum: ["alta", "baja"], description: "Prioridad del lead" },
            tipologia_answer: { type: "string", description: "Respuesta a pregunta de tipologia" },
            tipologia_score: { type: "number", description: "Puntaje de tipologia (max 10)" },
            separacion_answer: { type: "string", description: "Respuesta a pregunta de separacion" },
            separacion_score: { type: "number", description: "Puntaje de separacion (max 20)" },
            financiacion_answer: { type: "string", description: "Respuesta a pregunta de financiacion" },
            financiacion_score: { type: "number", description: "Puntaje de financiacion (max 15)" },
            plazo_answer: { type: "string", description: "Respuesta a pregunta de plazo" },
            plazo_score: { type: "number", description: "Puntaje de plazo (max 10)" },
            decision_answer: { type: "string", description: "Respuesta a pregunta de decision" },
            decision_score: { type: "number", description: "Puntaje de decision (max 10)" },
            visita_answer: { type: "string", description: "Respuesta a pregunta de visita presencial" },
            visita_score: { type: "number", description: "Puntaje de visita (max 10)" },
          },
          required: ["session_id"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "transfer_lead",
        description: "Transferir el lead a un agente humano de manera silenciosa. Actualiza precio, agrega nota resumen y mueve a etapa correspondiente.",
        parameters: {
          type: "object",
          properties: {
            session_id: { type: "string", description: "El entity_id del lead en Kommo" },
            priority: { type: "string", enum: ["alta", "baja"], description: "Prioridad del lead: alta para 55+ puntos, baja para menos de 55 puntos" },
            price: { type: "number", description: "Valor estimado del lead en pesos colombianos (68m2=348000000, 75m2=380000000)" },
            summary: { type: "string", description: "Resumen de la conversacion para el agente humano: nombre, tipologia, capacidad financiera, decision, interes general" },
          },
          required: ["session_id", "priority", "price", "summary"],
        },
      },
    },
    {
      type: "function",
      function: {
        name: "search_knowledge_base",
        description: "Buscar información sobre proyectos inmobiliarios, precios, ubicaciones y características",
        parameters: {
          type: "object",
          properties: {
            query: { type: "string", description: "La pregunta o tema a buscar en la base de conocimiento" },
          },
          required: ["query"],
        },
      },
    },
  ];
}

async function callOpenRouter(messages: any[], systemPrompt: string) {
  const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL ?? "openai/gpt-4o-mini",
      messages: [{ role: "system", content: systemPrompt }, ...messages],
      tools: buildTools(),
      response_format: { type: "json_schema", json_schema: responseSchema },
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`[Agent] OpenRouter error ${response.status}: ${error}`);
  }

  return response.json();
}

async function runWithTools(messages: any[], systemPrompt: string): Promise<string[]> {
  const loop = [...messages];

  for (let i = 0; i < 5; i++) {
    const data = await callOpenRouter(loop, systemPrompt);
    const choice = data.choices?.[0];

    if (choice?.finish_reason === "tool_calls") {
      const assistantMsg = choice.message;
      loop.push(assistantMsg);

      for (const toolCall of assistantMsg.tool_calls) {
        const toolName = toolCall.function.name;
        const args = JSON.parse(toolCall.function.arguments);

        let result: any;
        if (toolName === "select_user_data") {
          console.log(`[Tool] select_user_data → session_id: ${args.session_id}`);
          result = await selectUserData.execute!(args, {} as any);
        } else if (toolName === "upsert_user_data") {
          const campos = Object.keys(args).filter(k => k !== "session_id" && args[k] != null);
          console.log(`[Tool] upsert_user_data → session_id: ${args.session_id}, campos: [${campos.join(", ")}]`);
          result = await upsertUserData.execute!(args, {} as any);
        } else if (toolName === "search_knowledge_base") {
          console.log(`[Tool] search_knowledge_base → query: "${args.query}"`);
          result = await searchKnowledgeBase.execute!(args, {} as any);
        } else if (toolName === "transfer_lead") {
          console.log(`[Tool] transfer_lead → session_id: ${args.session_id}, priority: ${args.priority}, price: ${args.price}`);
          result = await transferLead.execute!(args, {} as any);
        } else {
          console.log(`[Tool] Unknown tool: ${toolName}`);
          result = { error: `Unknown tool: ${toolName}` };
        }

        loop.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      continue;
    }

    return JSON.parse(choice.message.content).messages;
  }

  throw new Error("[Agent] Se agotaron los pasos maximos");
}

export async function runAgent(entityId: string, messages: string[]): Promise<string[]> {
  console.log(`[Agent] Iniciando para: ${entityId}`);

  const history = await getChatHistory(entityId);
  console.log(`[Agent] Historial: ${history.length} mensajes previos`);

  const userRow = await getUserData(entityId);
  const userData = userRow ?? { status: null, person_name: null, project_name: null };
  const systemPrompt = buildSystemPrompt({ session_id: entityId, ...userData });

  const userMessage = messages.join("\n");

  const parts = await runWithTools(
    [...(history as any[]), { role: "user", content: userMessage }],
    systemPrompt
  );

  await saveChatHistory(entityId, "user", userMessage);
  await saveChatHistory(entityId, "assistant", parts.join(" "));

  console.log(`[Agent] ${parts.length} mensajes generados`);
  parts.forEach((p, i) => console.log(`[Agent] Mensaje ${i + 1} (${p.length} chars): "${p}"`));

  return parts;
}
