// Kommo: API client for Kommo CRM integration
import { notifier } from "../notifications/index";

const BASE = `https://${process.env.KOMMO_SUBDOMAIN}.kommo.com/api`;
const TOKEN = () => process.env.KOMMO_TOKEN!;

export const KOMMO_MESSAGE_MAX_CHARS = 256;

export function splitForKommo(
	text: string,
	max = KOMMO_MESSAGE_MAX_CHARS,
): string[] {
	const trimmed = text.trim();
	if (!trimmed) return [];
	if (trimmed.length <= max) return [trimmed];

	const chunks: string[] = [];
	let rest = trimmed;
	const minBoundary = Math.floor(max / 2);

	while (rest.length > max) {
		const window = rest.slice(0, max);

		let cut = Math.max(
			window.lastIndexOf(". "),
			window.lastIndexOf("! "),
			window.lastIndexOf("? "),
			window.lastIndexOf("\n"),
		);
		if (cut >= minBoundary) {
			cut = cut + 1;
		} else {
			cut = window.lastIndexOf(" ");
			if (cut < minBoundary) cut = max;
		}

		chunks.push(rest.slice(0, cut).trim());
		rest = rest.slice(cut).trim();
	}
	if (rest) chunks.push(rest);
	return chunks;
}

async function request(
	fnName: string,
	url: string,
	options: RequestInit,
): Promise<Response> {
	const res = await fetch(url, {
		...options,
		headers: {
			Authorization: `Bearer ${TOKEN()}`,
			"Content-Type": "application/json",
			...options.headers,
		},
	});
	if (res.status >= 400) {
		throw new Error(
			`[Kommo] Error ${res.status} en ${fnName}: ${await res.text()}`,
		);
	}
	return res;
}

export type KommoLead = {
	id: number;
	status_id: number;
	pipeline_id: number;
	[key: string]: unknown;
};

export async function getLeadData(entityId: string): Promise<KommoLead> {
	const res = await request(
		"getLeadData",
		`${BASE}/v4/leads/${entityId}?with=source`,
		{ method: "GET" },
	);
	return res.json();
}

export function parseAllowedStatusIds(raw: string | undefined): number[] {
	return (raw ?? "94318692")
		.split(",")
		.map((s) => s.trim())
		.filter((s) => s.length > 0)
		.map((s) => Number(s))
		.filter((n) => Number.isFinite(n));
}

export type StageCheckResult =
	| { allowed: true; lead: KommoLead; error?: undefined }
	| { allowed: false; lead: KommoLead; error?: undefined }
	| { allowed: true; lead: null; error: unknown };

export async function checkLeadStageAllowed(
	entityId: string,
): Promise<StageCheckResult> {
	const allowed = parseAllowedStatusIds(process.env.KOMMO_ALLOWED_STATUS_IDS);
	try {
		const lead = await getLeadData(entityId);
		return { allowed: allowed.includes(lead.status_id), lead };
	} catch (err) {
		return { allowed: true, lead: null, error: err };
	}
}

export async function setResponseField(
	entityId: string,
	text: string,
): Promise<void> {
	await notifier.notify({ level: 'info', fn: 'kommo/setResponseField', entityId, message: `Guardando respuesta en campo del lead` });
	await request("setResponseField", `${BASE}/v4/leads/${entityId}`, {
		method: "PATCH",
		body: JSON.stringify({
			custom_fields_values: [
				{
					field_id: Number(process.env.RESPUESTA_FIELD_ID),
					values: [{ value: text }],
				},
			],
		}),
	});
}

export async function launchSalesbot(entityId: string): Promise<void> {
	await notifier.notify({ level: 'info', fn: 'kommo/launchSalesbot', entityId, message: `Lanzando salesbot bot_id: ${process.env.TEXT_BOT_ID}` });
	await request("launchSalesbot", `${BASE}/v2/salesbot/run`, {
		method: "POST",
		body: JSON.stringify([
			{
				bot_id: Number(process.env.TEXT_BOT_ID),
				entity_id: Number(entityId),
				entity_type: "leads",
			},
		]),
	});
	await notifier.notify({ level: 'info', fn: 'kommo/launchSalesbot', entityId, message: `Salesbot lanzado` });
}

export async function moveLeadToAppointmentStage(
	leadId: string,
	priority: "alta" | "baja" = "baja",
): Promise<void> {
	const statusId = priority === "alta" ? 94318696 : 103161339;
	await notifier.notify({ level: 'info', fn: 'kommo/moveStage', entityId: leadId, message: `Moviendo a etapa ${priority} (status: ${statusId})` });
	await request("moveLeadToAppointmentStage", `${BASE}/v4/leads/${leadId}`, {
		method: "PATCH",
		body: JSON.stringify({
			pipeline_id: 12207252,
			status_id: statusId,
		}),
	});
	await notifier.notify({ level: 'info', fn: 'kommo/moveStage', entityId: leadId, message: `Lead movido a etapa ${priority}` });
}

export async function updateLeadPrice(
	leadId: string,
	price: number,
): Promise<void> {
	await notifier.notify({ level: 'info', fn: 'kommo/updatePrice', entityId: leadId, message: `Actualizando precio: $${price}` });
	await request("updateLeadPrice", `${BASE}/v4/leads`, {
		method: "PATCH",
		body: JSON.stringify([
			{
				id: Number(leadId),
				price,
			},
		]),
	});
	await notifier.notify({ level: 'info', fn: 'kommo/updatePrice', entityId: leadId, message: `Precio actualizado` });
}

export async function addLeadNote(
	leadId: string,
	text: string,
): Promise<void> {
	await notifier.notify({ level: 'info', fn: 'kommo/addNote', entityId: leadId, message: `Agregando nota` });
	await request("addLeadNote", `${BASE}/v4/leads/notes`, {
		method: "POST",
		body: JSON.stringify([
			{
				note_type: "common",
				entity_id: Number(leadId),
				params: { text },
			},
		]),
	});
	await notifier.notify({ level: 'info', fn: 'kommo/addNote', entityId: leadId, message: `Nota agregada` });
}

export async function sendMessages(
	entityId: string,
	messages: string[],
): Promise<number> {
	const delay = parseInt(process.env.DELAY_BETWEEN_MESSAGES ?? "1500");
	const chunks = messages.flatMap((m) => splitForKommo(m));
	let sent = 0;

	for (let i = 0; i < chunks.length; i++) {
		const chunk = chunks[i];
		try {
			await setResponseField(entityId, chunk);
			await launchSalesbot(entityId);
			sent++;
			await notifier.notify({ level: 'info', fn: 'kommo/sendMessages', entityId, message: `Chunk ${i + 1}/${chunks.length} enviado: "${chunk.slice(0, 60)}"` });
		} catch (error) {
			await notifier.notify({
				level: 'error',
				fn: 'kommo/sendMessages',
				entityId,
				message: `Falló chunk ${i + 1}/${chunks.length}: ${error instanceof Error ? error.message : String(error)}`,
				error,
				extra: { chunkIndex: i, totalChunks: chunks.length, chunkLength: chunk.length, preview: chunk.slice(0, 80) },
			});
		}

		if (i < chunks.length - 1) {
			await new Promise((r) => setTimeout(r, delay));
		}
	}
	return sent;
}
