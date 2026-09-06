<template>
  <div
    class="panel-shell no-scrollbar absolute bottom-4 left-1/2 z-30 max-h-[calc(100vh-7.5rem)] w-[min(420px,calc(100%-1.5rem))] -translate-x-1/2 overflow-y-auto rounded-3xl border border-cyan-500/20 bg-black/80 p-5 backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.6)] transition-all duration-300 ease-out sm:bottom-24 sm:max-h-[calc(100vh-10rem)]"
  >
    <div class="mb-5 flex items-center justify-between border-b border-white/5 pb-4">
      <div class="flex items-center gap-2">
        <div
          class="h-1.5 w-1.5 rounded-full bg-cyan-400 font-bold shadow-[0_0_12px_rgba(34,211,238,0.8)] animate-pulse"
        ></div>
        <p class="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-100/90 text-shadow-sm">
          {{ translate('settings.systemControl') }}
        </p>
      </div>
      <button
        class="group rounded-full p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
        @click="$emit('close')"
      >
        <XMarkIcon class="h-5 w-5 transition-transform group-hover:rotate-90" />
      </button>
    </div>

    <div class="space-y-6">
      <div class="space-y-3">
        <p class="text-[10px] font-mono uppercase tracking-[0.15em] text-cyan-500/50 ml-1">
          {{ translate('settings.identityMatrix') }}
        </p>

        <div class="space-y-2 max-h-[160px] overflow-y-auto pr-1 no-scrollbar">
          <div
            class="group relative flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-3 transition-all hover:bg-cyan-900/20 hover:border-cyan-500/30 cursor-pointer"
            @click="$emit('switch-model', null)"
          >
            <div class="flex items-center gap-3">
              <div
                class="flex h-9 w-9 items-center justify-center rounded-lg bg-gray-900 border border-white/10 text-indigo-400 shadow-inner group-hover:border-cyan-500/30 group-hover:text-cyan-300 transition-colors"
              >
                <CubeIcon class="h-5 w-5" />
              </div>
              <div>
                <p
                  class="text-xs font-semibold text-white/90 group-hover:text-cyan-100 transition-colors"
                >
                  {{ translate('settings.defaultRiko') }}
                </p>
                <p class="text-[10px] text-white/40 group-hover:text-cyan-200/50 transition-colors">
                  {{ translate('settings.systemModel') }}
                </p>
              </div>
            </div>
          </div>

          <div
            v-for="model in availableModels"
            :key="model.key"
            class="group relative flex items-center justify-between rounded-xl border border-white/5 bg-white/5 p-3 transition-all hover:bg-cyan-900/20 hover:border-cyan-500/30 cursor-pointer"
            @click="$emit('switch-model', model.key)"
          >
            <div class="flex items-center gap-3 min-w-0">
              <div
                class="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gray-900 border border-white/10 text-emerald-400 shadow-inner group-hover:border-cyan-500/30 group-hover:text-cyan-300 transition-colors"
              >
                <UserCircleIcon class="h-5 w-5" />
              </div>
              <div class="min-w-0 truncate">
                <p
                  class="truncate text-xs font-semibold text-white/90 group-hover:text-cyan-100 transition-colors"
                >
                  {{ model.meta?.name || translate('settings.unknownModel') }}
                </p>
                <p class="text-[10px] text-white/40 group-hover:text-cyan-200/50 transition-colors">
                  {{ formatTimeAgo(model.meta?.date) }}
                </p>
              </div>
            </div>

            <button
              class="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-white/40 hover:bg-rose-500/20 hover:text-rose-300 transition-all"
              @click.stop="$emit('delete-model', model.key)"
            >
              <TrashIcon class="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div class="space-y-3 pt-4 border-t border-white/5">
        <div class="flex items-center justify-between">
          <p class="text-[10px] font-mono uppercase tracking-[0.15em] text-cyan-500/50 ml-1">
            {{ translate('settings.aiPersona') }}
          </p>
          <button
            class="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-cyan-200 transition hover:bg-cyan-500/20"
            @click="$emit('open-persona-manager')"
          >
            <PencilSquareIcon class="h-3.5 w-3.5" />
            {{ translate('settings.editPersonas') }}
          </button>
        </div>

        <div class="rounded-xl border border-white/10 bg-black/35 p-3">
          <div class="flex items-center gap-2">
            <SparklesIcon class="h-4 w-4 text-cyan-300/80" />
            <p class="text-xs font-semibold text-white/90 truncate">{{ activePersonaTitle }}</p>
          </div>
          <p class="mt-1 text-[10px] leading-relaxed text-white/50">
            {{ activePersonaDescription || translate('settings.defaultPersonaDescription') }}
          </p>
        </div>
      </div>

      <div class="space-y-3 pt-4 border-t border-white/5">
        <div class="flex items-center justify-between">
          <p class="text-[10px] font-mono uppercase tracking-[0.15em] text-cyan-500/50 ml-1">
            {{ translate('settings.languageMode') }}
          </p>
          <div
            class="rounded bg-cyan-950/50 border border-cyan-500/20 px-2 py-0.5 text-[10px] font-mono text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.1)]"
          >
            {{ translate('settings.languageHint') }}
          </div>
        </div>

        <div class="rounded-xl border border-white/10 bg-black/35 px-3 py-2.5">
          <select
            :value="props.selectedLanguage"
            class="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none transition focus:border-cyan-400/60"
            @change="handleLanguageChange"
          >
            <option v-for="option in props.languageOptions" :key="option.code" :value="option.code">
              {{ option.label }}
            </option>
          </select>
        </div>
      </div>

      <div class="space-y-3 pt-4 border-t border-white/5">
        <div class="flex items-center justify-between">
          <p class="text-[10px] font-mono uppercase tracking-[0.15em] text-cyan-500/50 ml-1">
            {{ translate('settings.voiceMode') }}
          </p>
          <div
            class="rounded bg-cyan-950/50 border border-cyan-500/20 px-2 py-0.5 text-[10px] font-mono text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.1)]"
          >
            {{ translate('settings.voiceHint') }}
          </div>
        </div>

        <div class="rounded-xl border border-white/10 bg-black/35 px-3 py-2.5">
          <select
            :value="props.selectedVoice"
            class="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none transition focus:border-cyan-400/60 font-semibold"
            @change="handleVoiceChange"
          >
            <option v-for="voice in ['Aoede', 'Charon', 'Fenrir', 'Kore', 'Puck', 'Zephyr']" :key="voice" :value="voice">
              {{ voice }}
            </option>
          </select>
        </div>
      </div>

      <div class="space-y-3 pt-4 border-t border-white/5">
        <div class="flex items-center justify-between">
          <p class="text-[10px] font-mono uppercase tracking-[0.15em] text-cyan-500/50 ml-1">
            {{ translate('settings.projectionScale') }}
          </p>
          <div
            class="rounded bg-cyan-950/50 border border-cyan-500/20 px-2 py-0.5 text-[10px] font-mono text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.1)]"
          >
            {{ props.avatarScale.toFixed(1) }}x
          </div>
        </div>

        <div class="relative h-6 flex items-center group">
          <input
            type="range"
            min="0.5"
            max="3.0"
            step="0.1"
            :value="props.avatarScale"
            class="range-slider w-full h-[2px] bg-white/10 rounded-full appearance-none cursor-pointer outline-none transition-colors group-hover:bg-white/20 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-black [&::-webkit-slider-thumb]:border-[1.5px] [&::-webkit-slider-thumb]:border-cyan-400 [&::-webkit-slider-thumb]:shadow-[0_0_10px_rgba(34,211,238,0.8)] [&::-webkit-slider-thumb]:transition-transform [&::-webkit-slider-thumb]:hover:scale-125 hover:shadow-[0_0_15px_rgba(34,211,238,0.2)]"
            @input="handleScaleChange"
          />
        </div>
      </div>

      <div class="space-y-3 pt-4 border-t border-white/5">
        <div class="flex items-center justify-between">
          <p class="text-[10px] font-mono uppercase tracking-[0.15em] text-cyan-500/50 ml-1">
            {{ translate('settings.backgroundColor') }}
          </p>
          <div
            class="rounded bg-cyan-950/50 border border-cyan-500/20 px-2 py-0.5 text-[10px] font-mono text-cyan-300 shadow-[0_0_10px_rgba(34,211,238,0.1)]"
          >
            {{ props.backgroundColor }}
          </div>
        </div>

        <div
          class="flex items-center gap-3 rounded-xl border border-white/10 bg-black/35 px-3 py-2.5"
        >
          <input
            type="color"
            :value="props.backgroundColor"
            class="h-9 w-12 cursor-pointer rounded-md border border-white/15 bg-black/40 p-0.5"
            @input="handleBackgroundColorChange"
          />
          <input
            type="text"
            :value="props.backgroundColor"
            maxlength="7"
            spellcheck="false"
            class="w-full rounded-lg border border-white/10 bg-black/30 px-3 py-1.5 text-xs font-mono tracking-wide text-cyan-100/90 outline-none transition-colors focus:border-cyan-400/50"
            @input="handleBackgroundColorChange"
          />
        </div>
      </div>

      <div class="space-y-3 pt-4 border-t border-white/5">
        <p class="text-[10px] font-mono uppercase tracking-[0.15em] text-cyan-500/50 ml-1">
          {{ translate('settings.visionSensors') }}
        </p>

        <div class="flex gap-2">
          <button
            class="flex-1 rounded-xl border p-3 transition-all duration-300 text-left relative overflow-hidden group shadow-lg"
            :class="
              props.lookAtUserEnabled
                ? 'bg-cyan-950/30 border-cyan-500/40 shadow-[inset_0_0_20px_rgba(6,182,212,0.1)]'
                : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'
            "
            @click="toggleLookAtUser"
          >
            <div class="relative z-10">
              <div class="flex items-center justify-between mb-2">
                <div class="relative">
                  <EyeIcon
                    v-if="props.lookAtUserEnabled"
                    class="h-5 w-5 transition-colors duration-300 text-cyan-400 drop-shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                  />
                  <EyeSlashIcon
                    v-else
                    class="h-5 w-5 transition-colors duration-300 text-white/20"
                  />
                </div>
                <div
                  class="h-1.5 w-1.5 rounded-full transition-all duration-300"
                  :class="
                    props.lookAtUserEnabled
                      ? 'bg-cyan-400 shadow-[0_0_10px_rgba(34,211,238,1)]'
                      : 'bg-white/10'
                  "
                ></div>
              </div>
              <p
                class="text-xs font-medium tracking-wide"
                :class="props.lookAtUserEnabled ? 'text-cyan-100' : 'text-white/30'"
              >
                {{ translate('settings.faceTrack') }}
              </p>
            </div>
          </button>

          <button
            class="flex-1 rounded-xl border p-3 transition-all duration-300 text-left relative overflow-hidden group shadow-lg"
            :class="
              props.lookAtScreenEnabled
                ? 'bg-purple-900/20 border-purple-500/40 shadow-[inset_0_0_20px_rgba(168,85,247,0.1)]'
                : 'bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10'
            "
            @click="toggleLookAtScreen"
          >
            <div class="relative z-10">
              <div class="flex items-center justify-between mb-2">
                <div class="relative">
                  <ComputerDesktopIcon
                    class="h-5 w-5 transition-colors duration-300"
                    :class="
                      props.lookAtScreenEnabled
                        ? 'text-purple-400 drop-shadow-[0_0_8px_rgba(192,132,252,0.8)]'
                        : 'text-white/20'
                    "
                  />
                  <NoSymbolIcon
                    v-if="!props.lookAtScreenEnabled"
                    class="absolute -right-1.5 -bottom-1.5 h-3.5 w-3.5 text-white/30 drop-shadow-md"
                  />
                </div>
                <div
                  class="h-1.5 w-1.5 rounded-full transition-all duration-300"
                  :class="
                    props.lookAtScreenEnabled
                      ? 'bg-purple-400 shadow-[0_0_10px_rgba(192,132,252,1)]'
                      : 'bg-white/10'
                  "
                ></div>
              </div>
              <p
                class="text-xs font-medium tracking-wide"
                :class="props.lookAtScreenEnabled ? 'text-purple-100' : 'text-white/30'"
              >
                {{ translate('settings.screenSense') }}
              </p>
            </div>
          </button>
        </div>
      </div>

      <!-- Live Subtitles & Captions Section -->
      <div class="space-y-3 pt-4 border-t border-white/5">
        <div class="flex items-center justify-between">
          <p class="text-[10px] font-mono uppercase tracking-[0.15em] text-cyan-500/50 ml-1">
            {{ translate('settings.liveCaptions') || 'Live Subtitles & Captions' }}
          </p>
          <button
            class="rounded-lg border px-2.5 py-1 text-[10px] font-mono uppercase tracking-[0.12em] transition"
            :class="
              props.subtitlesEnabled
                ? 'border-rose-500/30 bg-rose-500/10 text-rose-300 hover:bg-rose-500/20 shadow-[0_0_10px_rgba(244,63,94,0.2)]'
                : 'border-white/10 bg-white/5 text-white/50 hover:bg-white/10 hover:text-white'
            "
            @click="$emit('update:subtitlesEnabled', !props.subtitlesEnabled)"
          >
            {{ props.subtitlesEnabled ? 'Enabled' : 'Disabled' }}
          </button>
        </div>

        <div v-if="props.subtitlesEnabled" class="space-y-3 rounded-xl border border-white/10 bg-black/35 p-3 animate-in fade-in duration-200">
          <!-- Style Preset Selection -->
          <div class="space-y-1.5">
            <span class="text-[11px] text-white/70">Theme Preset</span>
            <div class="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
              <button
                v-for="p in [
                  { id: 'vtuber-pink', label: 'Sakura', color: 'bg-rose-500 border-rose-400' },
                  { id: 'neon-cyan', label: 'Cyan', color: 'bg-cyan-500 border-cyan-400' },
                  { id: 'sunset-gold', label: 'Gold', color: 'bg-amber-500 border-amber-400' },
                  { id: 'amethyst-purple', label: 'Violet', color: 'bg-purple-500 border-purple-400' },
                  { id: 'obsidian-clean', label: 'Dark', color: 'bg-slate-800 border-slate-600' }
                ]"
                :key="p.id"
                class="flex flex-col items-center gap-1 rounded-lg border p-1.5 text-[10px] transition"
                :class="
                  props.subtitlesPreset === p.id
                    ? 'border-white/40 bg-white/10 text-white font-semibold'
                    : 'border-white/5 bg-black/20 text-white/50 hover:bg-white/5 hover:text-white'
                "
                @click="$emit('update:subtitlesPreset', p.id)"
              >
                <span class="h-3 w-3 rounded-full border shadow-sm" :class="p.color"></span>
                <span>{{ p.label }}</span>
              </button>
            </div>
          </div>

          <!-- Subtitle Size, Speed & Position -->
          <div class="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
            <div class="space-y-1">
              <span class="text-[10px] text-white/60">Font Size</span>
              <div class="flex rounded-lg border border-white/10 bg-black/30 p-0.5">
                <button
                  v-for="s in ['small', 'normal', 'large']"
                  :key="s"
                  class="flex-1 rounded-md py-1 text-[10px] capitalize transition"
                  :class="
                    props.subtitlesSize === s
                      ? 'bg-white/15 text-white font-medium shadow-sm'
                      : 'text-white/40 hover:text-white'
                  "
                  @click="$emit('update:subtitlesSize', s)"
                >
                  {{ s }}
                </button>
              </div>
            </div>

            <div class="space-y-1">
              <span class="text-[10px] text-white/60">Speed / Lead</span>
              <div class="flex rounded-lg border border-white/10 bg-black/30 p-0.5">
                <button
                  v-for="spd in [
                    { id: 'fast', label: 'Fast' },
                    { id: 'snappy', label: 'Snappy' },
                    { id: 'standard', label: 'Standard' }
                  ]"
                  :key="spd.id"
                  class="flex-1 rounded-md py-1 text-[10px] capitalize transition"
                  :class="
                    props.subtitlesSpeed === spd.id
                      ? 'bg-white/15 text-white font-medium shadow-sm'
                      : 'text-white/40 hover:text-white'
                  "
                  @click="$emit('update:subtitlesSpeed', spd.id)"
                >
                  {{ spd.label }}
                </button>
              </div>
            </div>

            <div class="space-y-1">
              <span class="text-[10px] text-white/60">Position / Height</span>
              <div class="flex rounded-lg border border-white/10 bg-black/30 p-0.5">
                <button
                  v-for="pos in [
                    { id: 'chest', label: 'Chest' },
                    { id: 'high-chest', label: 'High' },
                    { id: 'bottom', label: 'Bottom' },
                    { id: 'center', label: 'Center' },
                  ]"
                  :key="pos.id"
                  class="flex-1 rounded-md py-1 text-[10px] capitalize transition"
                  :class="
                    props.subtitlesPosition === pos.id
                      ? 'bg-white/15 text-white font-medium shadow-sm'
                      : 'text-white/40 hover:text-white'
                  "
                  @click="$emit('update:subtitlesPosition', pos.id)"
                >
                  {{ pos.label }}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import {
  ComputerDesktopIcon,
  CubeIcon,
  EyeIcon,
  EyeSlashIcon,
  NoSymbolIcon,
  PencilSquareIcon,
  SparklesIcon,
  TrashIcon,
  UserCircleIcon,
  XMarkIcon,
} from '@heroicons/vue/24/solid'
import { getLocaleForLanguage, translateUi } from '../i18n/ui.js'

