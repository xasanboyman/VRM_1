<template>
  <Transition name="cue-card-pop">
    <div
      v-if="visible"
      class="cue-card-container pointer-events-auto fixed z-[55] select-none"
      :class="[
        isMinimized ? 'cue-card-minimized' : 'cue-card-expanded',
        isDragging ? 'cursor-grabbing' : '',
      ]"
      :style="cardPositionStyle"
      role="region"
      aria-label="IELTS Speaking Part 2 Cue Card"
    >
      <!-- ================= MINIMIZED VIEW ================= -->
      <div
        v-if="isMinimized"
        class="minimized-pill flex items-center gap-3 rounded-2xl border-2 border-slate-700 bg-slate-950/90 px-4 py-2.5 shadow-2xl backdrop-blur-xl transition-all duration-200 hover:border-slate-500"
        @mousedown="startDrag"
        @touchstart.passive="startDrag"
      >
        <div class="flex items-center gap-2">
          <span
            class="h-2.5 w-2.5 rounded-full"
            :class="
              currentPhase === 'prep'
                ? 'bg-amber-400 shadow-[0_0_10px_rgba(251,191,36,0.8)] animate-pulse'
                : 'bg-emerald-400 shadow-[0_0_10px_rgba(52,211,153,0.8)] animate-pulse'
            "
          ></span>
          <span class="font-mono text-xs font-bold uppercase tracking-wider text-amber-300">
            {{ currentPhase === 'prep' ? 'Prep Time' : 'Speaking' }}: {{ formattedTime }}
          </span>
        </div>

        <div class="h-4 w-px bg-white/20"></div>

        <span class="max-w-[220px] truncate text-xs font-medium text-slate-200" :title="activeTopic">
          {{ activeTopic }}
        </span>

        <div class="flex items-center gap-1.5 pl-1">
          <button
            class="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-slate-300 transition hover:bg-white/20 hover:text-white"
            title="Expand Cue Card"
            @click.stop="isMinimized = false"
          >
            <ArrowsPointingOutIcon class="h-4 w-4" />
          </button>
          <button
            class="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-slate-300 transition hover:bg-rose-500/20 hover:text-rose-300"
            title="Dismiss Cue Card"
            @click.stop="handleDismiss"
          >
            <XMarkIcon class="h-4 w-4" />
          </button>
        </div>
      </div>

      <!-- ================= AUTHENTIC IELTS CANDIDATE TASK CARD ================= -->
      <div
        v-else
        class="cue-card-shell relative flex flex-col overflow-hidden rounded-2xl border-2 border-slate-800 bg-[#ffffff] text-slate-900 shadow-[0_20px_60px_rgba(0,0,0,0.45)]"
      >
        <!-- Card Header (Draggable Bar) -->
        <div
          class="card-header flex items-center justify-between border-b-2 border-slate-800 bg-[#1e293b] px-5 py-3 text-white cursor-grab active:cursor-grabbing"
          @mousedown="startDrag"
          @touchstart.passive="startDrag"
        >
          <div class="flex items-center gap-2.5">
            <span class="rounded bg-amber-400 px-2 py-0.5 text-[11px] font-black uppercase tracking-wider text-slate-950">
              IELTS
            </span>
            <span class="text-xs font-bold uppercase tracking-wider text-slate-200">
              Speaking Part 2 — Candidate Task Card
            </span>
          </div>

          <!-- Header Actions -->
          <div class="flex items-center gap-2">
            <div class="flex items-center rounded-lg bg-black/30 p-0.5 text-[11px] font-semibold border border-white/10">
              <span
                class="rounded px-2 py-0.5"
                :class="currentPhase === 'prep' ? 'bg-amber-400 text-slate-950 font-bold' : 'text-slate-400'"
              >
                1m Prep
              </span>
              <span
                class="rounded px-2 py-0.5"
                :class="currentPhase === 'speak' ? 'bg-emerald-400 text-slate-950 font-bold' : 'text-slate-400'"
              >
                2m Speaking
              </span>
            </div>

            <button
              class="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white/80 transition hover:bg-white/20 hover:text-white"
              title="Minimize card"
              @click="isMinimized = true"
            >
              <ArrowsPointingInIcon class="h-3.5 w-3.5" />
            </button>
            <button
              class="flex h-7 w-7 items-center justify-center rounded-lg bg-rose-500/20 text-rose-200 transition hover:bg-rose-500/40 hover:text-white"
              title="Close cue card"
              @click="handleDismiss"
            >
              <XMarkIcon class="h-4 w-4" />
            </button>
          </div>
        </div>

        <!-- Timer Countdown Strip -->
        <div class="relative h-1.5 w-full bg-slate-200">
          <div
            class="h-full transition-all duration-300 ease-out"
            :class="currentPhase === 'prep' ? 'bg-amber-500' : 'bg-emerald-600'"
            :style="{ width: `${progressPercent}%` }"
          ></div>
        </div>

        <!-- Authentic IELTS Cue Card Content -->
        <div class="card-content-scroll max-h-[70vh] overflow-y-auto px-6 py-6 sm:px-8 sm:py-7 bg-white">
          <!-- Main IELTS Prompt Card Container -->
          <div class="ielts-card-box rounded-xl border-2 border-slate-700 bg-[#fdfdfd] p-6 shadow-sm">
            <!-- Topic Title -->
            <h2 class="font-serif text-xl sm:text-2xl font-bold leading-relaxed text-slate-950">
              {{ activeTopic }}
            </h2>

            <!-- Prompt introduction line -->
            <p class="mt-4 font-serif text-base sm:text-lg font-semibold text-slate-800">
              {{ activePrompt }}
            </p>

            <!-- Bullet points -->
            <ul class="mt-3 flex flex-col gap-2.5 pl-2">
              <li
                v-for="(item, idx) in activeBulletPoints"
                :key="idx"
                class="flex items-start gap-3 font-serif text-base sm:text-lg leading-relaxed text-slate-800"
              >
                <span class="text-xl font-bold text-slate-700 leading-none select-none">•</span>
                <span>{{ item }}</span>
              </li>
            </ul>

            <!-- Concluding bullet footer -->
            <p v-if="activeFooter" class="mt-4 font-serif text-base sm:text-lg font-bold text-slate-900 border-t border-slate-200 pt-3">
              {{ activeFooter }}
            </p>
          </div>

          <!-- Candidate Scratchpad (Notes) -->
          <div class="mt-5 rounded-xl border border-slate-300 bg-[#f8fafc] p-4">
            <div class="mb-2 flex items-center justify-between">
              <div class="flex items-center gap-2">
                <PencilSquareIcon class="h-4 w-4 text-slate-600" />
                <span class="text-xs font-bold uppercase tracking-wider text-slate-700">
                  Candidate Notes (1-Minute Preparation)
                </span>
              </div>
              <div class="flex items-center gap-2">
                <button
                  v-if="candidateNotes.trim()"
                  class="text-[11px] font-semibold text-slate-600 underline hover:text-slate-900"
                  @click="copyNotes"
                >
                  {{ notesCopied ? 'Copied!' : 'Copy' }}
                </button>
                <button
                  v-if="candidateNotes.trim()"
                  class="text-[11px] font-medium text-rose-600 hover:text-rose-800"
                  @click="candidateNotes = ''"
                >
                  Clear
                </button>
              </div>
            </div>

            <!-- Quick note keywords -->
            <div class="mb-2 flex flex-wrap gap-1.5">
              <button
                v-for="chip in ['What / Where', 'When', 'Who with', 'Why / Feelings']"
                :key="chip"
                class="rounded border border-slate-300 bg-white px-2 py-0.5 text-[11px] font-medium text-slate-700 hover:bg-slate-50 transition active:scale-95"
                @click="appendNoteChip(chip)"
              >
                + {{ chip }}
              </button>
            </div>

            <textarea
              v-model="candidateNotes"
              rows="3"
              class="w-full resize-y rounded-lg border border-slate-300 bg-white p-2.5 font-mono text-sm text-slate-900 placeholder-slate-400 outline-none focus:border-slate-700 focus:ring-1 focus:ring-slate-700"
              placeholder="Jot down brief keywords and phrases for your talk..."
            ></textarea>
          </div>
        </div>

        <!-- Footer Bar with Preparation & Speaking Timer -->
        <div class="card-footer flex flex-wrap items-center justify-between gap-3 border-t-2 border-slate-800 bg-[#f1f5f9] px-6 py-3.5">
          <!-- Timer Display -->
          <div class="flex items-center gap-3">
            <div
              class="flex h-10 w-10 items-center justify-center rounded-xl font-mono text-base font-bold shadow-sm"
              :class="
                currentPhase === 'prep'
                  ? 'bg-amber-100 text-amber-900 border border-amber-300'
                  : 'bg-emerald-100 text-emerald-900 border border-emerald-300'
              "
            >
              <ClockIcon class="h-5 w-5" />
            </div>
            <div>
              <p class="text-[10px] font-bold uppercase tracking-wider text-slate-500">
                {{ currentPhase === 'prep' ? 'Preparation Time' : 'Speaking Time' }}
              </p>
              <p class="font-mono text-xl font-black tracking-tight text-slate-900">
                {{ formattedTime }}
              </p>
            </div>
          </div>

          <!-- Controls -->
          <div class="flex items-center gap-2">
            <button
              class="flex h-9 items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 text-xs font-bold text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95"
              @click="toggleTimer"
            >
              <PauseIcon v-if="isTimerRunning" class="h-3.5 w-3.5" />
              <PlayIcon v-else class="h-3.5 w-3.5 text-emerald-600" />
              <span>{{ isTimerRunning ? 'Pause' : 'Start' }}</span>
            </button>

            <button
              class="flex h-9 items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 text-xs font-medium text-slate-700 shadow-sm transition hover:bg-slate-50 active:scale-95"
              title="Reset Timer"
              @click="resetTimer"
            >
              <ArrowPathIcon class="h-3.5 w-3.5" />
              <span>Reset</span>
            </button>

            <button
              v-if="currentPhase === 'prep'"
              class="flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 text-xs font-bold text-white shadow transition hover:bg-emerald-500 active:scale-95"
              @click="switchPhase('speak')"
            >
              <MicrophoneIcon class="h-3.5 w-3.5" />
              <span>Start Speaking</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import {
  ArrowPathIcon,
  ArrowsPointingInIcon,
  ArrowsPointingOutIcon,
  ClockIcon,
  MicrophoneIcon,
  PauseIcon,
  PencilSquareIcon,
  PlayIcon,
  XMarkIcon,
} from '@heroicons/vue/24/solid'

