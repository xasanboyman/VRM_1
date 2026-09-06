<template>
  <div
    class="pointer-events-none absolute bottom-4 left-1/2 z-30 w-[min(680px,calc(100%-1.5rem))] -translate-x-1/2 sm:bottom-7"
  >
    <div
      class="dock-shell pointer-events-auto mx-auto flex items-center justify-between gap-2 rounded-[1.4rem] bg-black/60 border border-cyan-500/20 px-2 py-2 backdrop-blur-xl shadow-[0_4px_30px_rgba(0,0,0,0.5)] sm:gap-3 sm:px-3 transition-all duration-300"
    >
      <input
        ref="fileInputRef"
        type="file"
        accept=".vrm"
        class="hidden"
        @change="handleFileUpload"
      />

      <!-- Upload VRM Avatar -->
      <button
        class="dock-btn group relative flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 text-white/40 transition-all hover:bg-white/10 hover:text-white"
        :class="!isReady ? 'opacity-50 cursor-not-allowed' : ''"
        :disabled="!isReady"
        :title="translate('dock.uploadAvatarTitle')"
        @click="openFilePicker"
      >
        <ArrowUpTrayIcon class="h-5 w-5" />
        <span
          class="absolute -top-10 left-1/2 -translate-x-1/2 rounded bg-black/90 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap"
          >{{ translate('dock.upload') }}</span
        >
      </button>

      <!-- Screen Share Toggle -->
      <button
        class="dock-btn group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all"
        :class="
          isSharingScreen
            ? 'bg-purple-500/20 text-purple-300 shadow-[0_0_15px_rgba(168,85,247,0.3)]'
            : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
        "
        :title="translate('dock.toggleScreenShareTitle')"
        @click="$emit('toggle-screen-share')"
      >
        <ComputerDesktopIcon class="h-5 w-5" />
        <span
          class="absolute -top-10 left-1/2 -translate-x-1/2 rounded bg-black/90 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap"
          >{{ translate('dock.screen') }}</span
        >
      </button>

      <!-- Main Live Call Connect / Disconnect Button -->
      <button
        class="dock-call group relative flex h-14 w-14 items-center justify-center rounded-full border-2 transition-all duration-300"
        :class="[
          !isReady || isConnecting ? 'opacity-50 cursor-not-allowed border-white/5 bg-white/5' : '',
          isConnected
            ? 'border-rose-500/50 bg-rose-500/20 text-rose-300 shadow-[0_0_20px_rgba(244,63,94,0.4)] hover:bg-rose-500/30'
            : 'border-emerald-500/50 bg-emerald-500/20 text-emerald-300 shadow-[0_0_20px_rgba(16,185,129,0.4)] hover:bg-emerald-500/30',
        ]"
        :disabled="!isReady || isConnecting"
        :title="
          isConnecting
            ? translate('dock.connecting')
            : isConnected
              ? translate('dock.disconnect')
              : translate('dock.connect')
        "
        @click="$emit('toggle-connection')"
      >
        <PhoneXMarkIcon v-if="isConnected" class="h-6 w-6" />
        <MicrophoneIcon v-else class="h-6 w-6" :class="isConnecting ? 'animate-pulse' : ''" />
      </button>

      <!-- Chat Sidebar Toggle -->
      <button
        class="dock-btn group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all"
        :class="
          showChat
            ? 'bg-cyan-500/20 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.3)]'
            : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
        "
        :title="translate('dock.toggleChatTitle')"
        @click="$emit('toggle-chat')"
      >
        <ChatBubbleLeftRightIcon class="h-5 w-5" />
        <span
          class="absolute -top-10 left-1/2 -translate-x-1/2 rounded bg-black/90 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap"
          >{{ translate('dock.chat') }}</span
        >
      </button>

      <!-- Subtitles Toggle -->
      <button
        class="dock-btn group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all"
        :class="
          showSubtitles
            ? 'bg-rose-500/20 text-rose-300 shadow-[0_0_15px_rgba(244,63,94,0.35)]'
            : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
        "
        :title="translate('dock.toggleSubtitlesTitle')"
        @click="$emit('toggle-subtitles')"
      >
        <ChatBubbleBottomCenterTextIcon class="h-5 w-5" />
        <span
          class="absolute -top-10 left-1/2 -translate-x-1/2 rounded bg-black/90 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap"
          >{{ translate('dock.subtitles') }}</span
        >
      </button>

      <!-- Settings Panel Toggle -->
      <button
        class="dock-btn group relative flex h-10 w-10 items-center justify-center rounded-xl transition-all"
        :class="
          showSettings
            ? 'bg-cyan-500/20 text-cyan-300 shadow-[0_0_15px_rgba(34,211,238,0.3)]'
            : 'bg-white/5 text-white/40 hover:bg-white/10 hover:text-white'
        "
        :title="translate('dock.settingsTitle')"
        @click="$emit('toggle-settings')"
      >
        <Cog6ToothIcon class="h-5 w-5" />
        <span
          class="absolute -top-10 left-1/2 -translate-x-1/2 rounded bg-black/90 px-2 py-1 text-[10px] text-white opacity-0 transition-opacity group-hover:opacity-100 whitespace-nowrap"
          >{{ translate('dock.settings') }}</span
        >
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'
import {
  ArrowUpTrayIcon,
  ChatBubbleBottomCenterTextIcon,
  ChatBubbleLeftRightIcon,
  Cog6ToothIcon,
  ComputerDesktopIcon,
  MicrophoneIcon,
  PhoneXMarkIcon,
} from '@heroicons/vue/24/solid'
import { translateUi } from '../i18n/ui.js'

const props = defineProps({
  isReady: {
    type: Boolean,
    default: false,
  },
  isConnected: Boolean,
  isConnecting: {
    type: Boolean,
    default: false,
  },
  isSharingScreen: Boolean,
  showChat: Boolean,
  showSubtitles: {
    type: Boolean,
    default: true,
  },
  showSettings: Boolean,
  language: {
    type: String,
    default: 'en',
  },
})

const emit = defineEmits([
  'toggle-connection',
  'toggle-screen-share',
  'toggle-chat',
  'toggle-subtitles',
  'toggle-settings',
  'file-upload',
])

const fileInputRef = ref(null)
const translate = (key, params = {}) => translateUi(props.language, key, params)

const openFilePicker = () => {
  if (fileInputRef.value) {
    fileInputRef.value.click()
  }
}

const handleFileUpload = (event) => {
  if (event.target.files && event.target.files[0]) {
    emit('file-upload', event.target.files[0])
  }
  event.target.value = ''
}
</script>
