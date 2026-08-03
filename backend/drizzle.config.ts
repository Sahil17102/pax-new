import * as dotenv from 'dotenv'
import { defineConfig } from 'drizzle-kit'
import path from 'path'

const env = process.env.NODE_ENV || 'development'

// Always load from inside backend/ (works locally + VPS)
const envFile = path.resolve(__dirname, `.env.${env}`)

dotenv.config({ path: envFile })

if (!process.env.DATABASE_URL) {
  throw new Error(`DATABASE_URL is not defined in ${envFile}`)
}

const databaseUrl = new URL(process.env.DATABASE_URL)
if (env === 'production' && !databaseUrl.searchParams.has('sslmode')) {
  databaseUrl.searchParams.set('sslmode', 'require')
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/schema.ts',
  out: './src/drizzle/migrations',
  dbCredentials: {
    url: databaseUrl.toString(),
  },
})
