// Kommo: API client for Kommo CRM integration
import { notifier } from "../notifications/index";

const BASE = `https://${process.env.KOMMO_SUBDOMAIN}.kommo.com/api`;
const TOKEN = () => process.env.KOMMO_TOKEN!;

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

export async function getLeadData(entityId: string): Promise<object> {
	const res = await request(
		"getLeadData",
		`${BASE}/v4/leads/${entityId}?with=source`,
		{ method: "GET" },
	);
	return res.json();
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
): Promise<void> {
	const delay = parseInt(process.env.DELAY_BETWEEN_MESSAGES ?? "1500");

	for (const message of messages) {
		await setResponseField(entityId, message);
		await launchSalesbot(entityId);
		await notifier.notify({ level: 'info', fn: 'kommo/sendMessages', entityId, message: `Mensaje enviado: "${message.slice(0, 60)}"` });

		if (messages.indexOf(message) < messages.length - 1) {
			await new Promise((r) => setTimeout(r, delay));
		}
	}
}
