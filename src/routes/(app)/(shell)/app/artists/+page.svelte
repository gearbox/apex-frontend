<script lang="ts">
  import * as m from '$paraglide/messages';
</script>

<svelte:head>
  <title>{m.artists_title()}</title>
</svelte:head>

<section class="mx-auto w-full max-w-5xl px-4 py-6 md:px-8">
  <h1 class="text-2xl font-bold text-text">{m.artists_title()}</h1>
  <p class="mt-3 text-sm text-text-muted">{m.artists_coming_soon()}</p>
</section>
