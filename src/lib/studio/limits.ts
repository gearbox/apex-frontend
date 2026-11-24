export const STUDIO_LIMITS = {
  artistName: 100,
  persona: 4000,
  voiceNotes: 2000,
  memoryTitle: 120,
  memoryBody: 2000,
  styleTags: { items: 40, length: 60 },
  globalAvoid: { items: 40, length: 60 },
  aestheticReferences: { items: 20, length: 200 },
  themes: { items: 12, length: 60 },
  imagery: { items: 20, length: 120 },
} as const;