const props = defineProps({
  avatarScale: {
    type: Number,
    required: true,
  },
  backgroundColor: {
    type: String,
    default: '#111827',
  },
  lookAtUserEnabled: {
    type: Boolean,
    default: true,
  },
  lookAtScreenEnabled: {
    type: Boolean,
    default: true,
  },
  subtitlesEnabled: {
    type: Boolean,
    default: true,
  },
  subtitlesPreset: {
    type: String,
    default: 'vtuber-pink',
  },
  subtitlesSize: {
    type: String,
    default: 'normal',
  },
  subtitlesSpeed: {
    type: String,
    default: 'fast',
  },
  subtitlesPosition: {
    type: String,
    default: 'chest',
  },
  availableModels: {
    type: Array,
    default: () => [],
  },
  activePersonaTitle: {
    type: String,
    default: '',
  },
  activePersonaDescription: {
    type: String,
    default: '',
  },
  selectedLanguage: {
    type: String,
    default: 'en',
  },
  selectedVoice: {
    type: String,
    default: 'Zephyr',
  },
  languageOptions: {
    type: Array,
    default: () => [],
  },
  language: {
    type: String,
    default: 'en',
  },
})

const emit = defineEmits([
  'close',
  'update:avatarScale',
  'update:backgroundColor',
  'update:lookAtUserEnabled',
  'update:lookAtScreenEnabled',
  'update:subtitlesEnabled',
  'update:subtitlesPreset',
  'update:subtitlesSize',
  'update:subtitlesSpeed',
  'update:subtitlesPosition',
  'switch-model',
  'delete-model',
  'open-persona-manager',
  'update:selectedLanguage',
  'update:selectedVoice',
])

