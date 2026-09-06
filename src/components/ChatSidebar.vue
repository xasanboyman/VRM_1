<template>
  <div
    class="panel-shell absolute bottom-24 right-3 top-20 z-30 flex w-[min(420px,calc(100%-1.5rem))] flex-col overflow-hidden rounded-2xl border border-cyan-500/20 bg-black/80 backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.4)] sm:bottom-28 sm:right-4 transition-all duration-300"
  >
    <div
      class="flex items-center justify-between border-b border-white/5 px-4 py-3 bg-white/[0.02]"
    >
      <div class="flex items-center gap-2">
        <span
          class="h-1.5 w-1.5 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)] animate-pulse"
        ></span>
        <p class="text-[11px] font-mono uppercase tracking-[0.16em] text-cyan-100/80">
          {{ translate('chat.conversationLog', { count: chatHistory.length }) }}
        </p>
      </div>
      <div class="flex items-center gap-3">
        <button
          class="text-[10px] font-mono uppercase tracking-[0.14em] text-cyan-500/50 transition-colors hover:text-rose-400"
          @click="$emit('clear-history')"
        >
          {{ translate('chat.clear') }}
        </button>
        <button class="text-white/30 transition-colors hover:text-white" @click="$emit('close')">
          <XMarkIcon class="h-4 w-4" />
        </button>
      </div>
    </div>

    <div
      ref="chatContainerRef"
      class="scroll-area flex-1 space-y-5 overflow-y-auto overscroll-contain px-4 py-4 no-scrollbar"
    >
      <div
        v-if="chatHistory.length === 0"
        class="flex h-full flex-col items-center justify-center gap-2 text-white/20"
      >
        <ChatBubbleLeftRightIcon class="h-8 w-8 opacity-40" />
        <p class="text-xs font-mono uppercase tracking-[0.16em]">
          {{ translate('chat.noMessagesYet') }}
        </p>
      </div>

      <div
        v-for="(msg, idx) in chatHistory"
        :key="msg.id || idx"
        class="flex flex-col"
        :class="msg.role === 'user' ? 'items-end' : 'items-start'"
      >
        <div
          class="max-w-[88%] rounded-2xl border px-4 py-3 text-sm leading-relaxed backdrop-blur-md transition-all sm:text-[13px]"
          :class="
            msg.role === 'user'
              ? 'border-cyan-500/30 bg-cyan-950/40 text-cyan-50 shadow-[0_4px_20px_rgba(6,182,212,0.1)]'
              : 'border-purple-500/20 bg-purple-900/20 text-indigo-50 shadow-[0_4px_20px_rgba(168,85,247,0.05)]'
          "
        >
          {{ msg.text }}
        </div>
        <div class="mt-1.5 flex items-center gap-2 px-1">
          <span
            class="text-[10px] font-mono uppercase tracking-[0.14em]"
            :class="msg.role === 'user' ? 'text-cyan-400' : 'text-purple-400'"
          >
            {{ msg.role === 'user' ? translate('chat.you') : translate('chat.assistant') }}
          </span>
          <span class="text-[10px] text-white/20">·</span>
          <span class="text-[10px] font-mono text-white/30">
            {{ formatTime(msg.timestamp) }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { nextTick, ref, watch } from 'vue'
import { ChatBubbleLeftRightIcon, XMarkIcon } from '@heroicons/vue/24/solid'
import { getLocaleForLanguage, translateUi } from '../i18n/ui.js'

const props = defineProps({
  chatHistory: {
    type: Array,
    default: () => [],
  },
  language: {
    type: String,
    default: 'en',
  },
})

defineEmits(['clear-history', 'close'])

const chatContainerRef = ref(null)
const translate = (key, params = {}) => translateUi(props.language, key, params)

const formatTime = (timestamp) => {
  return new Date(timestamp).toLocaleTimeString(getLocaleForLanguage(props.language), {
    hour: '2-digit',
    minute: '2-digit',
  })
}

watch(
  () => props.chatHistory,
  () => {
    nextTick(() => {
      const container = chatContainerRef.value
      if (container) {
        container.scrollTo({
          top: container.scrollHeight,
          behavior: 'smooth',
        })
      }
    })
  },
  { deep: true },
)
</script>
