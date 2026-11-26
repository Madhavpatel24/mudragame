export type LookAlike = { id: string; share: number }

export type Mudra = {
  /** The label the model uses, for example "Mayura". */
  id: string
  name: string
  /** One line for the learner. */
  meaning: string
  /** Things this mudra can stand for, phrased for "show me ..." prompts. */
  uses: string[]
  photo: string | null
  /** true: the picture has a white background (a drawing), so its frame is white too. */
  light?: boolean
  /** Mudras the model tends to mix this one up with, from sample photos. */
  lookalikes: LookAlike[]
  /** 0 = easiest to get right, 1 = hardest. */
  difficulty: number
  /** false: the second guess also counts, because the model is weaker on this mudra. */
  strict: boolean
}

export type ModeId = "asamyukta" | "samyukta"
