# Vella Vision + PWA Install — Diagnostic Audit Report

**Mode:** Read-only forensic audit. No fixes implemented.

---

## PART 1 — VELLA IMAGE PIPELINE FAILURE

### STEP 1 — Client Image Upload

**Files:** `app/session/page.tsx`

| Check | Result |
|-------|--------|
| **clientImagePayload** | Image is stored as base64 data URL via `FileReader.readAsDataURL(file)` → `setSelectedImage(event.target?.result as string)`. Held in React state `selectedImage` (line 79). |
| **imageStorageMechanism** | On send: `imageToSend = selectedImage` captured (line 233), then `setSelectedImage(null)` and `setImageFile(null)` (lines 234–235). Image for the message is stored in `messageImageMap` keyed by `savedMsg.id`: `setMessageImageMap((prev) => ({ ...prev, [savedMsg.id]: imageToSend }))` (line 251). |
| **messageImageMap persistence** | `messageImageMap` is **in-memory only** (`useState<Record<string, string>>({})`, line 86). Not persisted to `sessionStore` or localStorage. `VellaMessage` in `lib/session/sessionStore.ts` has no `image` field (only `id`, `sessionId`, `role`, `content`, `createdAt`). |
| **renderLifecycle** | After send: `refreshMessages()` (line 254) runs synchronously after `setMessageImageMap(...)`. React batches state updates; first paint may have new message in `messages` but `messageImageMap` not yet updated → image can appear one frame later. |
| **possibleStateLoss** | Yes. Any remount of `SessionPage` (navigation away/back, full reload, HMR) re-initialises `messageImageMap` to `{}`, so all images disappear from the UI. |

---

### STEP 2 — Request Payload Sent to API

**File:** `app/session/page.tsx` (lines 258–294)

| Check | Result |
|-------|--------|
| **Fetch call** | `fetch("/api/vella/text", { method: "POST", headers, body: JSON.stringify(requestBody) })` (lines 289–293). |
| **Payload structure** | `requestBody` includes: `message`, `session_id`, `conversationHistory`, `interactionMode`. When `hasImage && imageToSend`: `requestBody.image = imageToSend` (base64 data URL), `requestBody.hasImage = true`, `requestBody.visionConstraints = { ... }` (lines 266–285). |
| **image field** | Present when user sent an image; value is full base64 data URL (e.g. `data:image/png;base64,...`). |
| **image length** | Client allows file up to 10MB (line 388: `file.size > 10 * 1024 * 1024`). Base64 is ~4/3 of file size → ~13.3MB string for a 10MB file, which **exceeds** schema `max(12_000_000)` and would cause validation error. |

**Actual payload shape:** `{ message: string, session_id?: string, conversationHistory?, interactionMode?, image?: string, hasImage?: boolean, visionConstraints? }`.

---

### STEP 3 — API Route Handling

**File:** `app/api/vella/text/route.ts`

| Check | Result |
|-------|--------|
| **parsed.image** | Extracted at line 273: `image = parsed.image ?? null` after `vellaTextRequestSchema.safeParse(json)`. |
| **image variable** | Declared line 231: `let image: string | null = null`. Set from `parsed.image` (line 273). Logged line 274: `console.log("[VellaVision] ROUTE", { hasImage: !!image, imageSlice: image?.slice(0, 50) })`. |
| **Passed to engine** | Line 429: `imageUrl: image` passed into `runVellaTextCompletion(prompt, userId, { ..., imageUrl: image, userMessage: text, ... })`. |
| **imageReceivedByRoute** | Yes, if validation passes. |
| **imageLength** | Not checked in route; schema caps at 12M chars. |
| **imageSlice** | Logged as `image?.slice(0, 50)` for debugging. |

Image is **not** lost in the route after parsing; it is passed through to `runVellaTextCompletion` when the request reaches the AI path. It **is** dropped when the route short-circuits (see STEP 8).

---

### STEP 4 — Schema Validation

**File:** `lib/security/validationSchemas.ts` (lines 51–72)