const props = defineProps({
  visible: { type: Boolean, default: false },
  title: { type: String, default: '' },
  prompt: { type: String, default: 'You should say:' },
  items: { type: Array, default: () => [] },
  footer: { type: String, default: '' },
  prepSeconds: { type: Number, default: 60 },
  speakSeconds: { type: Number, default: 120 },
})

const emit = defineEmits(['dismiss', 'phase-change', 'time-expired'])

// Default Fallback IELTS Task (Describe a website)
const DEFAULT_TOPIC = 'Describe a website you use that helps you a lot in your work or studies.'
const DEFAULT_PROMPT = 'You should say:'
const DEFAULT_ITEMS = [
  'what the website is',
  'how often you use the website',
  'what information you find on the website',
]
const DEFAULT_FOOTER = 'and explain why you find the website useful.'

// State
const isMinimized = ref(false)
const currentPhase = ref('prep') // 'prep' (60s default) or 'speak' (120s)
const remainingSeconds = ref(props.prepSeconds || 60)
const totalSeconds = ref(props.prepSeconds || 60)
const isTimerRunning = ref(false)
const candidateNotes = ref('')
const notesCopied = ref(false)

// Draggable positioning
const cardPosition = ref({ x: 32, y: 70 })
const isDragging = ref(false)
let dragOffset = { x: 0, y: 0 }

