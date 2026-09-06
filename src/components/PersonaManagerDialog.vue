<template>
  <div
    class="panel-shell absolute left-1/2 top-1/2 z-30 flex max-h-[calc(100vh-1.5rem)] w-[min(680px,calc(100%-1.5rem))] -translate-x-1/2 -translate-y-1/2 flex-col overflow-hidden rounded-3xl border border-cyan-500/20 bg-black/85 p-4 backdrop-blur-xl shadow-[0_0_50px_rgba(0,0,0,0.65)] sm:max-h-[calc(100vh-2rem)] sm:p-5"
  >
    <div class="mb-5 flex items-center justify-between border-b border-white/5 pb-4">
      <div class="flex items-center gap-2">
        <SparklesIcon class="h-4 w-4 text-cyan-300" />
        <p class="text-[11px] font-mono uppercase tracking-[0.2em] text-cyan-100/90">
          {{ translate('personaDialog.editPersonas') }}
        </p>
      </div>
      <button
        class="group rounded-full p-1.5 text-white/40 transition-colors hover:bg-white/10 hover:text-white"
        @click="$emit('close')"
      >
        <XMarkIcon class="h-5 w-5 transition-transform group-hover:rotate-90" />
      </button>
    </div>

    <div class="no-scrollbar grid min-h-0 flex-1 gap-4 overflow-y-auto pr-1 md:grid-cols-2">
      <div>
        <div class="mb-3 flex items-center justify-between">
          <p class="text-[10px] font-mono uppercase tracking-[0.15em] text-cyan-500/60">
            {{ translate('personaDialog.availablePersonas') }}
          </p>
          <button
            :disabled="isEditLockActive"
            class="inline-flex items-center gap-1 rounded-lg border border-cyan-500/30 bg-cyan-500/10 px-2 py-1 text-[10px] font-mono uppercase tracking-[0.12em] text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:bg-cyan-500/10"
            @click="startCreatePersona"
          >
            <PlusIcon class="h-3.5 w-3.5" />
            {{ translate('personaDialog.new') }}
          </button>
        </div>

        <div class="no-scrollbar max-h-[38vh] space-y-2 overflow-y-auto pr-1 md:max-h-[360px]">
          <div
            v-for="persona in personas"
            :key="persona.id"
            class="group rounded-xl border p-3 transition-all"
            :class="[
              selectedPersonaId === persona.id
                ? 'border-cyan-500/50 bg-cyan-900/25'
                : 'border-white/5 bg-white/5 hover:bg-cyan-900/20 hover:border-cyan-500/30',
              isPersonaLocked(persona.id) ? 'cursor-not-allowed opacity-40' : 'cursor-pointer',
            ]"
            :aria-disabled="isPersonaLocked(persona.id)"
            @click="selectPersona(persona.id)"
          >
            <div class="flex items-start justify-between gap-2">
              <div class="min-w-0">
                <div class="flex items-center gap-2">
                  <p class="truncate text-xs font-semibold text-white/90">{{ persona.title }}</p>
                  <CheckCircleIcon
                    v-if="selectedPersonaId === persona.id"
                    class="h-3.5 w-3.5 shrink-0 text-cyan-300"
                  />
                  <span
                    v-if="persona.isDefault"
                    class="rounded border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-mono uppercase tracking-[0.1em] text-amber-200"
                  >
                    {{ translate('personaDialog.default') }}
                  </span>
                </div>
                <p class="mt-1 text-[10px] leading-relaxed text-white/50">
                  {{ persona.description }}
                </p>
              </div>

              <div class="flex items-center gap-1">
                <button
                  v-if="!persona.isDefault && !persona.isBuiltin"
                  :disabled="isPersonaLocked(persona.id)"
                  class="rounded p-1.5 text-white/35 transition hover:bg-white/10 hover:text-cyan-200"
                  :class="{
                    'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-white/35':
                      isPersonaLocked(persona.id),
                  }"
                  :title="translate('personaDialog.editPersonaTitle')"
                  @click.stop="startEditPersona(persona)"
                >
                  <PencilSquareIcon class="h-4 w-4" />
                </button>
                <button
                  v-if="!persona.isDefault && !persona.isBuiltin"
                  :disabled="isPersonaLocked(persona.id)"
                  class="rounded p-1.5 text-white/35 transition hover:bg-rose-500/20 hover:text-rose-300"
                  :class="{
                    'cursor-not-allowed opacity-40 hover:bg-transparent hover:text-white/35':
                      isPersonaLocked(persona.id),
                  }"
                  :title="translate('personaDialog.deletePersonaTitle')"
                  @click.stop="deletePersona(persona.id)"
                >
                  <TrashIcon class="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="rounded-xl border border-white/10 bg-black/35 p-3">
        <div class="mb-3 flex items-center justify-between">
          <p class="text-[10px] font-mono uppercase tracking-[0.12em] text-cyan-200/70">
            {{
              isEditingPersona
                ? translate('personaDialog.editPersona')
                : translate('personaDialog.createPersona')
            }}
          </p>
          <button
            v-if="isPersonaFormOpen"
            class="text-[10px] text-white/50 hover:text-white transition"
            @click="cancelPersonaForm"
          >
            {{ translate('personaDialog.cancel') }}
          </button>
        </div>

        <div v-if="isPersonaFormOpen" class="space-y-3">
          <label class="block space-y-1">
            <span class="text-[10px] text-white/50">{{ translate('personaDialog.title') }}</span>
            <input
              v-model="personaDraft.title"
              type="text"
              maxlength="60"
              class="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none transition focus:border-cyan-400/60"
              :placeholder="translate('personaDialog.titlePlaceholder')"
            />
          </label>

          <label class="block space-y-1">
            <span class="text-[10px] text-white/50">{{
              translate('personaDialog.shortDescription')
            }}</span>
            <input
              v-model="personaDraft.description"
              type="text"
              maxlength="180"
              class="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none transition focus:border-cyan-400/60"
              :placeholder="translate('personaDialog.summaryPlaceholder')"
            />
          </label>

          <label class="block space-y-1">
            <span class="text-[10px] text-white/50">{{
              translate('personaDialog.personaPrompt')
            }}</span>
            <textarea
              v-model="personaDraft.prompt"
              rows="6"
              maxlength="5000"
              class="w-full rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white outline-none transition focus:border-cyan-400/60 resize-y"
              :placeholder="translate('personaDialog.promptPlaceholder')"
            ></textarea>
          </label>

          <button
            class="w-full rounded-lg border border-cyan-400/40 bg-cyan-500/15 px-3 py-2 text-xs font-semibold text-cyan-100 transition hover:bg-cyan-500/25"
            @click="submitPersona"
          >
            {{
              isEditingPersona
                ? translate('personaDialog.saveChanges')
                : translate('personaDialog.addPersona')
            }}
          </button>
        </div>

        <div v-else class="text-[11px] leading-relaxed text-white/45">
          {{ translate('personaDialog.pickPersonaHint') }}
        </div>
        <p v-if="isEditLockActive" class="mt-3 text-[10px] text-cyan-200/70">
          {{ translate('personaDialog.editLockHint') }}
        </p>
      </div>
    </div>
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import {
  CheckCircleIcon,
  PencilSquareIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
} from '@heroicons/vue/24/solid'
import { translateUi } from '../i18n/ui.js'

