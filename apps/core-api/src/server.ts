import 'dotenv/config'

import { createApp } from './app.js'
import {
  createSupabaseJwtVerifier,
  readSupabaseJwtConfig,
} from './auth/supabase-jwt.js'

const port = Number(process.env.PORT ?? 3001)
const jwtVerifier = createSupabaseJwtVerifier(readSupabaseJwtConfig())
const app = createApp({ jwtVerifier })

app.listen(port, () => {
  console.log(`Core API listening on http://localhost:${port}`)
})
