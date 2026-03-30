import 'dotenv/config'
import { Pool } from 'pg'

const arg = process.argv.find(a => a.startsWith('--contact_id='))
const contactId = arg?.split('=')[1]

if (!contactId) {
  console.error('❌ Debes proporcionar --contact_id. Ejemplo: npm run clear:history -- --contact_id=47388380')
  process.exit(1)
}

const pool = new Pool({ connectionString: process.env.POSTGRES_URL })

async function main() {
  console.log(`🔍 Buscando historial para contact_id: ${contactId}`)

  const countResult = await pool.query<{ count: string }>(
    'SELECT COUNT(*) FROM chat_history WHERE session_id = $1',
    [contactId]
  )
  const count = parseInt(countResult.rows[0].count, 10)
  console.log(`📊 Registros encontrados: ${count}`)

  if (count === 0) {
    console.log(`⚠️  No se encontró historial para contact_id: ${contactId}`)
    return
  }

  console.log('🗑️  Eliminando...')
  await pool.query('DELETE FROM chat_history WHERE session_id = $1', [contactId])
  console.log('✅ Historial eliminado correctamente')
}

main()
  .catch((err) => {
    console.error('❌ Error al limpiar historial:', err)
    process.exit(1)
  })
  .finally(() => pool.end())