| Check | Result |
|-------|--------|
| **image field** | `image: z.string().max(12_000_000).optional()` (line 60). Not stripped; optional. |
| **max size** | 12,000,000 characters. Images larger than this fail validation → 400 VALIDATION_ERROR, request never reaches engine. |
| **Schema vs engine** | **Mismatch:** schema allows up to 12M chars; `lib/ai/textEngine.ts` uses `MAX_IMAGE_STRING_LENGTH = 10 * 1024 * 1024` (10,485,760). So an image between ~10M and 12M chars **passes schema** but **is rejected in the engine** (see STEP 5). |

---

### STEP 5 — Engine Processing

**File:** `lib/ai/textEngine.ts`

| Check | Result |
|-------|--------|
| **validateImageUrl()** | Lines 37–47. Returns `null` if: (1) `!url`, (2) `!url.startsWith("data:image/")`, (3) `url.length > MAX_IMAGE_STRING_LENGTH` (10,485,760). Otherwise returns `url`. |
| **validatedImage** | Line 92: `const validatedImage = validateImageUrl(context?.imageUrl)`. Logged line 93. |
| **validatedImageStatus** | If validation fails, `validatedImage` is `null`. |
| **reasonIfNull** | (1) Missing or wrong prefix (not `data:image/`), (2) length > 10,485,760 chars. No MIME whitelist; any `data:image/...` prefix passes. |

When `validatedImage` is null, the code takes the **non-vision path** (lines 108–109): `messages.push({ role: "user", content: prompt })` — i.e. **no image_url in the user message**. The model then receives only text and may reply with "I can't see images" or similar.

---

### STEP 6 — OpenAI Payload Construction

**File:** `lib/ai/textEngine.ts` (lines 95–110)

| Check | Result |
|-------|--------|
| **Vision path** | When `validatedImage` is truthy: user message is `content: [ { type: "text", text: userText }, { type: "image_url", image_url: { url: validatedImage } } ]` (lines 100–105). Correct structure. |
| **Non-vision path** | When `validatedImage` is null: user message is `{ role: "user", content: prompt }` (line 109) — **no image element**. |
| **finalMessagesPayload** | Vision: system messages (mode, interactionMode, prompt, VISION_GUARDRAIL) + one user message with text + image_url. Non-vision: same system messages + one user message with full prompt text only. |
| **imagePresence** | Image is present in the OpenAI request **only** when `validateImageUrl(context?.imageUrl)` returns a non-null value. |

---

### STEP 7 — Model Capability

**File:** `lib/ai/textEngine.ts` (line 122)

| Check | Result |
|-------|--------|
| **modelName** | `"gpt-4o-mini"` (hardcoded in `createChatCompletion` call). |
| **visionSupport** | gpt-4o-mini supports vision (image_url in user content). |

---

### STEP 8 — Why Vella Says She Cannot See

**Root cause (choose one or combine):**

| Outcome | Explanation |
|--------|-------------|
| **A. Image never reaches API** | Possible if request body is truncated (e.g. platform body size limit). Then `parsed.image` could be missing or truncated → wrong prefix or invalid data → `validateImageUrl` returns null. |
| **B. Schema strips image** | **No.** Schema keeps `image`; it is optional and has `.max(12_000_000)`. Oversized payload fails validation entirely (400), not silent strip. |
| **C. validateImageUrl rejects image** | **Yes.** Main case: image length between 10,485,760 and 12,000,000 chars passes schema but fails in engine (size rejection). Secondary: wrong prefix (e.g. truncated or corrupted body). When rejected, payload sent to OpenAI has **no image**, so model replies that it can't see. |
| **D. Payload sent to OpenAI missing image** | **Yes**, as a consequence of C (and/or A). |
| **E. Model has no vision** | **No.** gpt-4o-mini supports vision. |
| **F. Persona suppresses capability** | **No.** No instruction in prompts or VISION_GUARDRAIL that says "say you can't see images". |

**Intent router short-circuit:** The router (`lib/intent/router.ts`) is **text-only**; it does not receive or consider `image` or `hasImage`. If the route returns early (e.g. `greeting_template` or `engine` mode), it never calls `runVellaTextCompletion`, so the image is never sent to the model. For a first message with "What do you see?" + image, the router sends first messages to AI (policy_first_message_ai), so we do **not** short-circuit there. For a short greeting in an existing session with &lt; 3 messages, we can short-circuit and never use the image.

