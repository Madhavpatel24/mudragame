import { MUDRAS as GUIDE } from "@asamyukta/mudra/guide"
import asamyuktaGenerated from "./generated/asamyukta.json"
import samyuktaGenerated from "./generated/samyukta.json"
import samyuktaTeacher from "./generated/samyukta-teacher.json"
import { ASAMYUKTA_MEANINGS, SAMYUKTA_MEANINGS, type Meaning } from "./meanings"
import type { LookAlike, ModeId, Mudra } from "./types"

export type { Mudra, ModeId, LookAlike } from "./types"

/** The photographs are from the Bharatanatyam Mudra Dataset. Its licence asks for this credit. */
export const PHOTO_CREDIT = {
  text: "Mudra photographs: Bharatanatyam Mudra Dataset by Jisha Raj R and colleagues (College of Engineering, Attingal), licensed CC BY-SA 4.0. Backgrounds were removed.",
  href: "https://github.com/Madhavpatel24/mudragame/blob/main/NOTICE.md",
}

type Generated = Record<string, { sampleAccuracy: number; meanProb: number; lookalikes: LookAlike[]; photo?: string }>

const clamp = (x: number) => Math.min(1, Math.max(0, x))

function difficultyOf(recognisability: number, lookalikes: LookAlike[]): number {
  const pressure = clamp(lookalikes.reduce((s, l) => s + l.share, 0))
  return clamp(0.7 * (1 - recognisability) + 0.3 * pressure)
}

function build(
  gen: Generated,
  meanings: Record<string, Meaning>,
  extra: (id: string, g: Generated[string]) => { recognisability: number; strict: boolean }
): Mudra[] {
  const out: Mudra[] = []
  for (const [id, m] of Object.entries(meanings)) {
    const g = gen[id]
    if (!g || !g.photo) continue // no photo in the dataset: left out of the game
    const { recognisability, strict } = extra(id, g)
    out.push({
      id,
      name: m.name,
      meaning: m.meaning,
      uses: m.uses,
      photo: g.photo,
      lookalikes: g.lookalikes,
      difficulty: difficultyOf(recognisability, g.lookalikes),
      strict,
    })
  }
  return out.sort((a, b) => a.difficulty - b.difficulty)
}

const guideById = new Map(GUIDE.map((g) => [g.name, g]))

const asamyukta = build(asamyuktaGenerated as Generated, ASAMYUKTA_MEANINGS, (id, g) => {
  const guide = guideById.get(id)
  // the independent test accuracy is the honest measure; fall back to the sample when there is none
  const measured = guide?.accuracy != null ? guide.accuracy / 100 : 0.6 * g.sampleAccuracy + 0.4 * g.meanProb
  return { recognisability: measured, strict: guide?.tier === "reliable" }
})

const teacher = samyuktaTeacher as Record<string, { teacherAgrees: boolean; teacherPredicted: string }>

// Where the model got a mudra wrong on the teacher video, that is independent evidence of a look-alike.
const TEACHER_LOOKALIKE_SHARE = 0.3
const withTeacherEvidence = (gen: Generated): Generated => {
  const out: Generated = JSON.parse(JSON.stringify(gen))
  for (const [id, t] of Object.entries(teacher)) {
    const g = out[id]
    if (!g || t.teacherAgrees || t.teacherPredicted === id || !(t.teacherPredicted in out)) continue
    if (!g.lookalikes.some((l) => l.id === t.teacherPredicted)) g.lookalikes = [{ id: t.teacherPredicted, share: TEACHER_LOOKALIKE_SHARE }, ...g.lookalikes].slice(0, 4)
  }
  return out
}

const samyukta = build(withTeacherEvidence(samyuktaGenerated as Generated), SAMYUKTA_MEANINGS, (id, g) => {
  const agrees = teacher[id]?.teacherAgrees ?? false
  // the teacher video is the only independent check on this model: a miss there makes a mudra harder and more forgiving
  return { recognisability: 0.6 * g.sampleAccuracy + 0.4 * g.meanProb - (agrees ? 0 : 0.15), strict: g.sampleAccuracy >= 0.9 && agrees }
})

const CONTENT: Record<ModeId, Mudra[]> = { asamyukta, samyukta }

/** The mudras that can be played in a mode, easiest first. */
export function getMudras(mode: ModeId): Mudra[] {
  return CONTENT[mode]
}

export function getMudra(mode: ModeId, id: string): Mudra | undefined {
  return CONTENT[mode].find((m) => m.id === id)
}

/** Prompts for "show me ..." that point to exactly one mudra in the mode. */
export function charadesPrompts(mode: ModeId): { prompt: string; id: string }[] {
  const counts = new Map<string, number>()
  for (const m of CONTENT[mode]) for (const u of m.uses) counts.set(u, (counts.get(u) ?? 0) + 1)
  return CONTENT[mode].flatMap((m) => m.uses.filter((u) => counts.get(u) === 1).map((u) => ({ prompt: u, id: m.id })))
}
