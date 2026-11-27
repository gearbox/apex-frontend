import type {
  PlanDocument,
  LyricsDocument,
  Pair,
  SectionDraft,
  SectionKind,
  SongDraft,
} from './songDraft';
import { buildSong, draftFromDocuments, newDraft, sameLyrics, samePlan } from './songDraft';
import type { SongDraftStore, StoredSongDraft } from './songDraftStore';
import { validateSong, type DraftIssue } from './songValidation';

interface DocumentPair {
  plan: PlanDocument | null;
  lyrics: LyricsDocument | null;
}

interface EditorDependencies {
  store: SongDraftStore;
  userId: string;
  trackId: string;
  makeId: () => string;
  now: () => Date;
}

export class SongEditor {
  draft = $state<SongDraft | null>(null);
  base = $state<Pair>({ plan: null, lyrics: null });
  baseDocs = $state<DocumentPair>({ plan: null, lyrics: null });
  readonly built = $derived(this.draft ? buildSong(this.draft) : null);
  readonly issues = $derived<DraftIssue[]>(
    this.draft && this.built ? validateSong(this.draft, this.built) : [],
  );
  readonly dirty = $derived(
    this.draft && this.built
      ? !samePlan(this.built.plan, this.baseDocs.plan) ||
          !sameLyrics(this.built.lyrics, this.baseDocs.lyrics)
      : false,
  );

  constructor(private readonly deps: EditorDependencies) {}

  start(base: Pair, docs: DocumentPair, defaults: { language: string }): void {
    this.base = { ...base };
    this.baseDocs = { ...docs };
    if (!docs.plan) {
      this.draft = null;
      return;
    }
    this.draft = draftFromDocuments(docs.plan, docs.lyrics, defaults);
  }

  create(template: 'blank' | 'verse_chorus', title: string, language: string): void {
    this.draft = newDraft(template, title, language, this.deps.makeId);
  }

  restore(record: StoredSongDraft, docs: DocumentPair): void {
    this.base = { ...record.base };
    this.baseDocs = { ...docs };
    this.draft = JSON.parse(JSON.stringify(record.draft)) as SongDraft;
  }

  discardStored(): void {
    this.deps.store.remove(this.deps.userId, this.deps.trackId);
  }

  addSection(kind: SectionKind): string {
    if (!this.draft) return '';
    const id = this.deps.makeId();
    this.draft.sections = [...this.draft.sections, this.emptySection(id, kind)];
    return id;
  }

  moveSection(id: string, delta: -1 | 1): void {
    if (!this.draft) return;
    const index = this.draft.sections.findIndex((section) => section.id === id);
    const target = index + delta;
    if (index < 0 || target < 0 || target >= this.draft.sections.length) return;
    const sections = [...this.draft.sections];
    [sections[index], sections[target]] = [sections[target]!, sections[index]!];
    this.draft.sections = sections;
  }

  duplicateSection(id: string): string {
    if (!this.draft) return '';
    const index = this.draft.sections.findIndex((section) => section.id === id);
    if (index < 0) return '';
    const original = this.draft.sections[index]!;
    const duplicate = {
      ...JSON.parse(JSON.stringify(original)),
      id: this.deps.makeId(),
    } as SectionDraft;
    this.draft.sections = [
      ...this.draft.sections.slice(0, index + 1),
      duplicate,
      ...this.draft.sections.slice(index + 1),
    ];
    return duplicate.id;
  }

  removeSection(id: string): void {
    if (!this.draft) return;
    this.draft.sections = this.draft.sections.filter((section) => section.id !== id);
  }

  rebase(pair: Pair, docs: DocumentPair): void {
    this.base = { ...pair };
    this.baseDocs = { ...docs };
  }

  persist(): void {
    if (!this.draft) return;
    if (!this.dirty) {
      this.discardStored();
      return;
    }
    const draft = JSON.parse(JSON.stringify($state.snapshot(this.draft))) as SongDraft;
    this.deps.store.save(this.deps.userId, this.deps.trackId, {
      savedAt: this.deps.now().toISOString(),
      base: { ...this.base },
      draft,
    });
  }

  clearStoredIfEqual(snapshot: SongDraft): void {
    if (!this.draft) return;
    if (JSON.stringify($state.snapshot(this.draft)) === JSON.stringify(snapshot)) {
      this.discardStored();
    }
  }

  private emptySection(id: string, kind: SectionKind): SectionDraft {
    return {
      id,
      kind,
      label: '',
      delivery: [],
      styleTags: [],
      styleAvoid: [],
      instrumental: false,
      duration: '',
      notes: '',
      lyrics: '',
    };
  }
}
