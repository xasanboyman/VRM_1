<template>
  <Transition name="timer-pop">
    <div
      v-if="visible"
      class="timer-widget pointer-events-auto fixed z-[55] select-none"
      :class="[
        minimized ? 'is-minimized' : 'is-expanded',
        isUrgent ? 'is-urgent' : '',
        isExpired ? 'is-expired' : '',
      ]"
      :style="positionStyle"
      role="timer"
      aria-live="polite"
      @click="emit('toggle-minimize')"
    >
      <div
        class="timer-shell relative overflow-hidden rounded-2xl border border-cyan-500/25 bg-black/55 backdrop-blur-xl shadow-[0_20px_44px_rgba(1,6,16,0.62)]"
      >
        <div class="pointer-events-none absolute inset-0 opacity-70">
          <div
            class="absolute -left-10 -top-10 h-32 w-32 rounded-full bg-cyan-400/15 blur-2xl"
          ></div>
          <div
            class="absolute -bottom-10 -right-10 h-32 w-32 rounded-full bg-indigo-500/12 blur-2xl"
          ></div>
        </div>

        <div class="relative flex items-center gap-3 px-3 py-2.5">
          <div class="relative grid place-items-center">
            <svg class="h-11 w-11 -rotate-90" viewBox="0 0 48 48" fill="none" aria-hidden="true">
              <circle cx="24" cy="24" :r="RADIUS" class="stroke-white/10" stroke-width="5" />
              <circle
                cx="24"
                cy="24"
                :r="RADIUS"
                class="timer-ring"
                stroke-width="5"
                stroke-linecap="round"
                :stroke-dasharray="circumference"
                :stroke-dashoffset="dashOffset"
              />
            </svg>
            <p class="absolute text-[11px] font-mono tracking-[0.12em] text-white/85">
              {{ formattedTime }}
            </p>
          </div>

          <div class="min-w-0 flex-1">
            <p
              class="text-[10px] font-mono uppercase tracking-[0.16em] text-white/50"
              :class="minimized ? 'hidden' : ''"
            >
              {{ isExpired ? 'Time' : 'Timer' }}
            </p>
            <p
              class="truncate text-sm font-semibold text-white/90"
              :class="minimized ? 'text-[13px]' : ''"
              :title="label"
            >
              {{ label }}
            </p>
            <p v-if="!minimized" class="mt-0.5 text-xs text-white/50">
              {{ isExpired ? 'Time is up' : 'Counting down…' }}
            </p>
          </div>

          <div class="flex shrink-0 items-center gap-2">
            <button
              class="timer-btn"
              type="button"
              title="Dismiss timer"
              aria-label="Dismiss timer"
              @click.stop="emit('dismiss')"
            >
              ×
            </button>
          </div>
        </div>
      </div>
    </div>
  </Transition>
</template>

<script setup>
import { computed } from 'vue'

const props = defineProps({
  visible: {
    type: Boolean,
    default: false,
  },
  minimized: {
    type: Boolean,
    default: true,
  },
  label: {
    type: String,
    default: 'Timer',
  },
  remainingSeconds: {
    type: Number,
    default: 0,
  },
  progress: {
    type: Number,
    default: 0,
  },
})

const emit = defineEmits(['toggle-minimize', 'dismiss'])

const RADIUS = 18
const circumference = 2 * Math.PI * RADIUS

const clamp01 = (value) => Math.max(0, Math.min(1, Number(value) || 0))

const isExpired = computed(() => (Number(props.remainingSeconds) || 0) <= 0)
const isUrgent = computed(() => !isExpired.value && (Number(props.remainingSeconds) || 0) <= 5)

const dashOffset = computed(() => circumference * (1 - clamp01(props.progress)))

const formattedTime = computed(() => {
  const totalSeconds = Math.max(0, Math.floor(Number(props.remainingSeconds) || 0))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
})

const positionStyle = computed(() => {
  if (props.minimized) {
    return {
      top: 'calc(100dvh - 86px)',
      left: '16px',
      transform: 'translate3d(0,0,0) scale(0.92)',
    }
  }

  return {
    top: '50%',
    left: '50%',
    transform: 'translate3d(-50%,-50%,0) scale(1)',
  }
})
</script>

<style scoped>
.timer-widget {
  width: min(360px, calc(100vw - 2rem));
  transition:
    top 650ms cubic-bezier(0.22, 1, 0.36, 1),
    left 650ms cubic-bezier(0.22, 1, 0.36, 1),
    transform 650ms cubic-bezier(0.22, 1, 0.36, 1),
    filter 350ms ease,
    box-shadow 350ms ease;
}

.timer-widget.is-minimized {
  width: 182px;
}

.timer-ring {
  stroke: rgba(54, 225, 255, 0.9);
  filter: drop-shadow(0 0 10px rgba(54, 225, 255, 0.22));
  transition: stroke-dashoffset 240ms linear;
}

.timer-widget.is-urgent .timer-ring {
  stroke: rgba(251, 191, 36, 0.95);
  filter: drop-shadow(0 0 14px rgba(251, 191, 36, 0.18));
}

.timer-widget.is-expired .timer-ring {
  stroke: rgba(244, 63, 94, 0.95);
  filter: drop-shadow(0 0 18px rgba(244, 63, 94, 0.2));
}

.timer-widget.is-expired .timer-shell {
  border-color: rgba(244, 63, 94, 0.45);
  background: rgba(244, 63, 94, 0.12);
}

.timer-widget.is-urgent {
  animation: timerPulse 900ms ease-in-out infinite;
}

.timer-widget.is-expired {
  animation: timerGlow 1200ms ease-in-out infinite;
}

.timer-widget.is-expired .timer-shell {
  animation: timerShake 650ms ease-in-out 3;
}

.timer-btn {
  height: 28px;
  width: 28px;
  border-radius: 10px;
  border: 1px solid rgba(125, 157, 189, 0.28);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.7);
  font-size: 18px;
  line-height: 0;
  display: grid;
  place-items: center;
  transition:
    transform 160ms ease,
    background 160ms ease,
    border-color 160ms ease,
    color 160ms ease;
}

.timer-btn:hover {
  transform: translateY(-1px);
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(54, 225, 255, 0.4);
  color: rgba(255, 255, 255, 0.9);
}

.timer-pop-enter-active,
.timer-pop-leave-active {
  transition:
    opacity 220ms ease,
    transform 220ms ease;
}

.timer-pop-enter-from,
.timer-pop-leave-to {
  opacity: 0;
  transform: translate3d(0, 8px, 0) scale(0.98);
}

@keyframes timerPulse {
  0%,
  100% {
    filter: drop-shadow(0 0 0 rgba(251, 191, 36, 0));
  }
  50% {
    filter: drop-shadow(0 0 18px rgba(251, 191, 36, 0.18));
  }
}

@keyframes timerShake {
  0%,
  100% {
    transform: translate3d(0, 0, 0);
  }
  25% {
    transform: translate3d(-2px, 0, 0);
  }
  75% {
    transform: translate3d(2px, 0, 0);
  }
}

@keyframes timerGlow {
  0%,
  100% {
    filter: drop-shadow(0 0 14px rgba(244, 63, 94, 0.12));
  }
  50% {
    filter: drop-shadow(0 0 26px rgba(244, 63, 94, 0.22));
  }
}

@media (prefers-reduced-motion: reduce) {
  .timer-widget,
  .timer-widget.is-urgent,
  .timer-widget.is-expired {
    animation: none !important;
    transition: none !important;
  }

  .timer-shell {
    animation: none !important;
  }
}
</style>