// Topic resolution
const activeTopic = computed(() => props.title?.trim() || DEFAULT_TOPIC)
const activePrompt = computed(() => props.prompt?.trim() || DEFAULT_PROMPT)
const activeBulletPoints = computed(() => {
  if (props.items && props.items.length > 0) return props.items
  return DEFAULT_ITEMS
})
const activeFooter = computed(() => props.footer?.trim() || DEFAULT_FOOTER)

const progressPercent = computed(() => {
  if (!totalSeconds.value || totalSeconds.value <= 0) return 0
  return Math.max(0, Math.min(100, (remainingSeconds.value / totalSeconds.value) * 100))
})

const formattedTime = computed(() => {
  const total = Math.max(0, Math.floor(remainingSeconds.value))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${String(s).padStart(2, '0')}`
})

const cardPositionStyle = computed(() => {
  if (isMinimized.value) {
    return {
      bottom: '90px',
      left: '24px',
      transform: 'none',
    }
  }
  return {
    top: `${cardPosition.value.y}px`,
    left: `${cardPosition.value.x}px`,
    width: 'min(580px, calc(100vw - 32px))',
  }
})

// Timer management
let timerInterval = null

const startTimer = () => {
  if (timerInterval) clearInterval(timerInterval)
  isTimerRunning.value = true
  timerInterval = setInterval(() => {
    if (remainingSeconds.value > 0) {
      remainingSeconds.value -= 1
    } else {
      handleTimerExpired()
    }
  }, 1000)
}

const pauseTimer = () => {
  if (timerInterval) clearInterval(timerInterval)
  timerInterval = null
  isTimerRunning.value = false
}

const toggleTimer = () => {
  if (isTimerRunning.value) {
    pauseTimer()
  } else {
    startTimer()
  }
}

const resetTimer = () => {
  pauseTimer()
  if (currentPhase.value === 'prep') {
    remainingSeconds.value = props.prepSeconds || 60
    totalSeconds.value = props.prepSeconds || 60
  } else {
    remainingSeconds.value = props.speakSeconds || 120
    totalSeconds.value = props.speakSeconds || 120
  }
}

const switchPhase = (phase) => {
  pauseTimer()
  currentPhase.value = phase
  if (phase === 'prep') {
    remainingSeconds.value = props.prepSeconds || 60
    totalSeconds.value = props.prepSeconds || 60
  } else {
    remainingSeconds.value = props.speakSeconds || 120
    totalSeconds.value = props.speakSeconds || 120
  }
  startTimer()
  emit('phase-change', phase)
}

const handleTimerExpired = () => {
  pauseTimer()
  playChimeAlert()
  emit('time-expired', currentPhase.value)

  if (currentPhase.value === 'prep') {
    // Automatically advance to 2-minute speaking phase
    switchPhase('speak')
  }
}

const playChimeAlert = () => {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(587.33, ctx.currentTime) // D5
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.3) // A5
    gain.gain.setValueAtTime(0.25, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.55)
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.55)
  } catch (err) {
    void err
  }
}

const appendNoteChip = (chip) => {
  candidateNotes.value += (candidateNotes.value ? '\n' : '') + `• ${chip}: `
}

const copyNotes = async () => {
  try {
    await navigator.clipboard.writeText(candidateNotes.value)
    notesCopied.value = true
    setTimeout(() => {
      notesCopied.value = false
    }, 2000)
  } catch (err) {
    void err
  }
}

const handleDismiss = () => {
  pauseTimer()
  emit('dismiss')
}

// Dragging logic
const startDrag = (e) => {
  if (isMinimized.value) return
  isDragging.value = true
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const clientY = e.touches ? e.touches[0].clientY : e.clientY
  dragOffset.x = clientX - cardPosition.value.x
  dragOffset.y = clientY - cardPosition.value.y

  window.addEventListener('mousemove', onDrag)
  window.addEventListener('mouseup', stopDrag)
  window.addEventListener('touchmove', onDrag)
  window.addEventListener('touchend', stopDrag)
}

const onDrag = (e) => {
  if (!isDragging.value) return
  const clientX = e.touches ? e.touches[0].clientX : e.clientX
  const clientY = e.touches ? e.touches[0].clientY : e.clientY
  const maxX = window.innerWidth - 320
  const maxY = window.innerHeight - 180
  cardPosition.value.x = Math.max(12, Math.min(maxX, clientX - dragOffset.x))
  cardPosition.value.y = Math.max(12, Math.min(maxY, clientY - dragOffset.y))
}

const stopDrag = () => {
  isDragging.value = false
  window.removeEventListener('mousemove', onDrag)
  window.removeEventListener('mouseup', stopDrag)
  window.removeEventListener('touchmove', onDrag)
  window.removeEventListener('touchend', stopDrag)
}

watch(
  () => props.visible,
  (val) => {
    if (val) {
      currentPhase.value = 'prep'
      remainingSeconds.value = props.prepSeconds || 60
      totalSeconds.value = props.prepSeconds || 60
      startTimer()
    } else {
      pauseTimer()
    }
  },
  { immediate: true },
)

onMounted(() => {
  if (window.innerWidth > 768) {
    cardPosition.value.x = 32
    cardPosition.value.y = 70
  } else {
    cardPosition.value.x = 16
    cardPosition.value.y = 50
  }
})

onBeforeUnmount(() => {
  pauseTimer()
  stopDrag()
})
</script>

<style scoped>
.cue-card-container {
  max-width: calc(100vw - 32px);
}

.cue-card-pop-enter-active,
.cue-card-pop-leave-active {
  transition: all 260ms cubic-bezier(0.16, 1, 0.3, 1);
}

.cue-card-pop-enter-from,
.cue-card-pop-leave-to {
  opacity: 0;
  transform: scale(0.95) translateY(12px);
}

.card-content-scroll::-webkit-scrollbar {
  width: 6px;
}
.card-content-scroll::-webkit-scrollbar-track {
  background: transparent;
}
.card-content-scroll::-webkit-scrollbar-thumb {
  background: rgba(100, 116, 139, 0.3);
  border-radius: 9999px;
}
.card-content-scroll::-webkit-scrollbar-thumb:hover {
  background: rgba(100, 116, 139, 0.5);
}
</style>
