// Death metal clip name generator.
// Uses unique-names-generator with custom adjective + noun dictionaries.
// Example output: "Putrid Descent", "Severed Throne", "Wretched Abyss"

import { uniqueNamesGenerator, type Config } from "unique-names-generator";

const adjectives = [
  "Abyssal", "Accursed", "Ancient", "Apocalyptic", "Ashen",
  "Blasphemous", "Bleeding", "Burning", "Carrion", "Caustic",
  "Chthonic", "Corroded", "Crimson", "Cryptic", "Cursed",
  "Damned", "Decaying", "Decrepit", "Defiled", "Desecrated",
  "Desolate", "Devouring", "Dismembered", "Eldritch", "Entombed",
  "Eternal", "Eviscerated", "Exhumed", "Feral", "Festering",
  "Forsaken", "Gaunt", "Ghastly", "Ghoulish", "Glacial",
  "Godforsaken", "Grotesque", "Hallowed", "Hollow", "Howling",
  "Immolated", "Impaled", "Infernal", "Lacerated", "Languishing",
  "Malevolent", "Malignant", "Mangled", "Morbid", "Moribund",
  "Mortified", "Mutilated", "Necrotic", "Nihilistic", "Obliterated",
  "Obsidian", "Occult", "Odious", "Pestilent", "Profane",
  "Profligate", "Putrescent", "Putrid", "Rancid", "Ravaged",
  "Rotten", "Rotting", "Ruinous", "Sepulchral", "Severed",
  "Shrieking", "Smoldering", "Spectral", "Stygian", "Sundered",
  "Tainted", "Tormented", "Toxic", "Transcendent", "Unhallowed",
  "Unholy", "Venomous", "Vile", "Violent", "Visceral",
  "Void", "Wretched", "Writhing",
];

const nouns = [
  "Abyss", "Agony", "Altar", "Annihilation", "Apocalypse",
  "Apparition", "Ascension", "Atrocity", "Barrow", "Bastion",
  "Blade", "Bloodshed", "Burial", "Carnage", "Carrion",
  "Cataclysm", "Catacomb", "Chasm", "Colossus", "Condemnation",
  "Covenant", "Crypt", "Damnation", "Darkness", "Dawn",
  "Decay", "Decline", "Deluge", "Descent", "Desecration",
  "Devastation", "Dominion", "Eclipse", "Elegy", "Emptiness",
  "Entombment", "Exhumation", "Extinction", "Fallen", "Famine",
  "Flesh", "Gallows", "Genocide", "Glaciers", "Graves",
  "Grief", "Grimoire", "Harvest", "Hatred", "Hellfire",
  "Hollow", "Holocaust", "Hymn", "Incantation", "Inferno",
  "Lament", "Leviathan", "Maelstrom", "Massacre", "Misery",
  "Mortification", "Mutilation", "Nihil", "Oblivion", "Obliteration",
  "Obscurity", "Ossuary", "Perdition", "Pestilence", "Plague",
  "Prophecy", "Purgatory", "Reckoning", "Requiem", "Rite",
  "Ritual", "Ruin", "Sacrifice", "Sanctum", "Sepulcher",
  "Shroud", "Siege", "Skull", "Slaughter", "Sorrow",
  "Specter", "Suffering", "Tempest", "Throne", "Tomb",
  "Torment", "Twilight", "Veil", "Vengeance", "Void",
  "Wrath",
];

const config: Config = {
  dictionaries: [adjectives, nouns],
  separator: " ",
  style: "capital",
};

export function generateDeathMetalName(): string {
  return uniqueNamesGenerator(config);
}
