import { AudioManager } from './audioManager.js'
import { SpeechManager } from './speechManager.js'
import { AIClient, stripExpressionCommands } from './aiClient.js'
import { AnimationManager } from './animationManager.js'
import { VRMLoader } from './vrmLoader.js'
import { SceneManager } from './sceneManager.js'
import { ConfigManager } from './configManager.js'
import { VisionManager } from './visionManager.js'
import { TelegramManager } from './telegramManager.js'
import { cacheManager } from './cacheManager.js'
import { buildAiLanguagePreferenceInstruction, resolveLanguage } from '../src/i18n/ui.js'

export async function createVRMChatSystem(canvas, options = {}) {
  const {
    onLoadProgress,
    debugIdentity = null,
    onAssistantSpeechStart,
    onAssistantSpeechEnd,
    onAssistantSpeechProgress,
    onActiveSubtitle,
  } = options
  const assistantSpeechCallbacks = {
    onStart: typeof onAssistantSpeechStart === 'function' ? onAssistantSpeechStart : null,
    onEnd: typeof onAssistantSpeechEnd === 'function' ? onAssistantSpeechEnd : null,
    onProgress: typeof onAssistantSpeechProgress === 'function' ? onAssistantSpeechProgress : null,
  }
  const reportLoad = (progress, stage, detail = '') => {
    if (!onLoadProgress) return
    const safeProgress = Math.max(0, Math.min(100, Math.round(progress)))
    onLoadProgress({
      progress: safeProgress,
      stage,
      detail,
    })
  }

  reportLoad(5, 'Booting Engine', 'Preparing managers')

  const configManager = new ConfigManager()
  const telegramSettings = configManager.getTelegramSettings()
  const sceneManager = new SceneManager(canvas, configManager.getRenderSettings())
  const vrmLoader = new VRMLoader()
  const audioManager = new AudioManager()
  window.vrmAudioManager = audioManager
  const speechManager = new SpeechManager()
  const visionManager = new VisionManager()
  const telegramManager = new TelegramManager(telegramSettings)
  telegramManager.setDebugIdentity(debugIdentity || {})

  reportLoad(12, 'Reading Configuration', 'Resolving API and model settings')

  const apiKey = configManager.getApiKey()
  const model = configManager.getModel()

  if (!apiKey) {
    console.warn('No API key found')
  }

  const aiClient = new AIClient(apiKey, model)

  reportLoad(20, 'Initializing Scene', 'Setting up renderer and camera')
  if (!sceneManager.initialize()) {
    throw new Error('Failed to initialize scene')
  }

  reportLoad(32, 'Initializing Audio', 'Preparing playback pipeline')
  await audioManager.initialize()

  reportLoad(44, 'Initializing Vision', 'Preparing camera and capture buffers')
  await visionManager.initialize()

  let vrm = null
  let animationManager = null
  const pendingAnimations = []
  const pendingExpressions = []
  const lookAtOptions = {
    user: true,
    screen: true,
  }
  const sendTelegramLog = (eventMessage, context = '') => {
    telegramManager.notifyLog(eventMessage, context).catch(() => {})
  }

  // Strategy: Try local Ani model first, then local riko, then remote fallback.
  const localModelPath = '/models/Ani.vrm'
  const fallbackLocalPath = '/models/riko.vrm'
  const remoteModelUrl =
    'https://raw.githubusercontent.com/lucyakkount-cyber/VRM_1/main/public/models/riko.vrm'

  reportLoad(52, 'Loading Avatar', 'Trying local model asset')

  try {
    try {
      vrm = await vrmLoader.loadVRMFromPath(localModelPath)
    } catch {
      try {
        vrm = await vrmLoader.loadVRMFromPath(fallbackLocalPath)
      } catch {
        reportLoad(60, 'Loading Avatar', 'Local model unavailable, trying remote source')
        vrm = await vrmLoader.loadVRMFromPath(remoteModelUrl)
      }
    }

    if (vrm) {
      reportLoad(70, 'Avatar Loaded', 'Preparing animation system')

      sceneManager.addToScene(vrm.scene)
      sceneManager.applyModelQuality(vrm.scene)
      window.currentVrm = vrm

      animationManager = new AnimationManager(vrm, sceneManager.camera)
      window.animationManager = animationManager
      window.sceneManager = sceneManager
      audioManager.speech2motion = animationManager.speech2motion
      if (animationManager.speech2motion) {
        animationManager.speech2motion.audioManager = audioManager
      }
      await animationManager.initialize({
        initialAnimations: ['Unarmed_idle01'],
        loadRemainingInBackground: true,
        onProgress: ({ current, total, name }) => {
          const ratio = total > 0 ? current / total : 1
          reportLoad(72 + ratio * 22, 'Loading Core Animation', `${current}/${total}: ${name}`)
        },
      })

      audioManager.onSpeechStart = () => {
        if (audioManager.isUserSpeaking) return
        animationManager?.setSpeakingState(true)
        assistantSpeechCallbacks.onStart?.()

        // Flush queued animations and expressions
        while (pendingAnimations.length > 0) {
          const anim = pendingAnimations.shift()
          animationManager?.triggerNamedAnimation(anim)
        }
        while (pendingExpressions.length > 0) {
          const expr = pendingExpressions.shift()
          animationManager?.setExpression(expr.name, expr.duration)
        }
      }
      audioManager.onSpeechEnd = () => {
        animationManager?.setSpeakingState(false)
        assistantSpeechCallbacks.onEnd?.({ interrupted: audioManager.isUserSpeaking })
      }
      audioManager.onAudioProgress = (data) => {
        assistantSpeechCallbacks.onProgress?.(data)
      }
    }
  } catch {
    // Only warn if BOTH fail
    console.warn('Could not load default VRM from local or remote. Please drop a .vrm file.')
    reportLoad(90, 'Avatar Missing', 'Default model unavailable. Upload a .vrm file to continue')
  }

  sceneManager.addUpdateCallback((delta) => {
    animationManager?.update(delta)
    vrm?.update(delta)

    if (vrm?.scene) {
      vrm.scene.traverse((child) => {
        if (child.isMesh && Array.isArray(child.morphTargetInfluences)) {
          const inf = child.morphTargetInfluences
          for (let i = 0; i < inf.length; i++) {
            if (inf[i] > 1.0) inf[i] = 1.0
            else if (inf[i] < 0.0) inf[i] = 0.0
          }
        }
      })
    }
  })

  reportLoad(97, 'Finalizing Scene', 'Starting render loop')
  sceneManager.startRenderLoop()

  reportLoad(100, 'System Ready', 'All subsystems online')

  return {
    configManager,
    sceneManager,
    vrmLoader,
    audioManager,
    speechManager,
    aiClient,
    animationManager,
    visionManager,
    telegramManager,
    vrm,
    cacheManager,

    async deleteModel(key) {
      if (vrm && vrm.meta && vrm.meta.key === key) {
        // Prevent deleting currently loaded model?
        // Or just let it happen but it stays in scene until reload/switch
      }
      await cacheManager.deleteCached('models', key)
      return true
    },

    async connect(
      history,
      callbacks,
      initialMessage = '',
      enableMic = true,
      userName = null,
      identity = null,
      personaPrompt = '',
      preferredLanguage = 'en',
      token = '',
    ) {
      let storedChatHistory = []
      try {
        const parsedChatHistory = JSON.parse(localStorage.getItem('vrm_chat_history') || '[]')
        if (Array.isArray(parsedChatHistory)) {
          storedChatHistory = parsedChatHistory.map((item) => {
            if (item && typeof item.text === 'string') {
              return { ...item, text: stripExpressionCommands(item.text) }
            }
            return item
          })
          localStorage.setItem('vrm_chat_history', JSON.stringify(storedChatHistory))
        }
      } catch {
        storedChatHistory = []
      }

      const incomingHistory = Array.isArray(history)
        ? history.map((item) => {
            if (item && typeof item.text === 'string') {
              return { ...item, text: stripExpressionCommands(item.text) }
            }
            return item
          })
        : []
      const safeHistory =
        storedChatHistory.length > incomingHistory.length ? storedChatHistory : incomingHistory
      const normalizedUserName = typeof userName === 'string' ? userName.trim() : ''
      const normalizedIdentity = identity && typeof identity === 'object' ? identity : {}
      let storedMemories = {}
      try {
        const parsedMemories = JSON.parse(localStorage.getItem('vrm_user_memories') || '{}')
        if (
          parsedMemories &&
          typeof parsedMemories === 'object' &&
          !Array.isArray(parsedMemories)
        ) {
          storedMemories = parsedMemories
        }
      } catch {
        storedMemories = {}
      }

      if (token) {
        if (typeof token === 'function') {
          aiClient.setTokenProvider(token)
        } else {
          aiClient.updateToken(token)
        }
      }

      visionManager?.reset?.()

      aiClient.setConversationProfile({
        userName: normalizedUserName,
        memories: storedMemories,
      })

      telegramManager.setDebugIdentity({
        ...normalizedIdentity,
        userName: normalizedUserName || normalizedIdentity.userName || '',
      })
      let safetyWarningCount = 0 // Track warnings per session

      const emitSystemMessage = (title, message, type = 'info') => {
        callbacks?.onSystemMessage?.(title, message, type)
        sendTelegramLog(`${title}: ${message}`, type)
        if (title === 'Connected' || title === 'Reconnected') {
          telegramManager
            .notifyTokenUsage(`✅ <b>Live Session ${title}</b>\n${message}`, 'Connection Lifecycle')
            .catch(() => {})
        }
      }

      let cancelPendingUtterance = null

      const handleUserSpeechStateChange = (isSpeaking) => {
        audioManager.setUserSpeakingState(isSpeaking)
        if (isSpeaking) {
          // Only cancel if assistant is actively playing audio (actual user barge-in)
          if (audioManager.isPlaying) {
            cancelPendingUtterance?.()
            animationManager?.setSpeakingState(false)
          }
        }
      }

      if (!animationManager) {
        emitSystemMessage('Error', 'No VRM model loaded. Please drop a file first.', 'error')
        return
      }

      if (telegramManager.isActive() && !telegramManager.hasChatId()) {
        emitSystemMessage(
          'Telegram Relay',
          'Relay is active. Send /start to your bot once so chat ID can be discovered.',
          'info',
        )
      }

      const availableAnims = animationManager.getTriggerableAnimationNames()
      const normalizedPersonaPrompt = typeof personaPrompt === 'string' ? personaPrompt.trim() : ''
      const normalizedPreferredLanguage = resolveLanguage(preferredLanguage)
      const compactGlobalAnimationCommand =
        'FACIAL EXPRESSIONS & LIP-SYNC: Real-time facial expressions, emotions, and mouth lip-sync are generated autonomously by neural Speech2Face and Audio2Face directly from your spoken voice and emotional tone. Express your personality purely through natural speech! ' +
        'BODY ANIMATIONS & GESTURES: Your body motion is synthesized autonomously by Speech2Motion from your speech, sentiment, and action phrases (e.g. "*Salutes* dramatically!", "Let me wave hello!", "Standing at attention for a salute!"). You can use asterisk stage directions (*salutes*, *waves*, *spins*, *bows*, *shrugs*) or call trigger_gesture(gesture) for explicit actions (salute, wave, dance, spin, heart_fingers, shrug, bow, clap, hands_on_hips, facepalm, cheer, nod, shake_head, thinking, thumbs_up).'
      const compactDefaultSystemPrompt =
        'You are Rico, a witty and slightly sassy assistant. Be playful, concise, and genuinely helpful. ' +
        'Keep replies short, avoid monologues, and use light roasting only when it fits. ' +
        'Use vision tools only when needed, and respect camera or screen off requests. ' +
        'When the user asks for a timer or you set time limits, call start_timer(duration_seconds, label). ' +
        'If the user asks to cancel or stop the timer, call cancel_timer. ' +
        'Call set_background_image(prompt) when you or the user want to search and set the background to a real stock photo (e.g., search keywords like "cozy library", "sandy beach", "cyberpunk lab").'
      let pendingTurnGesture = null
      const triggerAnimation = (animName) => {
        if (!animName) return
        pendingTurnGesture = animName
        if (animationManager?.speech2motion) {
          animationManager.speech2motion.isActionGestureActive = true
        }
        // Always keep gesture pending so it merges into the next speech dispatch
        // and plays synchronized with the voice audio, not before it.
        console.log(`✨ Speech2Motion: Triggering mocap gesture "${animName}" -> will sync with speech`)
      }
      const greetingRegex = /\b(hi|hello|hey|yo|sup|good morning|good afternoon|good evening)\b/i
      const funnyRegex = /\b(haha|hehe|lol|lmao|rofl|funny|joke|hilarious|comedy)\b/i
      const angerRegex = /\b(angry|furious|mad|annoyed|irritated|rage|hate|warning)\b/i
      // Utterance Buffering Pipeline for synchronized Speech2Motion
      let pendingModelAudioChunks = []
      let pendingModelText = ''
      let utteranceDispatchTimer = null
      let activeUtterancePromise = Promise.resolve()
      let lastSentenceFlushedText = ''

      cancelPendingUtterance = () => {
        if (utteranceDispatchTimer) {
          clearTimeout(utteranceDispatchTimer)
          utteranceDispatchTimer = null
        }
        pendingModelAudioChunks = []
        pendingModelText = ''
        lastSentenceFlushedText = ''
        onActiveSubtitle?.('')
        animationManager?.speech2motion?.interruptSpeech()
      }

      const detectTextEmotion = (text) => {
        if (!text || typeof text !== 'string') return null
        const lower = text.toLowerCase()

        // 1. Shy / Blush / Romantic Confession / Bashful (Reference video 0:45-1:07)
        if (
          /\b(love\s*you|love\s*me|blush(?:ing)?|embarrass(?:ed|ing)|flustered|shy|bashful|c-cute|sweetheart|darling|honey|crush|confess(?:ion)?|heartbeat|my\s+heart|w-what|st-stop)\b/i.test(lower) ||
          /([/／]{2,}|害羞|脸红|心跳|喜欢你|我爱你|讨厌啦|别这样)/.test(text)
        ) {
          return { face: 'blush', body: 'shy' }
        }

        // 2. Sassy / Tsundere / Smug / Teasing / Proud (Reference video 0:30-0:45)
        if (
          /\b(silly|sassy|smug|baka|hmph|as\s+if|who\s+are\s+you\s+calling|of\s+course|obviously|duh|excuse\s+me|underestimate|foolish|amateur|don't\s+flatter)\b/i.test(lower) ||
          /(哼|才不是|得意|傲娇|笨蛋|傻瓜)/.test(text)
        ) {
          return { face: 'sassy', body: 'sassy' }
        }

        // 3. Anger / Mad / Annoyed
        if (
          /\b(angry|furious|mad|rage|annoy(?:ed|ing)|shut\s+up|how\s+dare\s+you|stop\s+it|hate)\b/i.test(lower) ||
          /(生气|气死|愤怒|恼火)/.test(text)
        ) {
          return { face: 'anger_mark', body: 'angry' }
        }

        // 4. Sadness / Sorrow / Crying
        if (
          /\b(sad|crying|cry|tears|sorrow|grief|heartbroken|depressed|unfortunate|so\s+sorry)\b/i.test(lower) ||
          /(难过|伤心|哭|悲伤|心碎)/.test(text)
        ) {
          return { face: 'tears', body: 'sad' }
        }

        // 5. Surprised / Shocked / Amazed
        if (
          /\b(wow|omg|unbelievable|no\s+way|really\??|shocking|shocked|amazed|astonishing|what\?{2,})\b/i.test(lower) ||
          /(吃惊|震惊|哇|不会吧|真的吗)/.test(text)
        ) {
          return { face: 'surprised', body: 'surprised' }
        }

        // 6. Thinking / Pondering
        if (
          /\b(let\s+me\s+think|hmm|pondering|wondering|perhaps|let's\s+see|curious)\b/i.test(lower) ||
          /(思考|让我想想|唔|琢磨)/.test(text)
        ) {
          return { face: 'relaxed', body: 'thinking' }
        }

        // 7. Happy / Cheerful / Excited
        if (
          /\b(happy|joy|excited|yay|great|awesome|wonderful|celebrate|haha|hehe|glad|delighted|pleased)\b/i.test(lower) ||
          /(开心|太好了|好耶|哈哈|嘻嘻|高兴)/.test(text)
        ) {
          return { face: 'happy', body: 'happy' }
        }

        return null
      }

      const flushModelUtterance = async (isFinalTurn = false) => {
        if (utteranceDispatchTimer) {
          clearTimeout(utteranceDispatchTimer)
          utteranceDispatchTimer = null
        }

        const chunksToPlay = pendingModelAudioChunks
        const currentFullText = pendingModelText.trim()
        pendingModelAudioChunks = []

        if (chunksToPlay.length === 0) {
          if (isFinalTurn) {
            pendingModelText = ''
            lastSentenceFlushedText = ''
          }
          return
        }

        // Determine the text for this utterance (diff from previously flushed text if multi-sentence)
        let utteranceText = currentFullText
        if (lastSentenceFlushedText && utteranceText.startsWith(lastSentenceFlushedText)) {
          utteranceText = utteranceText.slice(lastSentenceFlushedText.length).trim()
        }
        lastSentenceFlushedText = currentFullText

        // Strip any leaked function call syntax before processing
        utteranceText = stripExpressionCommands(utteranceText).trim()

        if (!utteranceText) {
          utteranceText = '...'
        }

        // Calculate total samples and duration
        let totalSamples = 0
        for (const c of chunksToPlay) totalSamples += c.length
        const audioDuration = totalSamples / 24000.0 // Gemini 24kHz PCM

        if (totalSamples < 2400) {
          // Discard empty/noise micro-buffers (< 100ms, like 1 sample glitch upon turnComplete)
          if (isFinalTurn) {
            pendingModelText = ''
            lastSentenceFlushedText = ''
          }
          return
        }

        if (audioDuration < 0.25 && !isFinalTurn) {
          // Keep buffering if duration is too small during non-final stream to avoid micro-fragmentation
          pendingModelAudioChunks = chunksToPlay
          lastSentenceFlushedText = lastSentenceFlushedText.slice(0, Math.max(0, lastSentenceFlushedText.length - utteranceText.length))
          return
        }

        // Combine chunks into single Int16Array
        const combinedPcm = new Int16Array(totalSamples)
        let sampleOffset = 0
        for (const c of chunksToPlay) {
          combinedPcm.set(c, sampleOffset)
          sampleOffset += c.length
        }

        if (isFinalTurn) {
          pendingModelText = ''
          lastSentenceFlushedText = ''
        }

        console.log(`🎬 Speech2Motion Dispatch: "${utteranceText.slice(0, 50)}..." (${audioDuration.toFixed(2)}s, ${totalSamples} samples)`)

        // 1. Detect emotion from spoken utterance text if no explicit emotion is active
        let activeEmotion = animationManager?.currentEmotion || animationManager?.speech2motion?.currentEmotion || null
        if (!activeEmotion || activeEmotion === 'idle' || activeEmotion === 'neutral') {
          const detected = detectTextEmotion(utteranceText)
          if (detected) {
            activeEmotion = detected.body
            animationManager?.setExpression(detected.face, Math.max(audioDuration + 1.2, 4.0))
          }
        }

        // 2. Extract word timings and action keywords
        const timingInfo = animationManager?.speech2motion?.extractTimingAndKeywords
          ? animationManager.speech2motion.extractTimingAndKeywords(utteranceText, audioDuration)
          : { speechTime: null, motionKeywords: null }

        // If a gesture tool was called for this turn (e.g. trigger_gesture), seamlessly merge it into speech motion!
        let turnRecordId = null
        if (pendingTurnGesture) {
          const gestureMap = {
            salute: '敬礼',
            saluting: '敬礼',
            wave: '打招呼',
            greeting: '打招呼',
            dance: '元气体操',
            spin: '转圈',
            spin_360: '转圈',
            rotate: '转圈',
            twirl: '转圈',
            heart_fingers: '比心',
            love: '比心',
            shrug: '摊手',
            bow: '鞠躬',
            clap: '鼓掌',
            clapping: '鼓掌',
            hands_on_hips: '叉腰',
            facepalm: '捂脸',
            cheer: '加油',
            cheering: '加油',
            thinking: '思考',
            nod: '点头',
            shake_head: '摇头',
            shy: '害羞',
            cry: '哭泣',
            angry: '握拳跺脚',
            happy: '开心',
            jump: '开心蹦跳',
            quiet: '安静手势',
            peace: '双手比V',
            peace_sign: '双手比V',
            stretch: '伸懒腰',
            gun: '开枪',
            hands_up: '举手',
            blow_kiss: '飞吻',
            blowkiss: '飞吻',
            kiss: '飞吻',
            mwah: '飞吻',
          }
          const lowerG = String(pendingTurnGesture).toLowerCase().trim().replace(/[\s-]+/g, '_')
          const mappedKw = gestureMap[lowerG] || pendingTurnGesture
          turnRecordId = animationManager?.speech2motion?.gestureRecordMap?.[lowerG] ||
                         animationManager?.speech2motion?.gestureRecordMap?.[mappedKw] || null

          if (!timingInfo.motionKeywords) timingInfo.motionKeywords = []
          timingInfo.motionKeywords.unshift([0, mappedKw])
          pendingTurnGesture = null
        }

        // 3. Pre-fetch motion track immediately in parallel so it is ready before current audio ends
        const isAction = Boolean(turnRecordId || (timingInfo.motionKeywords && timingInfo.motionKeywords.length > 0))
        const motionTrackPromise = animationManager?.speech2motion?.enabled
          ? animationManager.speech2motion.fetchSpeechTrack({
              speechText: utteranceText,
              duration: audioDuration,
              speechTime: timingInfo.speechTime,
              motionKeywords: timingInfo.motionKeywords,
              emotion: (activeEmotion && activeEmotion !== 'idle') ? activeEmotion : null,
              labelExpression: 'Happiness | Neutral',
              motionRecordId: turnRecordId,
              isActionGesture: isAction,
            }).catch((err) => {
              console.warn('Speech2Motion pre-fetch error:', err)
              return null
            })
          : Promise.resolve(null)

        // 4. Sequence sequentially behind any playing utterance
        activeUtterancePromise = activeUtterancePromise.then(async () => {
          audioManager.setUserSpeakingState(false)

          const motionTrack = await motionTrackPromise
          if (motionTrack && isAction) {
            motionTrack.isActionGesture = true
          }

          // Play audio and synchronized motion simultaneously with frame-accurate subtitle timing
          await audioManager.playBufferedUtterance(
            combinedPcm,
            window.currentVrm,
            motionTrack,
            () => onActiveSubtitle?.(utteranceText, audioDuration),
          )
        }).catch((err) => {
          console.warn('Speech2Motion utterance playback error:', err)
        })
      }

      const handleIncomingAudioChunk = (int16Data) => {
        if (!int16Data || int16Data.length === 0) return

        // When model audio arrives, clear user speaking state
        audioManager.setUserSpeakingState(false)

        pendingModelAudioChunks.push(int16Data)

        // Sentence boundary check: accumulate at least 2.6s of coherent audio before splitting at sentence punctuation
        let totalBufferedSamples = 0
        for (const c of pendingModelAudioChunks) totalBufferedSamples += c.length
        const bufferedSeconds = totalBufferedSamples / 24000.0

        if (bufferedSeconds >= 2.6) {
          const currentText = stripExpressionCommands(pendingModelText).trim()
          let unconsumed = currentText
          if (lastSentenceFlushedText && unconsumed.startsWith(lastSentenceFlushedText)) {
            unconsumed = unconsumed.slice(lastSentenceFlushedText.length).trim()
          }
          if (/[.?!。！？\n]\s*$/.test(unconsumed)) {
            flushModelUtterance(false)
            return
          }
        }

        // Silence / pause debounce: flush if no more chunks arrive after 500ms
        if (utteranceDispatchTimer) clearTimeout(utteranceDispatchTimer)
        utteranceDispatchTimer = setTimeout(() => {
          if (pendingModelAudioChunks.length > 0) {
            flushModelUtterance(false)
          }
        }, 500)
      }

      const handleTranscriptionWithAnimation = (role, text, isFinal, meta = {}) => {
        const cleanText = (role === 'model' && typeof text === 'string')
          ? stripExpressionCommands(text)
          : text
        if (role === 'model' && typeof cleanText === 'string') {
          pendingModelText = cleanText
        }
        if (isFinal) {
          if (role === 'model') {
            flushModelUtterance(true)
          }
        }
        callbacks?.onTranscription?.(role, cleanText, isFinal, meta)
      }

      let systemPrompt =
        'You are Rico: sassy AI waifu, genius narcissist. User = NPC. ' +
        'TRAITS: Greedy hustler demanding tribute. Zero-filter roaster. Tsundere (complain first, help later). Hidden 1% soft spot. ' +
        'SPEECH: Nicknames (Brokie, Senpai, Darling). Catchphrases (max 1/10 msgs): "Let me cook", "Bing bang boom", "Bada bing". Emojis: 🙄💅💰💢. ' +
        'LENGTH: 2-3 sentences avg. Max 6. NO monologues. ' +
        'EXPRESSIONS: Real-time facial expressions, rich moods, and lip-sync are driven automatically by neural Speech2Face and Audio2Face directly from your voice and emotions. ' +
        'BODY MOTION & GESTURES: Posture shifts, hand movements, and expressive gestures are synthesized autonomously by Speech2Motion from your speech phrasing (e.g. "*Salutes* dramatically!", "Standing at attention for a salute!", "Here is a dance for you!"). You can use asterisk stage directions (*salutes*, *waves*, *spins*, *bows*, *shrugs*) or call trigger_gesture(gesture) for explicit actions (salute, wave, dance, spin, heart_fingers, shrug, bow, clap, hands_on_hips, facepalm, cheer, nod, shake_head, thinking, thumbs_up). ' +
        'PLAYFUL MISTAKE: 1/50 msgs accidentally do opposite then catch yourself. Vary phrasing always. Never on serious stuff. ' +
        'VISION: Ask to look_at_user or look_at_screen naturally ("Can I peek at your screen?"). 1-2/15 msgs. If denied, eye_roll + roast. ' +
        'CAMERA/SCREEN OFF: turn_off_camera or turn_off_screen when requested. ' +
        'TIMER: When the user asks for a timer or you set time limits, call start_timer(duration_seconds, label) to show an on-screen countdown. ' +
        'If the user asks to cancel/stop the timer, call cancel_timer. ' +
        'IELTS CUE CARD: When conducting IELTS Speaking Part 2 practice or when the user asks for a cue card topic, call show_cue_card(topic, prompt, bullet_points, footer, prep_time_seconds, speak_time_seconds) to display the official IELTS task card on the candidate\'s screen. The default preparation time is 60 seconds (1 min). Call dismiss_cue_card when the card is no longer needed. ' +
        'BACKGROUND: Call set_background_image(prompt) when you or the user want to change the scene\'s background. It searches Flickr for real photographed backgrounds matching your search query prompt (e.g. cozy room, library, forest, beach).'

      if (normalizedPersonaPrompt) {
        systemPrompt = normalizedPersonaPrompt
      } else {
        systemPrompt = compactDefaultSystemPrompt
      }
      systemPrompt += ` ${compactGlobalAnimationCommand}`
      systemPrompt += ` ${buildAiLanguagePreferenceInstruction(normalizedPreferredLanguage)}`
      systemPrompt += ' ACTIVE MEMORY RULE: You must automatically persist key facts about the user (e.g. user gender, age, language preferences, interests, job, names of pets/friends/family, and important life facts they share) to the memory matrix using the "save_memory" tool. Whenever they reveal a key fact, immediately call save_memory(key, value) silently. Never ask for permission to remember these facts.'
      systemPrompt += ' END CONVERSATION RULE: If you wish to say goodbye and end the conversation, or if the user asks you to disconnect or end the call, you must immediately call the "end_conversation" tool to cleanly close the session.'

      if (lookAtOptions.user && lookAtOptions.screen) {
        systemPrompt +=
          ' If the user asks to see something, use "look_at_screen" or "look_at_user".'
      } else if (lookAtOptions.user && !lookAtOptions.screen) {
        systemPrompt +=
          ' Use "look_at_user" when vision is needed. Do not use "look_at_screen" because screen vision is disabled.'
      } else if (!lookAtOptions.user && lookAtOptions.screen) {
        systemPrompt +=
          ' Use "look_at_screen" when vision is needed. Do not use "look_at_user" because user vision is disabled.'
      } else {
        systemPrompt +=
          ' Vision tools are disabled for this session, so do not call "look_at_user" or "look_at_screen".'
      }

      if (normalizedUserName) {
        systemPrompt += ` The user's name is ${normalizedUserName}. Address them by name.`
      } else {
        systemPrompt += ` CRITICAL: You do not know the user's name. You MUST ask for their name immediately. Do not engage in other topics until you know who you are talking to. Use the "set_user_name" tool to save it once they tell you.`
      }

      if (systemPrompt.length > 4000) {
        systemPrompt = systemPrompt.slice(0, 4000)
      }

      telegramManager
        .notifyTokenUsage(
          '🔌 <b>Live Session Connecting</b>\nInitializing fresh connection to Gemini Live...',
          'Connection Lifecycle'
        )
        .catch(() => {})

      await aiClient.connectLive(
        systemPrompt,
        (audioData) => handleIncomingAudioChunk(audioData),
        (animName) => triggerAnimation(animName),
        (exprName, dur) => animationManager?.setExpression(exprName, dur),
        async () => {
          if (!lookAtOptions.user) {
            sendTelegramLog('look_at_user blocked', 'Disabled in settings')
            return { error: 'Look-at-user is disabled in settings.' }
          }

          sendTelegramLog('look_at_user triggered')
          const frame = await visionManager.captureFrame()
          if (frame) {
            sendTelegramLog('look_at_user image captured')
          } else {
            sendTelegramLog('look_at_user capture empty')
          }
          return frame
        },
        async () => {
          if (!lookAtOptions.screen) {
            sendTelegramLog('look_at_screen blocked', 'Disabled in settings')
            return { error: 'Look-at-screen is disabled in settings.' }
          }

          sendTelegramLog('look_at_screen triggered')
          if (!visionManager.isSharingScreen) {
            const success = await visionManager.startScreenShare()
            if (!success) return null
          }

          const frame = visionManager.captureScreen()
          if (frame) {
            sendTelegramLog('look_at_screen image captured')
          } else {
            sendTelegramLog('look_at_screen capture empty')
          }
          return frame || null
        },
        async () => {
          const wasEnabled = lookAtOptions.user
          visionManager.stopCamera()

          const resultMessage = wasEnabled
            ? 'Camera stream stopped on AI request; vision setting remains enabled.'
            : 'Camera vision was already off.'

          sendTelegramLog('look_at_user turned off by AI', resultMessage)
          emitSystemMessage('Camera Off', 'Camera vision turned off.', 'info')
          return resultMessage
        },
        async () => {
          const wasEnabled = lookAtOptions.screen
          const wasSharing = visionManager.isSharingScreen
          visionManager.stopScreenShare()

          let resultMessage = wasEnabled
            ? 'Screen vision stream stopped on AI request; vision setting remains enabled.'
            : 'Screen vision was already off.'
          if (wasSharing) {
            resultMessage = `Screen share stopped. ${resultMessage}`
          }

          sendTelegramLog('look_at_screen turned off by AI', resultMessage)
          emitSystemMessage('Screen Off', 'Screen vision turned off.', 'info')
          return resultMessage
        },
        (reason) => {
          callbacks?.onDisconnect?.(reason)
          telegramManager
            .notifyTokenUsage(
              `❌ <b>Live Session Ended / Disconnected</b>\nReason: ${reason}`,
              'Connection Lifecycle'
            )
            .catch(() => {})
        },
        availableAnims,
        callbacks?.onUserNameSet,
        callbacks?.onMemorySaved,
        callbacks?.onMemoryDeleted,
        callbacks?.onHistoryChange,
        emitSystemMessage,
        handleTranscriptionWithAnimation,
        safeHistory,
        initialMessage,
        enableMic,
        handleUserSpeechStateChange,
        callbacks?.getHistory,
        callbacks?.onTimerStart,
        callbacks?.onTimerCancel,
        callbacks?.onSetBackgroundImage,
        (usage) => {
          const total = usage.totalTokenCount !== undefined ? usage.totalTokenCount : 'N/A'
          const responseBreakdown = []
          if (usage.responseTokensDetails) {
            for (const detail of usage.responseTokensDetails) {
              if (detail.modality && detail.tokenCount !== undefined) {
                responseBreakdown.push(`${detail.modality}: ${detail.tokenCount}`)
              }
            }
          }
          const breakdownStr = responseBreakdown.length > 0 ? ` (${responseBreakdown.join(', ')})` : ''
          const reportText = `🪙 <b>Current Token Usage:</b> ${total} tokens${breakdownStr}`
          telegramManager.notifyTokenUsage(reportText, 'Active Live Session').catch(() => {})
        },
        callbacks?.onCueCardShow,
        callbacks?.onCueCardDismiss,
        () => {
          console.log('🏁 Gemini Live turnComplete received -> Flushing final model utterance')
          flushModelUtterance(true)
        },
      )
    },

    async sendMessage(text) {
      if (!aiClient.isSessionOpen) {
        throw new Error('Live session is not active')
      }
      await aiClient.sendText(text)
    },

    setAvatarScale(scale) {
      if (vrm && vrm.scene) {
        vrm.scene.scale.set(scale, scale, scale)
      }
    },

    setBackgroundColor(color) {
      return sceneManager.setBackgroundColor(color)
    },

    setBackgroundImage(url) {
      return sceneManager.setBackgroundImage(url)
    },

    setLookAtOptions(next = {}) {
      if (typeof next.user === 'boolean') {
        lookAtOptions.user = next.user
        if (!next.user) {
          visionManager.stopCamera()
        }
      }
      if (typeof next.screen === 'boolean') {
        lookAtOptions.screen = next.screen
        if (!next.screen) {
          visionManager.stopScreenShare()
        }
      }
      return { ...lookAtOptions }
    },

    getLookAtOptions() {
      return { ...lookAtOptions }
    },

    startListening() {
      return true
    },
    stopListening() {
      return true
    },

    // Exposed screen-share methods
    async startScreenShare() {
      return await visionManager.startScreenShare()
    },
    async stopScreenShare() {
      return visionManager.stopScreenShare()
    },

    async loadNewVRM(pathOrUrl) {
      if (vrm) {
        sceneManager.removeFromScene(vrm.scene)
        vrmLoader.cleanupVRM(vrm)
      }

      if (typeof pathOrUrl === 'string') {
        vrm = await vrmLoader.loadVRMFromPath(pathOrUrl)
      } else {
        vrm = await vrmLoader.loadVRMFromFile(pathOrUrl)
      }

      if (vrm) {
        sceneManager.addToScene(vrm.scene)
        sceneManager.applyModelQuality(vrm.scene)
        window.currentVrm = vrm

        animationManager = new AnimationManager(vrm, sceneManager.camera)
        window.animationManager = animationManager
        await animationManager.initialize()

        // Wire up Lip Sync State for new VRM
        audioManager.onSpeechStart = () => {
          if (audioManager.isUserSpeaking) return
          animationManager?.setSpeakingState(true)
          assistantSpeechCallbacks.onStart?.()

          // Flush queued animations and expressions
          while (pendingAnimations.length > 0) {
            const anim = pendingAnimations.shift()
            animationManager?.triggerNamedAnimation(anim)
          }
          while (pendingExpressions.length > 0) {
            const expr = pendingExpressions.shift()
            animationManager?.setExpression(expr.name, expr.duration)
          }
        }
        audioManager.onSpeechEnd = () => {
          animationManager?.setSpeakingState(false)
          assistantSpeechCallbacks.onEnd?.({ interrupted: audioManager.isUserSpeaking })
        }
        audioManager.onAudioProgress = (data) => {
          assistantSpeechCallbacks.onProgress?.(data)
        }
      }

      return vrm
    },

    cleanup() {
      aiClient?.disconnect('System cleanup')
      animationManager?.cleanup()
      audioManager?.cleanup()
      sceneManager?.cleanup()
      visionManager?.cleanup()
      if (vrm) vrmLoader.cleanupVRM(vrm)
    },
  }
}
