# FE Contract — i2i aspect-ratio capability (apex `0.24.0`)

**Repo:** `gearbox/apex-frontend` · **Depends on:** apex branch `fix/i2i-aspect-reshape-capability` deployed to the target environment first, then `gen:api` type regeneration.
**Why:** `grok-imagine-image` accepts `aspect_ratio` on image edits but silently **stretches** the source instead of recomposing (verified against the raw xAI API). The FE's current behavior — always sending an aspect, defaulting to `3:4` — therefore distorts every Grok i2i whose source isn't 3:4. The backend now exposes a per-model *edit-reshape capability* and rejects incapable combinations with a 400.

## 1. API contract changes

### 1.1 `GET /v1/providers` — new field

`ModelInfo.image` (`ImageConstraints`) gains:

```json
"image": {
  "edit_aspect_ratios": ["2:3", "3:2", "1:1", "9:16", "16:9", "3:4", "4:3"]
}
```

Semantics: the aspect ratios this model can **genuinely reshape to during image editing (i2i)**.

| Model | `edit_aspect_ratios` | Meaning |
|---|---|---|
| `grok-imagine-image` | `[]` | Cannot reshape on edit. **Omit** `aspect_ratio` for i2i; output follows the source image's aspect. |
| `aisha-image` | full list | Reshapes natively; explicit aspect on i2i is honored without distortion. |

The existing `aspect_ratios` field is unchanged and now explicitly means **t2i only**. Treat `edit_aspect_ratios` as the single source of truth for the i2i aspect UI — never fall back to `aspect_ratios` for edit mode.

### 1.2 `POST /v1/generate` — `aspect_ratio` is now optional/nullable

```
aspect_ratio?: AspectRatio | null
```

- **Omitted / null, t2i:** provider default applies (`1:1` image, `16:9` video). No FE behavior change needed for t2i — keep sending the user's selection.
- **Omitted / null, i2i:** output follows the source image's aspect. This is the **required** FE behavior for models with empty `edit_aspect_ratios`, and the sensible default ("Auto") for all models.
- **Set, i2i:** accepted only if the value is in the model's `edit_aspect_ratios`; otherwise **HTTP 400**:

```json
{ "detail": "Model 'grok-imagine-image' cannot reshape aspect ratio during image editing; omit aspect_ratio to preserve the source aspect" }
```

The backend will not silently drop the value — a 400 here means the FE sent an aspect it should not have (stale capability cache or a missed code path).

### 1.3 Job / gallery responses — `aspect_ratio: null` semantics

`aspect_ratio` on job and gallery items is already nullable; it is now `null` whenever the generation followed the source aspect (i2i without explicit reshape, both providers). Render as "Auto / source" rather than blank; never assume `1:1` for `null`. Actual pixel dimensions remain the authoritative display source where available.

## 2. Required FE behavior changes

1. **Stop sending the `3:4` default for i2i.** The hardcoded default aspect applies to **t2i only**. For i2i, the default selection is **Auto (match source)**, serialized by omitting `aspect_ratio` from the request body (do not send `null` explicitly if the generated client distinguishes; omit the key).
2. **Drive the i2i aspect control from `edit_aspect_ratios`:**
   - `[]` → hide the aspect selector entirely in edit mode (mirrors xAI's own console behavior for this model), or render it locked to "Auto (match source)".
   - Non-empty → show "Auto (match source)" as the first/default option plus the listed ratios.
3. **Mode switching:** when the user flips t2i → i2i (or attaches a source image / remixes an output), re-derive the aspect control state from `edit_aspect_ratios`; a previously selected t2i aspect must not leak into an i2i request for a model with empty capability.
4. **Multi-reference i2i (`source_images`):** same rules; on Aisha the **first** image drives the "Auto" canvas — worth a hint in the UI if references have mixed aspects.
5. **400 handling:** surface the backend message verbatim as a form-level validation error on the aspect control; it is actionable as written.

## 3. Deployment ordering

1. Deploy apex `0.24.0` to staging.
2. **Known gap:** until the FE ships, existing FE builds will get 400s on grok-imagine-image i2i (they send `3:4`). This is intentional fail-loud, not a backend bug — deploy FE in the same window.
3. Regenerate API types (`gen:api`) against the deployed spec; `aspect_ratio` on the request type must come out optional and `ImageConstraints` must include `edit_aspect_ratios`.
4. Verify on staging before prod promotion:
   - Grok i2i, portrait source, Auto → output aspect matches source, no distortion (round objects stay round).
   - Grok i2i with any explicit aspect → not constructible via UI; direct API call returns 400.
   - Aisha i2i, portrait source, Auto → portrait output; explicit `16:9` → recomposed 16:9, undistorted.
   - t2i on both providers → unchanged behavior with explicit aspect.
   - Gallery renders `aspect_ratio: null` items as Auto/source.

## 4. Non-goals / heads-up

- `grok-imagine-image-quality` (reshapes correctly) may be added later as a separate model; the capability-driven UI from §2.2 will pick it up with zero FE changes — that is the point of the design.
- Video aspect handling is untouched in this release; i2v/v2v capability gating may follow after the equivalent verification experiment.
