import { GoogleGenAI } from '@google/genai'

export function stripExpressionCommands(text) {
  if (typeof text !== 'string') return ''
  return text
    .replace(/set_expression\s*\([^)]*\)/gi, '')
    .replace(/set_expression\s*\{[^}]*\}/gi, '')
    .replace(/\[\s*set_expression[^\]]*\]/gi, '')
    .replace(/\(\s*set_expression[^)]*\)/gi, '')
    .replace(/set_expression:[a-zA-Z0-9_]+/gi, '')
    .replace(/expression:\s*[a-zA-Z0-9_]+/gi, '')
    .replace(/\{[^{}]*"name"\s*:\s*"set_expression"[^{}]*(\{[^{}]*\})*[^{}]*\}/gi, '')
    .replace(/\{"name"\s*:\s*"set_expression"[^}]*\}/gi, '')
    .replace(/trigger_special_effect\s*\([^)]*\)/gi, '')
    .replace(/trigger_special_effect\s*\{[^}]*\}/gi, '')
    .replace(/\[\s*trigger_special_effect[^\]]*\]/gi, '')
    .replace(/\{[^{}]*"name"\s*:\s*"trigger_special_effect"[^{}]*(\{[^{}]*\})*[^{}]*\}/gi, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// Monkeypatch global WebSocket to correct the double-slash URL bug in the @google/genai SDK
if (typeof window !== 'undefined' && !window.__websocket_patched) {
  window.__websocket_patched = true
  const OriginalWebSocket = window.WebSocket
  window.WebSocket = function (url, protocols) {
    let cleanUrl = url
    if (typeof url === 'string' && url.includes('generativelanguage.googleapis.com//ws/')) {
      cleanUrl = url.replace('generativelanguage.googleapis.com//ws/', 'generativelanguage.googleapis.com/ws/')
      console.log('🔧 Patched Double-Slash WebSocket URL:', cleanUrl)
    }
    return new OriginalWebSocket(cleanUrl, protocols)
  }
  Object.assign(window.WebSocket, OriginalWebSocket)
  window.WebSocket.prototype = OriginalWebSocket.prototype
}

const WORKLET_CODE = `
class PCMProcessor extends AudioWorkletProcessor {
  process(inputs) {
    const input = inputs[0];
    if (input && input[0] && input[0].length > 0) {
      const channelData = input[0];
      const pcmData = new Int16Array(channelData.length);
      for (let i = 0; i < channelData.length; i++) {
        const sample = Math.max(-1, Math.min(1, channelData[i]));
        pcmData[i] = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      }
      this.port.postMessage(pcmData);
    }
    return true;
  }
}
registerProcessor('pcm-processor', PCMProcessor);
`

export class AIClient {
  client
  liveModel
  activeSession = null
  audioContext = null
  workletNode = null
  mediaSourceNode = null
  mediaStream = null
  isRecording = false
  inputBuffer = new Int16Array(2048)
  inputBufferIndex = 0
  handledToolCallIds = new Set()
  isDisconnecting = false
  isSessionOpen = false
  isReconnecting = false
  reconnectAttempts = 0
  maxReconnectAttempts = 12
  reconnectFirstDelayMs = 120
  reconnectBaseDelayMs = 300
  reconnectMaxDelayMs = 2200
  reconnectTimer = null
  reconnectHistorySuggestionSent = false
  connectionArgs = null
  recognition = null
  onDisconnectCallback = null
  onUserSpeechStateChange = null
  isUserSpeaking = false
  userSpeechReleaseTimer = null
  userSpeechReleaseMs = 700
  lastAutoAngryAnimationAt = 0
  autoAngryAnimationCooldownMs = 5500

  // Transcription state
  currentInputTranscription = ''
  currentOutputTranscription = ''

  // Internal history to preserve context on reconnects
  internalHistory = []
  maxInternalHistoryItems = 180
  maxConnectionHistoryItems = 16
  maxResumeOverlayHistoryItems = 12
  conversationProfile = { userName: '', memories: {} }
  recentInputAudioChunks = []
  reconnectAudioWindowMs = 5000
  reconnectAudioReplaySilenceMs = 400
  reconnectAudioSampleRate = 16000
  pendingReconnectAudio = false
  isRestoringReconnectContext = false
  sessionResumptionStorageKey = 'vrm_live_session_resumption'
  sessionResumptionHandle = ''
  sessionResumptionUpdatedAt = 0
  sessionResumptionScope = ''
  sessionResumptionMaxAgeMs = 2 * 60 * 60 * 1000
  goAwayTimeLeft = ''
  goAwayNotified = false
  skipSessionResumptionOnce = false

  constructor(apiKey, model) {
    this.apiKey = apiKey
    const apiVersion = apiKey?.startsWith('auth_tokens/') ? 'v1alpha' : 'v1beta'
    this.client = new GoogleGenAI({ apiKey: apiKey || 'dummy-key-to-prevent-throw', apiVersion })
    this.liveModel = model || 'gemini-3.1-flash-live-preview'
    this._loadSessionResumptionState()
    this._loadConversationProfile()
  }

  tokenProvider = null

  updateToken(token) {
    const apiVersion = token?.startsWith('auth_tokens/') ? 'v1alpha' : 'v1beta'
    this.client = new GoogleGenAI({ apiKey: token, apiVersion })
  }

  setTokenProvider(provider) {
    this.tokenProvider = typeof provider === 'function' ? provider : null
  }

  setConversationProfile(profile = {}) {
    if (!profile || typeof profile !== 'object') {
      return {
        userName: this.conversationProfile.userName,
        memories: { ...this.conversationProfile.memories },
      }
    }

    if (Object.prototype.hasOwnProperty.call(profile, 'userName')) {
      this.conversationProfile.userName = this._normalizeProfileText(profile.userName, 80)
    }

    if (Object.prototype.hasOwnProperty.call(profile, 'memories')) {
      this.conversationProfile.memories = this._normalizeConversationMemories(profile.memories)
    }

    try {
      const storage = this._getStorage()
      storage?.setItem('vrm_conversation_profile', JSON.stringify(this.conversationProfile))
    } catch (e) {
      console.warn('Failed to save conversation profile:', e)
    }

    return {
      userName: this.conversationProfile.userName,
      memories: { ...this.conversationProfile.memories },
    }
  }

  clearSessionResumption() {
    this._clearSessionResumptionState()
  }

  async connectLive(
    systemPrompt = '',
    onAudioData,
    onAnimationTrigger,
    onExpressionTrigger,
    onVisionTrigger,
    onScreenTrigger,
    onCameraOffTrigger,
    onScreenOffTrigger,
    onDisconnect,
    availableAnimations = [],
    onUserNameSet,
    onMemorySaved,
    onMemoryDeleted,
    onHistoryChange,
    onSystemMessage,
    onTranscription,
    pastHistory = [],
    initialMessage = '',
    enableMic = true,
    onUserSpeechStateChange,
    getHistory = null,
    onTimerStart = null,
    onTimerCancel = null,
    onSetBackgroundImage = null,
    onUsageMetadata = null,
    onCueCardShow = null,
    onCueCardDismiss = null,
    onTurnComplete = null,
  ) {
    if (this.activeSession) return

    console.log(`🔌 Connecting to Gemini Live... (Mic: ${enableMic})`)
    this.isDisconnecting = false
    this.isReconnecting = false
    this.reconnectAttempts = 0
    this.reconnectHistorySuggestionSent = false
    this._clearReconnectTimer()
    this.internalHistory = []
    this.currentInputTranscription = ''
    this.currentOutputTranscription = ''
    this.recentInputAudioChunks = []
    this.pendingReconnectAudio = false
    this.isRestoringReconnectContext = false
    this.onDisconnectCallback = onDisconnect || null
    this.onUserSpeechStateChange =
      typeof onUserSpeechStateChange === 'function' ? onUserSpeechStateChange : null
    this._resetVoiceActivityState()
    this._setUserSpeakingState(false, true)

    try {
      this.connectionArgs = {
        baseSystemPrompt: systemPrompt,
        onAudioData,
        onAnimationTrigger,
        onExpressionTrigger,
        onVisionTrigger,
        onScreenTrigger,
        onCameraOffTrigger,
        onScreenOffTrigger,
        onDisconnect,
        availableAnimations,
        onUserNameSet,
        onMemorySaved,
        onMemoryDeleted,
        onHistoryChange,
        onSystemMessage,
        onTranscription,
        pastHistory,
        initialMessage,
        enableMic,
        onUserSpeechStateChange,
        getHistory,
        onTimerStart: typeof onTimerStart === 'function' ? onTimerStart : null,
        onTimerCancel: typeof onTimerCancel === 'function' ? onTimerCancel : null,
        onSetBackgroundImage: typeof onSetBackgroundImage === 'function' ? onSetBackgroundImage : null,
        onUsageMetadata: typeof onUsageMetadata === 'function' ? onUsageMetadata : null,
        onCueCardShow: typeof onCueCardShow === 'function' ? onCueCardShow : null,
        onCueCardDismiss: typeof onCueCardDismiss === 'function' ? onCueCardDismiss : null,
        onTurnComplete: typeof onTurnComplete === 'function' ? onTurnComplete : null,
      }

      await this._establishConnection()
    } catch (e) {
      console.error('🔥 Connection Failed:', e)
      this.disconnect('Initial connection failed')
      onSystemMessage?.('Connection Failed', e.message, 'error')
    }
  }

  async _establishConnection() {
    if (this.isDisconnecting) return
    const isReconnectSession = this.isReconnecting

    const {
      baseSystemPrompt,
      onAudioData,
      onAnimationTrigger,
      onExpressionTrigger,
      onVisionTrigger,
      onScreenTrigger,
      onCameraOffTrigger,
      onScreenOffTrigger,
      onUserNameSet,
      onMemorySaved,
      onMemoryDeleted,
      onSystemMessage,
      onTranscription,
      pastHistory,
      initialMessage,
      enableMic,
      onUserSpeechStateChange,
      getHistory,
      onUsageMetadata,
    } = this.connectionArgs

    let forceFreshSession = false
    try {
      const storage = this._getStorage()
      if (storage?.getItem('vrm_session_ended') === 'true') {
        forceFreshSession = true
        storage?.setItem('vrm_session_ended', 'false')
      }
    } catch (e) {
      console.warn('Failed to consume vrm_session_ended flag:', e)
    }

    if (forceFreshSession) {
      this._clearSessionResumptionState()
    }

    const resumptionScope = this._createSessionResumptionScope(baseSystemPrompt)
    const resumeHandle = (this.skipSessionResumptionOnce || forceFreshSession)
      ? ''
      : this._getValidSessionResumptionHandle(resumptionScope)
    const isUsingSessionResumption = Boolean(resumeHandle)
    this.skipSessionResumptionOnce = false

    if (this.tokenProvider) {
      try {
        console.log('🔄 Fetching a fresh ephemeral token from token provider...')
        const freshToken = await this.tokenProvider()
        this.updateToken(freshToken)
      } catch (tokenErr) {
        console.warn('⚠️ Token provider failed, falling back to direct API key:', tokenErr)
        if (this.apiKey) {
          this.updateToken(this.apiKey)
        } else if (isReconnectSession) {
          this._scheduleReconnect(onSystemMessage, 'Token refresh failed: ' + tokenErr.message)
          return
        } else {
          throw new Error('Failed to obtain ephemeral token: ' + tokenErr.message)
        }
      }
    } else if (this.apiKey) {
      this.updateToken(this.apiKey)
    }

    this.onUserSpeechStateChange =
      typeof onUserSpeechStateChange === 'function' ? onUserSpeechStateChange : null

    // REFACTOR: Decoupled history from System Prompt for AI Studio alignment.
    // We no longer append history to fullSystemPrompt here.
    // Instead, we will inject it as a "User Context" message immediately after connection.

    const liveHistorySnapshot = this._getHistorySnapshot(getHistory)
    const safePastHistory = Array.isArray(liveHistorySnapshot)
      ? liveHistorySnapshot
      : Array.isArray(pastHistory)
        ? pastHistory
        : []
    const combinedHistory = Array.isArray(liveHistorySnapshot)
      ? safePastHistory
      : [...safePastHistory, ...this.internalHistory]

    const historyForConnection = this._resolveHistoryForConnection(combinedHistory, {
      isReconnectSession,
      isUsingSessionResumption,
      forceFreshSession,
    })

    const profilePrompt = this._buildConversationProfileInstruction(isReconnectSession, forceFreshSession)
    const fullSystemPrompt = profilePrompt
      ? `${baseSystemPrompt}\n\n${profilePrompt}`
      : baseSystemPrompt
    const systemInstruction = fullSystemPrompt
      ? {
          parts: [{ text: fullSystemPrompt }],
        }
      : undefined

    // If user explicitly sent text, always deliver it.
    // Otherwise recover a pending user query only during reconnect
    // and only when the latest meaningful message is from the user.
    const explicitPendingQuestion =
      typeof initialMessage === 'string' ? String(initialMessage).trim() : ''
    const lastMsg = this._getLastMeaningfulHistoryMessage(combinedHistory)
    const shouldReplayPendingAudio =
      isReconnectSession &&
      !explicitPendingQuestion &&
      this.pendingReconnectAudio &&
      this._hasRecoverableReconnectAudio()
    let pendingUserQuestion = explicitPendingQuestion
    let shouldAnswerPendingQuestion = explicitPendingQuestion.length > 0

    if (shouldReplayPendingAudio) {
      pendingUserQuestion = lastMsg?.role === 'user' ? lastMsg.text : ''
      shouldAnswerPendingQuestion = false
      console.log('Reconnect recovery: replaying recent user audio')
    } else if (isReconnectSession && !pendingUserQuestion) {
      if (lastMsg?.role === 'user') {
        pendingUserQuestion = lastMsg.text
        shouldAnswerPendingQuestion = pendingUserQuestion.length > 0
        if (shouldAnswerPendingQuestion) {
          console.log(
            'Reconnect recovery: answering last pending user message:',
            pendingUserQuestion,
          )
        }
      }
    }

    const animList =
      this.connectionArgs.availableAnimations.length > 0
        ? this.connectionArgs.availableAnimations
        : ['wave', 'clap', 'dance', 'backflip']

    const tools = this._getTools(animList)

    const config = {
      responseModalities: ['AUDIO'],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: (typeof localStorage !== 'undefined' ? localStorage.getItem('vrm_selected_voice') : null) || 'Zephyr' } },
      },
      realtimeInputConfig: {
        automaticActivityDetection: {},
      },
      contextWindowCompression: {
        slidingWindow: {},
      },
      sessionResumption: resumeHandle ? { handle: resumeHandle } : {},
      // Restored transcription settings (empty object uses default model)
      inputAudioTranscription: {},
      outputAudioTranscription: {},
      thinkingConfig: {
        thinkingLevel: 'minimal',
      },
      tools: tools,
      systemInstruction,
    }

    console.log('🔌 Starting New Session. History items:', combinedHistory.length)

    const connectionId = Date.now() + Math.random().toString(36).substring(2)
    this.currentConnectionId = connectionId

    try {
      // 1️⃣ Connect
      this.activeSession = await this.client.live.connect({
        model: this.liveModel,
        config: config,
        callbacks: {
          onopen: () => {
            if (this.currentConnectionId !== connectionId) return
            console.log('✅ Live Session Started')
            this.isSessionOpen = true
            this.reconnectAttempts = 0
            this.reconnectHistorySuggestionSent = false
            this._clearReconnectTimer()
            this.goAwayNotified = false
            this.goAwayTimeLeft = ''

            if (this.isReconnecting) {
              onSystemMessage?.(
                'Reconnected',
                isUsingSessionResumption
                  ? 'Resumed live session from server state'
                  : 'Restored connection & context',
                'success',
              )
              this.isReconnecting = false
            } else {
              // Only show connected message if not silently restarting for text
              if (!initialMessage) {
                onSystemMessage?.(
                  'Connected',
                  isUsingSessionResumption ? 'Live session resumed' : 'Live session started',
                  'success',
                )
              }
            }

            // 2️⃣ Restore Context Immediately
            void this._finalizeSessionOpen({
              combinedHistory: historyForConnection,
              pendingUserQuestion,
              shouldAnswerPendingQuestion,
              shouldReplayPendingAudio,
              enableMic,
              isUsingSessionResumption,
            })
          },
          onmessage: (msg) => {
            if (this.currentConnectionId !== connectionId) return

            if (msg.usageMetadata || msg.usage_metadata) {
              const usage = msg.usageMetadata || msg.usage_metadata
              onUsageMetadata?.(usage)
            }

            if (msg.sessionResumptionUpdate?.resumable && msg.sessionResumptionUpdate?.newHandle) {
              this._setSessionResumptionHandle(
                msg.sessionResumptionUpdate.newHandle,
                resumptionScope,
              )
            }

            if (msg.goAway && !this.goAwayNotified) {
              this.goAwayNotified = true
              this.goAwayTimeLeft = msg.goAway.timeLeft || ''
              this._stashPendingInputBufferForReconnect()

              onSystemMessage?.(
                'Session Renewal',
                this.goAwayTimeLeft
                  ? `Server will rotate this live connection in ${this.goAwayTimeLeft}. Reconnecting immediately.`
                  : 'Server will rotate this live connection soon. Reconnecting immediately.',
                'warning',
              )

              console.log('🔄 GoAway received: Reconnecting immediately per best practices...')

              this._setUserSpeakingState(false, true)
              this._resetVoiceActivityState()
              this._flushTranscriptions(true, onTranscription, 'both', {
                clearUserBuffer: true,
              })

              const oldSession = this.activeSession
              this.activeSession = null
              this.isSessionOpen = false
              this.currentConnectionId = null

              if (oldSession) {
                try {
                  oldSession.close()
                } catch (e) {
                  console.warn('Failed to close session on GoAway', e)
                }
              }

              this.isReconnecting = true
              this.reconnectAttempts = 0
              this._establishConnection()
              return
            }

            const content = msg.serverContent

            if (content?.groundingMetadata) {
              console.debug('Grounding:', content.groundingMetadata)
            }

            if (content?.interrupted) {
              console.log('⚡ Gemini Live: Model turn was interrupted by server')
            }

            if (content?.outputTranscription) {
              this.pendingReconnectAudio = false
              this._setUserSpeakingState(false)
              this._clearUserSpeechReleaseTimer()

              // AI is speaking - finalize and clear user input
              if (this.currentInputTranscription.trim().length > 0) {
                this._flushTranscriptions(true, onTranscription, 'user', {
                  clearUserBuffer: true,
                })
              }

              const text = content.outputTranscription.text
              this.currentOutputTranscription += text
              const cleanText = stripExpressionCommands(this.currentOutputTranscription)
              onTranscription?.('model', cleanText, false, {
                source: 'gemini_output',
              })
            }

            if (content?.inputTranscription) {
              // User is speaking - accumulate
              const text = content.inputTranscription.text
              if (this._isMeaningfulSpeechText(text)) {
                this._setUserSpeakingState(true)
                this._armUserSpeechReleaseTimer()
              }
              this.currentInputTranscription += text
              onTranscription?.('user', this.currentInputTranscription, false, {
                source: 'gemini_input',
              })
            }

            if (content?.turnComplete) {
              this._setUserSpeakingState(false)
              this._clearUserSpeechReleaseTimer()

              // Finalize user input and commit to history
              if (this.currentInputTranscription.trim().length > 0) {
                const userText = this.currentInputTranscription
                onTranscription?.('user', userText, true, {
                  source: 'gemini_input',
                })
                this._pushInternalHistory('user', userText)
                this.currentInputTranscription = ''
              }
              // Clear model transcriptions on turn complete
              this._flushTranscriptions(true, onTranscription, 'model')

              // Explicitly signal turn completion to play buffered model audio
              this.connectionArgs?.onTurnComplete?.()
            }

            // 2. Handle Audio
            if (content?.modelTurn?.parts) {
              // Model is actively producing output; user speech release timer is irrelevant now
              this.pendingReconnectAudio = false
              this._setUserSpeakingState(false)
              this._clearUserSpeechReleaseTimer()

              for (const part of content.modelTurn.parts) {
                if (part.inlineData?.data) {
                  const binaryString = atob(part.inlineData.data)
                  const bytes = new Uint8Array(binaryString.length)
                  for (let i = 0; i < binaryString.length; i++)
                    bytes[i] = binaryString.charCodeAt(i)
                  const samples = Math.floor(bytes.byteLength / 2)
                  if (samples > 0) {
                    onAudioData?.(new Int16Array(bytes.buffer, bytes.byteOffset, samples))
                  }
                }
                if (
                  !content?.outputTranscription &&
                  typeof part.text === 'string' &&
                  part.text.trim()
                ) {
                  this.currentOutputTranscription += part.text
                  const cleanText = stripExpressionCommands(this.currentOutputTranscription)
                  onTranscription?.('model', cleanText, false, {
                    source: 'gemini_output',
                  })
                }
                if (part.functionCall) {
                  const fc = part.functionCall
                  if (!this.handledToolCallIds.has(fc.id)) {
                    this.handledToolCallIds.add(fc.id)
                    this._executeFunction(
                      fc,
                      onAnimationTrigger,
                      onExpressionTrigger,
                      onVisionTrigger,
                      onScreenTrigger,
                      onCameraOffTrigger,
                      onScreenOffTrigger,
                      onUserNameSet,
                      onMemorySaved,
                      onMemoryDeleted,
                    ).then((resp) => {
                      if (this.activeSession && resp) {
                        this.activeSession.sendToolResponse({ functionResponses: [resp] }).catch((err) => {
                          console.warn('Part tool response failed:', err)
                        })
                      }
                    })
                  }
                }
              }
            }
            if (msg.toolCall) {
              this._handleToolCall(
                msg.toolCall,
                onAnimationTrigger,
                onExpressionTrigger,
                onVisionTrigger,
                onScreenTrigger,
                onCameraOffTrigger,
                onScreenOffTrigger,
                onUserNameSet,
                onMemorySaved,
                onMemoryDeleted,
              )
            }
          },
          onclose: (e) => {
            if (this.currentConnectionId !== connectionId) {
              console.log('🔄 Ignoring close event from an old connection')
              return
            }
            console.log('❌ Connection Closed', e)
            this.isSessionOpen = false
            this.activeSession = null
            this._setUserSpeakingState(false, true)
            this._resetVoiceActivityState()
            this._stashPendingInputBufferForReconnect()

            // IMPORTANT: Flush any partial transcriptions to history BEFORE attempting reconnect.
            // This ensures if the user was speaking, their words are captured in history
            // so the next session knows to answer them.
            this._flushTranscriptions(true, onTranscription, 'both', {
              clearUserBuffer: true,
            })

            // If the user manually disconnected, stop here.
            if (this.isDisconnecting) return

            const reason = e.reason || 'Connection lost'

            console.log(`Connection dropped unexpectedly (${reason}).`)

            this._scheduleReconnect(onSystemMessage, reason)
          },
          onerror: (e) => {
            if (this.currentConnectionId !== connectionId) return
            console.error('🔥 Live Error:', e)
            // Connection errors are often internal API issues (e.g., "Thread was cancelled")
            // These are typically transient and will trigger reconnection via onclose
          },
        },
      })
    } catch (err) {
      console.error('Failed to connect live session:', err)
      console.error('Error details:', err.message, err.stack)

      if (isUsingSessionResumption && !this.isDisconnecting) {
        console.warn('Session resumption failed, clearing handle and retrying with manual restore.')
        this._clearSessionResumptionState()
        this.skipSessionResumptionOnce = true
        onSystemMessage?.(
          'Session Resume Failed',
          'Falling back to chat history restore for this reconnect.',
          'warning',
        )
        await this._establishConnection()
        return
      }

      if (!this.isDisconnecting) {
        this._scheduleReconnect(onSystemMessage, err?.message || 'connection failed')
      } else {
        onSystemMessage?.('Connection Error', 'Failed to connect. Check API Key.', 'error')
      }
      return
    }
  }

  async _restoreContext(history, pendingQuestion, options = {}) {
    if (!this.activeSession) return
    const {
      shouldAnswerPendingQuestion = false,
      replayPendingAudio = false,
      historyOnly = false,
    } = options

    const safeHistory = Array.isArray(history) ? history : []
    const validHistory = safeHistory.filter((m) => m?.text && m.text.trim().length > 0)
    const normalizedPendingQuestion =
      typeof pendingQuestion === 'string' ? pendingQuestion.trim() : ''
    const shouldRecoverQuestion =
      !replayPendingAudio && shouldAnswerPendingQuestion && normalizedPendingQuestion.length > 0

    if (validHistory.length === 0 && !shouldRecoverQuestion && !replayPendingAudio) {
      return
    }

    let contextHistory = validHistory
    if ((shouldRecoverQuestion || replayPendingAudio) && validHistory.length > 0) {
      const lastMsg = validHistory[validHistory.length - 1]
      if (
        lastMsg?.role === 'user' &&
        (replayPendingAudio ||
          String(lastMsg.text || '')
            .trim()
            .toLowerCase() === normalizedPendingQuestion.toLowerCase())
      ) {
        contextHistory = validHistory.slice(0, -1)
      }
    }

    const historyTurns = contextHistory.map((msg) => ({
      role: msg?.role === 'user' ? 'user' : 'model',
      parts: [{ text: String(msg?.text || '') }],
    }))

    if (historyTurns.length > 0) {
      // Past history turns are complete; commit them so session is ready for fresh input
      await this._sendClientContent(historyTurns, true)
    }

    if (historyOnly) {
      return
    }

    if (shouldRecoverQuestion) {
      console.log('Restoring context with PENDING QUESTION:', normalizedPendingQuestion)
      await this._sendClientContent([
        { role: 'user', parts: [{ text: normalizedPendingQuestion }] },
      ], true)
    }
  }

  // Updated sendText to handle context restoration flag
  // forceSend: if true, sends directly to active session without restarting
  async sendText(text, forceSend = false, options = {}) {
    const normalizedText = typeof text === 'string' ? text.trim() : ''
    if (!normalizedText) return

    const { preserveReconnectAudio = false } = options
    if (!preserveReconnectAudio) {
      this.pendingReconnectAudio = false
    }

    if (!this.activeSession || !this.isSessionOpen) {
      throw new Error('Live session is not active')
    }

    try {
      console.log(
        'Sending realtime text to active session:',
        normalizedText.substring(0, 50) + '...',
      )
      if (typeof this.activeSession?.sendRealtimeInput === 'function') {
        try {
          await this.activeSession.sendRealtimeInput({ text: normalizedText })
          return
        } catch (realtimeErr) {
          console.warn('sendRealtimeInput for text failed, falling back to sendClientContent:', realtimeErr)
        }
      }
      await this._sendClientContent([
        { role: 'user', parts: [{ text: normalizedText }] },
      ], true)
      return
    } catch (error) {
      console.error('Failed to send realtime text:', error)
      if (!forceSend) {
        throw error
      }
      return
    }

    // eslint-disable-next-line no-unreachable
    {
      const { preserveReconnectAudio = false } = options
      if (!preserveReconnectAudio) {
        this.pendingReconnectAudio = false
      }
      if (forceSend && this.activeSession) {
        try {
          console.log('📤 Sending direct text to active session:', text.substring(0, 50) + '...')
          await this._sendClientContent(
            [
              {
                role: 'user',
                parts: [{ text }],
              },
            ],
            true,
          )
          return
        } catch (e) {
          console.error('Failed to send direct text, falling back to restart:', e)
        }
      }
      console.log('AIClient: Sending text by restarting session with context:', text)

      let newPastHistory = [...(this.connectionArgs?.pastHistory || [])]
      if (this.internalHistory.length > 0) {
        newPastHistory = [...newPastHistory, ...this.internalHistory]
      }

      // Explicitly set isDisconnecting to false so the close handler knows we are managing this
      // Actually, we want to STOP the auto-reconnect logic of the OLD session because we are making a NEW one.
      this.isDisconnecting = true // Stop old session from fighting us

      if (this.activeSession) {
        try {
          this.activeSession.close()
        } catch (error) {
          console.warn('Failed to close previous session', error)
        }
        this.activeSession = null
        await new Promise((resolve) => setTimeout(resolve, 200))
      }

      if (this.connectionArgs) {
        await this.connectLive(
          this.connectionArgs.baseSystemPrompt,
          this.connectionArgs.onAudioData,
          this.connectionArgs.onAnimationTrigger,
          this.connectionArgs.onExpressionTrigger,
          this.connectionArgs.onVisionTrigger,
          this.connectionArgs.onScreenTrigger,
          this.connectionArgs.onCameraOffTrigger,
          this.connectionArgs.onScreenOffTrigger,
          this.connectionArgs.onDisconnect,
          this.connectionArgs.availableAnimations,
          this.connectionArgs.onUserNameSet,
          this.connectionArgs.onMemorySaved,
          this.connectionArgs.onMemoryDeleted,
          this.connectionArgs.onHistoryChange,
          this.connectionArgs.onSystemMessage,
          this.connectionArgs.onTranscription,
          newPastHistory,
          text,
          false,
          this.connectionArgs.onUserSpeechStateChange,
          this.connectionArgs.getHistory,
          this.connectionArgs.onTimerStart,
          this.connectionArgs.onTimerCancel,
          this.connectionArgs.onSetBackgroundImage,
          this.connectionArgs.onUsageMetadata,
          this.connectionArgs.onCueCardShow,
          this.connectionArgs.onCueCardDismiss,
        )
      } else {
        console.error('AIClient: Cannot restart session, no connection args.')
      }
    }
  }

  _clearReconnectTimer() {
    if (!this.reconnectTimer) return
    clearTimeout(this.reconnectTimer)
    this.reconnectTimer = null
  }

  _getLastMeaningfulHistoryMessage(history = []) {
    if (!Array.isArray(history)) return null
    for (let i = history.length - 1; i >= 0; i -= 1) {
      const item = history[i]
      const text = typeof item?.text === 'string' ? item.text.trim() : ''
      if (!text) continue
      const role = item?.role === 'user' ? 'user' : 'model'
      return { role, text }
    }
    return null
  }

  _pushInternalHistory(role, text) {
    const normalizedRole = role === 'user' ? 'user' : 'model'
    const normalizedText = typeof text === 'string' ? text.trim() : ''
    if (!normalizedText) return

    const hasRecentDuplicate = this.internalHistory
      .slice(-6)
      .some((item) => item?.role === normalizedRole && item?.text === normalizedText)
    if (hasRecentDuplicate) return

    this.internalHistory.push({
      role: normalizedRole,
      text: normalizedText,
      timestamp: Date.now(),
    })

    if (this.internalHistory.length > this.maxInternalHistoryItems) {
      this.internalHistory = this.internalHistory.slice(-this.maxInternalHistoryItems)
    }
  }

  _normalizeProfileText(value, maxLength = 240) {
    const normalized = typeof value === 'string' ? value.replace(/\s+/g, ' ').trim() : ''
    if (!normalized) return ''
    return normalized.slice(0, maxLength).trim()
  }

  _normalizeConversationMemories(memories = {}) {
    if (!memories || typeof memories !== 'object' || Array.isArray(memories)) return {}

    const normalized = {}
    let count = 0
    for (const [key, value] of Object.entries(memories)) {
      const safeKey = this._normalizeProfileText(key, 80)
      const safeValue = this._normalizeProfileText(value, 220)
      if (!safeKey || !safeValue) continue
      normalized[safeKey] = safeValue
      count += 1
      if (count >= 24) break
    }

    return normalized
  }

  _getStorage() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return null
      return window.localStorage
    } catch {
      return null
    }
  }

  _loadSessionResumptionState() {
    const storage = this._getStorage()
    if (!storage) return

    try {
      const parsed = JSON.parse(storage.getItem(this.sessionResumptionStorageKey) || 'null')
      this.sessionResumptionHandle = typeof parsed?.handle === 'string' ? parsed.handle.trim() : ''
      this.sessionResumptionUpdatedAt = Number(parsed?.updatedAt) || 0
      this.sessionResumptionScope = typeof parsed?.scope === 'string' ? parsed.scope.trim() : ''
    } catch (error) {
      console.warn('Failed to load session resumption state:', error)
      this._clearSessionResumptionState()
    }
  }

  _loadConversationProfile() {
    const storage = this._getStorage()
    if (!storage) return

    try {
      const parsed = JSON.parse(storage.getItem('vrm_conversation_profile') || 'null')
      if (parsed && typeof parsed === 'object') {
        if (typeof parsed.userName === 'string') {
          this.conversationProfile.userName = this._normalizeProfileText(parsed.userName, 80)
        }
        if (parsed.memories && typeof parsed.memories === 'object') {
          this.conversationProfile.memories = this._normalizeConversationMemories(parsed.memories)
        }
      }
    } catch (error) {
      console.warn('Failed to load conversation profile:', error)
    }
  }

  _persistSessionResumptionState() {
    const storage = this._getStorage()
    if (!storage) return

    if (
      !this.sessionResumptionHandle ||
      !this.sessionResumptionUpdatedAt ||
      !this.sessionResumptionScope
    ) {
      storage.removeItem(this.sessionResumptionStorageKey)
      return
    }

    storage.setItem(
      this.sessionResumptionStorageKey,
      JSON.stringify({
        handle: this.sessionResumptionHandle,
        updatedAt: this.sessionResumptionUpdatedAt,
        scope: this.sessionResumptionScope,
      }),
    )
  }

  _setSessionResumptionHandle(handle, scope) {
    const normalizedHandle = typeof handle === 'string' ? handle.trim() : ''
    const normalizedScope = typeof scope === 'string' ? scope.trim() : ''
    if (!normalizedHandle || !normalizedScope) return
    if (
      this.sessionResumptionHandle === normalizedHandle &&
      this.sessionResumptionScope === normalizedScope
    ) {
      return
    }

    this.sessionResumptionHandle = normalizedHandle
    this.sessionResumptionUpdatedAt = Date.now()
    this.sessionResumptionScope = normalizedScope
    this._persistSessionResumptionState()
  }

  _clearSessionResumptionState() {
    this.sessionResumptionHandle = ''
    this.sessionResumptionUpdatedAt = 0
    this.sessionResumptionScope = ''

    const storage = this._getStorage()
    storage?.removeItem(this.sessionResumptionStorageKey)
  }

  _hashString(value = '') {
    const input = typeof value === 'string' ? value : ''
    let hash = 2166136261

    for (let i = 0; i < input.length; i += 1) {
      hash ^= input.charCodeAt(i)
      hash = Math.imul(hash, 16777619)
    }

    return (hash >>> 0).toString(16)
  }

  _createSessionResumptionScope(baseSystemPrompt = '') {
    return `${this.liveModel}:${this._hashString(baseSystemPrompt)}`
  }

  _getValidSessionResumptionHandle(scope) {
    const normalizedScope = typeof scope === 'string' ? scope.trim() : ''
    if (!normalizedScope) return ''
    if (!this.sessionResumptionHandle || !this.sessionResumptionUpdatedAt) return ''
    if (this.sessionResumptionScope !== normalizedScope) return ''

    const ageMs = Date.now() - this.sessionResumptionUpdatedAt
    if (ageMs > this.sessionResumptionMaxAgeMs) {
      this._clearSessionResumptionState()
      return ''
    }

    return this.sessionResumptionHandle
  }

  _selectReconnectHistoryWindow(history = []) {
    const safeHistory = Array.isArray(history) ? history.filter(Boolean) : []
    if (safeHistory.length === 0) return []

    const withTimestamp = safeHistory.filter((item) => Number.isFinite(Number(item?.timestamp)))
    if (withTimestamp.length === 0) {
      return safeHistory.slice(-60)
    }

    const newestTimestamp = Math.max(...withTimestamp.map((item) => Number(item.timestamp)))
    const oneHourAgo = newestTimestamp - 60 * 60 * 1000
    const lastHourHistory = safeHistory.filter((item) => Number(item?.timestamp) >= oneHourAgo)
    if (lastHourHistory.length > 0) {
      return lastHourHistory
    }

    const dayStart = new Date(newestTimestamp)
    dayStart.setHours(0, 0, 0, 0)
    const sameDayHistory = safeHistory.filter(
      (item) => Number(item?.timestamp) >= dayStart.getTime(),
    )
    if (sameDayHistory.length > 0) {
      return sameDayHistory
    }

    return safeHistory.slice(-60)
  }

  _getResumeOverlayHistory(history = []) {
    const safeHistory = Array.isArray(history) ? history.filter(Boolean) : []
    if (safeHistory.length === 0) return []
    return safeHistory.slice(-this.maxResumeOverlayHistoryItems)
  }

  _resolveHistoryForConnection(history = [], options = {}) {
    const { isReconnectSession = false, isUsingSessionResumption = false, forceFreshSession = false } = options
    if (isUsingSessionResumption || forceFreshSession) return []

    const safeHistory = Array.isArray(history) ? history : []

    // Strip any turns that contain an end_conversation tool call so the model
    // does not re-execute the disconnect on the next fresh session.
    const filteredHistory = safeHistory.filter((item) => {
      const text = typeof item?.text === 'string' ? item.text : ''
      return !text.includes('end_conversation')
    })

    const boundedHistory = filteredHistory.slice(-this.maxConnectionHistoryItems)
    const reconnectWindow = isReconnectSession ? this._selectReconnectHistoryWindow(filteredHistory) : []
    return (reconnectWindow.length > 0 ? reconnectWindow : boundedHistory).slice(
      -this.maxConnectionHistoryItems,
    )
  }

  _isFatalCloseReason(reason = '') {
    const normalized = String(reason || '').toLowerCase()
    if (!normalized) return false
    return (
      normalized.includes('quota') ||
      normalized.includes('billing') ||
      normalized.includes('resource exhausted') ||
      normalized.includes('429') ||
      normalized.includes('authentication') ||
      normalized.includes('invalid api key') ||
      normalized.includes('unauthenticated') ||
      normalized.includes('credentials')
    )
  }

  _setConversationMemory(key, value) {
    const safeKey = this._normalizeProfileText(key, 80)
    const safeValue = this._normalizeProfileText(value, 220)
    if (!safeKey || !safeValue) return

    this.conversationProfile.memories = {
      ...this.conversationProfile.memories,
      [safeKey]: safeValue,
    }
  }

  _deleteConversationMemory(key) {
    const safeKey = this._normalizeProfileText(key, 80)
    if (!safeKey || !this.conversationProfile.memories[safeKey]) return

    const nextMemories = { ...this.conversationProfile.memories }
    delete nextMemories[safeKey]
    this.conversationProfile.memories = nextMemories
  }

  _buildConversationProfileInstruction(isReconnectSession = false, forceFreshSession = false) {
    const sections = []
    const userName = this.conversationProfile.userName
    const memoryEntries = Object.entries(this.conversationProfile.memories)

    if (userName) {
      sections.push(
        `[PROFILE OVERRIDE] The user's verified name is ${userName}. ` +
          `Do not ask for their name again. Ignore any earlier instruction that says you do not know their name.`,
      )
    }

    if (memoryEntries.length > 0) {
      const memoryLines = memoryEntries.map(([key, value]) => `- ${key}: ${value}`).join('\n')
      sections.push(
        `[SAVED MEMORIES]\n${memoryLines}\nTreat these as remembered facts unless the user corrects or deletes them.`,
      )
    }

    try {
      const storage = this._getStorage()
      const savedHistoryStr = storage?.getItem('vrm_chat_history')
      if (savedHistoryStr) {
        const fullHistory = JSON.parse(savedHistoryStr)
        if (Array.isArray(fullHistory) && fullHistory.length > 0) {
          const useReconnect = isReconnectSession && !forceFreshSession
          const cutoffIndex = useReconnect ? Math.max(0, fullHistory.length - 16) : 0
          const olderHistory = fullHistory
            .slice(0, useReconnect ? cutoffIndex : fullHistory.length)
            // Remove any turns that mention end_conversation so the model
            // does not think it should end the call in the new session.
            .filter((item) => {
              const text = typeof item?.text === 'string' ? item.text : ''
              return !text.includes('end_conversation')
            })

          if (olderHistory.length > 0) {
            const formattedHistory = olderHistory.map(item => {
              const roleLabel = item.role === 'user' ? 'User' : 'Riko (AI)'
              const cleanText = stripExpressionCommands(item.text || '')
              return `${roleLabel}: ${cleanText}`
            }).filter(item => item.trim().length > 0).join('\n')

            sections.push(
              `[OLDER CONVERSATION HISTORY LOG]\n` +
              `This is the record of your previous conversation turns with this user before the current session. Use it to keep track of what you discussed:\n` +
              `${formattedHistory}`
            )
          }
        }
      }
    } catch (e) {
      console.warn('Failed to load older chat history log for profile instruction:', e)
    }

    // Always inject a session boundary marker so the model knows the previous
    // session has ended and this is a completely fresh conversation start.
    sections.push(
      `[NEW SESSION] The previous conversation session has fully ended. ` +
      `You are starting a completely new conversation session now. ` +
      `Do NOT automatically close the call or call end_conversation. Only end the call if the user explicitly ` +
      `requests you to do so in the new conversation.`
    )

    if (sections.length === 0) return ''
    return `[RECONNECT PROFILE]\n${sections.join('\n\n')}`
  }

  _getHistorySnapshot(getHistory) {
    if (typeof getHistory !== 'function') return null
    try {
      const snapshot = getHistory()
      return Array.isArray(snapshot) ? snapshot : null
    } catch (error) {
      console.warn('Failed to read history snapshot for reconnect:', error)
      return null
    }
  }

  async _finalizeSessionOpen(options = {}) {
    const {
      combinedHistory = [],
      pendingUserQuestion = '',
      shouldAnswerPendingQuestion = false,
      shouldReplayPendingAudio = false,
      enableMic = true,
      isUsingSessionResumption = false,
    } = options

    try {
      this.isRestoringReconnectContext = shouldReplayPendingAudio

      if (isUsingSessionResumption) {
        const overlayHistory = this._getResumeOverlayHistory(combinedHistory)
        if (overlayHistory.length > 0) {
          await this._restoreContext(overlayHistory, '', {
            historyOnly: true,
          })
        }

        if (
          shouldAnswerPendingQuestion &&
          typeof pendingUserQuestion === 'string' &&
          pendingUserQuestion.trim()
        ) {
          await this._sendClientContent([
            { role: 'user', parts: [{ text: pendingUserQuestion.trim() }] },
          ], true)
        }
      } else {
        await this._restoreContext(combinedHistory, pendingUserQuestion, {
          shouldAnswerPendingQuestion,
          replayPendingAudio: shouldReplayPendingAudio,
        })
      }

      if (shouldReplayPendingAudio) {
        await new Promise((resolve) => setTimeout(resolve, 140))
        await this._replayRecentUserAudio()
      }
    } catch (error) {
      console.error('Failed to restore live session context:', error)
    } finally {
      this.isRestoringReconnectContext = false
      if (enableMic) {
        await this.startMicrophone()
      } else {
        this.stopMicrophone()
      }
    }
  }

  _hasSpeechEnergyInChunk(int16Data) {
    if (!(int16Data instanceof Int16Array) || int16Data.length === 0) return false

    let sumSquares = 0
    for (let i = 0; i < int16Data.length; i += 1) {
      const sample = int16Data[i] / 32768
      sumSquares += sample * sample
    }

    const rms = Math.sqrt(sumSquares / int16Data.length)
    return rms >= 0.015
  }

  _trimRecentInputAudio(referenceTime = Date.now()) {
    const minTimestamp = referenceTime - this.reconnectAudioWindowMs
    this.recentInputAudioChunks = this.recentInputAudioChunks.filter(
      (chunk) => chunk?.samples?.length > 0 && chunk.timestamp >= minTimestamp,
    )
    this.pendingReconnectAudio = this.recentInputAudioChunks.some((chunk) => chunk.hasSpeech)
  }

  _rememberRecentAudioChunk(int16Data) {
    if (!(int16Data instanceof Int16Array) || int16Data.length === 0) return

    const chunkCopy = int16Data.slice()
    this.recentInputAudioChunks.push({
      timestamp: Date.now(),
      samples: chunkCopy,
      hasSpeech: this._hasSpeechEnergyInChunk(chunkCopy),
    })
    this._trimRecentInputAudio()
  }

  _stashPendingInputBufferForReconnect() {
    if (!Number.isFinite(this.inputBufferIndex) || this.inputBufferIndex <= 0) return
    const partialChunk = this.inputBuffer.slice(0, this.inputBufferIndex)
    this.inputBufferIndex = 0
    this._rememberRecentAudioChunk(partialChunk)
  }

  _hasRecoverableReconnectAudio() {
    this._trimRecentInputAudio()
    return this.pendingReconnectAudio && this.recentInputAudioChunks.length > 0
  }

  _encodeInt16ToBase64(int16Data) {
    if (!(int16Data instanceof Int16Array) || int16Data.length === 0) return ''

    const bytes = new Uint8Array(int16Data.buffer, int16Data.byteOffset, int16Data.byteLength)
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    return btoa(binary)
  }

  _encodeUtf8TextToBase64(text) {
    const normalizedText = typeof text === 'string' ? text : ''
    if (!normalizedText) return ''

    const bytes = new TextEncoder().encode(normalizedText)
    let binary = ''
    const chunkSize = 0x8000
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
    }
    return btoa(binary)
  }

  async _createHistoryAttachmentPart(historyDocument) {
    const normalizedDocument = typeof historyDocument === 'string' ? historyDocument : '[]'

    try {
      const historyBlob = new Blob([normalizedDocument], { type: 'application/json' })
      const uploadedFile = await this.client.files.upload({
        file: historyBlob,
        config: {
          mimeType: 'application/json',
          displayName: 'vrm_chat_history.json',
        },
      })

      if (uploadedFile?.uri) {
        return {
          fileData: {
            fileUri: uploadedFile.uri,
            mimeType: uploadedFile.mimeType || 'application/json',
            displayName: uploadedFile.displayName || 'vrm_chat_history.json',
          },
        }
      }
    } catch (error) {
      console.warn('Failed to upload vrm_chat_history.json, falling back to inline JSON:', error)
    }

    return {
      inlineData: {
        mimeType: 'application/json',
        data: this._encodeUtf8TextToBase64(normalizedDocument),
      },
    }
  }

  async _sendClientContent(turns, turnComplete = true) {
    if (!this.activeSession) {
      throw new Error('No active live session')
    }

    await this.activeSession.sendClientContent({
      turns: Array.isArray(turns) ? turns.filter(Boolean) : [],
      turnComplete,
    })
  }

  async _replayRecentUserAudio() {
    if (!this.activeSession || !this.isSessionOpen) return false
    if (!this._hasRecoverableReconnectAudio()) return false

    try {
      for (const chunk of this.recentInputAudioChunks) {
        const base64Audio = this._encodeInt16ToBase64(chunk.samples)
        if (!base64Audio) continue

        await this.activeSession.sendRealtimeInput({
          audio: { mimeType: 'audio/pcm;rate=16000', data: base64Audio },
        })
      }

      const silenceSamples = Math.max(
        1,
        Math.floor((this.reconnectAudioSampleRate * this.reconnectAudioReplaySilenceMs) / 1000),
      )
      const silenceBase64 = this._encodeInt16ToBase64(new Int16Array(silenceSamples))
      if (silenceBase64) {
        await this.activeSession.sendRealtimeInput({
          audio: { mimeType: 'audio/pcm;rate=16000', data: silenceBase64 },
        })
      }

      this.pendingReconnectAudio = false
      console.log('Reconnect recovery: replayed recent user audio')
      return true
    } catch (error) {
      console.error('Failed to replay recent user audio:', error)
      return false
    }
  }

  _scheduleReconnect(onSystemMessage, reason = 'Connection lost') {
    if (this.isDisconnecting) return
    if (this._isFatalCloseReason(reason)) {
      onSystemMessage?.(
        'Connection Closed',
        'Live session rejected the current setup (API Key or Quota issue). Reconnect stopped to avoid looping.',
        'error',
      )
      this.disconnect(reason)
      return
    }

    if (reason.toLowerCase().includes('goaway')) {
      this.goAwayAbortionCount = (this.goAwayAbortionCount || 0) + 1
      if (this.goAwayAbortionCount >= 2) {
        this.goAwayAbortionCount = 0
        onSystemMessage?.(
          'GoAway Loop Detected',
          'Connection unstable. Clearing chat history and session context to recover...',
          'error',
        )

        this._clearSessionResumptionState()
        this.internalHistory = []
        if (typeof this.connectionArgs?.onHistoryChange === 'function') {
          this.connectionArgs.onHistoryChange([])
        }
        try {
          if (typeof window !== 'undefined' && window.localStorage) {
            window.localStorage.removeItem('vrm_chat_history')
          }
        } catch (e) {}

        this.reconnectAttempts = 0
        this.isReconnecting = true
        this.skipSessionResumptionOnce = true

        setTimeout(() => {
          this._establishConnection()
        }, 1000)
        return
      }
    } else {
      this.goAwayAbortionCount = 0
    }

    if (this.reconnectTimer) return

    this.isReconnecting = true
    this.reconnectAttempts += 1

    if (this.reconnectAttempts > this.maxReconnectAttempts) {
      onSystemMessage?.(
        'Connection Failed',
        'Reconnect limit reached. Clear chat history and reconnect manually.',
        'error',
      )
      this.disconnect('Reconnect limit reached')
      return
    }

    const attempt = this.reconnectAttempts
    const exponentialDelay = this.reconnectBaseDelayMs * 2 ** Math.max(0, attempt - 2)
    const baseDelay = attempt === 1 ? this.reconnectFirstDelayMs : exponentialDelay
    const jitterMs = Math.floor(Math.random() * 120)
    const delayMs = Math.min(this.reconnectMaxDelayMs, baseDelay + jitterMs)
    const delaySeconds = Math.ceil(delayMs / 1000)

    onSystemMessage?.(
      'Reconnecting',
      `Connection unstable (${reason}). Retry ${attempt}/${this.maxReconnectAttempts} in ${delaySeconds}s.`,
      'warning',
    )

    if (attempt >= 4 && !this.reconnectHistorySuggestionSent) {
      this.reconnectHistorySuggestionSent = true
      onSystemMessage?.(
        'History Cleanup Recommended',
        'Too many reconnects. Open Chat > Clear to remove old history, then reconnect.',
        'warning',
      )
    }

    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null
      this._establishConnection()
    }, delayMs)
  }

  _flushTranscriptions(isFinal, onTranscription, target = 'both', options = {}) {
    const { clearUserBuffer = false } = options

    if ((target === 'user' || target === 'both') && this.currentInputTranscription.trim()) {
      const text = this.currentInputTranscription
      onTranscription?.('user', text, isFinal, { source: 'gemini_input' })
      if (isFinal) {
        this._pushInternalHistory('user', text)
        this.currentInputTranscription = ''
      }
    }

    if ((target === 'model' || target === 'both') && this.currentOutputTranscription.trim()) {
      const text = stripExpressionCommands(this.currentOutputTranscription).trim()
      if (text) {
        onTranscription?.('model', text, isFinal, { source: 'gemini_output' })
      }
      if (isFinal) {
        if (text) {
          this._pushInternalHistory('model', text)
        }
        this.currentOutputTranscription = ''
      }
    }
  }

  async _handleToolCall(
    toolCall,
    onAnimationTrigger,
    onExpressionTrigger,
    onVisionTrigger,
    onScreenTrigger,
    onCameraOffTrigger,
    onScreenOffTrigger,
    onUserNameSet,
    onMemorySaved,
    onMemoryDeleted,
  ) {
    if (!toolCall?.functionCalls || toolCall.functionCalls.length === 0) return
    console.log(`🎯 ToolCall batch received (${toolCall.functionCalls.length} function(s)):`, toolCall.functionCalls.map((f) => f.name))
    try {
      const functionResponses = []
      for (const fc of toolCall.functionCalls) {
        if (fc.id && this.handledToolCallIds.has(fc.id)) {
          console.log(`⏩ Skipping duplicate toolCall id: ${fc.id} (${fc.name})`)
          functionResponses.push({ id: fc.id, name: fc.name, response: { result: 'ok' } })
          continue
        }
        if (fc.id) {
          this.handledToolCallIds.add(fc.id)
          if (this.handledToolCallIds.size > 200) {
            const first = this.handledToolCallIds.values().next().value
            this.handledToolCallIds.delete(first)
          }
        }
        const resp = await this._executeFunction(
          fc,
          onAnimationTrigger,
          onExpressionTrigger,
          onVisionTrigger,
          onScreenTrigger,
          onCameraOffTrigger,
          onScreenOffTrigger,
          onUserNameSet,
          onMemorySaved,
          onMemoryDeleted,
        )
        if (resp) {
          functionResponses.push(resp)
        }
      }

      if (this.activeSession && functionResponses.length > 0) {
        console.log(`📤 Sending batched toolResponse (${functionResponses.length} response(s)):`, functionResponses)
        await this.activeSession.sendToolResponse({ functionResponses })
      }
    } catch (err) {
      console.error('🔥 Failed to handle batched tool calls:', err)
    }
  }

  _isAngerExpression(expressionName) {
    if (typeof expressionName !== 'string') return false
    const normalized = expressionName.trim().toLowerCase()
    if (!normalized) return false
    return /\b(angry|furious|enraged|livid|seething|fuming|irate|wrathful|hostile|aggressive|annoyed|agitated|resentful|defiant|serious|determined)\b/.test(
      normalized,
    )
  }

  async _executeFunction(
    fc,
    onAnimationTrigger,
    onExpressionTrigger,
    onVisionTrigger,
    onScreenTrigger,
    onCameraOffTrigger,
    onScreenOffTrigger,
    onUserNameSet,
    onMemorySaved,
    onMemoryDeleted,
  ) {
    const { id, name, args } = fc
    console.log(`🎯 Executing Function: ${name} (id: ${id})`, args)

    if (name === 'trigger_gesture' || name === 'trigger_animation') {
      const gestureName = args?.gesture || args?.animation_name || args?.name
      onAnimationTrigger?.(gestureName)
      return { id, name, response: { result: 'ok', gesture: gestureName } }
    }

    if (name === 'set_user_name') {
      this.setConversationProfile({ userName: args?.name })
      onUserNameSet?.(args.name)
      return { id, name, response: { result: 'ok' } }
    }

    if (name === 'save_memory') {
      this._setConversationMemory(args?.key, args?.value)
      onMemorySaved?.(args.key, args.value)
      return { id, name, response: { result: 'ok' } }
    }

    if (name === 'delete_memory') {
      this._deleteConversationMemory(args?.key)
      onMemoryDeleted?.(args.key)
      return { id, name, response: { result: 'ok' } }
    }

    if (name === 'start_timer') {
      const durationSeconds = Number(args?.duration_seconds)
      if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
        return {
          id,
          name,
          response: { error: 'duration_seconds must be a positive number of seconds.' },
        }
      }

      const label = typeof args?.label === 'string' ? args.label : 'Timer'
      this.connectionArgs?.onTimerStart?.({ duration_seconds: durationSeconds, label })
      return { id, name, response: { result: 'ok' } }
    }

    if (name === 'cancel_timer') {
      this.connectionArgs?.onTimerCancel?.()
      return { id, name, response: { result: 'ok' } }
    }

    if (name === 'show_cue_card') {
      const topic = typeof args?.topic === 'string' ? args.topic.trim() : ''
      if (!topic) {
        return { id, name, response: { error: 'topic is required' } }
      }
      const prompt = typeof args?.prompt === 'string' ? args.prompt.trim() : 'You should say:'
      const bullet_points = Array.isArray(args?.bullet_points) ? args.bullet_points : []
      const footer = typeof args?.footer === 'string' ? args.footer.trim() : ''
      const prep_time_seconds = Number(args?.prep_time_seconds) || 60
      const speak_time_seconds = Number(args?.speak_time_seconds) || 120

      this.connectionArgs?.onCueCardShow?.({
        topic,
        prompt,
        bullet_points,
        footer,
        prep_time_seconds,
        speak_time_seconds,
      })
      return { id, name, response: { result: 'ok' } }
    }

    if (name === 'dismiss_cue_card') {
      this.connectionArgs?.onCueCardDismiss?.()
      return { id, name, response: { result: 'ok' } }
    }

    if (name === 'end_conversation') {
      const checkAndDisconnect = () => {
        const audioManager = window.vrmSystem?.audioManager || window.vrmAudioManager
        const isSpeaking = audioManager ? (audioManager.isPlaying || (audioManager.activeSources && audioManager.activeSources.length > 0)) : false
        if (isSpeaking) {
          console.log('AI is still speaking, deferring end_conversation disconnect...')
          setTimeout(checkAndDisconnect, 500)
        } else {
          console.log('AI finished speaking, disconnecting end_conversation now.')
          this.disconnect('AI ended the conversation')
        }
      }
      setTimeout(checkAndDisconnect, 1500)
      return { id, name, response: { result: 'ok' } }
    }

    if (name === 'set_background_image') {
      const prompt = args?.prompt
      if (typeof prompt === 'string' && prompt.trim().length > 0) {
        this._handleSetBackgroundImageAsync(prompt.trim())
        return { id, name, response: { result: 'Background image update queued.' } }
      } else {
        return { id, name, response: { error: 'Prompt is required.' } }
      }
    }

    if (name === 'look_at_user') {
      return await this._executeVisionCapture(id, name, onVisionTrigger, 'Camera not available.')
    }

    if (name === 'look_at_screen') {
      return await this._executeVisionCapture(
        id,
        name,
        onScreenTrigger,
        'Screen not shared or active. Ask user to enable screen share.',
      )
    }

    if (name === 'turn_off_camera') {
      return await this._executeControlAction(
        id,
        name,
        onCameraOffTrigger,
        'Camera is already off or unavailable.',
      )
    }

    if (name === 'turn_off_screen') {
      return await this._executeControlAction(
        id,
        name,
        onScreenOffTrigger,
        'Screen share is already off or unavailable.',
      )
    }

    if (name === 'set_expression') {
      const expressionName = args?.expression
      onExpressionTrigger?.(expressionName, args?.duration || 5.0)
      return { id, name, response: { result: 'ok', expression: expressionName } }
    }

    if (name === 'trigger_special_effect') {
      const effectName = args?.effect || args?.name
      if (effectName) {
        window.effectsManager?.trigger(effectName, args)
      }
      return { id, name, response: { result: 'ok', effect: effectName } }
    }

    // Default fallback
    return { id, name, response: { result: 'ok' } }
  }

  async _handleSetBackgroundImageAsync(prompt) {
    if (!prompt) return
    try {
      const seed = Math.floor(Math.random() * 1000000)
      const stopwords = new Set(['and', 'the', 'with', 'for', 'from', 'under', 'above', 'near', 'beside', 'foreground', 'background', 'view', 'scenic', 'sunset', 'sunny', 'landscape'])
      const tags = prompt.trim()
        .toLowerCase()
        .replace(/[^a-z0-9\s,]/g, '')
        .split(/[\s,]+/)
        .filter(t => t.length > 2 && !stopwords.has(t))
        .slice(0, 4)
        .join(',')

      const queryTags = tags || 'landscape'
      const searchUrl = `/api/search-image?q=${encodeURIComponent(prompt.trim())}`

      let imageUrl = null
      try {
        const res = await fetch(searchUrl)
        const data = await res.json()
        if (data?.results && data.results.length > 0) {
          const limit = Math.min(data.results.length, 5)
          const randomIndex = Math.floor(Math.random() * limit)
          imageUrl = data.results[randomIndex].image
        }
      } catch (err) {
        console.warn('Image search failed, using fallback:', err)
      }

      if (!imageUrl) {
        imageUrl = `https://loremflickr.com/1024/576/${queryTags}?random=${seed}`
      }

      if (typeof this.connectionArgs?.onSetBackgroundImage === 'function') {
        this.connectionArgs.onSetBackgroundImage(imageUrl)
      }

      const finalFetchUrl = imageUrl.startsWith('http')
        ? `/api/proxy-image?url=${encodeURIComponent(imageUrl)}`
        : imageUrl

      fetch(finalFetchUrl)
        .then((r) => r.blob())
        .then((blob) => {
          const reader = new FileReader()
          reader.onloadend = () => {
            const base64Data = reader.result.split(',')[1]
            this._sendRealtimeImage(base64Data).catch(() => {})
          }
          reader.readAsDataURL(blob)
        })
        .catch(() => {})
    } catch (e) {
      console.warn('Set background image async failed:', e)
    }
  }

  async _executeControlAction(id, toolName, actionFn, defaultMessage) {
    try {
      if (!actionFn) {
        return { id, name: toolName, response: { result: defaultMessage } }
      }

      const result = await actionFn()
      if (result && typeof result === 'object' && typeof result.error === 'string') {
        return { id, name: toolName, response: { result: result.error } }
      }
      if (typeof result === 'string' && result.trim().length > 0) {
        return { id, name: toolName, response: { result: result.trim() } }
      }
      if (result === false) {
        return { id, name: toolName, response: { result: defaultMessage } }
      }

      return { id, name: toolName, response: { result: 'Done.' } }
    } catch (error) {
      console.error(`${toolName} failed`, error)
      return {
        id,
        name: toolName,
        response: { result: `Action failed: ${error?.message || 'unknown error'}` },
      }
    }
  }

  async _executeVisionCapture(id, toolName, captureFn, unavailableMessage) {
    try {
      if (!captureFn) {
        return { id, name: toolName, response: { result: unavailableMessage } }
      }

      const frame = await captureFn()
      if (frame && typeof frame === 'object' && typeof frame.error === 'string') {
        return { id, name: toolName, response: { result: frame.error } }
      }
      if (typeof frame !== 'string' || frame.length === 0) {
        return { id, name: toolName, response: { result: unavailableMessage } }
      }

      const delivered = await this._sendRealtimeImage(frame)
      if (!delivered) {
        return {
          id,
          name: toolName,
          response: { result: 'Session is reconnecting. Ask again in a moment.' },
        }
      }

      return {
        id,
        name: toolName,
        response: { result: 'Image delivered. Analyze and respond now.' },
      }
    } catch (error) {
      console.error(`${toolName} failed`, error)
      return {
        id,
        name: toolName,
        response: { result: `Capture failed: ${error?.message || 'unknown error'}` },
      }
    }
  }

  async _sendToolResponse(id, name, response) {
    if (!this.activeSession) return
    try {
      await this.activeSession.sendToolResponse({
        functionResponses: [{ id, name, response }],
      })
    } catch (e) {
      console.error('Tool response failed', e)
    }
  }

  async _sendRealtimeImage(base64Image) {
    if (!this.activeSession || !this.isSessionOpen) return false
    try {
      await this.activeSession.sendRealtimeInput({
        video: { mimeType: 'image/jpeg', data: base64Image },
      })
      return true
    } catch (e) {
      console.error('Image send failed', e)
      return false
    }
  }

  async startMicrophone() {
    if (this.isRecording) return
    try {
      this._resetVoiceActivityState()
      this._setUserSpeakingState(false, true)

      this.audioContext = new (window.AudioContext || window.webkitAudioContext)({
        sampleRate: 16000,
      })

      if (this.audioContext.state === 'suspended') {
        await this.audioContext.resume()
      }

      this.mediaStream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          sampleRate: 16000,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })

      const shouldAbortMicStart =
        !this.audioContext || this.isDisconnecting || !this.activeSession || !this.isSessionOpen
      if (shouldAbortMicStart) {
        this.mediaStream?.getTracks().forEach((t) => t.stop())
        this.mediaStream = null
        try {
          await this.audioContext?.close()
        } catch {}
        this.audioContext = null
        return
      }

      if (!this.workletNode) {
        let blobUrl = ''
        const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' })
        try {
          blobUrl = URL.createObjectURL(blob)
          await this.audioContext.audioWorklet.addModule(blobUrl)
        } finally {
          if (blobUrl) {
            URL.revokeObjectURL(blobUrl)
          }
        }

        const shouldAbortAfterWorklet =
          !this.audioContext || this.isDisconnecting || !this.activeSession || !this.isSessionOpen
        if (shouldAbortAfterWorklet) {
          this.mediaStream?.getTracks().forEach((t) => t.stop())
          this.mediaStream = null
          try {
            await this.audioContext?.close()
          } catch {}
          this.audioContext = null
          return
        }

        this.mediaSourceNode = this.audioContext.createMediaStreamSource(this.mediaStream)
        this.workletNode = new AudioWorkletNode(this.audioContext, 'pcm-processor')
        this.workletNode.port.onmessage = (e) => {
          if (this.isRecording) this._processAudioChunk(e.data)
        }
        this.mediaSourceNode.connect(this.workletNode)

        // Connect worklet to a silent sink so Chrome WebAudio render thread continuously processes frames
        this.silentGainNode = this.audioContext.createGain()
        this.silentGainNode.gain.value = 0.0
        this.workletNode.connect(this.silentGainNode)
        this.silentGainNode.connect(this.audioContext.destination)
      }
      this.isRecording = true
    } catch (e) {
      this.mediaStream?.getTracks().forEach((t) => t.stop())
      this.mediaStream = null
      this.mediaSourceNode?.disconnect()
      this.mediaSourceNode = null
      if (this.silentGainNode) {
        try {
          this.silentGainNode.disconnect()
        } catch {}
        this.silentGainNode = null
      }
      if (this.workletNode) {
        this.workletNode.port.onmessage = null
        this.workletNode.disconnect()
      }
      this.workletNode = null
      try {
        await this.audioContext?.close()
      } catch {}
      this.audioContext = null
      console.error('Mic Error:', e)
    }
  }

  stopMicrophone() {
    this.isRecording = false
    this._setUserSpeakingState(false, true)
    this._resetVoiceActivityState()
    this.mediaStream?.getTracks().forEach((t) => t.stop())
    this.mediaStream = null
    this.mediaSourceNode?.disconnect()
    this.mediaSourceNode = null
    if (this.silentGainNode) {
      try {
        this.silentGainNode.disconnect()
      } catch {}
      this.silentGainNode = null
    }
    if (this.workletNode) {
      this.workletNode.port.onmessage = null
      this.workletNode.disconnect()
    }
    this.workletNode = null
    this.audioContext?.close()
    this.audioContext = null
    this.inputBufferIndex = 0
  }

  _processAudioChunk(pcm16Data) {
    if (this.isDisconnecting) return
    if (!(pcm16Data instanceof Int16Array)) return

    let dataToBuffer = pcm16Data
    if (this.audioContext && this.audioContext.sampleRate && this.audioContext.sampleRate !== 16000) {
      dataToBuffer = this._resampleTo16k(pcm16Data, this.audioContext.sampleRate)
    }

    for (let i = 0; i < dataToBuffer.length; i++) {
      this.inputBuffer[this.inputBufferIndex++] = dataToBuffer[i]
      if (this.inputBufferIndex === this.inputBuffer.length) this._flushInputBuffer()
    }
  }

  _resampleTo16k(pcm16Data, fromRate) {
    if (!fromRate || fromRate === 16000) return pcm16Data
    const ratio = fromRate / 16000
    const newLength = Math.round(pcm16Data.length / ratio)
    const result = new Int16Array(newLength)
    for (let i = 0; i < newLength; i++) {
      const srcIndex = i * ratio
      const indexFloor = Math.floor(srcIndex)
      const indexCeil = Math.min(pcm16Data.length - 1, indexFloor + 1)
      const frac = srcIndex - indexFloor
      result[i] = Math.round(pcm16Data[indexFloor] * (1 - frac) + pcm16Data[indexCeil] * frac)
    }
    return result
  }

  _flushInputBuffer() {
    if (this.inputBufferIndex <= 0) return

    const audioChunk = this.inputBuffer.slice(0, this.inputBufferIndex)
    this._rememberRecentAudioChunk(audioChunk)
    this.inputBufferIndex = 0

    if (
      !this.activeSession ||
      this.isDisconnecting ||
      !this.isSessionOpen ||
      this.isRestoringReconnectContext
    )
      return

    const base64 = this._encodeInt16ToBase64(audioChunk)
    if (!base64) return
    this._sendToGemini(base64)
  }

  async _sendToGemini(base64Audio) {
    if (!this.activeSession || !this.isSessionOpen) return
    try {
      await this.activeSession.sendRealtimeInput({
        audio: { mimeType: 'audio/pcm;rate=16000', data: base64Audio },
      })
    } catch (e) {
      const errMsg = String(e?.message || '').toLowerCase()
      if (!errMsg.includes('closed') && !errMsg.includes('closing')) {
        console.error('Audio Send Error:', e)
      }
    }
  }

  _isMeaningfulSpeechText(text) {
    if (typeof text !== 'string') return false
    const cleaned = text
      .replace(/<[^>]*>/g, ' ')
      .replace(/\[[^\]]*]/g, ' ')
      .replace(/\b(noise|silence|music|laughter|laugh|breath|breathing|applause)\b/gi, ' ')
      .trim()

    if (!cleaned) return false
    return /[A-Za-z]{2,}|[0-9]{2,}/.test(cleaned)
  }

  _armUserSpeechReleaseTimer() {
    this._clearUserSpeechReleaseTimer()
    this.userSpeechReleaseTimer = setTimeout(() => {
      this.userSpeechReleaseTimer = null
      this._setUserSpeakingState(false)
    }, this.userSpeechReleaseMs)
  }

  _clearUserSpeechReleaseTimer() {
    if (!this.userSpeechReleaseTimer) return
    clearTimeout(this.userSpeechReleaseTimer)
    this.userSpeechReleaseTimer = null
  }

  _setUserSpeakingState(isSpeaking, force = false) {
    const next = Boolean(isSpeaking)
    if (!force && this.isUserSpeaking === next) return
    this.isUserSpeaking = next
    if (!next) this._clearUserSpeechReleaseTimer()

    if (typeof this.onUserSpeechStateChange === 'function') {
      try {
        this.onUserSpeechStateChange(next)
      } catch (error) {
        console.error('User speech state callback failed:', error)
      }
    }
  }

  _resetVoiceActivityState() {
    this._clearUserSpeechReleaseTimer()
  }

  disconnect(reason = 'User disconnected') {
    if (this.isDisconnecting) return
    try {
      const storage = this._getStorage()
      storage?.setItem('vrm_session_ended', 'true')
    } catch (e) {
      console.warn('Failed to set vrm_session_ended flag:', e)
    }
    if (
      !this.activeSession &&
      !this.isRecording &&
      !this.reconnectTimer &&
      !this.onDisconnectCallback
    )
      return
    this.isDisconnecting = true
    this._clearReconnectTimer()
    this.isReconnecting = false
    this.reconnectAttempts = 0
    console.log(`🔌 Disconnecting: ${reason}`)

    this.isSessionOpen = false
    this._stashPendingInputBufferForReconnect()
    this.stopMicrophone()

    this._flushTranscriptions(true, this.connectionArgs?.onTranscription, 'both', {
      clearUserBuffer: true,
    })

    if (this.activeSession) {
      try {
        this.activeSession.close()
      } catch (error) {
        console.warn('Failed to close live session cleanly', error)
      }
      this.activeSession = null
    }
    this.onDisconnectCallback?.(reason)
    this.onDisconnectCallback = null
  }

  _getTools(animList) {
    return [
      {
        functionDeclarations: [
          {
            name: 'trigger_gesture',
            description:
              'Trigger a full-body mocap gesture or emotion posture for the avatar (e.g. salute, wave, dance, spin, heart_fingers, shrug, bow, clap, hands_on_hips, facepalm, cheer, shy, nod, shake_head, thinking, thumbs_up, blow_kiss).',
            parameters: {
              type: 'OBJECT',
              properties: {
                gesture: {
                  type: 'STRING',
                  description:
                    'Gesture name to play. Allowed values: salute, wave, dance, spin, heart_fingers, shrug, bow, clap, hands_on_hips, facepalm, cheer, shy, nod, shake_head, thinking, thumbs_up, jump, cry, quiet, blow_kiss.',
                },
              },
              required: ['gesture'],
            },
          },
          {
            name: 'set_expression',
            description:
              'Change the facial expression of the 3D avatar (e.g. blush, crying, dizzy, happy, angry, sad, surprised, relaxed, neutral).',
            parameters: {
              type: 'OBJECT',
              properties: {
                expression: {
                  type: 'STRING',
                  description:
                    'Facial expression name. Allowed values: blush, crying, tears, dizzy, happy, angry, sad, surprised, relaxed, neutral, wink.',
                },
                duration: {
                  type: 'NUMBER',
                  description: 'Duration in seconds for the expression to stay active (default: 4.0).',
                },
              },
              required: ['expression'],
            },
          },
          {
            name: 'trigger_special_effect',
            description:
              'Trigger anime visual special effects (e.g. hearts, sparkles, tears, sweat, steam, exclamation, question, zzz, music_notes, gloom, sakura, speed_lines, vignette, glitch).',
            parameters: {
              type: 'OBJECT',
              properties: {
                effect: {
                  type: 'STRING',
                  description:
                    'Visual effect name. Allowed values: hearts, sparkles, tears, sweat, steam, exclamation, question, zzz, music_notes, gloom, sakura, speed_lines, vignette, glitch.',
                },
              },
              required: ['effect'],
            },
          },
          {
            name: 'set_background_image',
            description: 'Change the background image of the 3D scene. The AI can generate a background based on a prompt or describe a scene to load.',
            parameters: {
              type: 'OBJECT',
              properties: {
                prompt: {
                  type: 'STRING',
                  description: 'A prompt describing the background image to generate (e.g. Enclose your exact phrase in quotation marks (e.g., "Martin Luther King Jr.") to force the search to look for the exact string rather than individual words.). And the images chosen by may not be accurate since they are from the WIKIPEDIA.',
                },
              },
              required: ['prompt'],
            },
          },
          {
            name: 'look_at_user',
            description: 'Capture a live image from the user camera when vision is needed.',
          },
          {
            name: 'look_at_screen',
            description: "Capture the user's shared screen when screen context is needed.",
          },
          {
            name: 'turn_off_camera',
            description: 'Stop camera-based vision.',
          },
          {
            name: 'turn_off_screen',
            description: 'Stop screen-based vision.',
          },
          {
            name: 'set_user_name',
            description: 'Save user name.',
            parameters: {
              type: 'OBJECT',
              properties: { name: { type: 'STRING' } },
              required: ['name'],
            },
          },
          {
            name: 'save_memory',
            description: 'Persist a fact about the user.',
            parameters: {
              type: 'OBJECT',
              properties: {
                key: { type: 'STRING' },
                value: { type: 'STRING' },
              },
              required: ['key', 'value'],
            },
          },
          {
            name: 'delete_memory',
            description: 'Forget a fact about the user.',
            parameters: {
              type: 'OBJECT',
              properties: { key: { type: 'STRING' } },
              required: ['key'],
            },
          },
          {
            name: 'start_timer',
            description: 'Start an on-screen countdown timer.',
            parameters: {
              type: 'OBJECT',
              properties: {
                duration_seconds: {
                  type: 'NUMBER',
                  description: 'Countdown duration in seconds.',
                },
                label: {
                  type: 'STRING',
                  description: 'Short label for the timer.',
                },
              },
              required: ['duration_seconds'],
            },
          },
          {
            name: 'cancel_timer',
            description: 'Cancel and hide the active on-screen timer.',
          },
          {
            name: 'show_cue_card',
            description:
              'Show an authentic IELTS Speaking Part 2 candidate task card with 1-minute preparation timer and 2-minute speaking timer on the screen.',
            parameters: {
              type: 'OBJECT',
              properties: {
                topic: {
                  type: 'STRING',
                  description:
                    'The main IELTS Speaking Part 2 topic (e.g. "Describe a memorable journey you have been on").',
                },
                prompt: {
                  type: 'STRING',
                  description: 'The prompt sentence, defaults to "You should say:".',
                },
                bullet_points: {
                  type: 'ARRAY',
                  items: { type: 'STRING' },
                  description: '3 to 4 bullet points that the candidate should cover.',
                },
                footer: {
                  type: 'STRING',
                  description: 'Concluding instruction e.g. "and explain why it was memorable."',
                },
                prep_time_seconds: {
                  type: 'NUMBER',
                  description: 'Preparation countdown duration in seconds (default: 60).',
                },
                speak_time_seconds: {
                  type: 'NUMBER',
                  description: 'Speaking countdown duration in seconds (default: 120).',
                },
              },
              required: ['topic'],
            },
          },
          {
            name: 'dismiss_cue_card',
            description: 'Dismiss and hide the active IELTS Speaking cue card widget.',
          },
          {
            name: 'end_conversation',
            description: 'End the current active conversation session and disconnect the call.',
          },
        ],
      },
      { google_search: {} },
    ]
  }
}
