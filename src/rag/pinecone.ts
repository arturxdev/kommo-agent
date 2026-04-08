// RAG: vector search and retrieval using Pinecone
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";
import { notifier } from "../notifications/index";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

export async function searchKnowledge(
	query: string,
	topK = 4,
): Promise<string> {
	await notifier.notify({ level: 'info', fn: 'rag', message: `Query: "${query.slice(0, 50)}"` });

	try {
		const embeddingResponse = await openai.embeddings.create({
			model: "text-embedding-3-small",
			input: query,
			dimensions: 512,
		});
		const vector = embeddingResponse.data[0].embedding;

		const index = pinecone.index(process.env.PINECONE_INDEX!);
		const results = await index.namespace(process.env.PINECONE_NAMESPACE!).query({
			vector,
			topK,
			includeMetadata: true,
		});
		await notifier.notify({
			level: 'info',
			fn: 'rag',
			message: `Scores: ${results.matches.map(m => `${m.score?.toFixed(2)}`).join(', ')}`,
		});

		const matches = results.matches.filter((m) => (m.score ?? 0) > 0.45);
		await notifier.notify({ level: 'info', fn: 'rag', message: `Resultados encontrados: ${matches.length}` });

		return matches.map((m) => m.metadata?.text as string).join("\n\n");
	} catch (err) {
		await notifier.notify({ level: 'error', fn: 'rag', message: `Error en búsqueda: ${(err as Error).message}`, error: err });
		return "";
	}
}
