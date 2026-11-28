import type {
  BuiltSong,
  DocumentPair,
  Pair,
  SectionDraft,
  SectionKind,
  SongDraft,
} from './songDraft';
import { buildSong, draftFromDocuments, hasUnsentInput, newDraft, sameDocs } from './songDraft';
import type { SongDraftStore, StoredSongDraft } from './songDraftStore';
import { validateSong, type DraftIssue } from './songValidation';

/** Whether the device must keep a draft: it has unsaved documents, or text they cannot carry. */
function mustKeepOnDevice(draft: SongDraft, built: BuiltSong, baseDocs: DocumentPair): boolean {
  return !sameDocs(built, baseDocs) || hasUnsentInput(draft, built);
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
    this.draft && this.built ? !sameDocs(this.built, this.baseDocs) : false,
  );
  readonly needsLocalCopy = $derived(
    this.draft && this.built ? mustKeepOnDevice(this.draft, this.built, this.baseDocs) : false,
  );
  /** `savedAt` of the stored record this instance holds; a late save uses it to prove ownership. */
  private lastWrittenAt: string | undefined;

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
    this.lastWrittenAt = record.savedAt;
  }

  discardStored(): void {
    this.deps.store.remove(this.deps.userId, this.deps.trackId);
    this.lastWrittenAt = undefined;
  }

  /** False once another editor of this track has written the stored record. */
  ownsStoredRecord(): boolean {
    const savedAt = this.deps.store.load(this.deps.userId, this.deps.trackId)?.savedAt;
    return savedAt === undefined || savedAt === this.lastWrittenAt;
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

  /** Reads state, never the deriveds: a late save persists an editor whose component is gone, and
   *  Svelte answers a derived of a destroyed component with its stale value. */
  persist(): void {
    if (!this.draft) return;
    const draft = $state.snapshot(this.draft) as SongDraft;
    if (!mustKeepOnDevice(draft, buildSong(draft), this.baseDocs)) {
      this.discardStored();
      return;
    }
    const savedAt = this.deps.now().toISOString();
    const record = { savedAt, base: { ...this.base }, draft };
    if (this.deps.store.save(this.deps.userId, this.deps.trackId, record))
      this.lastWrittenAt = savedAt;
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
