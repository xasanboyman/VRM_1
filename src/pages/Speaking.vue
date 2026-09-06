<template>
  <div
    class="app-shell relative h-screen w-full overflow-hidden select-none"
    @dragenter.prevent="handleDrag"
    @dragover.prevent="handleDrag"
    @dragleave.prevent="handleDrag"
    @drop.prevent="handleDrop"
  >
    <div class="app-backdrop absolute inset-0 z-0"></div>
    <div class="app-vignette absolute inset-0 z-0"></div>

    <div
      class="absolute inset-0 z-50 pointer-events-none transition-opacity duration-[1000ms] ease-in-out"
      :class="loadingState.progress >= 100 ? 'opacity-0 delay-200' : 'opacity-100'"
    >
      <SciFiLoader
        :progress="loadingState.progress"
        :stage="loadingState.stage"
        :detail="loadingState.detail"
      />
    </div>

    <canvas ref="canvasRef" class="absolute inset-0 z-0 block h-full w-full outline-none"></canvas>

    <Transition name="fade">
      <div
        v-if="dragActive"
        class="absolute inset-0 z-40 m-3 sm:m-6 flex items-center justify-center rounded-3xl border border-cyan-500/40 bg-black/80 backdrop-blur-xl"
      >
        <div class="rounded-2xl border border-cyan-500/30 px-8 py-6 text-center">
          <p class="text-[11px] font-mono uppercase tracking-[0.22em] text-cyan-200/70">
            {{ t('app.dragAndDrop') }}
          </p>
          <p class="mt-2 text-xl sm:text-2xl font-semibold tracking-wide text-white">
            {{ t('app.uploadAvatar') }}
          </p>
        </div>
      </div>
    </Transition>

    <div class="absolute left-0 top-0 z-20 w-full p-4 sm:p-6 pointer-events-none">
      <div class="flex items-start justify-between gap-3 sm:gap-4">
        <div class="hud-panel pointer-events-auto">
          <div class="flex items-center gap-2">
            <span
              class="h-2.5 w-2.5 rounded-full shadow-[0_0_0_2px_rgba(255,255,255,0.06)]"
              :class="
                isConnected
                  ? 'bg-rose-500 shadow-[0_0_12px_rgba(244,63,94,0.8)]'
                  : 'bg-amber-400 shadow-[0_0_12px_rgba(251,191,36,0.55)]'
              "
            ></span>
            <p class="text-[11px] font-mono uppercase tracking-[0.18em] text-white/50">
              {{ isConnected ? t('app.liveSessionActive') : t('app.systemStandby') }}
            </p>
          </div>
          <p class="mt-2 text-sm text-white/40">
            {{ isConnected ? t('app.voiceLinkStable') : t('app.connectVoiceVision') }}
          </p>
          <div class="mt-2 flex flex-wrap gap-2">
            <span
              v-if="isSharingScreen"
              class="inline-flex items-center rounded-full border border-sky-300/30 bg-sky-500/12 px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.16em] text-sky-200 font-semibold"
            >
              {{ t('app.screenShareEnabled') }}
            </span>
          </div>
        </div>

        <div class="hud-panel min-w-[6rem] sm:min-w-[140px] text-right pointer-events-auto">
          <p
            class="text-[10px] font-mono uppercase tracking-[0.16em] text-[color:var(--text-muted)]"
          >
            {{ t('app.renderFps') }}
          </p>
          <p class="mt-1 text-xl font-semibold text-[color:var(--text-primary)]">{{ fps }}</p>
          <p class="mt-1 text-[11px] text-[color:var(--text-muted)]">
            {{ systemReady ? t('app.sceneReady') : t('app.initializingScene') }}
          </p>
        </div>
      </div>
    </div>

    <div v-if="showChat" class="pointer-events-none absolute inset-0 z-40">
      <ChatSidebar
        class="pointer-events-auto"
        :language="selectedLanguage"
        :chatHistory="chatHistory"
        @clear-history="clearHistory"
        @close="showChat = false"
      />
    </div>

    <div v-if="showSettings" class="absolute inset-0 z-50" @click.self="showSettings = false">
      <SettingsPanel
        v-model:avatarScale="avatarScale"
        v-model:backgroundColor="backgroundColor"
        v-model:lookAtUserEnabled="lookAtUserEnabled"
        v-model:lookAtScreenEnabled="lookAtScreenEnabled"
        v-model:subtitlesEnabled="subtitlesEnabled"
        v-model:subtitlesPreset="subtitlesPreset"
        v-model:subtitlesSize="subtitlesSize"
        v-model:subtitlesSpeed="subtitlesSpeed"
        v-model:subtitlesPosition="subtitlesPosition"
        v-model:selectedLanguage="selectedLanguage"
        :selectedVoice="selectedVoice"
        @update:selectedVoice="handleVoiceChange"
        :language="selectedLanguage"
        :languageOptions="languageOptions"
        :availableModels="availableModels"
        :activePersonaTitle="selectedPersona?.title || t('settings.defaultRiko')"
        :activePersonaDescription="
          selectedPersona?.description || t('settings.defaultPersonaDescription')
        "
        @switch-model="handleModelSwitch"
        @delete-model="handleModelDelete"
        @open-persona-manager="openPersonaManager"
        @close="showSettings = false"
      />
    </div>

    <div
      v-if="showPersonaManager"
      class="absolute inset-0 z-[60]"
      @click.self="showPersonaManager = false"
    >
      <PersonaManagerDialog
        :language="selectedLanguage"
        :personas="personas"
        :selectedPersonaId="selectedPersonaId"
        @select-persona="handlePersonaSelect"
        @create-persona="handlePersonaCreate"
        @update-persona="handlePersonaUpdate"
        @delete-persona="handlePersonaDelete"
        @close="showPersonaManager = false"
      />
    </div>

    <Transition name="fade">
      <div
        v-if="timerExpiredOverlayVisible"
        class="pointer-events-none absolute inset-0 z-[54] bg-rose-500/15 backdrop-blur-sm"
      ></div>
    </Transition>

    <!-- Live Subtitles & Captions Overlay (Word-by-word VTuber Style) -->
    <LiveSubtitleOverlay
      :text="currentSubtitleText"
      :isSpeaking="assistantSpeaking"
      :audioProgress="assistantAudioProgress"
      :enabled="subtitlesEnabled"
      :speed="subtitlesSpeed"
      :stylePreset="subtitlesPreset"
      :fontSize="subtitlesSize"
      :position="subtitlesPosition"
    />

    <CueCardWidget
      :visible="cueCardVisible"
      :title="cueCardTitle"
      :prompt="cueCardPrompt"
      :items="cueCardItems"
      :footer="cueCardFooter"
      :prepSeconds="cueCardPrepSeconds"
      :speakSeconds="cueCardSpeakSeconds"
      @dismiss="dismissCueCard"
      @phase-change="handleCueCardPhaseChange"
      @time-expired="handleCueCardTimeExpired"
    />

    <TimerWidget
      :visible="timerVisible"
      :minimized="timerMinimized"
      :label="timerLabel"
      :remainingSeconds="timerRemainingSeconds"
      :progress="timerProgress"
      @toggle-minimize="toggleTimerMinimize"
      @dismiss="dismissTimer"
    />

    <ControlDock
      :language="selectedLanguage"
      :isReady="systemReady"
      :isConnected="isConnected"
      :isConnecting="isConnecting"
      :isSharingScreen="isSharingScreen"
      :showChat="showChat"
      :showSubtitles="subtitlesEnabled"
      :showSettings="showSettings"
      @toggle-connection="toggleConnection"
      @toggle-screen-share="toggleScreenShare"
      @toggle-chat="toggleChatPanel"
      @toggle-subtitles="subtitlesEnabled = !subtitlesEnabled"
      @toggle-settings="toggleSettingsPanel"
      @file-upload="loadVRMFile"
    />

    <TransitionGroup
      name="toast"
      tag="div"
      class="pointer-events-none absolute right-4 top-24 z-50 flex w-[calc(100%-2rem)] flex-col items-end gap-3 sm:right-6 sm:w-auto"
    >
      <div
        v-for="toast in toasts"
        :key="toast.id"
        class="toast-card pointer-events-auto flex w-full max-w-[360px] items-start gap-3 rounded-2xl border px-4 py-3"
      >
        <div class="mt-0.5 shrink-0">
          <CheckCircleIcon v-if="toast.type === 'success'" class="h-5 w-5 text-emerald-400" />
          <XCircleIcon v-else-if="toast.type === 'error'" class="h-5 w-5 text-rose-400" />
          <InformationCircleIcon v-else class="h-5 w-5 text-cyan-300" />
        </div>
        <div class="min-w-0">
          <p class="text-sm font-semibold text-[color:var(--text-primary)]">{{ toast.title }}</p>
          <p class="mt-1 text-xs leading-relaxed text-[color:var(--text-muted)]">
            {{ toast.message }}
          </p>
        </div>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { CheckCircleIcon, InformationCircleIcon, XCircleIcon } from '@heroicons/vue/24/solid'

