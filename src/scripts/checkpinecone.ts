import "dotenv/config";
import { Pinecone } from "@pinecone-database/pinecone";

async function main() {
	const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! });
	const index = pinecone.index(process.env.PINECONE_INDEX!);

	// 1. Ver stats del índice completo
	const stats = await index.describeIndexStats();
	console.log("📊 Stats del índice:");
	console.log(JSON.stringify(stats, null, 2));

	// 2. Ver stats por namespace específico
	const nsStats = await index
		.namespace(process.env.PINECONE_NAMESPACE!)
		.describeIndexStats();
	console.log(`\n📁 Namespace "${process.env.PINECONE_NAMESPACE}":`);
	console.log(JSON.stringify(nsStats, null, 2));
}

main().catch(console.error);
