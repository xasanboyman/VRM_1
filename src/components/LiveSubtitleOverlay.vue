<template>
  <Transition name="subtitle-fade">
    <div
      v-if="visible && currentSentence"
      class="live-subtitle-container pointer-events-none fixed left-1/2 z-30 w-[min(92vw,860px)] -translate-x-1/2 select-none px-4 flex justify-center"
      :class="positionClass"
    >
      <div
        class="live-subtitle-bubble w-full px-5 py-3 transition-all duration-200 text-center"
        :class="[stylePresetClass, backgroundBoxClass]"
      >
        <p class="subtitle-text text-center leading-snug tracking-wide break-words" :class="sizeClass">
          <span
            v-for="(item, idx) in currentSentence.words"
            :key="item.id"
            class="subtitle-word inline-block transition-opacity duration-150"
            :class="idx <= activeWordIndex ? 'opacity-100' : 'opacity-70'"
          >
            {{ item.word }}<span v-if="idx < currentSentence.words.length - 1">&nbsp;</span>
          </span>
        </p>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, ref, watch, onBeforeUnmount } from 'vue'

const props = defineProps({
  text: {
    type: String,
    default: '',
  },
  isSpeaking: {
    type: Boolean,
    default: false,
  },
  audioProgress: {
    type: Object,
    default: () => ({ isPlaying: false, progress: 1, elapsed: 0, totalDuration: 0 }),
  },
  enabled: {
    type: Boolean,
    default: true,
  },
  speed: {
    type: String,
    default: 'fast', // 'fast' (lead ahead) | 'snappy' | 'standard'
  },
  stylePreset: {
    type: String,
    default: 'vtuber-pink', // 'vtuber-pink' | 'neon-cyan' | 'sunset-gold' | 'amethyst-purple' | 'obsidian-clean'
  },
  fontSize: {
    type: String,
    default: 'normal', // 'small' | 'normal' | 'large'
  },
  position: {
    type: String,
    default: 'chest', // 'chest' (lowered) | 'high-chest' | 'bottom' | 'center'
  },
  backgroundStyle: {
    type: String,
    default: 'floating', // 'floating' | 'subtle-glass' | 'dark-pill'
  },
})

const visible = ref(false)
const parsedSentences = ref([])
let autoFadeTimeout = null
let lastRawText = ''

const positionClass = computed(() => {
  switch (props.position) {
    case 'high-chest':
      return 'bottom-[25%] sm:bottom-[27%] md:bottom-[29%]'
    case 'bottom':
      return 'bottom-12 sm:bottom-16'
    case 'center':
      return 'top-1/2 -translate-y-1/2'
    case 'chest':
    default:
      // Lowered by ~15-20px: sits cleanly right above the dock in the lower scene
      return 'bottom-[16%] sm:bottom-[17%] md:bottom-[18%]'
  }
})

const sizeClass = computed(() => {
  switch (props.fontSize) {
    case 'small':
      return 'text-base sm:text-lg font-bold'
    case 'large':
      return 'text-2xl sm:text-4xl font-extrabold'
    case 'normal':
    default:
      return 'text-xl sm:text-2xl md:text-3xl font-extrabold'
  }
})

const stylePresetClass = computed(() => {
  switch (props.stylePreset) {
    case 'neon-cyan':
      return 'preset-neon-cyan'
    case 'sunset-gold':
      return 'preset-sunset-gold'
    case 'amethyst-purple':
      return 'preset-amethyst-purple'
    case 'obsidian-clean':
      return 'preset-obsidian-clean'
    case 'vtuber-pink':
    default:
      return 'preset-vtuber-pink'
  }
})

const backgroundBoxClass = computed(() => {
  switch (props.backgroundStyle) {
    case 'subtle-glass':
      return 'rounded-2xl bg-black/40 backdrop-blur-md border border-white/10 shadow-2xl'
    case 'dark-pill':
      return 'rounded-2xl bg-slate-950/80 backdrop-blur-lg border border-white/15 shadow-[0_8px_32px_rgba(0,0,0,0.6)]'
    case 'floating':
    default:
      return 'bg-transparent'
  }
})

// Strips non-spoken command markers, asterisks, and tool invocation syntax
const cleanRawText = (raw) => {
  return String(raw || '')
    .replace(/\*+[^*]+\*+/g, '') // remove *spins*, *smiles*
    .replace(/\b(?:set_expression|trigger_gesture|trigger_special_effect|stop_special_effect|modulate_voice)\s*\([^)]*\)/gi, '')
    .replace(/\b(?:set_expression|trigger_gesture|trigger_special_effect):[a-zA-Z0-9_]+/gi, '')
    .replace(/\{[^{}]*"name"\s*:\s*"(?:set_expression|trigger_gesture|trigger_special_effect|stop_special_effect|modulate_voice)"[^{}]*(\{[^{}]*\})*[^{}]*\}/gi, '')
    .replace(/\{"name"\s*:\s*"[^"]*"[^}]*\}/gi, '')
    .replace(/\s{2,}/g, ' ')
    .trim()
}

