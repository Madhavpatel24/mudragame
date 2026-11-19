import type { Metadata } from "next"
import type { ReactNode } from "react"
import { Playfair_Display, Poppins } from "next/font/google"
import "./globals.css"
import { ModeProvider } from "@/components/mode-provider"

export const metadata: Metadata = {
  title: "NrityaNetra: Mudra Practice",
  description: "Practise single-hand and two-hand mudras with your camera.",
}

const playfair = Playfair_Display({ subsets: ["latin"], variable: "--font-playfair" })
const poppins = Poppins({ subsets: ["latin"], weight: ["300", "400", "500", "600", "700"], variable: "--font-poppins" })

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={`${playfair.variable} ${poppins.variable}`}>
      <body className="paper-grain min-h-screen bg-background font-sans text-foreground antialiased">
        <ModeProvider>{children}</ModeProvider>
      </body>
    </html>
  )
}
