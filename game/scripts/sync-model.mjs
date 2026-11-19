// Copies the Asamyukta model files into this app's public folder, so asamyukta/ stays the one source.
import { cpSync, existsSync, mkdirSync } from "node:fs"
import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))
const from = path.join(here, "../../asamyukta/frontend/public/model")
const to = path.join(here, "../public/model")

if (!existsSync(from)) {
  console.error(`Model files not found at ${from}`)
  process.exit(1)
}
mkdirSync(to, { recursive: true })
cpSync(from, to, { recursive: true })
console.log(`Copied model files to ${to}`)