**Conclusion:** The primary failure is **C/D**: **validateImageUrl** returns null (most likely due to **image length &gt; 10MB** but ≤ 12M after schema), so the OpenAI request is built **without** the image and the model responds that it cannot see. Secondary: intent short-circuit in non–first-message greeting cases drops the image; and **A** (body truncation) is possible on large payloads.

**Confirmation:** The vision request **does not** reach OpenAI with an image when `validatedImage` is null. When it is non-null, the vision request **does** reach OpenAI with the correct `image_url` content.

---

## PART 2 — IMAGE DISAPPEARING FROM CHAT

**File:** `components/chat/VellaMessage.tsx` (lines 76–81)

| Check | Result |
|-------|--------|
| **messageImageMap** | Image is supplied as prop `image={messageImageMap[m.id] ?? null}` from `app/session/page.tsx` (line 519). Rendered only for user messages: `{image && <img src={image} ... />}` (lines 76–81). |
| **Tied to temporary state** | **Yes.** `messageImageMap` is React state in `SessionPage`; it is **never** persisted. `sessionStore` messages have no `image` field. |
| **Lost during rerender** | Not during normal rerender (same component instance keeps state). Lost when **SessionPage unmounts** (e.g. navigate away from `/session` and back, or full page reload). |
| **Message saved without image reference** | **Yes.** `addMessage({ sessionId, role: "user", content: userContent })` (line 249) stores only `content` (text). Image exists only in `messageImageMap[savedMsg.id]` in memory. |
| **Hydration mismatch** | Possible only if server-rendered list of messages differs from client (e.g. different message ids or order). Not the main cause of "disappears after Vella responds." |

**renderBugLocation:** No render bug in `VellaMessage.tsx` itself. The image disappears because **messageImageMap** is in-memory only and is reset when the component tree remounts.

**stateLifecycle:** (1) User sends message → `setMessageImageMap(prev => ({ ...prev, [savedMsg.id]: imageToSend }))`; (2) Messages re-fetched via `refreshMessages()`; (3) Response arrives, `refreshMessages()` again; (4) If `SessionPage` remounts for any reason, `messageImageMap` re-initialises to `{}` → all images gone.

**fixLocation (conceptual, not implemented):** Persist image per message (e.g. extend `sessionStore` or localStorage to store `messageId → imageUrl` or persist `messageImageMap`), or ensure the same component instance stays mounted so state is not reset.

---

## PART 3 — IMAGE SIZE TOO LARGE (IN CHAT BUBBLE)

**File:** `components/chat/VellaMessage.tsx` (lines 76–80)

**Current styling:**

```tsx
<img
  src={image}
  alt="Attached image"
  className="max-w-[180px] max-h-[220px] object-cover rounded-xl mb-2"
/>
```

**Reported classes:** `max-w-[180px]` (max width 180px), `max-h-[220px]` (max height 220px), `object-cover`, `rounded-xl`, `mb-2`. No `w-full` or unbounded width/height, so the image can still render at intrinsic size up to 180×220. If the data URL is very high resolution, the **intrinsic size** can be large; `max-w`/`max-h` cap the box, but perceived "very large" could be due to aspect ratio, object-cover, or missing constraints (e.g. no `max-w-full` for narrow viewports). Exact line: **80**.

---

## PART 4 — PWA INSTALL PROMPT AGGRESSIVE

**Files:** `app/components/PwaInstallHandler.tsx`, `app/components/MobileShell.tsx`

**Search results:** `beforeinstallprompt` and `prompt()` in `PwaInstallHandler.tsx`; `display-mode` / `standalone` in `PwaInstallHandler.tsx`, `lib/security/deviceCapabilities.ts`, `lib/device/capabilities.ts`. No `localStorage`/cookie/session key found for install dismissal.

