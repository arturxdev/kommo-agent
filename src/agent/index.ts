import { buildSystemPrompt } from "./prompts";
import { selectUserData, upsertUserData, getUserData, searchKnowledgeBase, transferLead } from "./tools";
import { getChatHistory, saveChatHistory } from "../memory/postgres";
import { notifier } from "../notifications/index";

const responseSchema = {
  name: "agent_response",
  strict: true,
  schema: {
    type: "object",
    properties: {
      messages: {
        type: "array",
        items: { type: "string" },
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

function safeParseJSON(text: string): any | null {
  try {
    return JSON.parse(text);
  } catch {
    // Try extracting JSON from markdown code fences
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) {
      try { return JSON.parse(fenceMatch[1].trim()); } catch {}
    }
    // Try extracting a JSON object from the text
    const objMatch = text.match(/\{[\s\S]*\}/);
    if (objMatch) {
      try { return JSON.parse(objMatch[0]); } catch {}
    }
    return null;
  }
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

async function runWithTools(messages: any[], systemPrompt: string, entityId: string, requestId?: string): Promise<string[]> {
  const loop = [...messages];

  for (let i = 0; i < 5; i++) {
    const data = await callOpenRouter(loop, systemPrompt);
    const choice = data.choices?.[0];

    if (choice?.finish_reason === "tool_calls") {
      const assistantMsg = choice.message;
      loop.push(assistantMsg);

      for (const toolCall of assistantMsg.tool_calls) {
        const toolName = toolCall.function.name;
        let args: any;
        try {
          args = JSON.parse(toolCall.function.arguments);
        } catch (parseErr) {
          await notifier.notify({
            level: 'error',
            fn: `tool/${toolName}`,
            entityId,
            requestId,
            message: `Argumentos inválidos para ${toolName}`,
            error: parseErr,
            extra: { raw: toolCall.function.arguments },
          });
          loop.push({
            role: "tool",
            tool_call_id: toolCall.id,
            content: JSON.stringify({ error: `Invalid tool arguments for ${toolName}` }),
          });
          continue;
        }

        await notifier.notify({
          level: 'info',
          fn: `tool/${toolName}`,
          entityId,
          requestId,
          message: `Llamando ${toolName}`,
          extra: { args },
        });

        let result: any;
        if (toolName === "select_user_data") {
          result = await selectUserData.execute!(args, {} as any);
        } else if (toolName === "upsert_user_data") {
          result = await upsertUserData.execute!(args, {} as any);
        } else if (toolName === "search_knowledge_base") {
          result = await searchKnowledgeBase.execute!(args, {} as any);
        } else if (toolName === "transfer_lead") {
          result = await transferLead.execute!(args, {} as any);
        } else {
          result = { error: `Unknown tool: ${toolName}` };
        }

        await notifier.notify({
          level: 'info',
          fn: `tool/${toolName}`,
          entityId,
          requestId,
          message: `Resultado ${toolName}`,
          extra: { result },
        });

        loop.push({
          role: "tool",
          tool_call_id: toolCall.id,
          content: JSON.stringify(result),
        });
      }

      continue;
    }

    const parsed = safeParseJSON(choice.message.content);
    if (parsed && Array.isArray(parsed.messages) && parsed.messages.length > 0) {
      return parsed.messages;
    }

    await notifier.notify({
      level: 'warning',
      fn: 'agent/retry',
      entityId,
      requestId,
      message: `Respuesta sin messages válido (intento ${i + 1}/5), reintentando...`,
      extra: { content: choice.message.content?.slice(0, 200) },
    });
    continue;
  }

  await notifier.notify({
    level: 'error',
    fn: 'agent/retry',
    entityId,
    requestId,
    message: 'Se agotaron los reintentos, enviando mensaje fallback',
  });
  return ["Lo siento, no pude procesar tu mensaje. ¿Podrías intentarlo de nuevo?"];
}

export async function runAgent(entityId: string, messages: string[], requestId?: string): Promise<string[]> {
  await notifier.notify({ level: 'info', fn: 'agent', entityId, requestId, message: `Iniciando para: ${entityId}` });

  const history = await getChatHistory(entityId);
  await notifier.notify({ level: 'info', fn: 'agent', entityId, requestId, message: `Historial: ${history.length} mensajes previos` });

  const userRow = await getUserData(entityId);
  const userData = userRow ?? { status: null, person_name: null, project_name: null };
  const systemPrompt = buildSystemPrompt({ session_id: entityId, ...userData });

  const userMessage = messages.join("\n");

  const parts = await runWithTools(
    [...(history as any[]), { role: "user", content: userMessage }],
    systemPrompt,
    entityId,
    requestId
  );

  await saveChatHistory(entityId, "user", userMessage);
  await saveChatHistory(entityId, "assistant", parts.join(" "));

  await notifier.notify({ level: 'info', fn: 'agent', entityId, requestId, message: `${parts.length} mensajes generados` });
  for (const [i, p] of parts.entries()) {
    await notifier.notify({ level: 'info', fn: 'agent', entityId, requestId, message: `Mensaje ${i + 1} (${p.length} chars): "${p}"` });
  }

  return parts;
}
