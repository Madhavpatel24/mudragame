// What each mudra means, in short.
//
// Samyukta: the meanings are the ones in Aparna's teacher reference
//   (vendor/samyukta-hasta-game/outputs/teacher/teacher_reference.json), phrased here for "show me ..." prompts.
// Asamyukta: written from the standard descriptions of the single-hand gestures in the classical texts.
//   DRAFT: a dance teacher should check these before release.

export type Meaning = { name: string; meaning: string; uses: string[] }

export const ASAMYUKTA_MEANINGS: Record<string, Meaning> = {
  Alapadma: { name: "Alapadma", meaning: "A fully bloomed lotus", uses: ["a fully bloomed lotus", "a full moon"] },
  Arala: { name: "Arala", meaning: "Bent: drinking nectar or poison, a gentle breeze", uses: ["drinking nectar", "a gentle breeze"] },
  Ardhachandra: { name: "Ardhachandra", meaning: "The half-moon", uses: ["the half-moon", "a prayer offered with open hands"] },
  Ardhapathaka: { name: "Ardhapathaka", meaning: "Half flag: a leaf, a knife, a tower", uses: ["a leaf", "a knife", "a tower"] },
  Chandrakala: { name: "Chandrakala", meaning: "The crescent moon", uses: ["the crescent moon"] },
  Hamsasya: { name: "Hamsasya", meaning: "Swan face: a thin thread, a pearl, a delicate touch", uses: ["a thin thread", "a pearl"] },
  Kapittha: { name: "Kapittha", meaning: "Wood-apple: holding cymbals, the goddess Lakshmi", uses: ["holding cymbals", "the goddess Lakshmi"] },
  Kartarimukha: { name: "Kartarimukha", meaning: "Scissors face: separation, lightning", uses: ["separation", "lightning"] },
  Mayura: { name: "Mayura", meaning: "A peacock", uses: ["a peacock"] },
  Mukula: { name: "Mukula", meaning: "A bud", uses: ["a bud", "a lotus bud"] },
  Mushti: { name: "Mushti", meaning: "A fist: holding firmly", uses: ["holding something firmly", "a fist"] },
  Pathaka: { name: "Pathaka", meaning: "A flag: clouds, a river, a forest", uses: ["a flag", "a river", "a forest"] },
  Samdamsha: { name: "Samdamsha", meaning: "Pincers: tongs, biting", uses: ["pincers"] },
  Sarpashirsha: { name: "Sarpashirsha", meaning: "A snake's head", uses: ["a snake's head"] },
  Shikhara: { name: "Shikhara", meaning: "A peak: a pillar, a bow", uses: ["a mountain peak", "a pillar"] },
  Shukatunda: { name: "Shukatunda", meaning: "A parrot's beak: shooting an arrow", uses: ["a parrot's beak", "shooting an arrow"] },
  Simhamukha: { name: "Simhamukha", meaning: "A lion's face", uses: ["a lion's face"] },
  Suchi: { name: "Suchi", meaning: "A needle: the number one, pointing", uses: ["a needle", "the number one"] },
  Tamrachuda: { name: "Tamrachuda", meaning: "A rooster", uses: ["a rooster"] },
  Tripathaka: { name: "Tripathaka", meaning: "Three-part flag: a tree, a crown", uses: ["a tree", "a crown"] },
  Trishula: { name: "Trishula", meaning: "A trident, the weapon of Shiva", uses: ["a trident"] },
}

export const SAMYUKTA_MEANINGS: Record<string, Meaning> = {
  Anjali: { name: "Anjali", meaning: "Salutation", uses: ["a salutation"] },
  Berunda: { name: "Berunda", meaning: "Love birds", uses: ["a pair of love birds"] },
  Chakra: { name: "Chakra", meaning: "A wheel", uses: ["a wheel"] },
  Garuda: { name: "Garuda", meaning: "The mythological eagle", uses: ["the eagle Garuda"] },
  Kapotham: { name: "Kapotham", meaning: "A casket, or a pigeon", uses: ["a pigeon"] },
  Karkatta: { name: "Karkatta", meaning: "A crab", uses: ["a crab"] },
  Kartariswastika: { name: "Kartariswastika", meaning: "Scissors, or crossed arrow shafts", uses: ["scissors", "crossed arrow shafts"] },
  Katakavardhana: { name: "Katakavardhana", meaning: "A pair of bracelets, or a blessing", uses: ["a pair of bracelets", "a blessing"] },
  Khatva: { name: "Khatva", meaning: "A bed", uses: ["a bed"] },
  Kilaka: { name: "Kilaka", meaning: "An emotional bond", uses: ["an emotional bond"] },
  Kurma: { name: "Kurma", meaning: "A tortoise", uses: ["a tortoise"] },
  Matsya: { name: "Matsya", meaning: "A fish", uses: ["a fish"] },
  Nagabandha: { name: "Nagabandha", meaning: "A coiled serpent", uses: ["a coiled serpent"] },
  Pasha: { name: "Pasha", meaning: "A rope", uses: ["a rope"] },
  Pushpaputa: { name: "Pushpaputa", meaning: "Holding flowers, a flower basket", uses: ["holding flowers", "a flower basket"] },
  Sakata: { name: "Sakata", meaning: "Demons", uses: ["demons"] },
  Samputa: { name: "Samputa", meaning: "Hiding something, a container", uses: ["hiding something", "a container"] },
  Shanka: { name: "Shanka", meaning: "A conch shell", uses: ["a conch shell"] },
  Shivalinga: { name: "Shivalinga", meaning: "Lord Shiva", uses: ["Lord Shiva"] },
  Swastikam: { name: "Swastikam", meaning: "A cross", uses: ["a cross"] },
  Varaha: { name: "Varaha", meaning: "A wild pig", uses: ["a wild pig"] },
}
