# Quantum VRM 🌌

Real-time 3D interactive avatar assistant platform built using **Vue 3, Three.js, WebGL, Vite, and the Gemini Live API**. Quantum VRM brings 3D digital companions to life with low-latency conversational speech, vision, responsive animations, and robust privacy policies.

---

## 🌟 Core Features

- **Live Voice Interactions**: Fluid, real-time audio chat with 3D avatars driven by Gemini Live (WebRTC).
- **Responsive Animations & Lip-Sync**: Smooth mouth-sync matched to active audio outputs, complete with contextual emotional expressions (smug, happy, laugh, angry, flirty).
- **Contextual Vision**: Optional live camera stream analysis (`look_at_user`) and shared screen analysis (`look_at_screen`).
- **Telemetry & Safety Engine**: Diagnostic logging, security analysis, and community safety protection.
- **Privacy Consent Gating**: Dual-stage glassmorphic terms dialog to inform users of model data processing and telemetry.

---

## 🔒 Security & Privacy Consent Matrix

Before establishing a connection to the Gemini Live server, users must pass through our security consent flow:

### 1. AI Model Training (Required)
- Because this platform runs on a free-tier API provider, transcripts and audio bytes are processed by the provider to refine future AI models.
- **Enforcement**: If this consent is not accepted, connection attempts are completely blocked.

### 2. Developer Data Sharing (Optional)
- Opt-in to share logs, performance metrics, and camera screenshots/videos with the developers.
- **Sharing Enabled (Unlimited Access)**: Session duration is unlimited. Fully activates image and video telemetry transmission via the Telegram bot.
- **Sharing Disabled (Strict Limits)**: Imposes a strict **10-minute daily cumulative limit**. Deactivates and strictly bans any automated image/video forwarding via Telegram.
- **Telemetry Log Exemption**: General system error logs and diagnostics bypass this setting to ensure overall application health monitoring.
- **Safety reporting**: Critical threat and NSFW violations ignore all consent settings, transmitting immediate screenshots and transcripts directly to developer channels to guarantee community safety.

---

## ⏳ Cumulative Daily time limit

We enforce a strict **cumulative daily connection limit** instead of resetting the timer per session:

- **Usage Persistence**: Remaining time is saved to `localStorage` under `vrm_daily_limit_left` (in milliseconds) and mapped to `vrm_daily_limit_date` (today's date in `YYYY-MM-DD` format).
- **Session Interceptors**: If a user attempts to connect and their daily remaining time is `<= 0`, connection is blocked and a custom **Daily Free Limit Reached** dialog is shown.
- **Live Disconnect**: If the countdown tick reaches `0` during a call, the session is disconnected automatically, and the user is shown the daily limit expired overlay.
- **One-Click Upgrade**: The daily expired overlay dialog offers a direct **"Enable Sharing & Connect"** button. Clicking this instantly updates the developer sharing consent to `true`, unlocks **unlimited 24/7 connection time**, and connects to the AI assistant instantly.

---

## 🧠 Active Memory Matrix

The AI companion has an advanced memory system stored in `localStorage` under `vrm_user_memories`:

- **Automated Memory Rule**: An explicit instruction is embedded in the system prompt commanding the AI to automatically save user preferences (gender, age, location, job, interests, named relationships) to the memory matrix using the `save_memory` tool as soon as they are disclosed in chat.
- **Silent persistence**: Key facts are saved silently on the fly without asking the user for permission.
- **Context Loading**: On startup, saved facts are compiled, formatted as `- key: value`, and loaded under `[SAVED MEMORIES]` in the system instruction profile.

---

## 📝 Consolidated Long-Term Chat History

To resolve context loss when 2-hour server sessions rotate or during next-day reconnections:

- **History persistence**: The entire conversation log is persisted under `vrm_chat_history`.
- **Hybrid Context Restore**:
  - The **most recent 16 turns** are sent as active client content turns to maintain natural conversational immediacy.
  - All **older chat history** is parsed, converted into a neat historical transcript log (`User: ... \n Riko: ...`), and cleanly appended to the system instructions under `[OLDER CONVERSATION HISTORY LOG]`.
- This ensures the model retains 100% comprehension of yesterday's conversations and previous sessions without exhausting WebRTC turn boundaries.

---

## 🔌 Deferrable AI Call Disconnection

Quantum VRM features a dedicated AI-initiated call teardown capability:

- **The `end_conversation` Tool**: A registered function block allowing the AI model to end the active session when saying goodbye or when requested to disconnect.
- **Smart Speech Playback Check**: When the model calls `end_conversation()`, the client sends a successful tool reply but delays disconnect. It polls `window.vrmAudioManager` every 500ms and disconnects the WebRTC channel **only after all queued audio playback has fully finished**. The user hears the final goodbye sentence fully without getting cut off mid-speech.

---

## 💻 Tech Stack & Dependencies

- **Framework**: Vue 3 (Composition API)
- **3D Renderer**: Three.js & `@pixiv/three-vrm`
- **Build Pipeline**: Vite 7
- **CSS Styling**: Glassmorphism CSS & TailwindCSS (UI Layouts)
- **AI Core**: `@google/genai` (Gemini Live API)
- **OS Support**: Linux / Windows / macOS cross-compatible

---

## 🛠️ Setup & Local Execution

### 1. Clone & Install
```bash
npm install
```

### 2. Configure Environment
Create a `.env` file in the root directory:
```env
VITE_API_KEY=your_gemini_api_key
```

### 3. Start Dev Server
```bash
npm run dev
```

### 4. Build Production Bundle
```bash
npm run build
```

---

## 📂 Architecture & Directory Map

- `/src/pages/Speaking.vue` - App shell, daily time limits countdown, and modal overlay controllers.
- `/src/components/ConfirmTermsDialog.vue` - Security consent panel interface.
- `/src/components/SettingsPanel.vue` - Config panel for persona, data sharing, language, and settings.
- `/managers/aiClient.js` - Gemini Live WebRTC client, history formatter, and deferred `end_conversation` loop.
- `/managers/audioManager.js` - Playback worklet, speech event bindings, and real-time lip-sync.
- `/managers/telegramManager.js` - Telemetry dispatch, media permissions, and community safety reporting.
- `/managers/index.js` - Orchestrator that binds managers, exposes `vrmAudioManager`, and compiles `systemPrompt`.
- `/dist/` - Files for animation and 3d models
