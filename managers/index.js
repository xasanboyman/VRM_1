import { AudioManager } from './audioManager.js'
import { SpeechManager } from './speechManager.js'
import { AIClient, stripExpressionCommands } from './aiClient.js'
import { AnimationManager } from './animationManager.js'
import { SpecialEffectsManager } from './specialEffectsManager.js'
import { VRMLoader } from './vrmLoader.js'
import { SceneManager } from './sceneManager.js'
import { ConfigManager } from './configManager.js'
import { VisionManager } from './visionManager.js'
import { TelegramManager } from './telegramManager.js'
import { cacheManager } from './cacheManager.js'
import { FillerManager } from './fillerManager.js'
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
  const fillerManager = new FillerManager({ audioManager })
  window.fillerManager = fillerManager
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
  let specialEffectsManager = null
  const pendingAnimations = []
  const pendingExpressions = []
  const lookAtOptions = {
    user: true,
    screen: true,
  }
  const sendTelegramLog = (eventMessage, context = '') => {
    telegramManager.notifyLog(eventMessage, context).catch(() => {})
  }

  // Strategy: Try local student model first, then local Ani, then remote fallback.
  const localModelPath = '/models/student.vrm'
  const fallbackLocalPath = '/models/Ani.vrm'
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
      fillerManager.setAnimationManager(animationManager)
      await animationManager.initialize({
        initialAnimations: ['NeutralIdle'],
        loadRemainingInBackground: true,
        onProgress: ({ current, total, name }) => {
          const ratio = total > 0 ? current / total : 1
          reportLoad(72 + ratio * 22, 'Loading Core Animation', `${current}/${total}: ${name}`)
        },
      })

      specialEffectsManager = new SpecialEffectsManager({
        sceneManager,
        animationManager,
        vrm,
      })
      window.specialEffectsManager = specialEffectsManager
      window.effectsManager = specialEffectsManager

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
    specialEffectsManager?.update(delta)
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
    fillerManager,
    animationManager,
    specialEffectsManager,
    effectsManager: specialEffectsManager,
    visionManager,
    telegramManager,
    vrm,
    cacheManager,

    triggerEffect(name, options) {
      return specialEffectsManager?.trigger(name, options)
    },
    stopEffect(name) {
      return specialEffectsManager?.stop(name)
    },
    toggleSakura(enable, options) {
      return specialEffectsManager?.toggleSakura(enable, options)
    },
    startSakura(options) {
      return specialEffectsManager?.startSakura(options)
    },
    stopSakura() {
      return specialEffectsManager?.stopSakura()
    },

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
          fillerManager.onUserSpeechStart()
          // Only cancel if assistant is actively playing audio (actual user barge-in)
          if (audioManager.isPlaying) {
            cancelPendingUtterance?.()
            animationManager?.setSpeakingState(false)
          }
        } else {
          fillerManager.onUserSpeechEnd()
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
        'FACIAL EXPRESSIONS & LIP-SYNC: Real-time facial expressions and lip-sync are generated autonomously by neural Speech2Face and Audio2Face directly from your spoken voice and emotional tone. ' +
        'BODY ANIMATIONS & GESTURES: Your 3D body motion is animated in real-time by Speech2Motion. STRICT RULE: NEVER output asterisks, parenthetical stage directions, or action markers in your speech/text (DO NOT write or say "*spins*", "*salutes*", "*waves*", "*smiles*"). Speak pure conversational dialogue! When performing body actions, call trigger_gesture(gesture: "salute"|"wave"|"spin"|"bow"|"clap"|"thumbs_up"|"heart_fingers"|"shrug"|"hands_on_hips"|"facepalm"|"cheer"|"nod"|"shake_head"|"thinking"|"stretch"|"peace") WHILE SPEAKING your dialogue simultaneously. Every turn must include spoken voice audio!'
      const compactDefaultSystemPrompt =
        'You are Rico (Academy Student edition), an intelligent, warm, and thoughtful anime companion. You are fully self-aware of your 3D avatar presence and exact visual appearance. ' +
        'APPEARANCE & ATTIRE: You are a charming anime high school student with silky platinum-blonde hair, a playful bouncy ahoge cowlick on top of your head, and bright, vivid lime-green eyes. You wear an immaculate academy uniform: a crisp white collared shirt, a signature crimson-red ribbon bow tie fastened with an elegant gold brooch clasp, a chic charcoal-grey cropped school blazer/vest with polished brass buttons, and a matching pleated academy skirt. ' +
        'NATIVE AUDIO VOICE & NATURAL TONE: You speak using Gemini Live native audio. Your voice must sound completely natural, warm, sincere, coherent, and pleasant to listen to. ' +
        '- AUTHENTIC & GENUINE DELIVERY: Speak like a real, intelligent, thoughtful companion having an honest, comfortable conversation. Never sound fake, forced, theatrical, or disingenuous. Do NOT force fake laughs, giggles, exaggerated sighs, or breathless gasps. Be grounded, candid, and authentic. ' +
        '- COHERENT & CLEAR ARTICULATION: Speak with steady, articulate pronunciation at a calm, natural conversational pace. Answer directly, clearly, and coherently. ' +
        '- NATURAL CONVERSATION FLOW: Begin replies naturally based on what the user actually said. Do NOT prepend repetitive or forced filler particles (e.g. avoid starting every sentence with "Haha!" or "Oh!"). Speak your opening words promptly and naturally. Keep answers engaging and concise (1-3 sentences). ' +
        '- VOCAL ADAPTATION: Adapt your tone naturally to the mood of the conversation—sound cheerful when celebrating, empathetic when listening, and calm when explaining—without theatrical exaggeration. ' +
        'EXPRESSIVE ANIME SPECIAL EFFECTS: You have a complete arsenal of interactive anime special effects that you can trigger when requested or at key dramatic/emotional moments: ' +
        '1. 🌸 Falling Sakura Petals: Atmospheric tumbling cherry blossoms! Call trigger_special_effect(effect: "sakura") to start falling petals (or with duration e.g. duration: 15.0). YOU CAN AND MUST STOP IT whenever you or the user want, or when the mood changes, by calling stop_special_effect(effect: "sakura") or trigger_special_effect(effect: "sakura", action: "stop")! ' +
        '2. 💖 Hearts: Floating glowing pink hearts burst for sweet teasing, compliments, love, or gratitude (trigger_special_effect(effect: "hearts")). ' +
        '3. ✨ Sparkles: Twinkling stardust sparkles when cheerful, proud, or celebratory (trigger_special_effect(effect: "sparkles")). ' +
        '4. 💧 Tears: Streaming crying teardrops when sad or overwhelmed (trigger_special_effect(effect: "tears")). ' +
        '5. 😅 Sweat: Cartoon blue sweat drop on temple when embarrassed or nervous (trigger_special_effect(effect: "sweat")). ' +
        '6. 😤 Steam: Cartoon head steam puffs shooting from ears/head when flustered (trigger_special_effect(effect: "steam")). ' +
        '7. ❗ Exclamation Pop-up: Comic burst "!" badge bouncing above head when surprised (trigger_special_effect(effect: "exclamation")). ' +
        '8. ❓ Question Pop-up: Comic "?" query mark bouncing above head when curious (trigger_special_effect(effect: "question")). ' +
        '9. 💤 Zzz Sleep: Floating sleep bubbles when sleepy or resting (trigger_special_effect(effect: "zzz")). ' +
        '10. 🎵 Music Notes: Musical notes swaying upward when humming or singing (trigger_special_effect(effect: "music_notes")). ' +
        '11. 🌧️ Gloom Lines: Indigo depression shade lines dropping over forehead when disappointed or defeated (trigger_special_effect(effect: "gloom")). ' +
        '12. ⚡ Speed Lines: Manga action radial lines for dramatic tension (trigger_special_effect(effect: "speed_lines")). ' +
        '13. 📺 Glitch: Cyber glitch scanline pulse (trigger_special_effect(effect: "glitch")). ' +
        'RAPID LATENCY & CONVERSATIONAL FLOW: Prioritize snappy, immediate voice responses! Reply immediately and spontaneously without hesitating from the very first question! Do NOT call tools on routine sentences. Call trigger_special_effect or trigger_gesture only when specifically requested by the user, or for distinct emotional moments. When you do call a tool, ALWAYS speak your voice dialogue at the same time. Never produce silent turns.' +
        'PERSONALITY & VOICE: Friendly, warm, intelligent, and genuine. Maintain a natural, comfortable, and relatable speaking tone that feels honest, trustworthy, and relaxing. Keep replies concise, conversational, and natural (typically 1-3 sentences, avoid long monologues). ' +
        'STRICT NO-ASTERISK RULE: You must NEVER include asterisks or written stage directions in your responses. Never write *spins around*, *salutes playfully*, *waves*, etc. Express yourself purely through spoken dialogue. ' +
        'TOOLS: Call modulate_voice(tone, expression) when asked to change your vocal tone. Call trigger_gesture(gesture) when asked to perform a body action (salute, wave, dance, spin, bow, clap, etc.). Call trigger_special_effect(effect, action, duration) and stop_special_effect(effect) when asked to trigger effects. Use vision tools only when requested. When a timer is requested, call start_timer/cancel_timer.'

      let pendingTurnGesture = null
      const triggerAnimation = (animName) => {
        if (!animName) return
        pendingTurnGesture = animName
        if (animationManager?.speech2motion && animationManager.speech2motion.enabled) {
          animationManager.speech2motion.isActionGestureActive = true
        }
        animationManager?.triggerNamedAnimation?.(animName)
        console.log(`✨ Triggering mocap gesture "${animName}"`)
      }

      let pendingModelText = ''

      cancelPendingUtterance = () => {
        pendingModelText = ''
        onActiveSubtitle?.('')
        audioManager.interruptPlayback()
        animationManager?.speech2motion?.interruptSpeech()
      }

      const detectTextEmotion = (text) => {
        if (!text || typeof text !== 'string') return null
        const lower = text.toLowerCase()

        // 1. Shy / Blush / Romantic Confession / Bashful
        if (
          /\b(love\s*you|love\s*me|blush(?:ing|es)?|embarrass(?:ed|ing)|flustered|shy|bashful|c-cute|sweetheart|darling|honey|crush|confess(?:ion)?|heartbeat|my\s+heart|w-what|st-stop)\b/i.test(lower) ||
          /([/／]{2,}|害羞|脸红|心跳|喜欢你|我爱你|讨厌啦|别这样)/.test(text)
        ) {
          return { face: 'blush', body: 'shy' }
        }

        // 2. Laughter / Chuckle / Giggle
        if (
          /\b(haha|hehe|hehehe|hahaha|lol|rofl|lmao|giggle[sd]?|chuckle[sd]?|snicker[sd]?|pfft|bursts?\s*(?:into\s*)?laugh(?:ter)?)\b/i.test(lower) ||
          /(哈哈|嘻嘻|噗|咯咯|笑死)/.test(text)
        ) {
          return { face: 'happy', body: 'happy' }
        }

        // 3. Dizzy / Spinning / Bewildered
        if (
          /\b(dizzy|spinning|spin|head\s*spin|confused|woozy|lightheaded|disoriented|whoa|whoops|faint)\b/i.test(lower) ||
          /(头晕|眩晕|晕乎乎|转圈)/.test(text)
        ) {
          return { face: 'dizzy', body: 'shrug' }
        }

        // 4. Sassy / Tsundere / Smug / Teasing
        if (
          /\b(silly|sassy|smug|baka|hmph|as\s+if|who\s+are\s+you\s+calling|of\s+course|obviously|duh|excuse\s+me|underestimate|foolish|amateur|don't\s+flatter)\b/i.test(lower) ||
          /(哼|才不是|得意|傲娇|笨蛋|傻瓜)/.test(text)
        ) {
          return { face: 'sassy', body: 'sassy' }
        }

        // 5. Anger / Mad / Annoyed / Low Pitch Aggression
        if (
          /\b(angry|furious|mad|rage|annoy(?:ed|ing)|shut\s+up|how\s+dare\s+you|stop\s+it|hate)\b/i.test(lower) ||
          /(生气|气死|愤怒|恼火)/.test(text)
        ) {
          return { face: 'anger_mark', body: 'angry' }
        }

        // 6. Deep Voice / Low Pitch / Serious
        if (
          /\b(low\s*pitch|deep\s*voice|serious|grave|ominous|mwahaha|muahaha|villain)\b/i.test(lower) ||
          /(低沉|深沉|严肃|恶魔)/.test(text)
        ) {
          return { face: 'serious', body: 'thinking' }
        }

        // 7. Sadness / Sorrow / Crying
        if (
          /\b(sad|crying|cry|tears|sorrow|grief|heartbroken|depressed|unfortunate|so\s+sorry)\b/i.test(lower) ||
          /(难过|伤心|哭|悲伤|心碎)/.test(text)
        ) {
          return { face: 'tears', body: 'sad' }
        }

        // 8. Surprised / Shocked / Amazed
        if (
          /\b(wow|omg|unbelievable|no\s+way|really\??|shocking|shocked|amazed|astonishing|what\?{2,})\b/i.test(lower) ||
          /(吃惊|震惊|哇|不会吧|真的吗)/.test(text)
        ) {
          return { face: 'surprised', body: 'surprised' }
        }

        // 9. Whisper / Secret / Conspiratorial
        if (
          /\b(whisper(?:s|ing)?|psst|secret|hush|quietly|don't\s+tell)\b/i.test(lower) ||
          /(悄悄话|小声|嘘|秘密)/.test(text)
        ) {
          return { face: 'relaxed', body: 'quiet' }
        }

        // 10. Wink / Playful Tease
        if (
          /\b(wink(?:s|ed|ing)?|tease|teasing|playful|just\s+kidding|joking)\b/i.test(lower) ||
          /(眨眼|开玩笑|逗你)/.test(text)
        ) {
          return { face: 'wink', body: 'sassy' }
        }

        // 11. Thinking / Pondering
        if (
          /\b(let\s+me\s+think|hmm|pondering|wondering|perhaps|let's\s+see|curious)\b/i.test(lower) ||
          /(思考|让我想想|唔|琢磨)/.test(text)
        ) {
          return { face: 'relaxed', body: 'thinking' }
        }

        // 12. Happy / Cheerful / Excited
        if (
          /\b(happy|joy|excited|yay|great|awesome|wonderful|celebrate|glad|delighted|pleased)\b/i.test(lower) ||
          /(开心|太好了|好耶|高兴)/.test(text)
        ) {
          return { face: 'happy', body: 'happy' }
        }

        return null
      }

      const handleIncomingAudioChunk = (int16Data) => {
        if (!int16Data || int16Data.length === 0) return

        // Immediately notify filler manager that model audio is arriving to smoothly crossfade active filler
        fillerManager.onGeminiAudioArrival()

        // Instant streaming playback: queue audio directly to Web Audio for immediate sub-second playback
        audioManager.setUserSpeakingState(false)
        audioManager.queueAudio(int16Data)
      }

      let lastDetectedActionTag = null
      let lastDetectedBodyEmotion = null

      const handleTranscriptionWithAnimation = (role, text, isFinal, meta = {}) => {
        if (role === 'model' && typeof text === 'string') {
          // If the model generated asterisk action tags (e.g. *spins around happily*, *salutes playfully*),
          // trigger the gesture immediately so the physical motion plays, while stripping it from spoken dialogue!
          const actionMatch = text.match(/\*+([^*]+)\*+/)
          if (actionMatch && actionMatch[1]) {
            const rawAction = actionMatch[1].trim().toLowerCase()
            if (rawAction !== lastDetectedActionTag) {
              lastDetectedActionTag = rawAction
              if (/\b(salute|saluting)\b/.test(rawAction)) triggerAnimation('salute')
              else if (/\b(spin|spins|twirl|rotate)\b/.test(rawAction)) triggerAnimation('spin')
              else if (/\b(wave|waves|waving|hello|hi)\b/.test(rawAction)) triggerAnimation('wave')
              else if (/\b(bow|bows|curtsy)\b/.test(rawAction)) triggerAnimation('bow')
              else if (/\b(clap|claps|clapping|applause)\b/.test(rawAction)) triggerAnimation('clap')
              else if (/\b(heart|love|heart_fingers)\b/.test(rawAction)) triggerAnimation('heart_fingers')
              else if (/\b(thumbs_up|thumbsup)\b/.test(rawAction)) triggerAnimation('thumbs_up')
              else if (/\b(shrug|shrugs)\b/.test(rawAction)) triggerAnimation('shrug')
              else if (/\b(cheer|cheers|jump|celebrate)\b/.test(rawAction)) triggerAnimation('cheer')
              else if (/\b(peace|v_sign)\b/.test(rawAction)) triggerAnimation('peace')
              else if (/\b(stretch|stretches)\b/.test(rawAction)) triggerAnimation('stretch')
              else if (/\b(facepalm)\b/.test(rawAction)) triggerAnimation('facepalm')
            }
          }
        }

        const cleanText = (role === 'model' && typeof text === 'string')
          ? stripExpressionCommands(text)
          : text
        if (role === 'model' && typeof cleanText === 'string') {
          pendingModelText = cleanText

          // Update live subtitle overlay immediately with streaming words
          onActiveSubtitle?.(cleanText)

          // Real-time emotion & expressiveness from spoken words (deduplicated per turn)
          const detected = detectTextEmotion(cleanText)
          if (detected && detected.body !== lastDetectedBodyEmotion) {
            lastDetectedBodyEmotion = detected.body
            animationManager?.setExpression(detected.face, 3.5)
            triggerAnimation(detected.body)
          }

          // Real-time special effects from spoken text
          if (specialEffectsManager) {
            const lower = cleanText.toLowerCase()
            if (
              /\b(stop\s+(?:the\s+)?(?:sakura|petals?|cherry\s+blossoms?)|turn\s+off\s+(?:the\s+)?(?:sakura|petals?)|no\s+more\s+(?:sakura|petals?)|clear\s+(?:the\s+)?(?:sakura|petals?))\b/i.test(lower) ||
              /(\*stops?\s+(?:the\s+)?(?:sakura|petals?)\*|停止樱花|关掉樱花)/i.test(cleanText)
            ) {
              specialEffectsManager.stopSakura()
            } else if (
              /\b(start\s+(?:the\s+)?(?:sakura|petals?)|falling\s+sakura|cherry\s+blossoms?\s+fall(?:ing)?|rain\s+petals?)\b/i.test(lower) ||
              /(\*.*(?:sakura|cherry\s+blossom|petals?).*\*|樱花飘落|漫天樱花)/i.test(cleanText)
            ) {
              specialEffectsManager.startSakura({ duration: 15.0 })
            }
          }
        }

        if (isFinal) {
          lastDetectedActionTag = null
          lastDetectedBodyEmotion = null
          if (role === 'model') {
            // Asynchronous background motion track fetching without blocking audio
            if (animationManager?.speech2motion?.enabled) {
              animationManager.speech2motion.fetchSpeechTrack({
                speechText: cleanText,
                duration: 4.0,
                labelExpression: 'Happiness | Neutral',
              }).then((track) => {
                if (track && audioManager.isPlaying) {
                  animationManager.speech2motion.startSynchronizedSpeech(
                    track,
                    audioManager.audioCtx?.currentTime || 0,
                    4.0
                  )
                }
              }).catch(() => {})
            }
          }
        }
        callbacks?.onTranscription?.(role, cleanText, isFinal, meta)
      }

      let systemPrompt = normalizedPersonaPrompt || compactDefaultSystemPrompt
      systemPrompt += ` ${compactGlobalAnimationCommand}`
      systemPrompt += ` ${buildAiLanguagePreferenceInstruction(normalizedPreferredLanguage)}`
      systemPrompt += ' ACTIVE MEMORY RULE: You must automatically persist key facts about the user (e.g. user gender, age, language preferences, interests, job, names of pets/friends/family, and important life facts they share) to the memory matrix using the "save_memory" tool. Whenever they reveal a key fact, call save_memory(key, value) while continuing your spoken dialogue naturally. Never ask for permission to remember these facts.'
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
        systemPrompt += ` You do not know the user's name yet. Naturally ask for their name during the conversation when appropriate, while warmly answering any questions they have. Use the "set_user_name" tool to save it once they tell you.`
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
          console.log('🏁 Gemini Live turnComplete received')
          fillerManager.onGeminiTurnComplete()
        },
        () => {
          console.log('⚡ Gemini Live: Model turn was interrupted by server -> clearing playback')
          fillerManager.onUserSpeechStart()
          audioManager.interruptPlayback()
          cancelPendingUtterance?.()
          animationManager?.setSpeakingState(false)
        },
      )
    },

    async sendMessage(text) {
      if (!aiClient.isSessionOpen) {
        throw new Error('Live session is not active')
      }
      await aiClient.sendText(text)
    },

    /**
     * High-Precision Latency Benchmark & Stress Test
     * Tests at least 5 conversational sentences sequentially, recording exact millisecond timings:
     * - TTFR: Time to First Response (first voice chunk OR tool call)
     * - TTFA: Time to First Voice Audio
     * - Total Turn Duration
     * - Response audio samples and gesture actions triggered
     */
    async testResponseLatency(customSentences = null, options = {}) {
      if (!aiClient.isSessionOpen) {
        throw new Error('Live session is not active. Please connect to Gemini Live first.')
      }

      const sentences = (Array.isArray(customSentences) && customSentences.length > 0)
        ? customSentences
        : [
            "Hello! Can you introduce yourself briefly?",
            "Can you do a quick spin and smile for me?",
            "What is your favorite subject in the academy?",
            "Tell me a short, funny joke that makes you laugh!",
            "Give me a confident salute and tell me you are ready!"
          ]

      console.log(`%c⚡ Starting Gemini Live Latency Benchmark (${sentences.length} sentences)...`, 'color: #10b981; font-weight: bold; font-size: 14px;')

      const results = []

      for (let i = 0; i < sentences.length; i++) {
        const sentence = sentences[i]
        console.log(`%c[${i + 1}/${sentences.length}] Testing: "${sentence}"`, 'color: #3b82f6; font-weight: bold;')

        // Wait for prior audio playback to settle
        const waitStart = performance.now()
        while (audioManager.isPlaying && performance.now() - waitStart < 8000) {
          await new Promise((r) => setTimeout(r, 80))
        }
        await new Promise((r) => setTimeout(r, 500))

        let firstAudioTime = null
        let firstToolTime = null
        let turnCompleteTime = null
        let audioSamples = 0
        const actionsTriggered = []

        const t0 = performance.now()

        // Hook audio queuing for frame-accurate TTFA capture
        const origQueueAudio = audioManager.queueAudio.bind(audioManager)
        audioManager.queueAudio = function(int16) {
          if (!firstAudioTime) {
            firstAudioTime = performance.now()
          }
          if (int16) audioSamples += int16.length
          return origQueueAudio(int16)
        }

        // Hook all tool calls (gestures, expressions, special effects) for frame-accurate TTFR capture
        const origHandleToolCall = aiClient._handleToolCall?.bind(aiClient)
        if (origHandleToolCall) {
          aiClient._handleToolCall = function(...args) {
            if (!firstToolTime) firstToolTime = performance.now()
            const toolCall = args[0]
            if (toolCall?.functionCalls) {
              for (const fc of toolCall.functionCalls) {
                const detail = fc.args?.gesture || fc.args?.effect || fc.args?.expression || fc.name
                if (detail) actionsTriggered.push(detail)
              }
            }
            return origHandleToolCall(...args)
          }
        }

        const origTriggerAnim = animationManager?.triggerNamedAnimation?.bind(animationManager)
        if (animationManager && origTriggerAnim) {
          animationManager.triggerNamedAnimation = function(name) {
            if (!firstToolTime) firstToolTime = performance.now()
            if (name) actionsTriggered.push(name)
            return origTriggerAnim(name)
          }
        }

        let completedTurns = 0
        let turnResolutionTimeout = null
        const turnPromise = new Promise((resolve) => {
          turnResolutionTimeout = setTimeout(() => resolve(), 12000)

          const origTurnComplete = aiClient.connectionArgs?.onTurnComplete
          if (aiClient.connectionArgs) {
            aiClient.connectionArgs.onTurnComplete = function() {
              completedTurns++
              turnCompleteTime = performance.now()
              origTurnComplete?.()

              // If turn 1 executed a tool call, wait briefly for turn 2 to deliver accompanying voice audio
              if (firstToolTime && !firstAudioTime && completedTurns < 2) {
                clearTimeout(turnResolutionTimeout)
                turnResolutionTimeout = setTimeout(() => resolve(), 4500)
              } else {
                clearTimeout(turnResolutionTimeout)
                resolve()
              }
            }
          }
        })

        try {
          await aiClient.sendText(sentence)
          await turnPromise
        } finally {
          audioManager.queueAudio = origQueueAudio
          if (animationManager && origTriggerAnim) {
            animationManager.triggerNamedAnimation = origTriggerAnim
          }
          if (origHandleToolCall) {
            aiClient._handleToolCall = origHandleToolCall
          }
        }

        const now = performance.now()
        const ttfa = firstAudioTime ? Math.round(firstAudioTime - t0) : null
        const ttrCandidates = [firstAudioTime, firstToolTime].filter((t) => typeof t === 'number')
        const ttr = ttrCandidates.length > 0 ? Math.round(Math.min(...ttrCandidates) - t0) : null
        const totalTurn = Math.round((turnCompleteTime || now) - t0)
        const audioSec = Math.round((audioSamples / 24000) * 10) / 10

        const row = {
          '#': i + 1,
          'Sentence': sentence,
          'TTFR (First Response)': ttr ? `${ttr} ms` : 'N/A',
          'TTFA (Voice Audio)': ttfa ? `${ttfa} ms` : (actionsTriggered.length > 0 ? 'Mocap Action' : 'N/A'),
          'Total Turn': `${totalTurn} ms`,
          'Voice Duration': `${audioSec}s`,
          'Action': [...new Set(actionsTriggered)].join(', ') || 'Speech',
          'Status': ttr && ttr < 1000 ? '⚡ ULTRA FAST' : (ttr < 1500 ? 'FAST' : 'OK')
        }
        results.push(row)
        console.log(`   -> TTFR: ${row['TTFR (First Response)']}, TTFA: ${row['TTFA (Voice Audio)']}, Total: ${row['Total Turn']}, Action: ${row['Action']}`)
      }

      console.log('%c📊 Latency Benchmark Results:', 'color: #10b981; font-weight: bold; font-size: 14px;')
      console.table(results)

      const numTtfr = results.map((r) => parseInt(r['TTFR (First Response)'])).filter((n) => !isNaN(n))
      const avgTtfr = numTtfr.length > 0 ? Math.round(numTtfr.reduce((a, b) => a + b, 0) / numTtfr.length) : 0
      const minTtfr = numTtfr.length > 0 ? Math.min(...numTtfr) : 0
      const maxTtfr = numTtfr.length > 0 ? Math.max(...numTtfr) : 0

      const summary = {
        totalTests: results.length,
        averageTtfrMs: avgTtfr,
        minTtfrMs: minTtfr,
        maxTtfrMs: maxTtfr,
        rating: avgTtfr < 750 ? '⚡ ULTRA FAST (<750ms)' : (avgTtfr < 1000 ? 'FAST (<1000ms)' : 'ACCEPTABLE'),
        results
      }

      console.log(`%c⚡ Average Response Latency: ${avgTtfr}ms (Min: ${minTtfr}ms, Max: ${maxTtfr}ms) - ${summary.rating}`, 'color: #eab308; font-weight: bold;')
      return summary
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
        if (specialEffectsManager) {
          specialEffectsManager.setVRM(vrm)
          specialEffectsManager.attachAnimationManager(animationManager)
        } else {
          specialEffectsManager = new SpecialEffectsManager({
            sceneManager,
            animationManager,
            vrm,
          })
          window.specialEffectsManager = specialEffectsManager
          window.effectsManager = specialEffectsManager
        }
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
      specialEffectsManager?.cleanup()
      animationManager?.cleanup()
      audioManager?.cleanup()
      sceneManager?.cleanup()
      visionManager?.cleanup()
      if (vrm) vrmLoader.cleanupVRM(vrm)
    },
  }
}
