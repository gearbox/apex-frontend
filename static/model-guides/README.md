# Model guide sample assets

Each model can provide three WEBP thumbnails at `/model-guides/<model-key>/` for the prompts in
`src/lib/content/modelGuides/guides.ts`. Use the exact filenames below and do not add hashes:

| Model                | Files                                               |
| -------------------- | --------------------------------------------------- |
| `grok-imagine-image` | `gi-mug.webp`, `gi-fisher.webp`, `gi-road.webp`     |
| `grok-2-image-1212`  | `g2-watch.webp`, `g2-town.webp`, `g2-train.webp`    |
| `aisha-image`        | `ai-bottle.webp`, `ai-orchard.webp`, `ai-lamp.webp` |
| `grok-imagine-video` | `gv-bike.webp`, `gv-rain.webp`, `gv-train.webp`     |
| `aisha-video`        | `av-cloth.webp`, `av-forest.webp`, `av-city.webp`   |

Use a real generated image, or a representative poster frame from the corresponding generated video.
Keep the generated result's natural aspect ratio, encode as WEBP, and limit the longest edge to 512 px.
Do not add an `image` property in the guide registry until the matching file is supplied.
