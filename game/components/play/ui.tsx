"use client"

import type { ButtonHTMLAttributes, ReactNode } from "react"
import { Star } from "lucide-react"
import type { Mudra } from "@/lib/content"

export const cn = (...c: (string | false | null | undefined)[]) => c.filter(Boolean).join(" ")

export function Stars({ n, of = 3, className }: { n: number; of?: number; className?: string }) {
  return (
    <span className={cn("inline-flex gap-0.5", className)} role="img" aria-label={`${n} of ${of} stars`}>
      {Array.from({ length: of }, (_, i) => (
        <Star key={i} className={cn("h-4 w-4", i < n ? "fill-primary text-primary" : "text-border")} aria-hidden />
      ))}
    </span>
  )
}

export function Meter({ value, label, tone = "accent" }: { value: number; label?: string; tone?: "accent" | "green" }) {
  const pct = Math.round(Math.min(1, Math.max(0, value)) * 100)
  return (
    <div>
      {label && (
        <div className="mb-1 flex justify-between text-xs text-muted-foreground">
          <span>{label}</span>
          <span>{pct}%</span>
        </div>
      )}
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={cn("h-full rounded-full transition-[width] duration-150", tone === "green" ? "bg-emerald-600" : "bg-accent")} style={{ width: `${pct}%` }} />
      </div>
    </div>
  )
}

export function Button({ variant = "primary", className, ...rest }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "ghost" }) {
  return (
    <button
      type="button"
      {...rest}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full px-6 py-3 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50",
        variant === "primary" ? "bg-accent text-accent-foreground hover:bg-accent/90" : "border border-border bg-background/60 hover:border-accent/60 hover:text-accent",
        className
      )}
    />
  )
}

/** The black-background photo of a mudra. */
export function MudraPhoto({ mudra, className }: { mudra: Mudra; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-2xl border border-border bg-[#0a0807]", className)}>
      {mudra.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={mudra.photo} alt={`The ${mudra.name} mudra`} className="h-full w-full object-contain" />
      ) : (
        <div className="grid h-full w-full place-items-center text-sm text-[#e8d4b8]">No photo</div>
      )}
    </div>
  )
}

export function PageHeader({ eyebrow, title, children }: { eyebrow: string; title: string; children?: ReactNode }) {
  return (
    <header className="mb-8">
      <p className="eyebrow mb-2">{eyebrow}</p>
      <h1 className="font-serif text-4xl md:text-5xl">{title}</h1>
      {children && <div className="mt-3 max-w-2xl text-muted-foreground">{children}</div>}
    </header>
  )
}
