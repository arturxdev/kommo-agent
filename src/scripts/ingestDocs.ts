import 'dotenv/config'
import * as fs from 'fs'
import * as path from 'path'
import OpenAI from 'openai'
import { Pinecone } from '@pinecone-database/pinecone'
import { v4 as uuidv4 } from 'uuid'

const arg = process.argv.find(a => a.startsWith('--file='))
const filePath = arg?.split('=')[1]

if (!filePath) {
  console.error('❌ Debes proporcionar --file. Ejemplo: npm run ingest:docs -- --file=./docs/manual.txt')
  process.exit(1)
}

if (!fs.existsSync(filePath)) {
  console.error(`❌ El archivo no existe: ${filePath}`)
  process.exit(1)
}

if (path.extname(filePath).toLowerCase() !== '.txt') {
  console.error(`❌ Solo se aceptan archivos .txt`)
  process.exit(1)
}

function splitIntoChunks(text: string, size = 500, overlap = 50): string[] {
  const chunks: string[] = []
  let start = 0
  while (start < text.length) {
    chunks.push(text.slice(start, start + size))
    start += size - overlap
  }
  return chunks
}

async function main() {
  console.log(`📄 Leyendo archivo: ${filePath}`)

  const text = fs.readFileSync(filePath!, 'utf-8')
  console.log(`✂️  Dividiendo en chunks...`)

  const chunks = splitIntoChunks(text)
  console.log(`   ${chunks.length} chunks generados`)

  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })
  const pinecone = new Pinecone({ apiKey: process.env.PINECONE_API_KEY! })
  const index = pinecone.index(process.env.PINECONE_INDEX!).namespace(process.env.PINECONE_NAMESPACE ?? 'default')

  const source = path.basename(filePath!)
  const batchSize = 100
  const vectors: Array<{ id: string; values: number[]; metadata: Record<string, string | number> }> = []

  console.log(`🔢 Generando embeddings en batches de ${batchSize}...`)

  for (let i = 0; i < chunks.length; i += batchSize) {
    const batch = chunks.slice(i, i + batchSize)
    const end = Math.min(i + batchSize, chunks.length)
    process.stdout.write(`   [${end}/${chunks.length}] `)

    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: batch,
      dimensions: 512,
    })

    for (let j = 0; j < batch.length; j++) {
      vectors.push({
        id: uuidv4(),
        values: response.data[j].embedding,
        metadata: {
          text: batch[j],
          source,
          chunk_index: i + j,
        },
      })
    }
    console.log('OK')
  }

  console.log(`📤 Subiendo ${vectors.length} vectores a Pinecone...`)

  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize)
    const end = Math.min(i + batchSize, vectors.length)
    process.stdout.write(`   [${end}/${vectors.length}] `)
    await index.upsert({ records: batch })
    console.log('OK')
  }

  console.log(`✅ Ingestión completada: ${vectors.length} vectores de "${source}"`)
}

main().catch((err) => {
  console.error('❌ Error durante la ingestión:', err)
  process.exit(1)
})
