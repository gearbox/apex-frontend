import {
  deriveMemoryTitle,
  todayLocalIsoDate,
  type MemoryFields,
  type MemoryFormPayload,
} from './memoryDraft';

export class MemoryDraft {
  body = $state('');
  title = $state('');
  titleEdited = $state(false);
  occurredOn = $state('');
  themes = $state<string[]>([]);
  imagery = $state<string[]>([]);
  salience = $state(3);

  constructor(
    readonly mode: 'create' | 'edit',
    source?: MemoryFields,
  ) {
    this.load(source);
  }

  load(source?: MemoryFields): void {
    this.body = source?.body ?? '';
    this.title = source?.title ?? '';
    this.titleEdited =
      this.mode === 'edit' || (!!source && source.title !== deriveMemoryTitle(source.body));
    this.occurredOn = source ? (source.occurred_on ?? '') : todayLocalIsoDate();
    this.themes = [...(source?.themes ?? [])];
    this.imagery = [...(source?.imagery ?? [])];
    this.salience = source?.salience ?? 3;
  }

  reset(): void {
    this.load();
  }

  setBody(value: string): void {
    this.body = value;
    if (!this.titleEdited) this.title = deriveMemoryTitle(value);
  }

  setTitle(value: string): void {
    this.title = value;
    this.titleEdited = true;
  }

  get isEmpty(): boolean {
    return (
      !this.body.trim() &&
      !(this.titleEdited && this.title.trim()) &&
      this.themes.length === 0 &&
      this.imagery.length === 0
    );
  }

  toPayload(): MemoryFormPayload {
    return {
      title: this.title.trim(),
      body: this.body,
      ...(this.occurredOn
        ? { occurred_on: this.occurredOn }
        : this.mode === 'edit'
          ? { occurred_on: null }
          : {}),
      themes: [...this.themes],
      imagery: [...this.imagery],
      salience: this.salience,
    };
  }
}
