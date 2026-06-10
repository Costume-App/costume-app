// A curated, in-repo catalog of common stage productions and their standard
// character roles. Used to offer a one-click "add all roles" when a new
// production's title matches a known play. Extend by adding entries — keep `id`
// a stable kebab-case slug and `roles` in a sensible billing order.

export interface PlayCatalogEntry {
  id: string;
  title: string;
  aliases: string[];
  roles: string[];
}

// Normalize a title for matching: lowercase, strip surrounding whitespace, drop a
// single leading article, remove punctuation, and collapse internal whitespace.
export function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .trim()
    .replace(/^(the|a|an)\s+/, "")
    .replace(/[^a-z0-9\s]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export const PLAY_CATALOG: PlayCatalogEntry[] = [
  {
    id: "hamlet",
    title: "Hamlet",
    aliases: [],
    roles: [
      "Hamlet", "Claudius", "Gertrude", "Polonius", "Ophelia", "Laertes",
      "Horatio", "Rosencrantz", "Guildenstern", "Ghost of King Hamlet",
      "Fortinbras", "Gravedigger", "Osric", "Marcellus", "Bernardo",
    ],
  },
  {
    id: "romeo-and-juliet",
    title: "Romeo and Juliet",
    aliases: ["romeo juliet"],
    roles: [
      "Romeo", "Juliet", "Mercutio", "Tybalt", "Benvolio", "Nurse",
      "Friar Laurence", "Lord Capulet", "Lady Capulet", "Lord Montague",
      "Lady Montague", "Paris", "Prince Escalus", "Balthasar",
    ],
  },
  {
    id: "a-midsummer-nights-dream",
    title: "A Midsummer Night's Dream",
    aliases: ["midsummer nights dream", "midsummer"],
    roles: [
      "Oberon", "Titania", "Puck", "Hermia", "Lysander", "Helena", "Demetrius",
      "Theseus", "Hippolyta", "Egeus", "Nick Bottom", "Peter Quince",
      "Francis Flute", "Snug", "Tom Snout", "Robin Starveling",
    ],
  },
  {
    id: "macbeth",
    title: "Macbeth",
    aliases: [],
    roles: [
      "Macbeth", "Lady Macbeth", "Banquo", "Macduff", "Lady Macduff",
      "King Duncan", "Malcolm", "Donalbain", "Fleance", "Three Witches",
      "Hecate", "Ross", "Lennox",
    ],
  },
  {
    id: "nutcracker",
    title: "The Nutcracker",
    aliases: ["nutcracker ballet"],
    roles: [
      "Clara", "The Nutcracker Prince", "Drosselmeyer", "The Mouse King",
      "Sugar Plum Fairy", "Cavalier", "Snow Queen", "Snow King",
      "Mother Ginger", "Dewdrop", "Fritz",
    ],
  },
  {
    id: "swan-lake",
    title: "Swan Lake",
    aliases: [],
    roles: [
      "Odette", "Odile", "Prince Siegfried", "Baron von Rothbart",
      "The Queen Mother", "Benno", "Wolfgang",
    ],
  },
  {
    id: "the-wizard-of-oz",
    title: "The Wizard of Oz",
    aliases: ["wizard of oz"],
    roles: [
      "Dorothy", "Scarecrow", "Tin Man", "Cowardly Lion", "The Wizard",
      "Glinda", "Wicked Witch of the West", "Auntie Em", "Uncle Henry",
      "Toto",
    ],
  },
  {
    id: "a-christmas-carol",
    title: "A Christmas Carol",
    aliases: ["christmas carol"],
    roles: [
      "Ebenezer Scrooge", "Bob Cratchit", "Tiny Tim", "Jacob Marley",
      "Ghost of Christmas Past", "Ghost of Christmas Present",
      "Ghost of Christmas Yet to Come", "Fred", "Mrs. Cratchit",
      "Fezziwig", "Belle",
    ],
  },
  {
    id: "peter-pan",
    title: "Peter Pan",
    aliases: [],
    roles: [
      "Peter Pan", "Wendy Darling", "Captain Hook", "Tinker Bell",
      "John Darling", "Michael Darling", "Smee", "Tiger Lily",
      "Mr. Darling", "Mrs. Darling",
    ],
  },
  {
    id: "cinderella",
    title: "Cinderella",
    aliases: [],
    roles: [
      "Cinderella", "Prince Charming", "Fairy Godmother", "Stepmother",
      "Stepsister (Anastasia)", "Stepsister (Drizella)", "The King",
      "The Grand Duke",
    ],
  },
  {
    id: "the-sound-of-music",
    title: "The Sound of Music",
    aliases: ["sound of music"],
    roles: [
      "Maria Rainer", "Captain Georg von Trapp", "Liesl", "Friedrich",
      "Louisa", "Kurt", "Brigitta", "Marta", "Gretl", "Max Detweiler",
      "Elsa Schraeder", "Mother Abbess", "Rolf",
    ],
  },
  {
    id: "annie",
    title: "Annie",
    aliases: [],
    roles: [
      "Annie", "Oliver Warbucks", "Grace Farrell", "Miss Hannigan",
      "Rooster Hannigan", "Lily St. Regis", "Sandy", "Molly", "Pepper",
      "Duffy", "President Roosevelt",
    ],
  },
];

// Return the first catalog entry whose canonical title or any alias matches the
// given title (normalized), or null when there is no match or the title is blank.
export function findCuratedMatch(title: string): PlayCatalogEntry | null {
  const needle = normalizeTitle(title);
  if (!needle) return null;
  for (const entry of PLAY_CATALOG) {
    const candidates = [entry.title, ...entry.aliases].map(normalizeTitle);
    if (candidates.includes(needle)) return entry;
  }
  return null;
}
