<template>
  <Transition name="subtitle-fade">
    <div
      v-if="visible && activeDisplayWords.length > 0"
      class="live-subtitle-container pointer-events-none fixed left-1/2 z-30 w-[min(92vw,820px)] -translate-x-1/2 select-none px-4 flex justify-center"
      :class="positionClass"
    >
      <div
        class="live-subtitle-bubble w-full px-4 py-2 transition-all duration-150 text-left"
        :class="[stylePresetClass, backgroundBoxClass]"
      >
        <p class="subtitle-text text-left leading-snug tracking-wide break-words" :class="sizeClass">
          <span
            v-for="(item, idx) in activeDisplayWords"
            :key="item.id"
            class="subtitle-word inline-block opacity-100"
          >
            {{ item.word }}<span v-if="idx < activeDisplayWords.length - 1">&nbsp;</span>
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

// Splits input text into discrete sentences with word tokens and audio weights
const parseTextToSentences = (rawText) => {
  const clean = String(rawText || '')
    .replace(/set_expression\s*\([^)]*\)/gi, '')
    .replace(/set_expression:[a-zA-Z0-9_]+/gi, '')
    .replace(/expression:\s*[a-zA-Z0-9_]+/gi, '')
    .replace(/\{[^{}]*"name"\s*:\s*"set_expression"[^{}]*(\{[^{}]*\})*[^{}]*\}/gi, '')
    .replace(/\{"name"\s*:\s*"set_expression"[^}]*\}/gi, '')
    .trim()
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

  let runningWeight = 0
  return rawSegments.map((sentenceText, sIdx) => {
    const rawWords = sentenceText.split(/\s+/).filter(Boolean)
    const words = rawWords.map((w, wIdx) => {
      const wordStr = String(w).trim()
      let weight = Math.max(2, wordStr.length)
      if (/[,;:]$/.test(wordStr)) weight += 2
      if (/[.!?…]+$/.test(wordStr)) weight += 3
      return {
        id: `s${sIdx}_w${wIdx}_${wordStr}`,
        word: wordStr,
        weight,
      }
    })

    const sentenceWeight = words.reduce((acc, cur) => acc + cur.weight, 0)
    const startWeight = runningWeight
    runningWeight += sentenceWeight
    const endWeight = runningWeight

    return {
      index: sIdx,
      text: sentenceText,
      words,
      weight: sentenceWeight,
      startWeight,
      endWeight,
    }
  })
}

// Computes which words are currently visible for the active sentence with anticipatory lead
const activeDisplayWords = computed(() => {
  if (!props.enabled || !visible.value) return []
  const sentences = parsedSentences.value
  if (!sentences.length) return []

  const totalTurnWeight = sentences[sentences.length - 1]?.endWeight || 0
  if (totalTurnWeight <= 0) return []

  // If speaking is finished, display the full last spoken sentence
  if (!props.isSpeaking || props.audioProgress?.progress >= 0.98) {
    const lastSentence = sentences[sentences.length - 1]
    return lastSentence?.words || []
  }

  const rawProgress = Math.max(0, Math.min(1, props.audioProgress?.progress ?? 0))
  const currentTurnPos = rawProgress * totalTurnWeight

  // Find the single sentence active in the current audio timeline
  let activeSentence = sentences[sentences.length - 1]
  for (let i = 0; i < sentences.length; i++) {
    if (currentTurnPos < sentences[i].endWeight || i === sentences.length - 1) {
      activeSentence = sentences[i]
      break
    }
  }

  if (!activeSentence || !activeSentence.words.length) return []

  const words = activeSentence.words

  // Short sentences (<= 3 words) show completely right away so user reads immediately
  if (words.length <= 3) {
    return words
  }

  // Calculate progress within this specific sentence
  const sentenceDuration = activeSentence.endWeight - activeSentence.startWeight
  const localPos = Math.max(0, currentTurnPos - activeSentence.startWeight)
  const baseRatio = sentenceDuration > 0 ? Math.min(1, localPos / sentenceDuration) : 1

  // Anticipatory lead offset: words appear ahead of time so they're visible naturally as spoken
  let leadAhead = 0.12 // default fast (~300ms natural reading lead)
  if (props.speed === 'snappy') leadAhead = 0.20
  if (props.speed === 'standard') leadAhead = 0.05

  const effectiveRatio = Math.min(1, baseRatio + leadAhead)

  // Start with at least 1 word visible at onset of sentence
  let visibleCount = Math.min(words.length, 1)
  let accumulated = 0

  for (let i = 0; i < words.length; i++) {
    const wordShare = words[i].weight / activeSentence.weight
    accumulated += wordShare
    // Reveal word proactively ahead of time
    if (effectiveRatio >= accumulated - wordShare * 0.9) {
      visibleCount = i + 1
    }
  }

  return words.slice(0, Math.max(2, Math.min(words.length, visibleCount)))
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
