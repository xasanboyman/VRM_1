import * as THREE from 'three'
import { stripExpressionCommands } from './aiClient.js'

/**
 * Extract word timestamps and detected motion keywords from speech text.
 */
export function extractSpeechTimingAndKeywords(speechText, duration, excludeKeywords = new Set()) {
  if (!speechText || typeof speechText !== 'string') {
    return { speechTime: [], motionKeywords: [] }
  }

  // CRITICAL: Sanitize speechText FIRST before computing character offsets!
  // Otherwise leaked expression commands (set_expression(...)) shift word timestamps and keyword positions!
  const text = stripExpressionCommands(speechText).trim()
  const totalChars = text.length
  if (totalChars === 0 || duration <= 0) {
    return { speechTime: [], motionKeywords: [] }
  }

  // Find all words and calculate character offsets
  const wordRegex = /\S+/g
  const words = []
  let match
  while ((match = wordRegex.exec(text)) !== null) {
    words.push({
      word: match[0],
      charIndex: match.index,
      length: match[0].length,
    })
  }

  // Predict speech timestamp for each word start
  const speechTime = []
  for (const w of words) {
    const timeSec = Number(((w.charIndex / totalChars) * duration).toFixed(3))
    speechTime.push([w.charIndex, timeSec])
  }

  // 1. Explicit asterisk stage directions (*salutes*, *waves*, *spins*, etc.) have highest priority
  const motionKeywords = []
  const explicitKeywords = new Set()
  const asteriskRegex = /\*([^*]+)\*/g
  let astMatch
  while ((astMatch = asteriskRegex.exec(text)) !== null) {
    const stage = astMatch[1].toLowerCase()
    let mapped = null
    if (/salute/i.test(stage)) mapped = '敬礼'
    else if (/wave/i.test(stage)) mapped = '打招呼'
    else if (/spin|twirl/i.test(stage)) mapped = '转圈'
    else if (/shrug/i.test(stage)) mapped = '摊手'
    else if (/bow/i.test(stage)) mapped = '鞠躬'
    else if (/clap|applause/i.test(stage)) mapped = '鼓掌'
    else if (/heart/i.test(stage)) mapped = '比心'
    else if (/hip/i.test(stage)) mapped = '叉腰'
    else if (/nod/i.test(stage)) mapped = '点头'
    else if (/shake/i.test(stage)) mapped = '摇头'
    else if (/dance/i.test(stage)) mapped = '元气体操'
    else if (/face\s*palm|facepalm/i.test(stage)) mapped = '捂脸'
    else if (/jump|bounce/i.test(stage)) mapped = '开心蹦跳'
    else if (/think|ponder/i.test(stage)) mapped = '思考'
    else if (/hands?\s*up|raise\s*(?:your\s+|my\s+)?hands?/i.test(stage)) mapped = '举手'

    if (mapped) {
      motionKeywords.push([astMatch.index, mapped])
      explicitKeywords.add(mapped)
    }
  }

  // 2. Keyword pattern matching for expressive human mocap motions and full-body emotions
  const keywordPatterns = [
    { regex: /\b(spin(?:s|ning)?(?:\s*360|\s*degrees?)?|sping(?:\s*360)?|turn\s*around|rotate[sd]?|twirl(?:s|ed|ing)?)\b/gi, keyword: '转圈' },
    { regex: /\b(as\s+you\s+insist|all\s+right\s+all\s+right|if\s+you\s+insist|shrug(?:s|ged|ging)?)\b/gi, keyword: '摊手' },
    { regex: /\b(wave[sd]?|waving|greeting[s]?|hello|bye|goodbye|hi)\b/gi, keyword: '打招呼' },
    { regex: /\b(clap(?:s|ped|ping)?|applause)\b/gi, keyword: '鼓掌' },
    { regex: /\b(heart\s*fingers?|kpop\s*heart|love\s*you|my\s+heart)\b/gi, keyword: '比心' },
    { regex: /\b(hands\s+on\s+hips|sassy|tsundere|smug)\b/gi, keyword: '叉腰' },
    { regex: /\b(nod(?:s|ded|ding)?|agree[sd]?|approval)\b/gi, keyword: '点头' },
    { regex: /\b(shake\s*(?:my\s*)?head|disagree[sd]?|no\s*way)\b/gi, keyword: '摇头' },
    { regex: /\b(bow(?:s|ed|ing)?|thank\s*you)\b/gi, keyword: '鞠躬' },
    { regex: /\b(think(?:s|ing)?|thought|ponder(?:s|ed|ing)?|let\s*me\s*think)\b/gi, keyword: '思考' },
    { regex: /\b(thumbs?\s*up)\b/gi, keyword: '竖起拇指' },
    { regex: /\b(shy|blush(?:es|ed|ing)?|embarrassed|flustered|bashful)\b/gi, keyword: '害羞' },
    { regex: /\b(jump(?:s|ed|ing)?|bounce[sd]?|bouncing)\b/gi, keyword: '开心蹦跳' },
    { regex: /\b(cry(?:ing)?|cries|weep(?:ing)?|tears|sad|grief|sorrow)\b/gi, keyword: '哭泣' },
    { regex: /\b(angry|furious|mad|annoyed|rage)\b/gi, keyword: '生气' },
    { regex: /\b(happy|joy|cheerful|excited|yay)\b/gi, keyword: '开心' },
    { regex: /\b(salute[sd]?|saluting|yes\s*sir|reporting|at\s*attention|at\s*your\s*service)\b/gi, keyword: '敬礼' },
    { regex: /\b(face\s*palm(?:s|ed|ing)?|facepalm)\b/gi, keyword: '捂脸' },
    { regex: /\b(dance[sd]?|dancing|gymnastics)\b/gi, keyword: '元气体操' },
    { regex: /\b(cheer(?:s|ing)?|fight|let's\s+go)\b/gi, keyword: '加油' },
    { regex: /\b(quiet|hush|shh)\b/gi, keyword: '安静手势' },
    { regex: /\b(hands?\s*up|raise\s*(?:your\s+|my\s+)?hands?|put\s+your\s+hands\s+up|surrender)\b/gi, keyword: '举手' },
  ]

  for (const kp of keywordPatterns) {
    if (explicitKeywords.has(kp.keyword)) continue
    if (excludeKeywords && excludeKeywords.has(kp.keyword)) continue
    let m
    while ((m = kp.regex.exec(text)) !== null) {
      motionKeywords.push([m.index, kp.keyword])
      break // Cap at 1 instance per action per chunk to avoid repeating gestures
    }
  }

  motionKeywords.sort((a, b) => a[0] - b[0])

  return { speechTime, motionKeywords }
}

/**
 * Speech2MotionManager
 * 
 * Drives 100% of avatar skeletal animation and dynamic expressions through
 * the official Speech2Motion backend (FastAPI on port 18084).
 * 
 * Features:
 * - Infinite continuous motion generation without pre-recorded .vrma files.
 * - Gentle, calm standing idle with natural breathing and zero wild jumping/flailing.
 * - Full-body mocap emotional postures (shy bashful body twist, sad tear wipe, angry tsundere turn, happy curtsy).
 * - Calibrated natural pacing (no rushed/hyper-speed playback).
 * - Seamless Hermite slerp blending between all clips.
 * - Outward arm clearance abduction so arms and hands naturally clear Ani's flared skirt.
 * - Audio-synced speech gestures matching spoken words and emotion.
 * - Word-level keyframe alignment for action gestures (spin 360, shrug, wave, etc.).
 */
export class Speech2MotionManager {
  constructor(vrm, options = {}) {
    this.vrm = vrm
    const envWsUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SPEECH2MOTION_WS_URL : null
    const envApiUrl = typeof import.meta !== 'undefined' ? import.meta.env?.VITE_SPEECH2MOTION_URL : null

    this.apiEndpoint = options.apiEndpoint || (typeof window !== 'undefined' ? '/api/speech2motion/generate' : (envApiUrl ? `${envApiUrl.replace(/\/+$/, '')}/api/v3/speech2motion/generate` : '/api/speech2motion/generate'))
    this.avatarName = options.avatarName || 'Ani-default'
    this.enabled = options.enabled !== false

    // Persistent WebSocket for streaming motion generation (ultra low latency)
    this.ws = null
    this.wsEndpoint = options.wsEndpoint || envWsUrl || null
    if (!this.wsEndpoint && typeof window !== 'undefined') {
      const loc = window.location
      const protocol = loc.protocol === 'https:' ? 'wss:' : 'ws:'
      this.wsEndpoint = `${protocol}//${loc.host}/speech2motion-ws/api/v3/speech2motion/ws`
    }
    this.wsPendingRequests = new Map()
    this.wsReconnectTimer = null
    this._lastIdleRetryTime = 0

    // Playback state
    this.currentTrack = null
    this.nextTrack = null
    this.playbackTime = 0
    this.isPlaying = false
    this.isFetchingNext = false
    this.isInfiniteActive = false
    this.isSpeechActive = false
    this.speechStartTime = 0
    this.speechAudioDuration = 0
    this._speechSilenceTimer = 0
    this.speechTrackQueue = []
    this.currentEmotion = 'idle'
    this.isActionGestureActive = false
    this.isFetchingActionGesture = false

    // Cross-fade state
    this.transitionFromPose = new Map()
    this.transitionBlendDuration = 0.45 // 450ms smooth continuous crossfade
    this.transitionElapsed = 1.0 // start fully settled

    // Calibrated natural pacing:
    // - Idle: 0.72x for relaxed, gentle breathing (matches VTuber reference)
    // - Gestures/Emotions: 1.0x for real physical mocap accuracy (e.g. 360 degree spin)
    this.playbackSpeed = options.playbackSpeed || 1.0
    this.idlePlaybackSpeed = options.idlePlaybackSpeed || 0.72

    // Audio-Adaptive Timing & Pacing:
    // Dynamically adjust animation playback speed (slow or fast) to naturally match
    // the speech audio duration without artificial looping, repeating, or cut-offs.
    this.adaptiveSpeedEnabled = options.adaptiveSpeedEnabled !== false
    this.minSpeechSpeed = options.minSpeechSpeed || 0.40 // Calmed lower bound for longer speech (mostly slowing)
    this.maxSpeechSpeed = options.maxSpeechSpeed || 1.15 // Gentle upper bound (can faster but not that much)
    this.adaptivePlaybackSpeed = this.playbackSpeed
    this.motionScaledDuration = 0
    this.isDurationMatched = false

    // Natural human arm spacing with posture-dependent clearance for flared gothic skirt
    this._armClearanceQuatL = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.17)
    this._armClearanceQuatR = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.17)

    // Bone cache: jointName -> THREE.Object3D
    this.boneCache = new Map()
    this.animationManager = options.animationManager || null
    this.audioManager = options.audioManager || null
    this.resolvedMorphMap = new Map()
    this.activeAppliedMorphs = new Set()
    this._initBoneCache()

    // Temporary math objects for zero-allocation per-frame interpolation
    this._tempMatrix = new THREE.Matrix4()
    this._tempQuatA = new THREE.Quaternion()
    this._tempQuatB = new THREE.Quaternion()
    this._resultQuat = new THREE.Quaternion()
    this._tempVecA = new THREE.Vector3()
    this._tempVecB = new THREE.Vector3()

    // Natural lifelike idle head & gaze wander state (Hermite S-curve interpolation)
    this._headAdditiveEuler = new THREE.Euler(0, 0, 0, 'YXZ')
    this._headAdditiveQuat = new THREE.Quaternion()
    this._neckAdditiveEuler = new THREE.Euler(0, 0, 0, 'YXZ')
    this._neckAdditiveQuat = new THREE.Quaternion()
    this._gazeTimer = 2.5 // Dwell before first gentle glance
    this._gazeState = 'dwell' // 'dwell' | 'transition'
    this._gazeTransitionElapsed = 0
    this._gazeTransitionDuration = 1.5
    this._gazeCurrentYaw = 0
    this._gazeCurrentPitch = 0
    this._gazeCurrentRoll = 0
    this._gazeStartYaw = 0
    this._gazeStartPitch = 0
    this._gazeStartRoll = 0
    this._gazeTargetYaw = 0
    this._gazeTargetPitch = 0
    this._gazeTargetRoll = 0
    this._lastGlanceMode = 'center'
    this._previousAwayMode = ''
    this._gazeActionWeight = 1.0
    this._currentHeadYaw = 0
    this._currentHeadPitch = 0

    // Dedicated idle state & clean generation
    this.isIdleActive = false
    this.idleTimer = 0
    this.idleBlendWeight = 0.0
    this._isGeneratingFreshIdle = false

    // Natural organic idle neck motion
    this._idleNeckEuler = new THREE.Euler(0, 0, 0, 'YXZ')
    this._idleNeckQuat = new THREE.Quaternion()

    // Non-generic, organic idle hand & finger micro-movements
    this._idleHandEuler = new THREE.Euler(0, 0, 0, 'XYZ')
    this._idleHandQuat = new THREE.Quaternion()
    this._leftHandTimer = 2.0
    this._rightHandTimer = 4.2
    this._leftHandTargetCurl = 0
    this._rightHandTargetCurl = 0
    this._leftHandCurrentCurl = 0
    this._rightHandCurrentCurl = 0
    this._leftWristTargetPitch = 0
    this._rightWristTargetPitch = 0
    this._leftWristCurrentPitch = 0
    this._rightWristCurrentPitch = 0

    // Deduplication & cooldown for action gestures (e.g. 360 spin, waving)
    this.recentActionGestures = new Map()
    this.currentActionKeyword = null

    // Full Emotion to Body Mocap Mapping Dictionary
    this.emotionAliasMap = {
      shy: 'shy',
      blush: 'shy',
      '照れ': 'shy',
      embarrassed: 'shy',
      flustered: 'shy',
      bashful: 'shy',
      sad: 'sad',
      tears: 'sad',
      '涙': 'sad',
      cry: 'sad',
      crying: 'sad',
      grief: 'sad',
      dejected: 'sad',
      melancholy: 'sad',
      '困る': 'sad',
      angry: 'angry',
      anger_mark: 'angry',
      mad: 'angry',
      furious: 'angry',
      annoyed: 'angry',
      irritated: 'angry',
      '怒り': 'angry',
      sassy: 'sassy',
      smug: 'sassy',
      tsundere: 'sassy',
      confident: 'sassy',
      pride: 'sassy',
      smirk: 'sassy',
      happy: 'happy',
      joy: 'happy',
      smile: 'happy',
      ecstatic: 'happy',
      cheerful: 'happy',
      '笑い': 'happy',
      '喜び': 'happy',
      'にこり': 'happy',
      love: 'love',
      heart: 'love',
      affection: 'love',
      surprised: 'surprised',
      shocked: 'surprised',
      amazed: 'surprised',
      'びっくり': 'surprised',
      thinking: 'thinking',
      pondering: 'thinking',
      curious: 'thinking',
      disgust: 'disgust',
      unimpressed: 'disgust',
      unamused: 'disgust',
      neutral: 'idle',
      relaxed: 'idle',
      idle: 'idle',
    }

    // Motion keyword dictionary for interactive gestures
    this.gestureKeywordMap = {
      wave: '打招呼',
      greeting: '打招呼',
      hello: '打招呼',
      hi: '打招呼',
      heart_fingers: '比心',
      love: '比心',
      nod: '点头',
      approval: '点头',
      shake_head: '摇头',
      thinking: '思考',
      curiosity: '若有所思',
      cheering: '加油',
      cheer: '加油',
      joy: '开心',
      hands_on_hips: '叉腰',
      sassy: '叉腰',
      facepalm: '捂脸',
      face_palm: '捂脸',
      bow: '鞠躬',
      bowing: '鞠躬',
      dance: '元气体操',
      dancing: '元气体操',
      shy: '害羞',
      spin: '转圈',
      spin_360: '转圈',
      rotate: '转圈',
      twirl: '转圈',
      shrug: '摊手',
      shrugging: '摊手',
      as_you_insist: '摊手',
      clap: '鼓掌',
      clapping: '鼓掌',
      thumbs_up: '竖起拇指',
      thumbsup: '竖起拇指',
      jump: '开心蹦跳',
      jumping: '开心蹦跳',
      cry: '哭泣',
      crying: '哭泣',
      quiet: '安静手势',
      hush: '安静手势',
      shh: '安静手势',
      salute: '敬礼',
      saluting: '敬礼',
      attention: '敬礼',
      hands_up: '举手',
      raise_hands: '举手',
      blow_kiss: '飞吻',
      blowkiss: '飞吻',
      kiss: '飞吻',
      mwah: '飞吻',
      raise_hand: '举手',
      surrender: '举手',
      peace: '双手比V',
      peace_sign: '双手比V',
      v_sign: '双手比V',
      stretch: '伸懒腰',
      gun: '开枪',
      shoot: '开枪',
    }

    // Direct motion record ID mappings for 100% unadulterated mocap playback
    this.gestureRecordMap = {
      blow_kiss: 886,
      blowkiss: 886,
      kiss: 886,
      mwah: 886,
      '飞吻': 886,
      wave: 887,
      waving: 887,
      hello: 887,
      hi: 887,
      greeting: 887,
      '打招呼': 887,
      thumbs_up: 888,
      thumbsup: 888,
      '竖起拇指': 888,
      salute: 889,
      saluting: 889,
      '敬礼': 889,
      bow: 890,
      bowing: 890,
      '鞠躬': 890,
      heart_fingers: 891,
      love: 891,
      '比心': 891,
      clapping: 892,
      clap: 892,
      '鼓掌': 892,
      thinking: 893,
      '思考': 893,
      facepalm: 894,
      face_palm: 894,
      '捂脸': 894,
      cheering: 895,
      cheer: 895,
      yay: 895,
      hurray: 895,
      '欢呼': 895,
      '加油': 895,
      nod: 896,
      nodding: 896,
      yes: 896,
      '点头': 896,
      shake_head: 897,
      shakehead: 897,
      no: 897,
      '摇头': 897,
      shrug: 898,
      shrugging: 898,
      '耸肩': 898,
      '摊手': 898,
      point: 899,
      pointing: 899,
      '指': 899,
      '指向': 899,
    }
  }

  _smoothstep(t) {
    const c = Math.max(0, Math.min(1, t))
    return c * c * (3 - 2 * c)
  }

  setVRM(vrm) {
    this.vrm = vrm
    this.boneCache.clear()
    this.resolvedMorphMap.clear()
    this._initBoneCache()
  }

  _initBoneCache() {
    if (!this.vrm || !this.vrm.scene) return
    this.vrm.scene.traverse((obj) => {
      if (obj.isBone || obj.isObject3D) {
        if (obj.name) {
          this.boneCache.set(obj.name, obj)
        }
      }
    })
  }

  getBone(name) {
    if (!name || name === 'Root') return null
    if (this.boneCache.has(name)) return this.boneCache.get(name)
    if (!this.vrm || !this.vrm.scene) return null
    const bone = this.vrm.scene.getObjectByName(name)
    if (bone) this.boneCache.set(name, bone)
    return bone
  }

  /**
   * Start infinite continuous motion generation.
   * Feeds the avatar with calm, gentle breathing idle motion (Ani_standIdle / Record 721).
   */
  async startInfiniteMotion() {
    if (this.isInfiniteActive) return
    this.isInfiniteActive = true
    console.log('✨ Speech2Motion: Starting calm idle breathing pipeline...')

    // Fetch initial calm standing idle track (Record 721)
    const initialTrack = await this._fetchTrack({ isIdle: true, duration: 4.0 })
    if (initialTrack) {
      this.currentTrack = initialTrack
      this.playbackTime = 0
      this.isPlaying = true
      this.isIdleActive = true
      this.idleTimer = 0
      this.idleBlendWeight = 1.0
      this.transitionElapsed = this.transitionBlendDuration
    }

    // Pre-fetch next calm idle track so double-buffer queue is ready
    this._prefetchNextIdle()
  }

  /**
   * Asynchronously pre-fetch the next calm idle track.
   */
  async _prefetchNextIdle() {
    if (this.isFetchingNext || this.nextTrack || !this.isInfiniteActive || !this.isIdleActive) return
    this.isFetchingNext = true
    try {
      const track = await this._fetchTrack({ isIdle: true, duration: 4.0 })
      if (track && this.isIdleActive) {
        this.nextTrack = track
      }
    } catch (err) {
      console.warn('Speech2Motion pre-fetch idle error:', err)
    } finally {
      this.isFetchingNext = false
    }
  }

  /**
   * Extract word timing and motion keywords for text and duration.
   */
  extractTimingAndKeywords(speechText, duration) {
    const now = Date.now()
    const activeCooldownKeywords = new Set()
    for (const [kw, ts] of this.recentActionGestures.entries()) {
      if (now - ts < 3000) {
        activeCooldownKeywords.add(kw)
      } else {
        this.recentActionGestures.delete(kw)
      }
    }
    if (this.isActionGestureActive && this.currentActionKeyword) {
      activeCooldownKeywords.add(this.currentActionKeyword)
    }

    return extractSpeechTimingAndKeywords(speechText, duration, activeCooldownKeywords)
  }

  /**
   * Fetch a motion track from Speech2Motion backend without triggering playback immediately.
   */
  /**
   * Fetch a motion track from Speech2Motion backend without triggering playback immediately.
   */
  async fetchSpeechTrack({
    speechText = '...',
    duration = 4.0,
    labelExpression = 'Neutral | Happiness',
    motionKeywords = null,
    speechTime = null,
    emotion = null,
    isIdle = false,
    isActionGesture = false,
  }) {
    const track = await this._fetchTrack({
      speechText,
      duration,
      labelExpression,
      motionKeywords,
      speechTime,
      emotion,
      isIdle,
      isActionGesture,
    })
    if (track && isActionGesture) {
      track.isActionGesture = true
    }
    return track
  }

  /**
   * Fetch a motion track from Speech2Motion backend.
   */
  async _fetchTrack({
    speechText = '...',
    duration = 4.0,
    labelExpression = 'Neutral | Happiness',
    motionKeywords = null,
    speechTime = null,
    emotion = null,
    isIdle = false,
    motionRecordId = null,
    isActionGesture = false,
  }) {
    const cleanSpeechText = (speechText && speechText !== '...') ? (stripExpressionCommands(speechText) || '...') : '...'
    const payload = {
      speech_text: cleanSpeechText,
      duration: motionRecordId ? (duration || 0) : Math.max(1.0, duration),
      avatar: this.avatarName,
      app_name: 'babylon',
      label_expression: labelExpression,
    }
    if (isIdle) payload.is_idle = true
    if (emotion) payload.emotion = emotion
    if (motionRecordId) payload.motion_record_id = motionRecordId
    if (motionKeywords) {
      payload.motion_keywords = Array.isArray(motionKeywords) ? motionKeywords : [motionKeywords]
    }
    if (speechTime && Array.isArray(speechTime)) {
      payload.speech_time = speechTime
    }

    // Fast, reliable HTTP POST via local Vite proxy / direct API endpoint (bypasses 1500ms WS timeout)
    try {
      const response = await fetch(this.apiEndpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })

      if (!response.ok) {
        throw new Error(`Server returned ${response.status}: ${await response.text()}`)
      }

      const data = await response.json()
      if (!data.ok || !data.data_base64) {
        throw new Error(data.error || 'Empty motion payload')
      }

      const track = this._parseMotionPayload(data)
      if (track && (isActionGesture || (motionKeywords && motionKeywords.length > 0))) {
        track.isActionGesture = true
      }
      return track
    } catch (err) {
      console.warn('Speech2Motion fetch failed:', err)
      return null
    }
  }

  _initWebSocket() {
    if (typeof window === 'undefined' || !this.enabled || !this.wsEndpoint) return
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) return

    try {
      const ws = new WebSocket(this.wsEndpoint)
      this.ws = ws

      ws.onopen = () => {
        console.log('⚡ Speech2Motion WebSocket connected:', this.wsEndpoint)
      }

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          const reqId = data.request_id || data.client_request_id
          if (reqId && this.wsPendingRequests.has(reqId)) {
            const pending = this.wsPendingRequests.get(reqId)
            this.wsPendingRequests.delete(reqId)
            clearTimeout(pending.timer)
            pending.resolve(data)
          }
        } catch (e) {
          console.warn('Speech2Motion WS message parse error:', e)
        }
      }

      ws.onerror = (err) => {
        console.warn('Speech2Motion WS error:', err)
      }

      ws.onclose = () => {
        this.ws = null
        for (const [id, pending] of this.wsPendingRequests.entries()) {
          clearTimeout(pending.timer)
          pending.reject(new Error('Speech2Motion WebSocket closed'))
        }
        this.wsPendingRequests.clear()

        // Auto-reconnect after 3s
        if (!this.wsReconnectTimer) {
          this.wsReconnectTimer = setTimeout(() => {
            this.wsReconnectTimer = null
            this._initWebSocket()
          }, 3000)
        }
      }
    } catch (e) {
      console.warn('Speech2Motion WS init error:', e)
    }
  }

  _sendWsRequest(payload, requestId, timeoutMs = 5000) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.wsPendingRequests.delete(requestId)
        reject(new Error(`Speech2Motion WS request timed out after ${timeoutMs}ms`))
      }, timeoutMs)

      this.wsPendingRequests.set(requestId, { resolve, reject, timer })
      try {
        this.ws.send(JSON.stringify(payload))
      } catch (err) {
        clearTimeout(timer)
        this.wsPendingRequests.delete(requestId)
        reject(err)
      }
    })
  }

  /**
   * Begin synchronized speech motion playback tied to Web Audio context start time.
   */
  /**
   * Immediately activate a speech track with smooth Hermite slerp blending from the current pose.
   */
  _activateSpeechTrack(item) {
    if (!item || !item.track || !item.track.frames || item.track.frames.length === 0) return
    const track = item.track

    // Cleanly clear any previously applied mocap blendshapes from the face
    this._clearAppliedBlendshapes()

    // Capture current bone orientations as the blend source for smooth slerp crossfade
    this.transitionFromPose.clear()
    for (const [name, bone] of this.boneCache.entries()) {
      if (bone && bone.quaternion) {
        this.transitionFromPose.set(name, bone.quaternion.clone())
      }
    }

    this.currentTrack = track
    this.playbackTime = 0
    this.isPlaying = true
    this.isSpeechActive = true
    this.isIdleActive = false
    this.nextTrack = null
    this.idleBlendWeight = 0.0
    this.speechStartTime = item.startTime
    this.speechAudioDuration = item.duration
    this.transitionElapsed = 0
    this.transitionBlendDuration = 0.35 // 350ms smooth continuous crossfade
    this.isActionGestureActive = Boolean(item.isActionGesture || track.isActionGesture)
    this._speechSilenceTimer = 0

    // Adaptive timing calculation: adjust animation speed (slow or fast) based on audio duration
    const motionDur = track.duration || (track.nFrames / (track.fps || 30.0)) || 0
    const audioDur = item.duration || this.speechAudioDuration || 0
    if (!this.isActionGestureActive && this.adaptiveSpeedEnabled && audioDur > 0.1 && motionDur > 0.1) {
      const idealSpeed = motionDur / audioDur
      // Bound within human pacing limits (0.55x to 1.30x)
      const clampedSpeed = Math.max(this.minSpeechSpeed, Math.min(this.maxSpeechSpeed, idealSpeed))
      this.adaptivePlaybackSpeed = clampedSpeed
      this.motionScaledDuration = motionDur / clampedSpeed
      this.isDurationMatched = Math.abs(clampedSpeed - idealSpeed) < 0.01
      console.log(`⏱️ Speech2Motion Adaptive Timing: motion=${motionDur.toFixed(2)}s, audio=${audioDur.toFixed(2)}s -> speed=${this.adaptivePlaybackSpeed.toFixed(2)}x (spans ${this.motionScaledDuration.toFixed(2)}s real-time, matched=${this.isDurationMatched})`)
    } else {
      this.adaptivePlaybackSpeed = this.playbackSpeed || 1.0
      this.motionScaledDuration = motionDur / this.adaptivePlaybackSpeed
      this.isDurationMatched = false
    }

    console.log(`🎬 Speech2Motion: Speech track active (${track.nFrames} frames, ${track.duration.toFixed(2)}s, action=${this.isActionGestureActive}, speed=${this.adaptivePlaybackSpeed.toFixed(2)}x)`)
  }

  /**
   * Seamlessly switch to the next queued speech track with proportional keyframe alignment.
   */
  _switchNextQueuedSpeechTrack(nowAudioTime) {
    if (!this.speechTrackQueue || this.speechTrackQueue.length === 0) return false
    const item = this.speechTrackQueue.shift()
    this._activateSpeechTrack(item)
    if (nowAudioTime > 0 && item.startTime > 0 && nowAudioTime >= item.startTime) {
      const elapsed = nowAudioTime - item.startTime
      const initialProgress = item.duration > 0 ? Math.min(1.0, elapsed / item.duration) : 0
      this.playbackTime = initialProgress * (item.track?.duration || 0)
    } else {
      this.playbackTime = 0.0
    }
    return true
  }

  /**
   * Set adaptive playback speed limits (e.g. min 0.55x, max 1.30x).
   */
  setSpeechSpeedLimits(minSpeed = 0.55, maxSpeed = 1.30) {
    this.minSpeechSpeed = Math.max(0.3, Math.min(1.0, minSpeed))
    this.maxSpeechSpeed = Math.max(1.0, Math.min(2.5, maxSpeed))
  }

  /**
   * Manually override standard playback speed.
   */
  setPlaybackSpeed(speed = 0.80) {
    this.playbackSpeed = Math.max(0.3, Math.min(2.0, speed))
  }

  /**
   * Get currently active adaptive playback speed for speech.
   */
  getAdaptiveSpeed() {
    return this.adaptivePlaybackSpeed || this.playbackSpeed || 0.80
  }

  /**
   * Begin synchronized speech motion playback tied to Web Audio context start time.
   * If a track is already playing, cleanly enqueues the incoming track onto speechTrackQueue
   * so sentences sequence smoothly without stuttering, overlapping, or replaying from start.
   */
  startSynchronizedSpeech(track, speechStartTime, audioDuration) {
    if (!track || !track.frames || track.frames.length === 0) return

    // Crucial requirement: When speaking or playing another motion, idle motion MUST be stopped
    this.isIdleActive = false
    this.nextTrack = null // Clear any stale pre-fetched idle track
    this.idleBlendWeight = 0.0
    this._speechSilenceTimer = 0

    const isAction = Boolean(track.isActionGesture || (track.motionKeywords && track.motionKeywords.length > 0))
    const item = {
      track,
      startTime: speechStartTime,
      duration: audioDuration,
      endTime: speechStartTime + audioDuration,
      isActionGesture: isAction,
    }

    const audioMgr = this.audioManager || (typeof window !== 'undefined' ? window.vrmAudioManager : null)
    const nowAudioTime = (audioMgr && audioMgr.audioCtx) ? audioMgr.audioCtx.currentTime : 0

    // If an action gesture (like spin_360, wave, bow) is actively playing and incoming is not an action,
    // enqueue it so the action gesture completes smoothly first
    const hasActiveAction = this.isActionGestureActive && this.currentTrack?.isActionGesture
    if (hasActiveAction && !isAction && this.playbackTime < (this.currentTrack.duration - 0.4)) {
      console.log('⏳ Speech2Motion: Preserving active action gesture; queuing incoming speech track')
      this.speechTrackQueue.push(item)
      this.speechTrackQueue.sort((a, b) => a.startTime - b.startTime)
      return
    }

    // Only activate immediately if:
    // 1) No speech track is active (e.g. idle or first utterance), OR
    // 2) Current track is not speaking, AND nowAudioTime is at or close to speechStartTime (within 350ms)
    const hasActiveSpeechTrack = this.isSpeechActive && this.currentTrack && !this.currentTrack.is_idle
    const isTimeToStart = (nowAudioTime <= 0) || (nowAudioTime >= speechStartTime - 0.35)

    if (!hasActiveSpeechTrack && isTimeToStart) {
      this._activateSpeechTrack(item)
      return
    }

    // Otherwise, enqueue onto speechTrackQueue so it chains seamlessly at the right time
    this.speechTrackQueue.push(item)
    this.speechTrackQueue.sort((a, b) => a.startTime - b.startTime)
    console.log(`🎬 Speech2Motion: Enqueued speech track (${this.speechTrackQueue.length} in queue, starts at ${speechStartTime.toFixed(2)}s)`)
  }

  /**
   * Interrupt active speech and smoothly transition back to idle.
   */
  interruptSpeech() {
    this.speechTrackQueue = []
    this.isSpeechActive = false
    this.speechStartTime = 0
    this.speechAudioDuration = 0
    this._speechSilenceTimer = 0
    this._transitionToFreshIdle()
  }

  /**
   * Transition smoothly to next idle track or generate fresh idle if needed.
   */
  _transitionToNextIdle() {
    if (this.nextTrack && this.isIdleActive) {
      this._transitionToTrack(this.nextTrack, false)
      this.nextTrack = null
      this._prefetchNextIdle()
    } else {
      this._transitionToFreshIdle()
    }
  }

  /**
   * Smoothly transitions from the current final pose into a freshly synthesized idle track.
   * Clears old queues, sets up slerp crossfade, and restores calm standing posture.
   */
  async _transitionToFreshIdle() {
    if (this._isGeneratingFreshIdle) return
    this._isGeneratingFreshIdle = true

    console.log('🔄 Speech2Motion: Generating fresh idle track after motion/speech...')

    // Capture instantaneous bone quaternions at the moment of transition
    this.transitionFromPose.clear()
    for (const [name, bone] of this.boneCache.entries()) {
      if (bone && bone.quaternion) {
        this.transitionFromPose.set(name, bone.quaternion.clone())
      }
    }

    this.isSpeechActive = false
    this.speechStartTime = 0
    this.speechAudioDuration = 0
    this.isActionGestureActive = false
    this.nextTrack = null

    try {
      const freshTrack = await this._fetchTrack({ isIdle: true, duration: 4.0 })
      if (!freshTrack) {
        console.warn('Speech2Motion: Failed to fetch fresh idle, keeping fallback')
        this._isGeneratingFreshIdle = false
        this._lastIdleRetryTime = Date.now()
        return
      }

      // If a new speech utterance or action gesture started while fetching, do not overwrite
      if (this.isSpeechActive || this.isActionGestureActive) {
        console.log('Speech2Motion: Speech/gesture began during fresh idle fetch; discarding stale idle')
        this._isGeneratingFreshIdle = false
        return
      }

      // Re-capture pose so blending starts exactly from where bones are right now
      this.transitionFromPose.clear()
      for (const [name, bone] of this.boneCache.entries()) {
        if (bone && bone.quaternion) {
          this.transitionFromPose.set(name, bone.quaternion.clone())
        }
      }

      this._clearAppliedBlendshapes()
      this.currentTrack = freshTrack
      this.playbackTime = 0
      this.isPlaying = true
      this.isIdleActive = true
      this.transitionElapsed = 0
      this.transitionBlendDuration = 0.45 // 450ms smooth continuous crossfade
      this.currentEmotion = 'idle'
      console.log('✅ Speech2Motion: Fresh idle successfully active and blending')

      // Pre-buffer next idle track
      this._prefetchNextIdle()
    } catch (err) {
      console.warn('Speech2Motion _transitionToFreshIdle error:', err)
    } finally {
      this._isGeneratingFreshIdle = false
    }
  }

  /**
   * Trigger full-body mocap emotional posture (shy, sad, angry, happy, surprised, thinking).
   */
  async triggerEmotion(emotionName) {
    if (!this.enabled) return null
    if (this.isActionGestureActive) {
      console.log(`✨ Speech2Motion: Action gesture in progress, ignoring emotion "${emotionName}"`)
      return null
    }
    const lower = (emotionName || '').toLowerCase().trim().replace(/[\s-]+/g, '_')
    const mapped = this.emotionAliasMap[lower] || lower

    if (mapped === 'idle') {
      this.currentEmotion = 'idle'
      this._transitionToFreshIdle()
      return null
    }

    this.currentEmotion = mapped
    console.log(`✨ Speech2Motion: Triggering full-body emotion "${lower}" -> [${mapped}]`)
    const track = await this._fetchTrack({
      emotion: mapped,
      duration: 5.5,
    })

    if (track) {
      this._transitionToTrack(track, false)
    }
    return track
  }

  /**
   * Trigger an interactive mocap gesture (wave, heart_fingers, nod, spin, etc.)
   */
  async triggerGesture(gestureName) {
    if (!this.enabled) return null
    const lower = (gestureName || '').toLowerCase().trim().replace(/[\s-]+/g, '_')

    // If it maps to a body emotion, route directly to triggerEmotion
    if (this.emotionAliasMap[lower] && this.emotionAliasMap[lower] !== 'idle') {
      return this.triggerEmotion(lower)
    }

    const keyword = this.gestureKeywordMap[lower] || lower
    const recordId = this.gestureRecordMap?.[lower] || this.gestureRecordMap?.[keyword] || null

    // Dedup guard: If this gesture was triggered within the last 4 seconds and is active, do not re-trigger
    const lastTrigger = this.recentActionGestures.get(keyword) || 0
    if (Date.now() - lastTrigger < 4000 && this.isActionGestureActive) {
      console.log(`✨ Speech2Motion: Action gesture "${lower}" already playing, skipping duplicate trigger`)
      return this.currentTrack
    }

    this.recentActionGestures.set(keyword, Date.now())
    this.currentActionKeyword = keyword
    this.isFetchingActionGesture = true
    this.isActionGestureActive = true

    console.log(`✨ Speech2Motion: Triggering mocap gesture "${lower}" -> [${keyword}] (record: ${recordId || 'auto'})`)
    try {
      const track = await this._fetchTrack({
        motionRecordId: recordId,
        speechText: keyword,
        duration: recordId ? 0 : 4.5,
        labelExpression: 'Happiness | Neutral',
        motionKeywords: recordId ? null : [[0, keyword]],
        isActionGesture: true,
      })

      if (track) {
        track.isActionGesture = true
        this.isActionGestureActive = true
        this._transitionToTrack(track, false)
      } else {
        this.isActionGestureActive = false
      }
      return track
    } catch (err) {
      this.isActionGestureActive = false
      console.warn('Speech2Motion triggerGesture error:', err)
      return null
    } finally {
      this.isFetchingActionGesture = false
    }
  }

  /**
   * Waits until the current action gesture completes its animation.
   * Allows speech utterance queue to hold back spoken words until motion finishes.
   */
  waitForCurrentActionGesture(timeoutMs = 8000) {
    if (!this.isFetchingActionGesture && !this.isActionGestureActive && !this.currentTrack?.isActionGesture) {
      return Promise.resolve()
    }
    return new Promise((resolve) => {
      const startTime = Date.now()
      const check = () => {
        const elapsed = Date.now() - startTime
        const isActive = this.isFetchingActionGesture || this.isActionGestureActive || Boolean(this.currentTrack?.isActionGesture && this.isPlaying)
        if (!isActive || elapsed >= timeoutMs) {
          resolve()
        } else {
          setTimeout(check, 40)
        }
      }
      setTimeout(check, 40)
    })
  }

  /**
   * Reset all blendshapes previously driven by Speech2Motion to 0.
   */
  _clearAppliedBlendshapes() {
    if (!this.vrm?.expressionManager) return
    const em = this.vrm.expressionManager
    for (const morphName of this.activeAppliedMorphs) {
      const resolved = this.resolvedMorphMap.get(morphName)
      if (resolved) {
        try {
          em.setValue(resolved, 0)
        } catch (e) {
          void e
        }
      }
    }
    this.activeAppliedMorphs.clear()
  }

  /**
   * Seamlessly transition from current playing pose into a new track.
   */
  _transitionToTrack(track, isSpeech = false) {
    if (!track || !track.frames || track.frames.length === 0) return

    // Cleanly clear any previously applied mocap blendshapes from the face
    this._clearAppliedBlendshapes()

    // Capture current bone orientations as the blend source
    this.transitionFromPose.clear()
    for (const [name, bone] of this.boneCache.entries()) {
      if (bone && bone.quaternion) {
        this.transitionFromPose.set(name, bone.quaternion.clone())
      }
    }

    this.currentTrack = track
    this.playbackTime = 0
    this.isPlaying = true
    this.isSpeechActive = isSpeech
    this.transitionElapsed = 0
    this.transitionBlendDuration = 0.55 // 550ms smooth continuous crossfade

    if (!track.is_idle) {
      this.isIdleActive = false
      this.nextTrack = null
      this.idleBlendWeight = 0.0
    } else {
      this.isIdleActive = true
    }
  }

  /**
   * Parse the binary flat bytes payload into an indexed keyframe track with skirt clearance.
   */
  _parseMotionPayload(data) {
    const binaryString = atob(data.data_base64)
    const len = binaryString.length
    const bytes = new Uint8Array(len)
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryString.charCodeAt(i)
    }

    const floatView = new Float32Array(bytes.buffer)
    const nFrames = data.n_frames
    const fps = data.fps || 30.0
    const jointNames = data.joint_names || []
    const blendshapeNames = data.blendshape_names || []
    const nJoints = jointNames.length
    const nBlendshapes = blendshapeNames.length

    // Row stride: nJoints * 9 (rotations) + 3 (root pos) + 3 (cutoff marks) + nBlendshapes
    const stride = nJoints * 9 + 6 + nBlendshapes

    const frames = []

    for (let f = 0; f < nFrames; f++) {
      const offset = f * stride
      const frameRotations = new Map()

      // 1. Joint rotations
      for (let j = 0; j < nJoints; j++) {
        const jName = jointNames[j]
        if (jName === 'Root') continue
        const ro = offset + j * 9

        // 3x3 rotation matrix (row-major from Babylon conversion)
        this._tempMatrix.set(
          floatView[ro],     floatView[ro + 1], floatView[ro + 2], 0,
          floatView[ro + 3], floatView[ro + 4], floatView[ro + 5], 0,
          floatView[ro + 6], floatView[ro + 7], floatView[ro + 8], 0,
          0,                 0,                 0,                 1,
        )

        const quat = new THREE.Quaternion().setFromRotationMatrix(this._tempMatrix)

        // Apply dynamic posture-dependent outward abduction offset to Left_arm and Right_arm
        // Hands clear Ani's flared skirt in rest/standing pose, while raised gestures (salute, wave, chest) remain accurate
        if (jName === 'Left_arm') {
          this._tempVecA.set(1, 0, 0).applyQuaternion(quat)
          const downFactor = Math.max(0, Math.min(1, (-this._tempVecA.y - 0.25) / 0.45))
          if (downFactor > 0.001) {
            this._tempQuatA.setFromAxisAngle(new THREE.Vector3(0, 0, 1), 0.17 * downFactor)
            quat.multiply(this._tempQuatA)
          }
        } else if (jName === 'Right_arm') {
          this._tempVecA.set(-1, 0, 0).applyQuaternion(quat)
          const downFactor = Math.max(0, Math.min(1, (-this._tempVecA.y - 0.25) / 0.45))
          if (downFactor > 0.001) {
            this._tempQuatA.setFromAxisAngle(new THREE.Vector3(0, 0, 1), -0.17 * downFactor)
            quat.multiply(this._tempQuatA)
          }
        }

        frameRotations.set(jName, quat)
      }

      // 2. Root translation
      const rootX = floatView[offset + nJoints * 9] * 0.01 // cm to m
      const rootY = floatView[offset + nJoints * 9 + 1] * 0.01
      const rootZ = floatView[offset + nJoints * 9 + 2] * 0.01
      const rootPosition = new THREE.Vector3(rootX, rootY, rootZ)

      // 3. Blendshapes
      const frameBlendshapes = new Map()
      const bo = offset + nJoints * 9 + 6
      for (let b = 0; b < nBlendshapes; b++) {
        const bName = blendshapeNames[b]
        const bVal = floatView[bo + b]
        if (bVal > 0.005) {
          frameBlendshapes.set(bName, bVal)
        }
      }

      frames.push({
        time: f / fps,
        rotations: frameRotations,
        rootPosition,
        blendshapes: frameBlendshapes,
      })
    }

    return {
      frames,
      fps,
      nFrames,
      duration: data.duration || (nFrames / fps),
      is_idle: Boolean(data.is_idle),
      emotion: data.emotion || null,
      motion_record_id: data.motion_record_id || null,
      jointNames,
      blendshapeNames,
    }
  }

  stop() {
    this.isPlaying = false
    this.currentTrack = null
    this.nextTrack = null
    this.isInfiniteActive = false
    this.isSpeechActive = false
    this.speechStartTime = 0
    this.speechAudioDuration = 0
    this._clearAppliedBlendshapes()
  }

  /**
   * Called on every animation tick from AnimationManager.update(delta).
   */
  update(delta) {
    if (!this.currentTrack || !this.vrm) {
      const now = Date.now()
      if (this.isInfiniteActive && !this.isFetchingNext && !this.isSpeechActive && !this.isActionGestureActive && !this._isGeneratingFreshIdle && (now - (this._lastIdleRetryTime || 0) > 3000)) {
        this._lastIdleRetryTime = now
        this._transitionToFreshIdle()
      }
      return
    }

    const totalDuration = this.currentTrack.duration
    if (!totalDuration || totalDuration <= 0) return

    const safeDelta = Math.min(delta, 0.05)

    // Update transition elapsed timer
    if (this.transitionElapsed < this.transitionBlendDuration) {
      this.transitionElapsed += safeDelta
    }

    // Dynamic idle blend weight:
    // Smoothly ramps up to 1.0 during calm standing idle; quickly fades to 0.0 during speech or action
    if (this.isIdleActive && !this.isSpeechActive && !this.isActionGestureActive) {
      this.idleBlendWeight = Math.min(1.0, this.idleBlendWeight + safeDelta * 2.0)
      this.idleTimer += safeDelta
    } else {
      this.idleBlendWeight = Math.max(0.0, this.idleBlendWeight - safeDelta * 3.0)
    }

    // Check if speech audio is actively playing or scheduled from audioManager
    const audioMgr = this.audioManager || (typeof window !== 'undefined' ? window.vrmAudioManager : null)
    const nowAudioTime = (audioMgr && audioMgr.audioCtx) ? audioMgr.audioCtx.currentTime : 0
    const isSpeakingAudio = audioMgr && audioMgr.isPlaying && audioMgr.audioCtx && this.speechStartTime > 0
    const hasScheduledAudio = audioMgr && audioMgr.audioCtx && (audioMgr.nextStartTime > (audioMgr.audioCtx.currentTime + 0.05))

    const isActionTrack = this.isActionGestureActive || Boolean(this.currentTrack?.isActionGesture)

    // Seamlessly transition into the next queued speech track when it's time
    if (this.speechTrackQueue.length > 0 && !isActionTrack) {
      const nextItem = this.speechTrackQueue[0]
      const shouldSwitch = (nowAudioTime > 0 && nowAudioTime >= (nextItem.startTime - 0.35)) ||
                           (nowAudioTime <= 0 && this.playbackTime >= totalDuration)
      if (shouldSwitch) {
        if (this._switchNextQueuedSpeechTrack(nowAudioTime)) return
      }
    }

    if (isActionTrack) {
      // ACTION GESTURES (e.g. spin, wave, salute, bow, cheer):
      // Must advance at physical motion speed (1.0x) to complete the full physical movement!
      // Must NOT be clamped to short audio duration or aborted by speech silence timer!
      const speed = this.playbackSpeed || 1.0
      this.playbackTime += safeDelta * speed
    } else if (this.isSpeechActive && (isSpeakingAudio || hasScheduledAudio)) {
      this._speechSilenceTimer = 0
      // Hardware-synced to the audio output clock
      const audioElapsed = audioMgr.audioCtx.currentTime - this.speechStartTime
      const scaledDuration = this.motionScaledDuration || totalDuration

      if (audioElapsed < 0) {
        // Holding during lead-in crossfade before audio start:
        // Hold frame 0 while Hermite slerp blends from previous pose into Track start pose!
        this.playbackTime = 0.0
      } else if (audioElapsed <= scaledDuration) {
        // Continuous, smooth hardware-locked progression matching spoken audio
        const progress = Math.max(0.0, Math.min(1.0, audioElapsed / Math.max(0.001, scaledDuration)))
        const targetPlaybackTime = progress * totalDuration

        // Smoothly glide toward targetPlaybackTime locked to the audio clock
        const drift = targetPlaybackTime - this.playbackTime
        if (Math.abs(drift) > 0.20 || drift < -0.01) {
          this.playbackTime = targetPlaybackTime
        } else {
          this.playbackTime = THREE.MathUtils.lerp(this.playbackTime, targetPlaybackTime, Math.min(1.0, safeDelta * 22.0))
        }
        this.playbackTime = Math.max(0.0, Math.min(totalDuration, this.playbackTime))
      } else {
        // Speech audio is longer than track's scaled duration: check if next item is queued
        if (this.speechTrackQueue.length > 0 && (nowAudioTime <= 0 || nowAudioTime >= this.speechTrackQueue[0].startTime - 0.35)) {
          if (this._switchNextQueuedSpeechTrack(nowAudioTime)) return
        }

        // CRITICAL FIX: The motion gesture has reached its natural conclusion.
        // DO NOT loop the tail over and over again!
        // Repeating a gesture over and over creates the unnatural "overlapping / repetitive" feeling.
        // Instead, hold the expressive resolved end-pose at the final frame,
        // supported by natural respiration and gaze micro-movement, until audio ends or next track starts!
        this.playbackTime = Math.max(0.0, totalDuration - 0.001)
      }
    } else if (this.isSpeechActive) {
      if (this.speechTrackQueue.length > 0 && (nowAudioTime <= 0 || nowAudioTime >= this.speechTrackQueue[0].startTime - 0.35)) {
        if (this._switchNextQueuedSpeechTrack(nowAudioTime)) return
      }
      // Audio stream paused or finished between sentences; debounce before returning to idle
      this._speechSilenceTimer = (this._speechSilenceTimer || 0) + safeDelta
      if (this.playbackTime < totalDuration) {
        this.playbackTime = Math.min(totalDuration, this.playbackTime + safeDelta * (this.adaptivePlaybackSpeed || this.playbackSpeed))
      } else {
        this.playbackTime = Math.max(0.0, totalDuration - 0.001)
      }

      // Only transition to idle after sustained silence (0.6s) when no more speech is incoming and no audio scheduled
      if (this._speechSilenceTimer >= 0.6 && !hasScheduledAudio && this.speechTrackQueue.length === 0) {
        this.isSpeechActive = false
        this.speechStartTime = 0
        this.speechAudioDuration = 0
        this._speechSilenceTimer = 0
        this._transitionToFreshIdle()
        return
      }
    } else {
      // Natural human mocap speed: calm for idle, natural for gestures
      const speed = this.currentTrack.is_idle ? this.idlePlaybackSpeed : this.playbackSpeed
      this.playbackTime += safeDelta * speed
    }

    // Pre-buffer next idle track 1.5 seconds before current track ends ONLY when in idle
    if (this.isIdleActive && this.playbackTime >= totalDuration - 1.5 && !this.nextTrack && !this.isFetchingNext && this.isInfiniteActive) {
      this._prefetchNextIdle()
    }

    // When current track ends:
    if (this.playbackTime >= totalDuration) {
      this.isActionGestureActive = false
      if (this.speechTrackQueue.length > 0 && (nowAudioTime <= 0 || nowAudioTime >= this.speechTrackQueue[0].startTime - 0.35)) {
        if (this._switchNextQueuedSpeechTrack(nowAudioTime)) return
      }
      if (this.currentTrack.is_idle) {
        if (this.nextTrack) {
          // Seamlessly switch to next track
          this._transitionToTrack(this.nextTrack, false)
          this.nextTrack = null
          this._prefetchNextIdle()
        } else {
          // Seamlessly loop the calm breathing idle without stuttering
          this.playbackTime = this.playbackTime % totalDuration
          // Slerp across seam for complete continuity
          this.transitionFromPose.clear()
          for (const [name, bone] of this.boneCache.entries()) {
            if (bone && bone.quaternion) {
              this.transitionFromPose.set(name, bone.quaternion.clone())
            }
          }
          this.transitionElapsed = 0
          this.transitionBlendDuration = 0.40
        }
      } else if ((this.isSpeechActive && (isSpeakingAudio || hasScheduledAudio)) || this.speechTrackQueue.length > 0) {
        // Still in active speech playback: hold final expressive pose calmly
        this.playbackTime = Math.max(0.0, totalDuration - 0.001)
      } else if (this.isInfiniteActive) {
        // Finished a gesture/emotion/speech motion: generate fresh idle!
        this._transitionToFreshIdle()
        return
      } else {
        this.isPlaying = false
        return
      }
    }

    // Keyframe interpolation within current track
    const { frames, fps } = this.currentTrack
    const exactFrame = Math.min(frames.length - 1, Math.max(0, this.playbackTime * fps))
    const frameIndexA = Math.floor(exactFrame)
    const frameIndexB = Math.min(frames.length - 1, frameIndexA + 1)
    const alpha = exactFrame - frameIndexA

    const frameA = frames[frameIndexA]
    const frameB = frames[frameIndexB]
    if (!frameA || !frameB) return

    // Dynamic transition blend alpha (slerping from previous track's ending pose)
    const inTransition = this.transitionElapsed < this.transitionBlendDuration
    const transitionAlpha = inTransition
      ? this._smoothstep(this.transitionElapsed / this.transitionBlendDuration)
      : 1.0

    // 1. Apply Joint Rotations
    for (const [jointName, quatA] of frameA.rotations.entries()) {
      if (jointName === 'Root') continue
      const bone = this.getBone(jointName)
      if (!bone) continue

      const quatB = frameB.rotations.get(jointName) || quatA

      // Interpolate keyframes of current track
      this._resultQuat.copy(quatA).slerp(quatB, alpha)

      if (inTransition && this.transitionFromPose.has(jointName)) {
        // Blend seamlessly from the previous track's final pose
        const fromQuat = this.transitionFromPose.get(jointName)
        bone.quaternion.copy(fromQuat).slerp(this._resultQuat, transitionAlpha)
      } else {
        bone.quaternion.copy(this._resultQuat)
      }
    }

    // Layer subtle organic idle standing movements (faded out when speaking or in action gesture):
    this._applyIdleNeckMovement(safeDelta)
    this._applyIdleHandMovements(safeDelta)

    // Organic idle head shifts & natural gaze wander (suppressed during speech/action to maintain eye contact):
    this._applyNaturalHeadAndGaze(safeDelta)

    // 2. Apply Blendshapes
    if (this.vrm.expressionManager) {
      const em = this.vrm.expressionManager
      const isSpeakingAudio = audioMgr && audioMgr.isPlaying && this.isSpeechActive
      // When speaking, mouth visemes are driven by Audio2Face neural lip-sync; do not clash
      const mouthMorphs = new Set([
        'い', 'え', 'ん', 'あ', 'う', 'お', 'ワ', 'あ２', '口角上げ', '口横広げ', '口横狭め', 'mouth_close',
        'aa', 'ih', 'ou', 'ee', 'oh', 'jawOpen', 'mouthFunnel', 'mouthPucker',
        'smirk', 'にやり', 'にやり２', 'smile', 'にっこり', 'cat_mouth', 'ω', 'tongue', 'ぺろっ', 'tehepero', 'てへぺろ',
        'serious', '真面目', 'laugh', '笑い'
      ])

      const currentFrameMorphs = new Set([...frameA.blendshapes.keys(), ...frameB.blendshapes.keys()])
      const allToProcess = new Set([...currentFrameMorphs, ...this.activeAppliedMorphs])

      for (const morphName of allToProcess) {
        if (isSpeakingAudio && mouthMorphs.has(morphName)) {
          let resolved = this.resolvedMorphMap.get(morphName)
          if (resolved === undefined) {
            resolved = em.getExpression(morphName) ? morphName : null
            this.resolvedMorphMap.set(morphName, resolved)
          }
          if (resolved && this.activeAppliedMorphs.has(morphName)) {
            try {
              em.setValue(resolved, 0)
            } catch (e) {}
            this.activeAppliedMorphs.delete(morphName)
          }
          continue
        }

        let resolved = this.resolvedMorphMap.get(morphName)
        if (resolved === undefined) {
          if (this.animationManager?._getValidExpressionName) {
            resolved = this.animationManager._getValidExpressionName(morphName) || null
          } else {
            resolved = em.getExpression(morphName) ? morphName : null
          }
          this.resolvedMorphMap.set(morphName, resolved)
        }
        if (!resolved) continue

        const valA = frameA.blendshapes.get(morphName) || 0
        const valB = frameB.blendshapes.get(morphName) || 0
        const targetVal = THREE.MathUtils.lerp(valA, valB, alpha)

        if (targetVal > 0.01) {
          em.setValue(resolved, targetVal)
          this.activeAppliedMorphs.add(morphName)
        } else if (this.activeAppliedMorphs.has(morphName)) {
          em.setValue(resolved, 0)
          this.activeAppliedMorphs.delete(morphName)
        }
      }
    }
  }

  /**
   * Layer organic neck respiration and postural sway during idle standing.
   * Scaled smoothly by idleBlendWeight (completely inactive during speech or motion).
   */
  _applyIdleNeckMovement(delta) {
    if (this.idleBlendWeight <= 0.001) return
    const neckBone = this.getBone('Neck')
    if (!neckBone) return

    // Calm respiration micro-pitch (3.9s human breath cycle, ~0.9° amplitude)
    const breathPitch = Math.sin(this.idleTimer * (Math.PI * 2 / 3.9)) * 0.016

    // Gentle organic postural poise shift (8.7s harmonic cycle, ~0.7° amplitude)
    const poiseYaw = Math.sin(this.idleTimer * (Math.PI * 2 / 8.7)) * 0.012
    const poiseRoll = Math.cos(this.idleTimer * (Math.PI * 2 / 7.3)) * 0.008

    const effectivePitch = breathPitch * this.idleBlendWeight
    const effectiveYaw = poiseYaw * this.idleBlendWeight
    const effectiveRoll = poiseRoll * this.idleBlendWeight

    this._idleNeckEuler.set(effectivePitch, effectiveYaw, effectiveRoll, 'YXZ')
    this._idleNeckQuat.setFromEuler(this._idleNeckEuler)
    neckBone.quaternion.multiply(this._idleNeckQuat)
  }

  /**
   * Layer random, non-generic hand and finger micro-movements during idle standing.
   * Uses asymmetric independent timers for left/right hands, anatomical resting curls,
   * finger cascades, and gentle wrist breathing sway.
   * Scaled smoothly by idleBlendWeight (completely inactive during speech or motion).
   */
  _applyIdleHandMovements(delta) {
    if (this.idleBlendWeight <= 0.001) return

    // Update independent left hand timer
    this._leftHandTimer -= delta
    if (this._leftHandTimer <= 0) {
      // Natural resting finger curl range: -0.10 to -0.32 rad (~ -6° to -18°)
      this._leftHandTargetCurl = -(0.10 + Math.random() * 0.22)
      this._leftWristTargetPitch = (Math.random() - 0.5) * 0.035
      this._leftHandTimer = 3.5 + Math.random() * 4.0 // 3.5s - 7.5s interval
    }

    // Update independent right hand timer (asymmetric!)
    this._rightHandTimer -= delta
    if (this._rightHandTimer <= 0) {
      this._rightHandTargetCurl = -(0.10 + Math.random() * 0.22)
      this._rightWristTargetPitch = (Math.random() - 0.5) * 0.035
      this._rightHandTimer = 4.0 + Math.random() * 4.5 // 4.0s - 8.5s interval
    }

    // Smooth biological lerp towards target curls
    this._leftHandCurrentCurl = THREE.MathUtils.lerp(this._leftHandCurrentCurl, this._leftHandTargetCurl, delta * 1.8)
    this._rightHandCurrentCurl = THREE.MathUtils.lerp(this._rightHandCurrentCurl, this._rightHandTargetCurl, delta * 1.8)
    this._leftWristCurrentPitch = THREE.MathUtils.lerp(this._leftWristCurrentPitch, this._leftWristTargetPitch, delta * 1.5)
    this._rightWristCurrentPitch = THREE.MathUtils.lerp(this._rightWristCurrentPitch, this._rightWristTargetPitch, delta * 1.5)

    const curlL = this._leftHandCurrentCurl * this.idleBlendWeight
    const curlR = this._rightHandCurrentCurl * this.idleBlendWeight

    // 1. Apply subtle wrist poise and breathing micro-sway
    const wristPitchL = (this._leftWristCurrentPitch + Math.sin(this.idleTimer * 1.6) * 0.014) * this.idleBlendWeight
    const wristL = this.getBone('Left_wrist')
    if (wristL && Math.abs(wristPitchL) > 0.0001) {
      this._idleHandEuler.set(wristPitchL, 0, 0, 'XYZ')
      this._idleHandQuat.setFromEuler(this._idleHandEuler)
      wristL.quaternion.multiply(this._idleHandQuat)
    }

    const wristPitchR = (this._rightWristCurrentPitch + Math.sin(this.idleTimer * 1.6 + 1.2) * 0.014) * this.idleBlendWeight
    const wristR = this.getBone('Right_wrist')
    if (wristR && Math.abs(wristPitchR) > 0.0001) {
      this._idleHandEuler.set(wristPitchR, 0, 0, 'XYZ')
      this._idleHandQuat.setFromEuler(this._idleHandEuler)
      wristR.quaternion.multiply(this._idleHandQuat)
    }

    // 2. Apply organic resting finger curl cascade
    // Cascade multipliers: pinky curls deepest, followed by ring, middle, index
    const fingerCascade = [
      { prefix: 'LittleFinger', factor: 1.15 },
      { prefix: 'RingFinger',   factor: 1.10 },
      { prefix: 'MiddleFinger', factor: 1.00 },
      { prefix: 'IndexFinger',  factor: 0.88 },
    ]
    // Joint distribution: Joint 1 (45%), Joint 2 (35%), Joint 3 (20%)
    const jointWeights = [0.45, 0.35, 0.20]

    // Left hand fingers
    if (Math.abs(curlL) > 0.001) {
      for (const { prefix, factor } of fingerCascade) {
        const baseAngle = curlL * factor
        for (let j = 1; j <= 3; j++) {
          const bone = this.getBone(`${prefix}${j}_L`)
          if (bone) {
            this._idleHandEuler.set(baseAngle * jointWeights[j - 1], 0, 0, 'XYZ')
            this._idleHandQuat.setFromEuler(this._idleHandEuler)
            bone.quaternion.multiply(this._idleHandQuat)
          }
        }
      }
      // Left thumb
      const thumbWeights = [0.35, 0.55, 0.40]
      for (let j = 0; j <= 2; j++) {
        const bone = this.getBone(`Thumb${j}_L`)
        if (bone) {
          this._idleHandEuler.set(curlL * thumbWeights[j], 0, 0, 'XYZ')
          this._idleHandQuat.setFromEuler(this._idleHandEuler)
          bone.quaternion.multiply(this._idleHandQuat)
        }
      }
    }

    // Right hand fingers
    if (Math.abs(curlR) > 0.001) {
      for (const { prefix, factor } of fingerCascade) {
        const baseAngle = curlR * factor
        for (let j = 1; j <= 3; j++) {
          const bone = this.getBone(`${prefix}${j}_R`)
          if (bone) {
            this._idleHandEuler.set(baseAngle * jointWeights[j - 1], 0, 0, 'XYZ')
            this._idleHandQuat.setFromEuler(this._idleHandEuler)
            bone.quaternion.multiply(this._idleHandQuat)
          }
        }
      }
      // Right thumb
      const thumbWeights = [0.35, 0.55, 0.40]
      for (let j = 0; j <= 2; j++) {
        const bone = this.getBone(`Thumb${j}_R`)
        if (bone) {
          this._idleHandEuler.set(curlR * thumbWeights[j], 0, 0, 'XYZ')
          this._idleHandQuat.setFromEuler(this._idleHandEuler)
          bone.quaternion.multiply(this._idleHandQuat)
        }
      }
    }
  }

  /**
   * Layer subtle organic head tilt, glance away, and gaze wander at idle.
   * Primary gaze maintains steady, warm eye contact with camera/user (9s-16s dwell).
   * Glances away are rare, brief (1.2s-2.2s), and subtle (~2°).
   * Completely suppressed during speech or action gestures to maintain focus on user.
   */
  _applyNaturalHeadAndGaze(delta) {
    if (!this.currentTrack) return

    // Suppress gaze wander during speech OR action gestures so avatar stays focused on user
    const isSuppressed = this.isSpeechActive || this.isActionGestureActive || this.currentTrack?.isActionGesture
    if (isSuppressed) {
      this._gazeActionWeight = Math.max(0.0, this._gazeActionWeight - delta * 3.0)
    } else {
      this._gazeActionWeight = Math.min(1.0, this._gazeActionWeight + delta * 2.0)
    }

    if (this._gazeActionWeight <= 0.001) {
      this._currentHeadYaw = 0
      this._currentHeadPitch = 0
      return
    }

    // Gaze State Machine: smooth S-curve transitions and natural conversational dwells
    if (this._gazeState === 'transition') {
      this._gazeTransitionElapsed += delta
      const rawT = Math.min(1.0, this._gazeTransitionElapsed / this._gazeTransitionDuration)
      // Hermite smoothstep S-curve: 3t^2 - 2t^3
      // Velocity starts at 0, accelerates gently, and softly decelerates to 0 at arrival (no snap!)
      const t = rawT * rawT * (3.0 - 2.0 * rawT)

      this._gazeCurrentYaw = this._gazeStartYaw + (this._gazeTargetYaw - this._gazeStartYaw) * t
      this._gazeCurrentPitch = this._gazeStartPitch + (this._gazeTargetPitch - this._gazeStartPitch) * t
      this._gazeCurrentRoll = this._gazeStartRoll + (this._gazeTargetRoll - this._gazeStartRoll) * t

      if (rawT >= 1.0) {
        this._gazeState = 'dwell'
        // Center dwell is long (9.0s - 16.0s) for steady, natural eye contact
        // Away glances are brief (1.2s - 2.2s)
        this._gazeTimer = (this._lastGlanceMode === 'center')
          ? (9.0 + Math.random() * 7.0)
          : (1.2 + Math.random() * 1.0)
      }
    } else {
      // Dwell state
      this._gazeTimer -= delta
      if (this._gazeTimer <= 0) {
        if (this._lastGlanceMode !== 'center') {
          // After looking away, smoothly return to camera/user eye contact
          this._startNewGazeTarget('center', 0, 0, 0, 1.4 + Math.random() * 0.3)
        } else {
          // From center, pick a new away glance, avoiding repetitive alternation
          const pool = ['up', 'down', 'right', 'left']
          const filtered = pool.filter((p) => p !== this._previousAwayMode)
          const choice = filtered[Math.floor(Math.random() * filtered.length)]
          this._previousAwayMode = choice

          if (choice === 'right') {
            const yaw = 0.035 + Math.random() * 0.02 // ~2° to 3.1° subtle glance
            const pitch = (Math.random() - 0.5) * 0.015
            const roll = yaw * 0.12
            this._startNewGazeTarget('right', yaw, pitch, roll, 1.4 + Math.random() * 0.3)
          } else if (choice === 'left') {
            const yaw = -(0.035 + Math.random() * 0.02) // ~ -2° to -3.1°
            const pitch = (Math.random() - 0.5) * 0.015
            const roll = yaw * 0.12
            this._startNewGazeTarget('left', yaw, pitch, roll, 1.4 + Math.random() * 0.3)
          } else if (choice === 'up') {
            const yaw = (Math.random() - 0.5) * 0.02
            const pitch = -(0.025 + Math.random() * 0.02) // ~1.5° to 2.5° upward pensive
            const roll = (Math.random() - 0.5) * 0.01
            this._startNewGazeTarget('up', yaw, pitch, roll, 1.3 + Math.random() * 0.3)
          } else if (choice === 'down') {
            const yaw = (Math.random() - 0.5) * 0.02
            const pitch = 0.025 + Math.random() * 0.02 // ~1.5° to 2.5° subtle downward glance
            const roll = (Math.random() - 0.5) * 0.01
            this._startNewGazeTarget('down', yaw, pitch, roll, 1.3 + Math.random() * 0.3)
          }
        }
      }
    }

    const effectiveYaw = this._gazeCurrentYaw * this._gazeActionWeight
    const effectivePitch = this._gazeCurrentPitch * this._gazeActionWeight
    const effectiveRoll = this._gazeCurrentRoll * this._gazeActionWeight

    this._currentHeadYaw = effectiveYaw
    this._currentHeadPitch = effectivePitch

    // Distribute rotation naturally: Head gets 65%, Neck gets 35%
    this._headAdditiveEuler.set(effectivePitch * 0.65, effectiveYaw * 0.65, effectiveRoll * 0.65, 'YXZ')
    this._headAdditiveQuat.setFromEuler(this._headAdditiveEuler)

    this._neckAdditiveEuler.set(effectivePitch * 0.35, effectiveYaw * 0.35, effectiveRoll * 0.35, 'YXZ')
    this._neckAdditiveQuat.setFromEuler(this._neckAdditiveEuler)

    const headBone = this.getBone('Head')
    if (headBone) {
      headBone.quaternion.multiply(this._headAdditiveQuat)
    }

    const neckBone = this.getBone('Neck')
    if (neckBone) {
      neckBone.quaternion.multiply(this._neckAdditiveQuat)
    }
  }

  _startNewGazeTarget(mode, targetYaw, targetPitch, targetRoll, duration = 1.5) {
    this._lastGlanceMode = mode
    this._gazeState = 'transition'
    this._gazeTransitionElapsed = 0
    this._gazeTransitionDuration = duration
    this._gazeStartYaw = this._gazeCurrentYaw
    this._gazeStartPitch = this._gazeCurrentPitch
    this._gazeStartRoll = this._gazeCurrentRoll
    this._gazeTargetYaw = targetYaw
    this._gazeTargetPitch = targetPitch
    this._gazeTargetRoll = targetRoll
  }
}