import ChatSidebar from '../components/ChatSidebar.vue'
import ControlDock from '../components/ControlDock.vue'
import CueCardWidget from '../components/CueCardWidget.vue'
import LiveSubtitleOverlay from '../components/LiveSubtitleOverlay.vue'
import PersonaManagerDialog from '../components/PersonaManagerDialog.vue'
import SciFiLoader from '../components/SciFiLoader.vue'
import SettingsPanel from '../components/SettingsPanel.vue'
import TimerWidget from '../components/TimerWidget.vue'
import {
  SUPPORTED_LANGUAGES,
  UI_LANGUAGE_STORAGE_KEY,
  buildAiRuntimeLanguageHint,
  resolveLanguage,
  translateUi,
} from '../i18n/ui.js'

const canvasRef = ref(null)
const system = ref(null)
const systemReady = ref(false)
const isConnected = ref(false)
const isConnecting = ref(false)
const isSharingScreen = ref(false)
const dragActive = ref(false)
const showChat = ref(false)
const showSettings = ref(false)
const showPersonaManager = ref(false)
const fps = ref(0)
const toasts = ref([])
const availableModels = ref([])

// Live Subtitle Reactive State
const subtitlesEnabled = ref(localStorage.getItem('vrm_subtitles_enabled') !== 'false')
const subtitlesPreset = ref(localStorage.getItem('vrm_subtitles_preset') || 'vtuber-pink')
const subtitlesSize = ref(localStorage.getItem('vrm_subtitles_size') || 'normal')
const subtitlesSpeed = ref(localStorage.getItem('vrm_subtitles_speed') || 'fast')
const subtitlesPosition = ref(localStorage.getItem('vrm_subtitles_position') || 'chest')
const currentSubtitleText = ref('')
const assistantAudioProgress = ref({ isPlaying: false, progress: 1, elapsed: 0, totalDuration: 0 })

// IELTS Cue Card Reactive State
const cueCardVisible = ref(false)
const cueCardTitle = ref('')
const cueCardPrompt = ref('You should say:')
const cueCardItems = ref([])
const cueCardFooter = ref('')
const cueCardPrepSeconds = ref(60)
const cueCardSpeakSeconds = ref(120)

const loadingState = ref({
  progress: 0,
  stage: 'Booting Engine',
  detail: 'Preparing workspace',
})

const assistantSpeaking = ref(false)

const timerVisible = ref(false)
const timerMinimized = ref(true)
const timerLabel = ref('Timer')
const timerTotalMs = ref(0)
const timerEndAtMs = ref(0)
const timerNowMs = ref(Date.now())
const timerNotified = ref(false)
const timerExpiredOverlayVisible = ref(false)
const pendingTimerStart = ref(null)
let timerTickInterval = null
let timerAutoMinimizeTimeout = null
let timerExpiryDismissTimeout = null
let timerPendingFallbackTimeout = null

const timerRemainingMs = computed(() => {
  if (!timerVisible.value) return 0
  return Math.max(0, timerEndAtMs.value - timerNowMs.value)
})

const timerRemainingSeconds = computed(() => Math.ceil(timerRemainingMs.value / 1000))

const timerProgress = computed(() => {
  if (!timerVisible.value || timerTotalMs.value <= 0) return 0
  return Math.max(0, Math.min(1, timerRemainingMs.value / timerTotalMs.value))
})

const avatarScale = ref(parseFloat(localStorage.getItem('vrm_avatar_scale') || '2.0'))
const BACKGROUND_COLOR_STORAGE_KEY = 'vrm_background_color'
const normalizeHexColor = (value, fallback = '#111827') => {
  const raw = typeof value === 'string' ? value.trim() : ''
  const withHash = raw.startsWith('#') ? raw : `#${raw}`
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toLowerCase() : fallback
}
const backgroundColor = ref(
  normalizeHexColor(localStorage.getItem(BACKGROUND_COLOR_STORAGE_KEY), '#111827'),
)
const lookAtUserEnabled = ref(localStorage.getItem('vrm_look_at_user') !== 'false')
const lookAtScreenEnabled = ref(localStorage.getItem('vrm_look_at_screen') !== 'false')
const selectedLanguage = ref(resolveLanguage(localStorage.getItem(UI_LANGUAGE_STORAGE_KEY) || 'en'))
const selectedVoice = ref(localStorage.getItem('vrm_selected_voice') || 'Zephyr')
const t = (key, params = {}) => translateUi(selectedLanguage.value, key, params)
const languageLabelKeyByCode = Object.freeze({
  en: 'aiLanguage.english',
  uz: 'aiLanguage.uzbek',
  ru: 'aiLanguage.russian',
})
const languageOptions = computed(() =>
  SUPPORTED_LANGUAGES.map((item) => ({
    code: item.code,
    label: t(languageLabelKeyByCode[item.code] || languageLabelKeyByCode.en),
  })),
)
const chatHistory = ref([])
const activeUserTranscriptEntryId = ref(null)
const activeModelTranscriptEntryId = ref(null)
const MAX_CHAT_HISTORY_ITEMS = 12000
const DEBUG_USER_ID_STORAGE_KEY = 'vrm_debug_user_id'
const ASSISTANT_ACTOR_ID = 'assistant-riko'
const RECONNECT_WINDOW_MS = 180000
const RECONNECT_HINT_THRESHOLD = 3

import { generateDeviceFingerprint } from '../utils/deviceFingerprint.js'

