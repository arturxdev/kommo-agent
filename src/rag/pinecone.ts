// RAG: vector search and retrieval using Pinecone
import OpenAI from "openai";
import { Pinecone } from "@pinecone-database/pinecone";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });

export async function searchKnowledge(
	query: string,
	topK = 4,
): Promise<string> {
	console.log(`[RAG] Query: "${query.slice(0, 50)}"`);

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
	console.log(
		"[RAG] Scores:",
		results.matches.map((m) => ({
			score: m.score,
			text: (m.metadata?.text as string)?.slice(0, 50),
		})),
	);

	const matches = results.matches.filter((m) => (m.score ?? 0) > 0.45);
	console.log(`[RAG] Resultados encontrados: ${matches.length}`);

	return matches.map((m) => m.metadata?.text as string).join("\n\n");
}
