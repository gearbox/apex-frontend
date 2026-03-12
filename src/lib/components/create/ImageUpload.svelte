<script lang="ts">
  import { generationStore } from '$lib/stores/generation';
  import { addToast } from '$lib/stores/toasts';
  import { formatFileSize } from '$lib/utils/format';
  import { X, ImageIcon } from 'lucide-svelte';

  const MAX_SIZE_BYTES = 20 * 1024 * 1024; // 20 MB
  const ACCEPTED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

  let dragOver = $state(false);
  let uploading = $state(false);
  let previewUrl = $state<string | null>(null);
  let fileName = $state<string | null>(null);
  let fileSize = $state<number | null>(null);

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
    generationStore.setUploadedImageId(null);
    if (fileInput) fileInput.value = '';
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
</script>

<div class="flex flex-col gap-2">
  <span class="text-[11px] font-semibold uppercase tracking-[0.05em] text-text-muted">Source Image</span>

  {#if previewUrl}
    <div class="relative flex items-center gap-3 rounded-[10px] border border-border bg-surface p-3">
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
      class="flex flex-col items-center gap-2 rounded-[10px] border-2 border-dashed p-5 transition-colors
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
  {/if}

  <input
    bind:this={fileInput}
    type="file"
    accept={ACCEPTED_TYPES.join(',')}
    class="hidden"
    onchange={handleFileChange}
  />
</div>