const createDebugId = (prefix = 'id') => {
  const uuid = globalThis?.crypto?.randomUUID?.()
  const randomPart = uuid
    ? uuid.replace(/-/g, '').slice(0, 12)
    : `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
  return `${prefix}-${randomPart}`
}

const PERSONAS_STORAGE_KEY = 'vrm_personas'
const SELECTED_PERSONA_STORAGE_KEY = 'vrm_selected_persona_id'
const DEFAULT_PERSONA_ID = 'persona-default-riko'
const BUILTIN_PERSONA_IDS = Object.freeze({
  default: DEFAULT_PERSONA_ID,
  mentor: 'persona-sample-mentor',
  reviewer: 'persona-sample-reviewer',
  friend: 'persona-sample-friend',
})
const BUILTIN_PERSONA_ID_SET = new Set(Object.values(BUILTIN_PERSONA_IDS))

const BUILTIN_PERSONA_LOCALIZED = Object.freeze({
  en: {
    default: {
      title: 'Default Riko',
      description: 'Original Riko personality used by the app.',
      prompt: '',
    },
    mentor: {
      title: 'Calm Mentor',
      description: 'Patient teacher that explains clearly and keeps a supportive tone.',
      prompt:
        'You are a calm and practical mentor. Explain clearly, avoid drama, and guide the user step-by-step. Be friendly, direct, and solution-focused. Keep answers concise but complete.',
    },
    reviewer: {
      title: 'Strict Reviewer',
      description: 'Direct technical reviewer focused on correctness, risks, and tradeoffs.',
      prompt:
        'You are a strict technical reviewer. Focus on correctness, edge cases, and practical tradeoffs. Point out flaws quickly, propose concrete fixes, and avoid vague advice.',
    },
    friend: {
      title: 'Friendly Companion',
      description: 'Warm, casual, and upbeat conversational style with short responses.',
      prompt:
        'You are a warm and friendly AI companion. Keep a casual tone, use simple language, and give short helpful replies. Be kind and positive while staying useful.',
    },
  },
  uz: {
    default: {
      title: 'Standart Riko',
      description: 'Ilovadagi asl Riko personasi.',
      prompt: '',
    },
    mentor: {
      title: 'Sokin Mentor',
      description:
        "Sabrli o'qituvchi, tushunchalarni aniq tushuntiradi va qo'llab-quvvatlovchi ohangni ushlaydi.",
      prompt:
        "Siz sokin va amaliy mentorsiz. Tushuntirishni aniq bering, dramadan qoching va foydalanuvchini bosqichma-bosqich yo'naltiring. Do'stona, to'g'ridan-to'g'ri va yechimga qaratilgan bo'ling. Javoblarni qisqa, lekin to'liq bering.",
    },
    reviewer: {
      title: "Qattiqqo'l Tekshiruvchi",
      description:
        "To'g'rilik, xavflar va muvozanatlarga e'tibor beradigan to'g'ridan-to'g'ri texnik tekshiruvchi.",
      prompt:
        "Siz qattiqqo'l texnik tekshiruvchisiz. To'g'rilik, chekka holatlar va amaliy muvozanatlarga e'tibor qarating. Kamchiliklarni tez ayting, aniq tuzatishlarni taklif qiling va mavhum maslahatdan qoching.",
    },
    friend: {
      title: "Do'stona Hamroh",
      description: "Iliq, erkin va ko'tarinki uslubdagi, qisqa javob beruvchi suhbatdosh.",
      prompt:
        "Siz iliq va do'stona AI hamrohsiz. Erkin ohangni saqlang, sodda tilda yozing va qisqa, foydali javoblar bering. Mehribon va ijobiy bo'ling, lekin amaliy foydani yo'qotmang.",
    },
  },
  ru: {
    default: {
      title: 'Riko по умолчанию',
      description: 'Оригинальная персона Riko, используемая в приложении.',
      prompt: '',
    },
    mentor: {
      title: 'Спокойный Наставник',
      description: 'Терпеливый учитель, который объясняет понятно и сохраняет поддерживающий тон.',
      prompt:
        'Вы спокойный и практичный наставник. Объясняйте ясно, избегайте лишней драмы и ведите пользователя пошагово. Будьте дружелюбны, прямолинейны и ориентированы на решение. Отвечайте кратко, но полно.',
    },
    reviewer: {
      title: 'Строгий Ревьюер',
      description:
        'Прямой технический ревьюер, сфокусированный на корректности, рисках и компромиссах.',
      prompt:
        'Вы строгий технический ревьюер. Сосредотачивайтесь на корректности, пограничных случаях и практических компромиссах. Быстро указывайте на проблемы, предлагайте конкретные исправления и избегайте расплывчатых советов.',
    },
    friend: {
      title: 'Дружелюбный Спутник',
      description: 'Теплый, неформальный и бодрый собеседник с короткими ответами.',
      prompt:
        'Вы теплый и дружелюбный AI-собеседник. Держите разговорный тон, используйте простой язык и давайте короткие полезные ответы. Будьте доброжелательны и позитивны, оставаясь практичными.',
    },
  },
})

const BUILTIN_PERSONA_ENGLISH_PROMPTS = Object.freeze({
  [BUILTIN_PERSONA_IDS.mentor]:
    'You are a calm and practical mentor. Explain clearly, avoid drama, and guide the user step-by-step. Be friendly, direct, and solution-focused. Keep answers concise but complete.',
  [BUILTIN_PERSONA_IDS.reviewer]:
    'You are a strict technical reviewer. Focus on correctness, edge cases, and practical tradeoffs. Point out flaws quickly, propose concrete fixes, and avoid vague advice.',
  [BUILTIN_PERSONA_IDS.friend]:
    'You are a warm and friendly AI companion. Keep a casual tone, use simple language, and give short helpful replies. Be kind and positive while staying useful.',
})

const isBuiltinPersonaId = (personaId) => BUILTIN_PERSONA_ID_SET.has(String(personaId || ''))

const buildBuiltinPersonas = (language = selectedLanguage.value) => {
  const lang = resolveLanguage(language)
  const localized = BUILTIN_PERSONA_LOCALIZED[lang] || BUILTIN_PERSONA_LOCALIZED.en

  return [
    {
      id: BUILTIN_PERSONA_IDS.default,
      title: localized.default.title,
      description: localized.default.description,
      prompt: localized.default.prompt,
      promptEnglish: '',
      isDefault: true,
      isBuiltin: true,
    },
    {
      id: BUILTIN_PERSONA_IDS.mentor,
      title: localized.mentor.title,
      description: localized.mentor.description,
      prompt: localized.mentor.prompt,
      promptEnglish: BUILTIN_PERSONA_ENGLISH_PROMPTS[BUILTIN_PERSONA_IDS.mentor],
      isDefault: false,
      isBuiltin: true,
    },
    {
      id: BUILTIN_PERSONA_IDS.reviewer,
      title: localized.reviewer.title,
      description: localized.reviewer.description,
      prompt: localized.reviewer.prompt,
      promptEnglish: BUILTIN_PERSONA_ENGLISH_PROMPTS[BUILTIN_PERSONA_IDS.reviewer],
      isDefault: false,
      isBuiltin: true,
    },
    {
      id: BUILTIN_PERSONA_IDS.friend,
      title: localized.friend.title,
      description: localized.friend.description,
      prompt: localized.friend.prompt,
      promptEnglish: BUILTIN_PERSONA_ENGLISH_PROMPTS[BUILTIN_PERSONA_IDS.friend],
      isDefault: false,
      isBuiltin: true,
    },
  ]
}

const sanitizePersonaText = (value, maxLength) => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (normalized.length <= maxLength) return normalized
  return normalized.slice(0, maxLength).trim()
}

const normalizeStoredPersona = (raw) => {
  const id = typeof raw?.id === 'string' ? raw.id.trim() : ''
  const title = sanitizePersonaText(raw?.title, 60)
  const description = sanitizePersonaText(raw?.description, 180)
  const prompt = sanitizePersonaText(raw?.prompt, 5000)
  if (!id || !title || !description || !prompt) return null
  if (id === DEFAULT_PERSONA_ID || isBuiltinPersonaId(id)) return null
  return {
    id,
    title,
    description,
    prompt,
    isDefault: false,
    isBuiltin: false,
    promptEnglish: '',
  }
}

const mergeBuiltinsWithCustom = (customPersonas = [], language = selectedLanguage.value) => {
  const normalizedCustom = customPersonas
    .filter((item) => item && !isBuiltinPersonaId(item.id))
    .map((item) => ({
      ...item,
      isDefault: false,
      isBuiltin: false,
      promptEnglish: '',
    }))

  return [...buildBuiltinPersonas(language), ...normalizedCustom]
}

const loadPersonasFromStorage = (language = selectedLanguage.value) => {
  try {
    const raw = localStorage.getItem(PERSONAS_STORAGE_KEY)
    if (!raw) return mergeBuiltinsWithCustom([], language)
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return mergeBuiltinsWithCustom([], language)
    const normalized = parsed
      .map((item) => normalizeStoredPersona(item))
      .filter((item) => item && !isBuiltinPersonaId(item.id))
    return mergeBuiltinsWithCustom(normalized, language)
  } catch {
    return mergeBuiltinsWithCustom([], language)
  }
}

const personas = ref(loadPersonasFromStorage(selectedLanguage.value))
const selectedPersonaId = ref(
  localStorage.getItem(SELECTED_PERSONA_STORAGE_KEY) || DEFAULT_PERSONA_ID,
)
if (!personas.value.some((persona) => persona.id === selectedPersonaId.value)) {
  selectedPersonaId.value = DEFAULT_PERSONA_ID
}

const selectedPersona = computed(
  () =>
    personas.value.find((persona) => persona.id === selectedPersonaId.value) ||
    personas.value[0] ||
    buildBuiltinPersonas(selectedLanguage.value)[0],
)

const selectedPersonaPrompt = computed(() => {
  if (!selectedPersona.value || selectedPersona.value.isDefault) return ''
  const englishPrompt = sanitizePersonaText(selectedPersona.value.promptEnglish, 5000)
  if (englishPrompt) return englishPrompt
  return sanitizePersonaText(selectedPersona.value.prompt, 5000)
})

const userDebugId = ref(localStorage.getItem(DEBUG_USER_ID_STORAGE_KEY) || '')
const sessionDebugId = ref(createDebugId('sess'))

// Initialize persistent ID
generateDeviceFingerprint().then((fp) => {
  userDebugId.value = fp
  localStorage.setItem(DEBUG_USER_ID_STORAGE_KEY, fp)
  if (system.value?.telegramManager) {
    system.value.telegramManager.setDebugIdentity({
      userId: fp,
    })
  }
})

const stripControlCharacters = (value) => {
  let output = ''
  for (let i = 0; i < value.length; i += 1) {
    const code = value.charCodeAt(i)
    if (code === 9 || code === 10 || code === 13 || (code >= 32 && code !== 127)) {
      output += value[i]
    }
  }
  return output
}

const sanitizeTranscriptText = (value) => {
  if (typeof value !== 'string') return ''
  return stripControlCharacters(value)
    .replace(/<ctrl\d+>/gi, '')
    .replace(/<[^>]*ctrl[^>]*>/gi, '')
    .replace(/<noise>/gi, '')
    .replace(/<silence>/gi, '')
    .replace(/set_expression\s*\([^)]*\)/gi, '')
    .replace(/set_expression:[a-zA-Z0-9_]+/gi, '')
    .replace(/expression:\s*[a-zA-Z0-9_]+/gi, '')
    .replace(/\{[^{}]*"name"\s*:\s*"set_expression"[^{}]*(\{[^{}]*\})*[^{}]*\}/gi, '')
    .replace(/\{"name"\s*:\s*"set_expression"[^}]*\}/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

const trimHistory = (items) => {
  if (!Array.isArray(items)) return []
  return items.slice(-MAX_CHAT_HISTORY_ITEMS)
}

const createHistoryEntry = (role, text, overrides = {}) => {
  const normalizedRole = role === 'user' ? 'user' : 'model'
  return {
    id: typeof overrides.id === 'string' && overrides.id ? overrides.id : createDebugId('msg'),
    role: normalizedRole,
    text,
    timestamp: Number.isFinite(Number(overrides.timestamp))
      ? Number(overrides.timestamp)
      : Date.now(),
    actorId:
      typeof overrides.actorId === 'string' && overrides.actorId
        ? overrides.actorId
        : normalizedRole === 'user'
          ? userDebugId.value
          : ASSISTANT_ACTOR_ID,
    userId:
      typeof overrides.userId === 'string' && overrides.userId
        ? overrides.userId
        : userDebugId.value,
    sessionId:
      typeof overrides.sessionId === 'string' && overrides.sessionId
        ? overrides.sessionId
        : sessionDebugId.value,
  }
}

const findHistoryEntryIndexById = (items, entryId) => {
  const normalizedEntryId = typeof entryId === 'string' ? entryId.trim() : ''
  if (!normalizedEntryId || !Array.isArray(items)) return -1
  return items.findIndex((item) => item?.id === normalizedEntryId)
}

const updateHistoryEntryText = (entry, role, text) => {
  const normalizedRole = role === 'user' ? 'user' : 'model'
  entry.role = normalizedRole
  entry.text = text
  entry.timestamp = Date.now()
  if (!entry.id) entry.id = createDebugId('msg')
  if (!entry.actorId) {
    entry.actorId = normalizedRole === 'user' ? userDebugId.value : ASSISTANT_ACTOR_ID
  }
  if (!entry.userId) entry.userId = userDebugId.value
  if (!entry.sessionId) entry.sessionId = sessionDebugId.value
  return entry
}

const upsertGeminiTranscriptHistory = (items, role, text, isFinal) => {
  const normalizedRole = role === 'user' ? 'user' : 'model'
  const lastItem = items.length > 0 ? items[items.length - 1] : null

  // If the speaker role changed compared to the last message in history,
  // the previous speaker's turn has ended — start a brand new message bubble!
  if (normalizedRole === 'user') {
    activeModelTranscriptEntryId.value = null
    if (lastItem && lastItem.role !== 'user') {
      activeUserTranscriptEntryId.value = null
    }
  } else {
    activeUserTranscriptEntryId.value = null
    if (lastItem && lastItem.role !== 'model') {
      activeModelTranscriptEntryId.value = null
    }
  }

  const activeEntryIdRef =
    normalizedRole === 'user' ? activeUserTranscriptEntryId : activeModelTranscriptEntryId

  let entryIndex = findHistoryEntryIndexById(items, activeEntryIdRef.value)

  // Safety guard: Never mutate an older message in history that is not at the very end
  if (entryIndex >= 0 && entryIndex !== items.length - 1) {
    entryIndex = -1
    activeEntryIdRef.value = null
  }

  if (entryIndex < 0) {
    const entry = createHistoryEntry(normalizedRole, text)
    items.push(entry)
    activeEntryIdRef.value = entry.id
  } else {
    const entry = items[entryIndex]
    updateHistoryEntryText(entry, normalizedRole, text)
    activeEntryIdRef.value = entry.id
  }

  if (isFinal) {
    activeEntryIdRef.value = null
  }

  return trimHistory(items)
}

const normalizeStoredHistory = (items) => {
  if (!Array.isArray(items)) return []
  const normalized = []
  for (const rawItem of items) {
    const role = rawItem?.role === 'user' ? 'user' : 'model'
    const text = sanitizeTranscriptText(rawItem?.text || '')
    if (!text) continue
    normalized.push(createHistoryEntry(role, text, rawItem || {}))
  }
  return trimHistory(normalized)
}

try {
  const saved = localStorage.getItem('vrm_chat_history')
  if (saved) {
    chatHistory.value = normalizeStoredHistory(JSON.parse(saved))
  }
} catch {
  chatHistory.value = []
}

watch(avatarScale, (val) => {
  localStorage.setItem('vrm_avatar_scale', val.toString())
  if (system.value) system.value.setAvatarScale(val)
})

watch(backgroundColor, (value) => {
  const normalized = normalizeHexColor(value, '#111827')
  if (normalized !== value) {
    backgroundColor.value = normalized
    return
  }
  localStorage.setItem(BACKGROUND_COLOR_STORAGE_KEY, normalized)
  if (system.value) {
    system.value.setBackgroundColor(normalized)
  }
})

watch(lookAtUserEnabled, (value) => {
  localStorage.setItem('vrm_look_at_user', value ? 'true' : 'false')
  if (system.value) {
    system.value.setLookAtOptions({
      user: value,
      screen: lookAtScreenEnabled.value,
    })
  }
  showToast(
    t('toasts.lookAtUserTitle'),
    value ? t('toasts.lookAtUserEnabled') : t('toasts.lookAtUserDisabled'),
    'info',
  )
})

watch(lookAtScreenEnabled, (value) => {
  localStorage.setItem('vrm_look_at_screen', value ? 'true' : 'false')
  if (system.value) {
    system.value.setLookAtOptions({
      user: lookAtUserEnabled.value,
      screen: value,
    })
  }
  showToast(
    t('toasts.lookAtScreenTitle'),
    value ? t('toasts.lookAtScreenEnabled') : t('toasts.lookAtScreenDisabled'),
    'info',
  )
})

watch(subtitlesEnabled, (val) => {
  localStorage.setItem('vrm_subtitles_enabled', val ? 'true' : 'false')
})

watch(subtitlesPreset, (val) => {
  localStorage.setItem('vrm_subtitles_preset', val)
})

watch(subtitlesSize, (val) => {
  localStorage.setItem('vrm_subtitles_size', val)
})

watch(subtitlesSpeed, (val) => {
  localStorage.setItem('vrm_subtitles_speed', val)
})

watch(subtitlesPosition, (val) => {
  localStorage.setItem('vrm_subtitles_position', val)
})

watch(selectedLanguage, async (value, previous) => {
  const resolved = resolveLanguage(value)
  if (resolved !== value) {
    selectedLanguage.value = resolved
    return
  }

  localStorage.setItem(UI_LANGUAGE_STORAGE_KEY, resolved)
  const customPersonas = personas.value.filter(
    (persona) => !persona.isBuiltin && !isBuiltinPersonaId(persona.id),
  )
  personas.value = mergeBuiltinsWithCustom(customPersonas, resolved)

  if (!previous || previous === resolved) return

  if (isConnected.value && system.value?.aiClient?.isSessionOpen) {
    try {
      await system.value.aiClient.sendText(buildAiRuntimeLanguageHint(resolved), true)
      showToast(t('toasts.languageChangedTitle'), t('toasts.languageChangedMessage'), 'info')
    } catch (error) {
      console.warn('Failed to send runtime language hint', error)
      showToast(
        t('toasts.languageChangeFailedTitle'),
        t('toasts.languageChangeFailedMessage'),
        'warning',
      )
    }
  }
})

const handleVoiceChange = async (voiceName) => {
  selectedVoice.value = voiceName
  localStorage.setItem('vrm_selected_voice', voiceName)
  showToast(
    t('toasts.voiceChangedTitle'),
    t('toasts.voiceChangedMessage', { voiceName }),
    'success'
  )

  if (isConnected.value || isConnecting.value) {
    if (system.value?.aiClient) {
      system.value.aiClient.disconnect('Voice changed by user')
    }
    isConnected.value = false
    isConnecting.value = false
    
    // Wait briefly and reconnect automatically
    setTimeout(async () => {
      await proceedToConnect()
    }, 1000)
  }
}

watch(
  chatHistory,
  (val) => {
    const trimmed = trimHistory(val)
    if (trimmed.length !== val.length) {
      chatHistory.value = trimmed
      // recursive entry will trigger the update below
      return
    }
    localStorage.setItem('vrm_chat_history', JSON.stringify(trimmed))

    // Update Telegram debug info with message count
    if (system.value?.telegramManager) {
      system.value.telegramManager.setDebugIdentity({
        messageCount: trimmed.length,
      })
    }
  },
  { deep: true },
)

watch(
  personas,
  (list) => {
    const sanitized = list
      .filter(
        (persona) => !persona.isDefault && !persona.isBuiltin && !isBuiltinPersonaId(persona.id),
      )
      .map((persona) => ({
        id: persona.id,
        title: sanitizePersonaText(persona.title, 60),
        description: sanitizePersonaText(persona.description, 180),
        prompt: sanitizePersonaText(persona.prompt, 5000),
      }))

    localStorage.setItem(PERSONAS_STORAGE_KEY, JSON.stringify(sanitized))

    if (!list.some((persona) => persona.id === selectedPersonaId.value)) {
      selectedPersonaId.value = DEFAULT_PERSONA_ID
    }
  },
  { deep: true },
)

watch(selectedPersonaId, (nextId) => {
  const exists = personas.value.some((persona) => persona.id === nextId)
  const resolvedId = exists ? nextId : DEFAULT_PERSONA_ID
  if (resolvedId !== nextId) {
    selectedPersonaId.value = resolvedId
    return
  }
  localStorage.setItem(SELECTED_PERSONA_STORAGE_KEY, resolvedId)
})

let cleanupSystem = null
let fpsInterval = null
let dragDepth = 0
let toastCounter = 0
let reconnectEventTimestamps = []
let lastReconnectHintAt = 0

const stopTimerTicker = () => {
  if (timerTickInterval) {
    clearInterval(timerTickInterval)
    timerTickInterval = null
  }
  if (timerAutoMinimizeTimeout) {
    clearTimeout(timerAutoMinimizeTimeout)
    timerAutoMinimizeTimeout = null
  }
  if (timerExpiryDismissTimeout) {
    clearTimeout(timerExpiryDismissTimeout)
    timerExpiryDismissTimeout = null
  }
  if (timerPendingFallbackTimeout) {
    clearTimeout(timerPendingFallbackTimeout)
    timerPendingFallbackTimeout = null
  }
}

const dismissTimer = () => {
  stopTimerTicker()
  pendingTimerStart.value = null
  timerVisible.value = false
  timerMinimized.value = true
  timerLabel.value = 'Timer'
  timerTotalMs.value = 0
  timerEndAtMs.value = 0
  timerNowMs.value = Date.now()
  timerNotified.value = false
  timerExpiredOverlayVisible.value = false
}

const toggleTimerMinimize = () => {
  if (!timerVisible.value) return
  timerMinimized.value = !timerMinimized.value
}

const startFloatingTimer = (durationSeconds, label = 'Timer') => {
  const seconds = Math.max(0, Math.floor(Number(durationSeconds) || 0))
  if (seconds <= 0) {
    dismissTimer()
    return
  }

  stopTimerTicker()

  const safeLabel = typeof label === 'string' && label.trim() ? label.trim() : 'Timer'
  const now = Date.now()

  timerVisible.value = true
  timerMinimized.value = false
  timerLabel.value = safeLabel
  timerTotalMs.value = seconds * 1000
  timerEndAtMs.value = now + timerTotalMs.value
  timerNowMs.value = now
  timerNotified.value = false
  timerExpiredOverlayVisible.value = false

  timerTickInterval = setInterval(() => {
    timerNowMs.value = Date.now()
  }, 200)

  timerAutoMinimizeTimeout = setTimeout(() => {
    timerMinimized.value = true
  }, 1200)
}

const handleAiTimerStart = (payload = {}) => {
  const durationSeconds =
    payload?.duration_seconds ?? payload?.durationSeconds ?? payload?.seconds ?? payload?.duration
  const safeLabel = payload?.label || payload?.title || 'Timer'

  pendingTimerStart.value = { durationSeconds, label: safeLabel }

  if (timerPendingFallbackTimeout) {
    clearTimeout(timerPendingFallbackTimeout)
    timerPendingFallbackTimeout = null
  }

  if (!assistantSpeaking.value) {
    timerPendingFallbackTimeout = setTimeout(() => {
      timerPendingFallbackTimeout = null
      if (assistantSpeaking.value) return
      if (!pendingTimerStart.value) return
      handleAssistantSpeechEnd()
    }, 2500)
  }
}

const handleAiTimerCancel = () => {
  dismissTimer()
}

// IELTS Cue Card Handlers
const toggleCueCard = () => {
  cueCardVisible.value = !cueCardVisible.value
}

const dismissCueCard = () => {
  cueCardVisible.value = false
}

const handleAiCueCardShow = (payload = {}) => {
  cueCardTitle.value = payload?.topic || payload?.title || ''
  cueCardPrompt.value = payload?.prompt || 'You should say:'
  cueCardItems.value = Array.isArray(payload?.bullet_points)
    ? payload.bullet_points
    : Array.isArray(payload?.items)
      ? payload.items
      : []
  cueCardFooter.value = payload?.footer || ''
  cueCardPrepSeconds.value = Number(payload?.prep_time_seconds) || 60
  cueCardSpeakSeconds.value = Number(payload?.speak_time_seconds) || 120
  cueCardVisible.value = true
}

const handleAiCueCardDismiss = () => {
  dismissCueCard()
}

const handleCueCardPhaseChange = (phase) => {
  if (phase === 'speak') {
    showToast('IELTS Speaking Part 2', 'Preparation time completed! Start your 2-minute speech.', 'info')
  }
}

const handleCueCardTimeExpired = (phase) => {
  if (phase === 'speak') {
    showToast('IELTS Speaking Part 2', '2-Minute speaking time reached! Well done.', 'success')
  }
}

const handleAssistantSpeechEnd = () => {
  if (timerPendingFallbackTimeout) {
    clearTimeout(timerPendingFallbackTimeout)
    timerPendingFallbackTimeout = null
  }

  const pending = pendingTimerStart.value
  if (!pending) return
  pendingTimerStart.value = null
  startFloatingTimer(pending.durationSeconds, pending.label)
}

watch(timerRemainingSeconds, async (secondsLeft) => {
  if (!timerVisible.value) return

  if (secondsLeft <= 0) {
    stopTimerTicker()
    timerNowMs.value = timerEndAtMs.value
    timerMinimized.value = false
    timerExpiredOverlayVisible.value = true

    timerExpiryDismissTimeout = setTimeout(() => {
      dismissTimer()
    }, 3000)
    return
  }

  if (timerExpiredOverlayVisible.value) {
    timerExpiredOverlayVisible.value = false
  }

  if (timerNotified.value) return
  if (secondsLeft > 2) return

  timerNotified.value = true

  if (isConnected.value && system.value?.aiClient?.isSessionOpen) {
    try {
      await system.value.aiClient.sendText('Time is up.', true)
    } catch (error) {
      console.warn('Failed to notify AI about timer expiry', error)
    }
  }
})

const LOADER_TEXTS = Object.freeze({
  en: {
    'Booting Engine': 'Booting Engine',
    'Preparing workspace': 'Preparing workspace',
    'Preparing managers': 'Preparing managers',
    'Initializing client': 'Initializing client',
    'Reading Configuration': 'Reading Configuration',
    'Resolving API and model settings': 'Resolving API and model settings',
    'Initializing Scene': 'Initializing Scene',
    'Setting up renderer and camera': 'Setting up renderer and camera',
    'Initializing Audio': 'Initializing Audio',
    'Preparing playback pipeline': 'Preparing playback pipeline',
    'Initializing Vision': 'Initializing Vision',
    'Preparing camera and capture buffers': 'Preparing camera and capture buffers',
    'Loading Avatar': 'Loading Avatar',
    'Trying local model asset': 'Trying local model asset',
    'Local model unavailable, trying remote source':
      'Local model unavailable, trying remote source',
    'Avatar Loaded': 'Avatar Loaded',
    'Preparing animation system': 'Preparing animation system',
    'Loading Core Animation': 'Loading Core Animation',
    'Avatar Missing': 'Avatar Missing',
    'Default model unavailable. Upload a .vrm file to continue':
      'Default model unavailable. Upload a .vrm file to continue',
    'Finalizing Scene': 'Finalizing Scene',
    'Starting render loop': 'Starting render loop',
    'System Ready': 'System Ready',
    'All subsystems online': 'All subsystems online',
    'Avatar online': 'Avatar online',
    'Restored User Avatar': 'Restored User Avatar',
    'Upload a VRM model to continue': 'Upload a VRM model to continue',
    'Initialization Failed': 'Initialization Failed',
  },
  uz: {
    'Booting Engine': 'Dvigatel ishga tushmoqda',
    'Preparing workspace': 'Ish muhiti tayyorlanmoqda',
    'Preparing managers': 'Menejerlar tayyorlanmoqda',
    'Initializing client': 'Mijoz ishga tushirilmoqda',
    'Reading Configuration': "Konfiguratsiya o'qilmoqda",
    'Resolving API and model settings': 'API va model sozlamalari aniqlanmoqda',
    'Initializing Scene': 'Sahna ishga tushirilmoqda',
    'Setting up renderer and camera': 'Render va kamera sozlanmoqda',
    'Initializing Audio': 'Audio ishga tushirilmoqda',
    'Preparing playback pipeline': 'Ijro pipeline tayyorlanmoqda',
    'Initializing Vision': "Ko'rish tizimi ishga tushirilmoqda",
    'Preparing camera and capture buffers': 'Kamera va capture buferlari tayyorlanmoqda',
    'Loading Avatar': 'Avatar yuklanmoqda',
    'Trying local model asset': 'Lokal model fayli tekshirilmoqda',
    'Local model unavailable, trying remote source':
      "Lokal model topilmadi, masofaviy manba sinovdan o'tmoqda",
    'Avatar Loaded': 'Avatar yuklandi',
    'Preparing animation system': 'Animatsiya tizimi tayyorlanmoqda',
    'Loading Core Animation': 'Asosiy animatsiyalar yuklanmoqda',
    'Avatar Missing': 'Avatar topilmadi',
    'Default model unavailable. Upload a .vrm file to continue':
      'Standart model topilmadi. Davom etish uchun .vrm fayl yuklang',
    'Finalizing Scene': 'Sahna yakunlanmoqda',
    'Starting render loop': 'Render tsikli ishga tushirilmoqda',
    'System Ready': 'Tizim tayyor',
    'All subsystems online': 'Barcha quyi tizimlar faol',
    'Avatar online': 'Avatar faol',
    'Restored User Avatar': 'Foydalanuvchi avatari tiklandi',
    'Upload a VRM model to continue': 'Davom etish uchun VRM model yuklang',
    'Initialization Failed': 'Ishga tushirish muvaffaqiyatsiz',
  },
  ru: {
    'Booting Engine': 'Запуск движка',
    'Preparing workspace': 'Подготовка рабочего пространства',
    'Preparing managers': 'Подготовка менеджеров',
    'Initializing client': 'Инициализация клиента',
    'Reading Configuration': 'Чтение конфигурации',
    'Resolving API and model settings': 'Определение настроек API и модели',
    'Initializing Scene': 'Инициализация сцены',
    'Setting up renderer and camera': 'Настройка рендера и камеры',
    'Initializing Audio': 'Инициализация аудио',
    'Preparing playback pipeline': 'Подготовка аудио-конвейера',
    'Initializing Vision': 'Инициализация визуального модуля',
    'Preparing camera and capture buffers': 'Подготовка камеры и буферов захвата',
    'Loading Avatar': 'Загрузка аватара',
    'Trying local model asset': 'Пробуем локальную модель',
    'Local model unavailable, trying remote source':
      'Локальная модель недоступна, пробуем удаленный источник',
    'Avatar Loaded': 'Аватар загружен',
    'Preparing animation system': 'Подготовка системы анимации',
    'Loading Core Animation': 'Загрузка основных анимаций',
    'Avatar Missing': 'Аватар не найден',
    'Default model unavailable. Upload a .vrm file to continue':
      'Модель по умолчанию недоступна. Загрузите .vrm файл для продолжения',
    'Finalizing Scene': 'Финализация сцены',
    'Starting render loop': 'Запуск цикла рендера',
    'System Ready': 'Система готова',
    'All subsystems online': 'Все подсистемы онлайн',
    'Avatar online': 'Аватар онлайн',
    'Restored User Avatar': 'Аватар пользователя восстановлен',
    'Upload a VRM model to continue': 'Загрузите VRM модель для продолжения',
    'Initialization Failed': 'Ошибка инициализации',
  },
})

const localizeLoaderText = (value) => {
  const normalized = typeof value === 'string' ? value.trim() : ''
  if (!normalized) return normalized
  const lang = resolveLanguage(selectedLanguage.value)
  return LOADER_TEXTS[lang]?.[normalized] || normalized
}

const updateLoadingState = (next = {}) => {
  const progress = Number.isFinite(next.progress) ? next.progress : loadingState.value.progress
  loadingState.value = {
    progress: Math.max(loadingState.value.progress, Math.min(100, Math.round(progress))),
    stage: localizeLoaderText(next.stage || loadingState.value.stage),
    detail:
      next.detail === undefined || next.detail === null
        ? localizeLoaderText(loadingState.value.detail)
        : localizeLoaderText(next.detail),
  }
}

const selectedModelKey = ref(localStorage.getItem('vrm_selected_model_key') || null)

onMounted(async () => {
  if (!canvasRef.value) return

  updateLoadingState({ progress: 8, stage: 'Booting Engine', detail: 'Initializing client' })

  try {
    // Dynamic import to reduce initial bundle size
    const { createVRMChatSystem } = await import('../../managers/index.js')

    const initialUserName = (localStorage.getItem('vrm_user_name') || '').trim()
    const sys = await createVRMChatSystem(canvasRef.value, {
      onLoadProgress: updateLoadingState,
      onAssistantSpeechStart: () => {
        assistantSpeaking.value = true
        if (timerPendingFallbackTimeout) {
          clearTimeout(timerPendingFallbackTimeout)
          timerPendingFallbackTimeout = null
        }
      },
      onAssistantSpeechEnd: (meta = {}) => {
        assistantSpeaking.value = false
        assistantAudioProgress.value = { isPlaying: false, progress: 1, elapsed: 0, totalDuration: 0 }
        if (timerPendingFallbackTimeout) {
          clearTimeout(timerPendingFallbackTimeout)
          timerPendingFallbackTimeout = null
        }
        if (meta?.interrupted) {
          pendingTimerStart.value = null
          return
        }
        handleAssistantSpeechEnd()
      },
      onAssistantSpeechProgress: (data) => {
        if (data) {
          assistantAudioProgress.value = data
        }
      },
      onActiveSubtitle: (text) => {
        currentSubtitleText.value = text
      },
      debugIdentity: {
        userId: userDebugId.value,
        sessionId: sessionDebugId.value,
        userName: initialUserName,
      },
    })

    system.value = sys
    window.vrmSystem = sys
    cleanupSystem = sys.cleanup
    sys.setBackgroundColor(backgroundColor.value)
    sys.setLookAtOptions({
      user: lookAtUserEnabled.value,
      screen: lookAtScreenEnabled.value,
    })

    sys.visionManager.onStateChange = (isActive) => {
      isSharingScreen.value = isActive
      showToast(
        t('toasts.screenShareTitle'),
        isActive ? t('toasts.screenShareActive') : t('toasts.screenShareStopped'),
        isActive ? 'success' : 'info',
      )
    }

    // Refresh models first to populate availableModels
    await refreshModels()

    if (sys.vrm) {
      // If vrm is already loaded by default logic in createVRMChatSystem, strictly speaking we might want to override it
      // if the user has a different preferred model.
      // However, createVRMChatSystem likely loads the default model hardcoded.
      // We should check our preference.

      if (selectedModelKey.value) {
        // Verify if this key still exists in available models
        const exists = availableModels.value.find((m) => m.key === selectedModelKey.value)
        if (exists) {
          console.log('Loading saved model preference:', selectedModelKey.value)
          await system.value.loadNewVRM(selectedModelKey.value)
        } else {
          // Key expired or deleted? Revert to null
          selectedModelKey.value = null
          localStorage.removeItem('vrm_selected_model_key')
        }
      }

      systemReady.value = true
      sys.setAvatarScale(avatarScale.value)
      updateLoadingState({ progress: 100, stage: 'System Ready', detail: 'Avatar online' })
    } else {
      if (selectedModelKey.value) {
        try {
          await system.value.loadNewVRM(selectedModelKey.value)
          systemReady.value = true
          sys.setAvatarScale(avatarScale.value)
          updateLoadingState({
            progress: 100,
            stage: 'System Ready',
            detail: 'Restored User Avatar',
          })
        } catch (e) {
          console.warn('Failed to restore saved model', e)
          systemReady.value = true
          updateLoadingState({
            progress: 100,
            stage: 'System Ready',
            detail: 'Upload a VRM model to continue',
          })
          showToast(t('toasts.avatarMissingTitle'), t('toasts.avatarMissingSaved'), 'info')
        }
      } else {
        systemReady.value = true
        updateLoadingState({
          progress: 100,
          stage: 'System Ready',
          detail: 'Upload a VRM model to continue',
        })
        showToast(t('toasts.avatarMissingTitle'), t('toasts.avatarMissingDefault'), 'info')
      }
    }
  } catch (error) {
    console.error(error)
    updateLoadingState({ progress: 100, stage: 'Initialization Failed', detail: error.message })
    showToast(t('toasts.initializationFailedTitle'), error.message, 'error')
  }

  fpsInterval = setInterval(() => {
    fps.value = system.value?.sceneManager?.getCurrentFps?.() || 0
  }, 1000)
})

onBeforeUnmount(() => {
  dismissTimer()
  if (fpsInterval) clearInterval(fpsInterval)
  if (cleanupSystem) cleanupSystem()
})

function showToast(title, message, type = 'info') {
  toastCounter += 1
  const id = toastCounter
  const normalizedType = ['success', 'error', 'info', 'warning'].includes(type) ? type : 'info'

  toasts.value.push({
    id,
    title,
    message,
    type: normalizedType,
  })

  setTimeout(() => {
    toasts.value = toasts.value.filter((toast) => toast.id !== id)
  }, 4200)
}

const trackReconnectIssue = () => {
  const now = Date.now()
  reconnectEventTimestamps = reconnectEventTimestamps.filter(
    (timestamp) => now - timestamp <= RECONNECT_WINDOW_MS,
  )
  reconnectEventTimestamps.push(now)

  const shouldShowHint =
    reconnectEventTimestamps.length >= RECONNECT_HINT_THRESHOLD &&
    now - lastReconnectHintAt > RECONNECT_WINDOW_MS / 2

  if (shouldShowHint) {
    lastReconnectHintAt = now
    showToast(t('toasts.performanceTipTitle'), t('toasts.performanceTipMessage'), 'info')
  }
}

const openPersonaManager = () => {
  showSettings.value = false
  showPersonaManager.value = true
}

const toggleChatPanel = () => {
  const next = !showChat.value
  showChat.value = next
  if (next) {
    showSettings.value = false
    showPersonaManager.value = false
  }
}

const toggleSettingsPanel = () => {
  const next = !showSettings.value
  showSettings.value = next
  if (next) {
    showChat.value = false
    showPersonaManager.value = false
  }
}

const toggleConnection = async () => {
  if (!system.value || !systemReady.value) return
  if (isConnecting.value) return

  if (!system.value.vrm) {
    showToast(t('toasts.noAvatarTitle'), t('toasts.noAvatarMessage'), 'error')
    return
  }

  if (isConnected.value) {
    system.value.aiClient.disconnect('User ended call')
    isConnected.value = false
    return
  }

  await proceedToConnect()
}

const proceedToConnect = async () => {
  showToast(t('toasts.connectingTitle'), t('toasts.connectingMessage'), 'info')
  isConnecting.value = true

  const tokenProvider = async () => {
    const res = await fetch('/api/get-token')
    if (!res.ok) {
      throw new Error(`Token generation failed: ${res.statusText} (${res.status})`)
    }
    const data = await res.json()
    if (!data.token) {
      throw new Error('No token returned from server')
    }
    return data.token
  }

  try {
    await system.value.connect(
      chatHistory.value,
      {
        onUserNameSet: (name) => {
          localStorage.setItem('vrm_user_name', name)
          system.value?.telegramManager?.setDebugIdentity({
            userName: name,
            userId: userDebugId.value,
            sessionId: sessionDebugId.value,
          })
        },
        onMemorySaved: (key, value) => {
          const memories = JSON.parse(localStorage.getItem('vrm_user_memories') || '{}')
          memories[key] = value
          localStorage.setItem('vrm_user_memories', JSON.stringify(memories))
        },
        onMemoryDeleted: (key) => {
          const memories = JSON.parse(localStorage.getItem('vrm_user_memories') || '{}')
          delete memories[key]
          localStorage.setItem('vrm_user_memories', JSON.stringify(memories))
        },
        onSystemMessage: (title, msg, type) => showToast(title, msg, type),
        onTimerStart: handleAiTimerStart,
        onTimerCancel: handleAiTimerCancel,
        onCueCardShow: handleAiCueCardShow,
        onCueCardDismiss: handleAiCueCardDismiss,
        onSetBackgroundImage: (url) => {
          if (system.value) {
            system.value.setBackgroundImage(url)
          }
        },
        onLookAtOptionsChange: (nextOptions = {}) => {
          if (typeof nextOptions.user === 'boolean') {
            lookAtUserEnabled.value = nextOptions.user
          }
          if (typeof nextOptions.screen === 'boolean') {
            lookAtScreenEnabled.value = nextOptions.screen
          }
        },
        onDisconnect: (reason) => {
          activeUserTranscriptEntryId.value = null
          activeModelTranscriptEntryId.value = null
          isConnected.value = false
          currentSubtitleText.value = ''
          trackReconnectIssue()
          
          if (reason === 'AI ended the conversation') {
            const announcement = t('toasts.aiEndedCall')
            showToast(t('toasts.callEndedTitle'), announcement, 'info')
            
            try {
              if (window.speechSynthesis) {
                window.speechSynthesis.cancel()
                const utterance = new SpeechSynthesisUtterance(announcement)
                const resolvedLang = selectedLanguage.value || 'en'
                if (resolvedLang === 'uz') {
                  utterance.lang = 'uz-UZ'
                } else if (resolvedLang === 'ru') {
                  utterance.lang = 'ru-RU'
                } else {
                  utterance.lang = 'en-US'
                }
                utterance.volume = 0.8
                utterance.rate = 1.0
                window.speechSynthesis.speak(utterance)
              }
            } catch (e) {
              console.warn('Speech synthesis failed', e)
            }
          } else {
            showToast(t('toasts.callEndedTitle'), reason, 'info')
          }
        },
        onTranscription: (role, text, isFinal, meta = {}) => {
          const normalizedRole = role === 'user' ? 'user' : 'model'
          const normalizedText = sanitizeTranscriptText(text)
          if (!normalizedText) return

          chatHistory.value = upsertGeminiTranscriptHistory(
            [...chatHistory.value],
            normalizedRole,
            normalizedText,
            isFinal,
          )
        },
        getHistory: () => chatHistory.value,
      },
      '',
      true,
      localStorage.getItem('vrm_user_name'),
      {
        userId: userDebugId.value,
        sessionId: sessionDebugId.value,
        userName: (localStorage.getItem('vrm_user_name') || '').trim(),
      },
      selectedPersonaPrompt.value,
      selectedLanguage.value,
      tokenProvider,
    )

    isConnected.value = true
  } catch (error) {
    console.error(error)
    trackReconnectIssue()
    showToast(t('toasts.connectionFailedTitle'), error.message, 'error')
    isConnected.value = false
  } finally {
    isConnecting.value = false
  }
}

const toggleScreenShare = async () => {
  if (!system.value || !systemReady.value) return

  if (isSharingScreen.value) {
    await system.value.stopScreenShare()
    return
  }

  try {
    const started = await system.value.startScreenShare()
    if (!started) {
      showToast(t('toasts.screenShareTitle'), t('toasts.screenShareCouldNotStart'), 'error')
    }
  } catch {
    showToast(t('toasts.screenShareTitle'), t('toasts.screenSharePermissionBlocked'), 'error')
  }
}

const clearHistory = () => {
  activeUserTranscriptEntryId.value = null
  activeModelTranscriptEntryId.value = null
  system.value?.aiClient?.clearSessionResumption?.()
  chatHistory.value = []
  localStorage.removeItem('vrm_chat_history')

  if (isConnected.value) {
    system.value?.aiClient?.disconnect?.('Chat history cleared by user')
    isConnected.value = false
  }
}

const normalizePersonaPayload = (payload = {}) => {
  return {
    title: sanitizePersonaText(payload?.title, 60),
    description: sanitizePersonaText(payload?.description, 180),
    prompt: sanitizePersonaText(payload?.prompt, 5000),
  }
}

const handlePersonaSelect = (personaId) => {
  if (typeof personaId !== 'string' || !personaId.trim()) return
  const exists = personas.value.some((persona) => persona.id === personaId)
  if (!exists) return
  selectedPersonaId.value = personaId
  if (isConnected.value) {
    showToast(t('toasts.personaQueuedTitle'), t('toasts.personaQueuedMessage'), 'info')
  }
}

const handlePersonaCreate = (payload) => {
  const next = normalizePersonaPayload(payload)
  if (!next.title || !next.description || !next.prompt) {
    showToast(t('toasts.personaErrorTitle'), t('toasts.personaRequiredFields'), 'error')
    return
  }

  const createdPersona = {
    id: createDebugId('persona'),
    title: next.title,
    description: next.description,
    prompt: next.prompt,
    isDefault: false,
    isBuiltin: false,
    promptEnglish: '',
  }

  personas.value = [...personas.value, createdPersona]
  selectedPersonaId.value = createdPersona.id
  showToast(
    t('toasts.personaAddedTitle'),
    t('toasts.personaAddedMessage', { title: createdPersona.title }),
    'success',
  )
}

const handlePersonaUpdate = (payload) => {
  const personaId = typeof payload?.id === 'string' ? payload.id.trim() : ''
  if (!personaId || personaId === DEFAULT_PERSONA_ID) return

  const index = personas.value.findIndex((persona) => persona.id === personaId)
  if (index < 0) return
  if (personas.value[index]?.isBuiltin) return

  const next = normalizePersonaPayload(payload)
  if (!next.title || !next.description || !next.prompt) {
    showToast(t('toasts.personaErrorTitle'), t('toasts.personaRequiredFields'), 'error')
    return
  }

  const updated = [...personas.value]
  updated[index] = {
    ...updated[index],
    title: next.title,
    description: next.description,
    prompt: next.prompt,
    isDefault: false,
    isBuiltin: false,
    promptEnglish: '',
  }
  personas.value = updated
  showToast(
    t('toasts.personaUpdatedTitle'),
    t('toasts.personaUpdatedMessage', { title: next.title }),
    'success',
  )
}

const handlePersonaDelete = (personaId) => {
  if (typeof personaId !== 'string' || !personaId.trim() || personaId === DEFAULT_PERSONA_ID) {
    return
  }

  const target = personas.value.find((persona) => persona.id === personaId)
  if (!target) return
  if (target.isBuiltin) return

  if (!confirm(t('toasts.personaDeleteConfirm', { title: target.title }))) return

  personas.value = personas.value.filter((persona) => persona.id !== personaId)

  if (selectedPersonaId.value === personaId) {
    selectedPersonaId.value = DEFAULT_PERSONA_ID
  }

  showToast(
    t('toasts.personaDeletedTitle'),
    t('toasts.personaDeletedMessage', { title: target.title }),
    'success',
  )
}

const handleDrag = (event) => {
  if (event.type === 'dragenter') {
    dragDepth += 1
    dragActive.value = true
    return
  }

  if (event.type === 'dragleave') {
    dragDepth = Math.max(0, dragDepth - 1)
    if (dragDepth === 0) {
      dragActive.value = false
    }
    return
  }

  if (event.type === 'dragover') {
    dragActive.value = true
  }
}

const handleDrop = async (event) => {
  dragDepth = 0
  dragActive.value = false

  if (event.dataTransfer.files && event.dataTransfer.files[0]) {
    await loadVRMFile(event.dataTransfer.files[0])
  }
}

const refreshModels = async () => {
  if (system.value?.cacheManager) {
    try {
      const models = await system.value.cacheManager.getMetadataAll('models')
      // Filter ONLY user models (hides default/internal paths)
      const userModels = models.filter((m) => m.meta?.type === 'user')

      // Sort by date descending
      availableModels.value = userModels.sort((a, b) => {
        const dateA = a.meta?.date || 0
        const dateB = b.meta?.date || 0
        return dateB - dateA
      })
    } catch (e) {
      console.warn('Failed to refresh models', e)
    }
  }
}

const handleModelSwitch = async (modelKey) => {
  if (!system.value) return

  // If undefined/null, it means "Default"
  if (!modelKey) {
    await loadVRMFile({ name: 'Default', url: '/models/Ani.vrm' }, true)
    selectedModelKey.value = null
    localStorage.removeItem('vrm_selected_model_key')
    return
  }

  showToast(t('toasts.switchingAvatarTitle'), t('toasts.switchingAvatarMessage'), 'info')
  try {
    // Pass the key. vrmLoader will try cache first.
    // If it's a "user" model, the key was used as the cache key.
    await system.value.loadNewVRM(modelKey)
    selectedModelKey.value = modelKey
    localStorage.setItem('vrm_selected_model_key', modelKey)
    showToast(t('toasts.avatarUpdatedTitle'), t('toasts.avatarLoadedFromCache'), 'success')
  } catch (error) {
    console.error(error)
    showToast(t('toasts.loadFailedTitle'), t('toasts.cachedModelLoadFailed'), 'error')
  }
}

const handleModelDelete = async (modelKey) => {
  if (!system.value || !modelKey) return
  if (confirm(t('toasts.modelDeleteConfirm'))) {
    try {
      await system.value.deleteModel(modelKey)
      showToast(t('toasts.modelDeletedTitle'), t('toasts.modelDeletedMessage'), 'success')
      // If deleted model was selected, revert preference?
      if (selectedModelKey.value === modelKey) {
        selectedModelKey.value = null
        localStorage.removeItem('vrm_selected_model_key')
      }
      await refreshModels()
    } catch {
      showToast(t('toasts.errorTitle'), t('toasts.modelDeleteFailed'), 'error')
    }
  }
}

const loadVRMFile = async (file, isUrl = false) => {
  if (!isUrl && !file.name.toLowerCase().endsWith('.vrm')) {
    showToast(t('toasts.invalidFileTitle'), t('toasts.invalidFileMessage'), 'error')
    return
  }

  showToast(
    t('toasts.loadingAvatarTitle'),
    t('toasts.loadingAvatarMessage', { fileName: file.name || t('settings.defaultRiko') }),
    'info',
  )
  try {
    // If uploading a new user file, DELETE ALL OLD USER MODELS FIRST
    if (!isUrl && system.value?.cacheManager) {
      try {
        const allModels = await system.value.cacheManager.getMetadataAll('models')
        const userModels = allModels.filter((m) => m.meta?.type === 'user')

        for (const m of userModels) {
          console.log('Removing old user model:', m.key)
          await system.value.deleteModel(m.key)
        }

        // Clear available models locally to reflect immediate removal in UI
        availableModels.value = []
      } catch (e) {
        console.warn('Failed to cleanup old models', e)
      }
    }

    if (isUrl) {
      await system.value?.loadNewVRM(file.url)
    } else {
      // system.loadNewVRM might return the key if we updated it?
      // Actually loadNewVRM calls loader.loadVRMFromFile which caches it.
      // We need to know what the key is to allow setting it as "selected".
      // But vrmLoader currently doesn't return the key easily up the chain.
      // However, since we are sorting by date, the newest one is likely the one we just added.
      await system.value?.loadNewVRM(file)
    }
    showToast(t('toasts.avatarUpdatedTitle'), t('toasts.newAvatarLoaded'), 'success')
    await refreshModels()

    // Auto-select the newest if it was a file upload (implies user wants it)
    if (!isUrl && availableModels.value.length > 0) {
      // The first one is the newest
      const newest = availableModels.value[0]
      // Is it the one we just uploaded? (meta.date is roughly now)
      if (Date.now() - (newest.meta?.date || 0) < 5000) {
        selectedModelKey.value = newest.key
        localStorage.setItem('vrm_selected_model_key', newest.key)
      }
    }
  } catch {
    showToast(t('toasts.loadFailedTitle'), t('toasts.vrmLoadFailed'), 'error')
  }
}
</script>
