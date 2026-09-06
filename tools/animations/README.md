# Adding new avatar animations (Mixamo → VRM)

This project drives the VRM avatar with pre-recorded clips listed in
`getAnimationCatalog()` inside [`managers/animationManager.js`](../../managers/animationManager.js).
Two clip formats are supported and load through the same pipeline:

| Format  | How it loads                                                              |
| ------- | ------------------------------------------------------------------------- |
| `.vrma` | Native VRM Animation, parsed by `@pixiv/three-vrm-animation`.              |
| `.fbx`  | **Raw Mixamo export** — retargeted onto the VRM at load time (no convert). |

The converter ([`convert.mjs`](./convert.mjs)) also bakes **`.fbx` (Mixamo)** and
**`.bvh` (mocap)** down to `.vrma`. The bundled emotion set (`Joy`, `Love`,
`Fear`, `Greeting`, `Dab`, …) was produced this way from the
[VRM-Assets-Pack-For-Silly-Tavern](https://github.com/test157t/VRM-Assets-Pack-For-Silly-Tavern)
BVH pack, whose joints are already named with VRM humanoid bones:

```bash
node tools/animations/convert.mjs path/to/clip.bvh public/animations/Clip.vrma
```

> **You do not have to convert anything.** A Mixamo `.fbx` dropped into
> `public/animations/` works directly. Conversion to `.vrma` (below) is optional
> and only worth it if you want smaller files or to host them on a CDN.

---

## 1. Download a clip from Mixamo

1. Go to <https://www.mixamo.com> and sign in (free Adobe account).
2. Pick an animation (search e.g. _"Nod"_, _"Thinking"_, _"Bow"_, _"Cheering"_).
3. Click **Download** with these settings:
   - **Format:** `FBX Binary (.fbx)`
   - **Skin:** `Without Skin`  ← important, keeps the file small (motion only)
   - **Frames per Second:** `30`
   - **Keyframe Reduction:** `none`
4. Save the file into `public/animations/`.

## 2. Wire it into the catalog

The catalog already ships ready-to-use slots for a recommended set. Just name the
downloaded file to match and it activates automatically on next reload:

| Catalog name    | Drop this file into `public/animations/` | Mixamo search   |
| --------------- | ---------------------------------------- | --------------- |
| `nod`           | `Nod.fbx`                                | "Head Nod Yes"  |
| `shake_head`    | `ShakeHead.fbx`                          | "Head Shake No" |
| `thinking`      | `Thinking.fbx`                           | "Thinking"      |
| `talking`       | `Talking.fbx`                            | "Talking"       |
| `excited`       | `Excited.fbx`                            | "Excited"       |
| `bow`           | `Bow.fbx`                                | "Bowing"        |
| `victory`       | `Victory.fbx`                            | "Victory"       |
| `facepalm`      | `Facepalm.fbx`                           | "Face Palm"     |
| `cry`           | `Crying.fbx`                             | "Crying"        |
| `cheer`         | `Cheering.fbx`                           | "Cheering"      |
| `yawn`          | `Yawn.fbx`                               | "Yawn"          |
| `blow_kiss_air` | `BlowAKiss.fbx`                          | "Blow A Kiss"   |

Want a clip that's not in the list? Add one line to `getAnimationCatalog()`:

```js
{ name: 'my_move', path: '/animations/MyMove.fbx', loop: false, optional: true },
```

`loop: true` only for looping idles; one-shot gestures use `loop: false`. The AI
is told about whatever actually loaded (`getAvailableAnimations()`), so a new
clip becomes triggerable the moment its file is present — no other wiring needed.

## 3. (Optional) Bake an `.fbx` down to `.vrma`

Smaller, CDN-friendly, and matches the existing `.vrma` assets. Run:

```bash
npm run convert-anim -- "public/animations/Nod.fbx" "public/animations/Nod.vrma"
```

Then point the catalog entry at the `.vrma` path instead of the `.fbx`.
See [`convert.mjs`](./convert.mjs) for details and caveats.