const translate = (key, params = {}) => translateUi(props.language, key, params)

const handleScaleChange = (event) => {
  emit('update:avatarScale', parseFloat(event.target.value))
}

const normalizeHexColor = (value) => {
  const raw = typeof value === 'string' ? value.trim() : ''
  const withHash = raw.startsWith('#') ? raw : `#${raw}`
  return /^#[0-9a-fA-F]{6}$/.test(withHash) ? withHash.toLowerCase() : null
}

const handleBackgroundColorChange = (event) => {
  const normalized = normalizeHexColor(event?.target?.value)
  if (!normalized) return
  emit('update:backgroundColor', normalized)
}

const handleLanguageChange = (event) => {
  const nextValue = String(event?.target?.value || '')
    .trim()
    .toLowerCase()
  if (!nextValue) return
  emit('update:selectedLanguage', nextValue)
}

const handleVoiceChange = (event) => {
  const nextValue = String(event?.target?.value || '').trim()
  if (!nextValue) return
  emit('update:selectedVoice', nextValue)
}

const toggleLookAtUser = () => {
  emit('update:lookAtUserEnabled', !props.lookAtUserEnabled)
}

const toggleLookAtScreen = () => {
  emit('update:lookAtScreenEnabled', !props.lookAtScreenEnabled)
}

const formatTimeAgo = (timestamp) => {
  if (!timestamp) return translate('settings.unknownDate')
  const seconds = Math.floor((Date.now() - timestamp) / 1000)

  if (seconds < 60) return translate('settings.justNow')

  const intervals = [
    ['year', 31536000],
    ['month', 2592000],
    ['day', 86400],
    ['hour', 3600],
    ['minute', 60],
  ]

  const locale = getLocaleForLanguage(props.language)
  const formatter = new Intl.RelativeTimeFormat(locale, { numeric: 'always' })

  for (const [unit, secondsInUnit] of intervals) {
    const interval = Math.floor(seconds / secondsInUnit)
    if (interval >= 1) {
      const relative = formatter.format(-interval, unit)
      return translate('settings.cachedAgo', { relative })
    }
  }
  return translate('settings.justNow')
}
</script>

<style scoped>
.range-slider::-webkit-slider-thumb {
  -webkit-appearance: none;
}
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.text-shadow-sm {
  text-shadow: 0 0 10px rgba(34, 211, 238, 0.5);
}
</style>
