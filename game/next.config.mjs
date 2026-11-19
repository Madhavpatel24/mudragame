import path from "node:path"
import { fileURLToPath } from "node:url"

const here = path.dirname(fileURLToPath(import.meta.url))

/** @type {import('next').NextConfig} */
const nextConfig = {
  // The app compiles code that lives next to it: ../switcher and ../asamyukta.
  experimental: { externalDir: true },
  images: { unoptimized: true },
  webpack(config) {
    // Files in ../asamyukta import this package, but it is installed here.
    config.resolve.alias["@mediapipe/tasks-vision"] = path.join(here, "node_modules/@mediapipe/tasks-vision")
    return config
  },
}

export default nextConfig