| Check | Result |
|-------|--------|
| **installTriggerLocation** | `PwaInstallHandler` is mounted in `MobileShell.tsx` **only when `hideBottomNav` is false** (lines 56–78), i.e. on routes `/home`, `/checkin`, `/journal`, `/insights`. It is **not** rendered on `/session` (lines 36–53). So the install UI appears on those four routes when conditions are met. |
| **When install prompt triggers** | (1) **Chrome/Android:** When `beforeinstallprompt` fires (browser decides installability), handler stores the event and shows the banner (lines 47–51, 77–91). (2) **iOS:** When not standalone and `isIOS()` is true, `setShowIOSBanner(true)` in the same `useEffect` (lines 43–45). So on every mount on a non-session tab, if not already installed and (on iOS) iOS device, the banner shows. |
| **How often prompt fires** | Every time the user visits a tab that mounts `PwaInstallHandler` (home, checkin, journal, insights), because dismissal is not persisted. |
| **Prompt dismissal stored** | **No.** `dismissed` is component state only: `const [dismissed, setDismissed] = useState(false)` (line 36). "Not now" / "Got it" call `setDismissed(true)` (lines 66, 70). There is **no** `localStorage`, **no** cookie, **no** sessionStorage. On navigation or reload, component remounts and `dismissed` resets to `false`. |
| **missingDismissLogic** | **Yes.** Dismissal is in-memory only. No persistence of "user dismissed install prompt" across navigations or sessions. |

**installTriggerFrequency:** On every load or navigation to `/home`, `/checkin`, `/journal`, or `/insights` (when not in standalone and either `beforeinstallprompt` has fired or device is iOS). So the prompt is **aggressive** because it reappears every time the user hits those routes.

**PWA install prompt root cause:** **Missing persistence of dismiss choice.** The banner is shown whenever `PwaInstallHandler` mounts and the app is installable (or iOS). Dismissal is stored only in React state, so it is lost on remount, leading to repeated prompts.

---

## REQUIRED OUTPUT SUMMARY

### VELLA IMAGE FAILURE ROOT CAUSE

- **Primary:** **validateImageUrl** in `lib/ai/textEngine.ts` (lines 37–47) returns **null** when the image string length exceeds **10,485,760** chars. The schema in `lib/security/validationSchemas.ts` (line 60) allows up to **12,000,000** chars. So images between ~10MB and 12MB **pass validation** but are **rejected in the engine**. The OpenAI request is then sent **without** the image (non-vision path, line 109), and the model replies that it cannot see.
- **Secondary:** Intent router is text-only; short-circuits (e.g. greeting_template, engine) never call `runVellaTextCompletion`, so the image is never sent. For first message + image this is not the typical case.
- **Possible:** Request body truncation (e.g. body size limit) can leave `image` missing or truncated → wrong prefix or length → validateImageUrl null.
- **Confirmation:** Vision request **does not** reach OpenAI with an image when `validatedImage` is null. When non-null, it **does** reach OpenAI with the correct `image_url` structure. Model used: **gpt-4o-mini** (vision-capable).

### IMAGE DISAPPEAR BUG

- **Cause:** Image is stored only in **messageImageMap** (React state) in `app/session/page.tsx` (line 86). It is **not** persisted in `sessionStore` or elsewhere. When `SessionPage` **remounts** (e.g. navigate away and back, or reload), `messageImageMap` is re-initialised to `{}`, so all images disappear.
- **Location:** State design in `app/session/page.tsx` and `lib/session/sessionStore.ts` (no image on `VellaMessage`). Render in `components/chat/VellaMessage.tsx` is correct; the data is missing after remount.

### IMAGE SIZE ISSUE

- **Current styling:** `components/chat/VellaMessage.tsx` line 80: `className="max-w-[180px] max-h-[220px] object-cover rounded-xl mb-2"`. Image is capped at 180×220px but can still appear large depending on intrinsic size and layout (e.g. no `max-w-full` for container).

### PWA INSTALL PROMPT ROOT CAUSE

- **Cause:** Dismissal is stored only in React state (`dismissed` in `app/components/PwaInstallHandler.tsx`, line 36). No `localStorage`, cookie, or sessionStorage. So every time the user visits a route that mounts `PwaInstallHandler` (home, checkin, journal, insights), the banner shows again.
- **Trigger:** `PwaInstallHandler` is rendered in `MobileShell.tsx` (line 65) only when not on `/session`. Install UI appears when not standalone and (Chrome: after `beforeinstallprompt`; iOS: always on mount).

---

**End of report.**