// Estimates realistic spoken audio duration for a word (calibrated to Gemini Live Zephyr voice at ~165 WPM)
const calculateWordDuration = (wordStr) => {
  const cleanWord = wordStr.replace(/^[^\w\s]+|[^\w\s]+$/g, '')
  const len = cleanWord.length || 1

  // Base duration based on phoneme/character count:
  // Short words ("I", "a", "to", "am"): ~0.24s - 0.28s
  // Medium words ("hello", "today", "about"): ~0.32s - 0.38s
  // Long words ("fantastic", "conversational"): ~0.50s - 0.65s
  let dur = Math.max(0.24, Math.min(0.65, 0.18 + len * 0.038))

  // Natural conversational pauses from punctuation:
  if (/[,;:–—]$/.test(wordStr)) {
    dur += 0.28 // comma breath pause
  } else if (/[.!?…]+$/.test(wordStr)) {
    dur += 0.45 // sentence termination pause
  }

  return dur
}

// Splits input text into discrete sentences with word tokens, spoken offsets, and timeline intervals
const parseTextToSentences = (rawText) => {
  const clean = cleanRawText(rawText)
  if (!clean) return []

  const rawSegments = []
  const regex = /[^.!?\n\r…]+(?:[.!?…]+["'\)\]]?|\n|$)/g
  let match
  while ((match = regex.exec(clean)) !== null) {
    const s = match[0].trim()
    if (s) {
      rawSegments.push(s)
    }
  }

  if (rawSegments.length === 0 && clean) {
    rawSegments.push(clean)
  }

  // Merge tiny fragments (<= 2 words, e.g. "Hello!", "Yes!", "Of course!") with the subsequent sentence
  // so subtitles display coherent, natural thoughts and never flicker on 1-word salutations
  const normalizedSegments = []
  for (let i = 0; i < rawSegments.length; i++) {
    const seg = rawSegments[i]
    const wordCount = seg.split(/\s+/).filter(Boolean).length
    if (wordCount <= 2 && i + 1 < rawSegments.length) {
      rawSegments[i + 1] = `${seg} ${rawSegments[i + 1]}`
    } else {
      normalizedSegments.push(seg)
    }
  }

  let runningTurnSec = 0
  return normalizedSegments.map((sentenceText, sIdx) => {
    const rawWords = sentenceText.split(/\s+/).filter(Boolean)
    let sentenceOffset = 0

    const words = rawWords.map((w, wIdx) => {
      const wordStr = String(w).trim()
      const duration = calculateWordDuration(wordStr)
      const offset = sentenceOffset
      sentenceOffset += duration

      return {
        id: `s${sIdx}_w${wIdx}_${wordStr}`,
        word: wordStr,
        duration,
        offset, // Spoken offset from sentence start in seconds
      }
    })

    // Sentence minimum duration: ensure at least 1.4s for natural speech cadence
    const calculatedDuration = Math.max(1.4, sentenceOffset)
    const startSec = runningTurnSec
    runningTurnSec += calculatedDuration
    const endSec = runningTurnSec

    return {
      index: sIdx,
      text: sentenceText,
      words,
      duration: calculatedDuration,
      startSec,
      endSec,
    }
  })
}

// Computes the active sentence strictly synchronized with audio playback time:
// Each sentence waits for its complete spoken duration before advancing to the next sentence!
const currentSentence = computed(() => {
  if (!props.enabled || !visible.value) return null
  const sentences = parsedSentences.value
  if (!sentences.length) return null

  // If assistant finished speaking, hold and display the full last sentence on screen
  if (!props.isSpeaking) {
    return sentences[sentences.length - 1] || null
  }

  const elapsed = Math.max(0, props.audioProgress?.elapsed ?? 0)

  // Find the single active sentence: stays on screen until audio finishes its endSec
  let activeIndex = sentences.length - 1
  for (let i = 0; i < sentences.length; i++) {
    if (elapsed < sentences[i].endSec) {
      activeIndex = i
      break
    }
  }

  return sentences[activeIndex] || null
})

// Computes the active word highlight index within the active sentence with 1.0s anticipatory lead
const activeWordIndex = computed(() => {
  const sentence = currentSentence.value
  if (!sentence || !sentence.words.length) return -1
  if (!props.isSpeaking) return sentence.words.length - 1

  const elapsed = Math.max(0, props.audioProgress?.elapsed ?? 0)
  const sentenceElapsed = Math.max(0, elapsed - sentence.startSec)

  // Anticipatory reading lead time: highlight appears ~1 second ahead of spoken audio
  // (User options: fast = 1.0s lead, snappy = 1.4s lead, standard = 0.6s lead)
  let leadAheadSec = 1.0
  if (props.speed === 'snappy') leadAheadSec = 1.4
  if (props.speed === 'standard') leadAheadSec = 0.6

  const effectiveReadingTime = sentenceElapsed + leadAheadSec

  let currentIdx = 0
  for (let i = 0; i < sentence.words.length; i++) {
    if (effectiveReadingTime >= sentence.words[i].offset) {
      currentIdx = i
    }
  }

  return currentIdx
})

const clearFadeTimer = () => {
  if (autoFadeTimeout) {
    clearTimeout(autoFadeTimeout)
    autoFadeTimeout = null
  }
}

const scheduleFadeOut = (delayMs = 3500) => {
  clearFadeTimer()
  autoFadeTimeout = setTimeout(() => {
    visible.value = false
  }, delayMs)
}

// Watch incoming text changes
watch(
  () => props.text,
  (newText) => {
    if (!props.enabled) {
      visible.value = false
      return
    }

    const trimmed = String(newText || '').trim()
    if (!trimmed) {
      if (!props.isSpeaking) {
        scheduleFadeOut(800)
      }
      return
    }

    // Reset if text was truncated or new turn started
    if (trimmed.length < lastRawText.length && !lastRawText.startsWith(trimmed)) {
      parsedSentences.value = []
    }
    lastRawText = trimmed

    parsedSentences.value = parseTextToSentences(trimmed)
    visible.value = true
    clearFadeTimer()

    if (!props.isSpeaking) {
      scheduleFadeOut(3500)
    }
  },
  { immediate: true },
)

// Watch assistant speaking state
watch(
  () => props.isSpeaking,
  (speaking) => {
    if (speaking) {
      visible.value = true
      clearFadeTimer()
    } else {
      if (parsedSentences.value.length > 0) {
        scheduleFadeOut(3500)
      } else {
        visible.value = false
      }
    }
  },
)

watch(
  () => props.enabled,
  (val) => {
    if (!val) {
      visible.value = false
      clearFadeTimer()
    }
  },
)

onBeforeUnmount(() => {
  clearFadeTimer()
})
</script>

<style scoped>
.live-subtitle-container {
  font-family: 'Fredoka', 'Quicksand', 'Space Grotesk', system-ui, -apple-system, sans-serif;
  letter-spacing: 0.025em;
  word-break: break-word;
  filter: drop-shadow(0 4px 14px rgba(0, 0, 0, 0.75));
}

.subtitle-text {
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
}

/* Clean, crisp words with stable left origin (no left jumping) */
.subtitle-word {
  display: inline-block;
  opacity: 1;
  transform: none !important;
}

/* --- VTUBER PINK PRESET (Exact Match to User Reference Images) --- */
.preset-vtuber-pink {
  color: #ffffff;
  -webkit-text-stroke: 3.5px #be123c;
  paint-order: stroke fill;
  text-shadow:
    0 0 1px #be123c,
    2px 2px 0px #9f1239,
    -2px -2px 0px #9f1239,
    2px -2px 0px #9f1239,
    -2px 2px 0px #9f1239,
    0 4px 14px rgba(0, 0, 0, 0.9),
    0 0 18px rgba(244, 63, 94, 0.4);
}

/* --- NEON CYAN PRESET --- */
.preset-neon-cyan {
  color: #ffffff;
  -webkit-text-stroke: 3.5px #0e7490;
  paint-order: stroke fill;
  text-shadow:
    0 0 1px #0e7490,
    2px 2px 0px #155e75,
    -2px -2px 0px #155e75,
    2px -2px 0px #155e75,
    -2px 2px 0px #155e75,
    0 4px 14px rgba(0, 0, 0, 0.9),
    0 0 18px rgba(6, 182, 212, 0.5);
}

/* --- SUNSET GOLD PRESET --- */
.preset-sunset-gold {
  color: #ffffff;
  -webkit-text-stroke: 3.5px #b45309;
  paint-order: stroke fill;
  text-shadow:
    0 0 1px #b45309,
    2px 2px 0px #92400e,
    -2px -2px 0px #92400e,
    2px -2px 0px #92400e,
    -2px 2px 0px #92400e,
    0 4px 14px rgba(0, 0, 0, 0.9),
    0 0 18px rgba(245, 158, 11, 0.45);
}

/* --- AMETHYST PURPLE PRESET --- */
.preset-amethyst-purple {
  color: #ffffff;
  -webkit-text-stroke: 3.5px #7e22ce;
  paint-order: stroke fill;
  text-shadow:
    0 0 1px #7e22ce,
    2px 2px 0px #6b21a8,
    -2px -2px 0px #6b21a8,
    2px -2px 0px #6b21a8,
    -2px 2px 0px #6b21a8,
    0 4px 14px rgba(0, 0, 0, 0.9),
    0 0 18px rgba(168, 85, 247, 0.45);
}

/* --- OBSIDIAN CLEAN PRESET --- */
.preset-obsidian-clean {
  color: #ffffff;
  -webkit-text-stroke: 3.5px #0f172a;
  paint-order: stroke fill;
  text-shadow:
    0 0 1px #0f172a,
    2px 2px 0px #020617,
    -2px -2px 0px #020617,
    2px -2px 0px #020617,
    -2px 2px 0px #020617,
    0 4px 16px rgba(0, 0, 0, 0.95);
}

/* Smooth subtitle container entry & exit */
.subtitle-fade-enter-active,
.subtitle-fade-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.subtitle-fade-enter-from,
.subtitle-fade-leave-to {
  opacity: 0;
  transform: translate(-50%, 6px);
}
</style>