const props = defineProps({
  personas: {
    type: Array,
    default: () => [],
  },
  selectedPersonaId: {
    type: String,
    default: '',
  },
  language: {
    type: String,
    default: 'en',
  },
})

const emit = defineEmits([
  'close',
  'select-persona',
  'create-persona',
  'update-persona',
  'delete-persona',
])

const isPersonaFormOpen = ref(false)
const isEditingPersona = ref(false)
const editingPersonaId = ref('')
const personaDraft = ref({
  title: '',
  description: '',
  prompt: '',
})
const translate = (key, params = {}) => translateUi(props.language, key, params)

const sanitizeDraft = () => {
  personaDraft.value = {
    title: (personaDraft.value.title || '').trim(),
    description: (personaDraft.value.description || '').trim(),
    prompt: (personaDraft.value.prompt || '').trim(),
  }
}

const isEditLockActive = computed(
  () => isPersonaFormOpen.value && isEditingPersona.value && Boolean(editingPersonaId.value),
)

const isPersonaLocked = (personaId) => {
  if (!isEditLockActive.value) return false
  return personaId !== editingPersonaId.value
}

const resetPersonaDraft = () => {
  isPersonaFormOpen.value = false
  isEditingPersona.value = false
  editingPersonaId.value = ''
  personaDraft.value = {
    title: '',
    description: '',
    prompt: '',
  }
}

const startCreatePersona = () => {
  if (isEditLockActive.value) return
  resetPersonaDraft()
  isPersonaFormOpen.value = true
}

const startEditPersona = (persona) => {
  if (!persona || persona.isDefault || persona.isBuiltin) return
  if (isEditLockActive.value && editingPersonaId.value !== persona.id) return
  isPersonaFormOpen.value = true
  isEditingPersona.value = true
  editingPersonaId.value = persona.id
  personaDraft.value = {
    title: persona.title || '',
    description: persona.description || '',
    prompt: persona.prompt || '',
  }
}

const cancelPersonaForm = () => {
  resetPersonaDraft()
}

const submitPersona = () => {
  sanitizeDraft()
  if (!personaDraft.value.title || !personaDraft.value.description || !personaDraft.value.prompt) {
    return
  }

  if (isEditingPersona.value && editingPersonaId.value) {
    emit('update-persona', {
      id: editingPersonaId.value,
      ...personaDraft.value,
    })
  } else {
    emit('create-persona', {
      ...personaDraft.value,
    })
  }

  resetPersonaDraft()
}

const selectPersona = (personaId) => {
  if (isPersonaLocked(personaId)) return
  emit('select-persona', personaId)
}

const deletePersona = (personaId) => {
  if (isPersonaLocked(personaId)) return
  emit('delete-persona', personaId)
}
</script>

<style scoped>
.no-scrollbar::-webkit-scrollbar {
  display: none;
}
.no-scrollbar {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>
