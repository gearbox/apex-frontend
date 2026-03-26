<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
  import { addToast } from '$lib/stores/toasts';
  import { formatFileSize } from '$lib/utils/format';
  import { X, ImageIcon, GalleryHorizontalEnd } from 'lucide-svelte';
  import ImagePickerModal from './ImagePickerModal.svelte';
  import type { ImagePickerSelection } from './ImagePickerModal.svelte';
  import AuthImage from '$lib/components/ui/AuthImage.svelte';

  const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
  const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

  let dragOver = $state(false);
  let uploading = $state(false);
  let previewUrl = $state<string | null>(null);
  let fileName = $state<string | null>(null);
  let fileSize = $state<number | null>(null);
  let pickerOpen = $state(false);
  let pickerSelection = $state<{ previewUrl: string; label: string } | null>(null);

  let fileInput: HTMLInputElement;

  function validateFile(file: File): string | null {
    if (!ACCEPTED_TYPES.includes(file.type)) {
      return 'Only PNG, JPEG, and WebP are supported';
    }
    if (file.size > MAX_SIZE_BYTES) {
      return 'File must be under 20 MB';
    }
    return null;
  }

  async function uploadFile(file: File) {
    const validationError = validateFile(file);
    if (validationError) {
      addToast({ type: 'error', message: validationError });
      return;
    }

    uploading = true;
    previewUrl = URL.createObjectURL(file);
    fileName = file.name;
    fileSize = file.size;

    try {
      const formData = new FormData();
      formData.append('data', file);

      const res = await fetch(`${(await import('$lib/utils/constants')).API_BASE_URL}/v1/storage/upload`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${(await import('$lib/stores/auth')).getAccessToken()}`,
        },
        body: formData,
      });

      if (!res.ok) {
        throw new Error(`Upload failed (${res.status})`);
      }

      const data = await res.json() as { id: string };
      generationStore.setUploadedImageId(data.id);
    } catch {
      addToast({ type: 'error', message: 'Upload failed. Please try again.' });
      clearUpload();
    } finally {
      uploading = false;
    }
  }

  function clearUpload() {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    fileName = null;
    fileSize = null;
    pickerSelection = null;
    generationStore.setUploadedImageId(null);
    if (fileInput) fileInput.value = '';
  }

  function clearSelection() {
    pickerSelection = null;
    clearUpload();
    generationStore.setSourceOutputId(null);
  }

  function handleDrop(e: DragEvent) {
    dragOver = false;
    const file = e.dataTransfer?.files[0];
    if (file) uploadFile(file);
  }

  function handleFileChange(e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (file) uploadFile(file);
  }

  function handlePickerSelect(selection: ImagePickerSelection) {
    pickerOpen = false;

    // Clear any previous file upload state
    if (previewUrl && !pickerSelection) URL.revokeObjectURL(previewUrl);
    previewUrl = null;
    fileName = null;
    fileSize = null;
    if (fileInput) fileInput.value = '';

    if (selection.source === 'upload') {
      generationStore.setUploadedImageId(selection.id);
      pickerSelection = {
        previewUrl: selection.previewUrl,
        label: 'From uploads',
      };
    } else {
      generationStore.setSourceOutputId(selection.id, selection.previewUrl);
      pickerSelection = {
        previewUrl: selection.previewUrl,
        label: 'From generated',
      };

      if (selection.prompt) {
        generationStore.setPrompt(selection.prompt);
      }
    }
  }
</script>

<div class="flex flex-col gap-2">
  <span class="text-[11px] font-semibold uppercase tracking-wider text-text-muted">Source Image</span>

  {#if pickerSelection}
    <!-- Picker selection preview -->
    <div class="relative flex items-center gap-3 rounded-2.5 border border-border bg-surface p-3">
      <AuthImage
        src={pickerSelection.previewUrl}
        alt="Selected"
        class="h-14 w-14 rounded-lg object-cover"
      />
      <div class="min-w-0 flex-1">
        <p class="truncate text-xs font-medium text-text">{pickerSelection.label}</p>
      </div>
      <button
        onclick={clearSelection}
        class="shrink-0 rounded-md p-1 text-text-muted transition-colors hover:text-text"
        aria-label="Remove image"
      >
        <X size={14} />
      </button>
    </div>
  {:else if previewUrl}
    <div class="relative flex items-center gap-3 rounded-2.5 border border-border bg-surface p-3">
      <img src={previewUrl} alt="Preview" class="h-14 w-14 rounded-lg object-cover" />
      <div class="min-w-0 flex-1">
        <p class="truncate text-xs font-medium text-text">{fileName}</p>
        {#if fileSize}
          <p class="text-[11px] text-text-dim">{formatFileSize(fileSize)}</p>
        {/if}
        {#if uploading}
          <p class="text-[11px] text-accent">Uploading…</p>
        {/if}
      </div>
      <button
        onclick={clearUpload}
        class="shrink-0 rounded-md p-1 text-text-muted hover:text-text transition-colors"
        aria-label="Remove image"
      >
        <X size={14} />
      </button>
    </div>
  {:else}
    <!-- Drag-drop zone -->
    <button
      type="button"
      class="flex flex-col items-center gap-2 rounded-2.5 border-2 border-dashed p-5 transition-colors
        {dragOver ? 'border-accent bg-accent-glow' : 'border-border hover:border-border-active'}"
      ondragover={(e) => { e.preventDefault(); dragOver = true; }}
      ondragleave={() => (dragOver = false)}
      ondrop={(e) => { e.preventDefault(); handleDrop(e); }}
      onclick={() => fileInput.click()}
    >
      <ImageIcon size={24} class="text-text-dim" />
      <div class="text-center">
        <p class="text-xs font-medium text-text-muted">Drop image here or <span class="text-accent">browse</span></p>
        <p class="text-[11px] text-text-dim">PNG, JPEG, WebP · Max 20 MB</p>
      </div>
    </button>

    <!-- Choose from library -->
    <button
      type="button"
      class="flex w-full items-center justify-center gap-2 rounded-xl border border-border px-3 py-2.5 text-xs font-medium text-text-muted transition-colors hover:border-border-active hover:text-text"
      onclick={() => (pickerOpen = true)}
    >
      <GalleryHorizontalEnd size={14} />
      Choose from library
    </button>
  {/if}

  <input
    bind:this={fileInput}
    type="file"
    accept={ACCEPTED_TYPES.join(',')}
    class="hidden"
    onchange={handleFileChange}
  />
</div>

{#if pickerOpen}
  <ImagePickerModal
    open={pickerOpen}
    onclose={() => (pickerOpen = false)}
    onselect={handlePickerSelect}
  />
{/if}
