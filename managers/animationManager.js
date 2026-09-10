import * as THREE from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { VRMAnimationLoaderPlugin, createVRMAnimationClip } from '@pixiv/three-vrm-animation'
import { cacheManager } from './cacheManager'
import { Speech2MotionManager } from './speech2motionManager'

// Mixamo bone name -> VRM humanoid bone name. Lets us consume raw Mixamo FBX
// exports directly and retarget them onto any VRM at load time (the same method
// the official three-vrm "loadMixamoAnimation" example uses).
const MIXAMO_VRM_RIG_MAP = {
  mixamorigHips: 'hips',
  mixamorigSpine: 'spine',
  mixamorigSpine1: 'chest',
  mixamorigSpine2: 'upperChest',
  mixamorigNeck: 'neck',
  mixamorigHead: 'head',
  mixamorigLeftShoulder: 'leftShoulder',
  mixamorigLeftArm: 'leftUpperArm',
  mixamorigLeftForeArm: 'leftLowerArm',
  mixamorigLeftHand: 'leftHand',
  mixamorigLeftHandThumb1: 'leftThumbMetacarpal',
  mixamorigLeftHandThumb2: 'leftThumbProximal',
  mixamorigLeftHandThumb3: 'leftThumbDistal',
  mixamorigLeftHandIndex1: 'leftIndexProximal',
  mixamorigLeftHandIndex2: 'leftIndexIntermediate',
  mixamorigLeftHandIndex3: 'leftIndexDistal',
  mixamorigLeftHandMiddle1: 'leftMiddleProximal',
  mixamorigLeftHandMiddle2: 'leftMiddleIntermediate',
  mixamorigLeftHandMiddle3: 'leftMiddleDistal',
  mixamorigLeftHandRing1: 'leftRingProximal',
  mixamorigLeftHandRing2: 'leftRingIntermediate',
  mixamorigLeftHandRing3: 'leftRingDistal',
  mixamorigLeftHandPinky1: 'leftLittleProximal',
  mixamorigLeftHandPinky2: 'leftLittleIntermediate',
  mixamorigLeftHandPinky3: 'leftLittleDistal',
  mixamorigLeftUpLeg: 'leftUpperLeg',
  mixamorigLeftLeg: 'leftLowerLeg',
  mixamorigLeftFoot: 'leftFoot',
  mixamorigLeftToeBase: 'leftToes',
  mixamorigRightShoulder: 'rightShoulder',
  mixamorigRightArm: 'rightUpperArm',
  mixamorigRightForeArm: 'rightLowerArm',
  mixamorigRightHand: 'rightHand',
  mixamorigRightHandThumb1: 'rightThumbMetacarpal',
  mixamorigRightHandThumb2: 'rightThumbProximal',
  mixamorigRightHandThumb3: 'rightThumbDistal',
  mixamorigRightHandIndex1: 'rightIndexProximal',
  mixamorigRightHandIndex2: 'rightIndexIntermediate',
  mixamorigRightHandIndex3: 'rightIndexDistal',
  mixamorigRightHandMiddle1: 'rightMiddleProximal',
  mixamorigRightHandMiddle2: 'rightMiddleIntermediate',
  mixamorigRightHandMiddle3: 'rightMiddleDistal',
  mixamorigRightHandRing1: 'rightRingProximal',
  mixamorigRightHandRing2: 'rightRingIntermediate',
  mixamorigRightHandRing3: 'rightRingDistal',
  mixamorigRightHandPinky1: 'rightLittleProximal',
  mixamorigRightHandPinky2: 'rightLittleIntermediate',
  mixamorigRightHandPinky3: 'rightLittleDistal',
  mixamorigRightUpLeg: 'rightUpperLeg',
  mixamorigRightLeg: 'rightLowerLeg',
  mixamorigRightFoot: 'rightFoot',
  mixamorigRightToeBase: 'rightToes',
}

// Safety net: maps common names the model invents to real catalog animations,
// so a near-miss still plays something fitting instead of doing nothing.
const ANIMATION_ALIASES = {
  // anger / conflict
  anger: 'angry',
  mad: 'angry',
  furious: 'angry',
  // sadness
  crying: 'sadness',
  cry: 'sadness',
  sad: 'sadness',
  sorrow: 'grief',
  // joy / celebration
  happy: 'joy',
  happy_dance: 'dance',
  jump_joy: 'joy',
  jumping: 'joy',
  celebrate: 'cheering',
  celebration: 'cheering',
  cheer: 'cheering',
  cheering: 'cheering',
  victory: 'cheering',
  bouncing_in_excitement: 'excitement',
  excited: 'excitement',
  // applause
  applause: 'clap',
  clapping: 'clap',
  // affection
  kiss: 'blow_kiss',
  heart: 'heart_fingers',
  heart_fingers: 'heart_fingers',
  kpop_heart: 'heart_fingers',
  adore: 'love',
  adoration: 'love',
  // thinking / contemplation
  thinking: 'thinking',
  thoughtful: 'thinking',
  thought: 'thinking',
  ponder: 'thinking',
  interest: 'curiosity',
  interested: 'curiosity',
  confused: 'confusion',
  // head gestures
  nod: 'nod',
  head_nod: 'nod',
  agree: 'nod',
  agreement: 'nod',
  yes: 'nod',
  shake_head: 'shake_head',
  head_shake: 'shake_head',
  disagree: 'shake_head',
  disagreement: 'shake_head',
  no: 'shake_head',
  // greeting & respect
  hello: 'wave',
  hi: 'wave',
  bow: 'bow',
  bowing: 'bow',
  greet: 'greeting',
  // gratitude / approval
  thanks: 'gratitude',
  thankful: 'gratitude',
  grateful: 'gratitude',
  approve: 'approval',
  thumbsup: 'thumbs_up',
  // conversational
  explain: 'explaining',
  explaining: 'explaining',
  talk: 'explaining',
  talking: 'explaining',
  // sassy / pose
  sassy: 'hands_on_hips',
  sassy_pose: 'hands_on_hips',
  confident: 'hands_on_hips',
  hands_on_hips: 'hands_on_hips',
  // exasperation & emotion
  facepalm: 'facepalm',
  face_palm: 'facepalm',
  smh: 'facepalm',
  shy: 'shy',
  fidget: 'shy',
  timid: 'shy',
  // fear / anxiety
  scared: 'fear',
  afraid: 'fear',
  anxiety: 'nervous',
  anxious: 'nervous',
  nervousness: 'nervous',
  worried: 'nervous',
  // calm / relief
  calm: 'neutral_idle',
  calmness: 'neutral_idle',
  relieved: 'relief',
  satisfaction: 'relief',
  satisfied: 'relief',
  // disgust / disappointment
  disgusted: 'disgust',
  disappointed: 'disappointment',
  distress: 'sadness',
  distressed: 'sadness',
  // surprise
  surprised: 'surprise',
  shocked: 'surprise',
  realize: 'realization',
  // bored / tired
  boredom: 'bored',
  tired: 'bored',
  sleepy: 'sleeping',
  sleep: 'sleeping',
  // dance
  dancing: 'dance',
  gangnam: 'gangnam_style',
  macarena: 'Macarena_dance',
}

// Alias and locale mapping for VRM expressions (English <-> Japanese / alternate names)
const EXPRESSION_ALIASES = {
  // 1. Special Anime Blendshapes (Bidirectional English <-> Japanese)
  blush: ['blush', '照れ', 'blush_lines', '////'],
  '照れ': ['照れ', 'blush', 'blush_lines', '////'],

  tears: ['tears', '涙', 'crying'],
  '涙': ['涙', 'tears', 'crying'],
  crying: ['crying', 'tears', '涙'],

  blush_lines: ['blush_lines', '////', 'blush', '照れ'],
  '////': ['////', 'blush_lines', '照れ', 'blush'],

  sweat: ['sweat', '汗'],
  '汗': ['汗', 'sweat'],

  anger_mark: ['anger_mark', '怒', '怒りマーク'],
  '怒': ['怒', 'anger_mark', '怒りマーク'],
  '怒りマーク': ['怒りマーク', 'anger_mark', '怒'],

  dizzy: ['dizzy', 'ぐるぐる'],
  'ぐるぐる': ['ぐるぐる', 'dizzy'],

  star_eyes: ['star_eyes', '星目', '☆'],
  '星目': ['星目', 'star_eyes', '☆'],
  '☆': ['☆', '星目', 'star_eyes'],

  cat_mouth: ['cat_mouth', 'ω'],
  'ω': ['ω', 'cat_mouth'],

  smirk: ['smirk', 'にやり', 'smirk2', 'にやり２'],
  'にやり': ['にやり', 'smirk', 'にやり２', 'smirk2'],
  smirk2: ['smirk2', 'にやり２', 'smirk', 'にやり'],
  'にやり２': ['にやり２', 'smirk2', 'にやり', 'smirk'],

  smile: ['smile', 'にっこり', 'smile2', 'にこり'],
  'にっこり': ['にっこり', 'smile', 'にこり', 'smile2'],
  smile2: ['smile2', 'にこり', 'smile', 'にっこり'],
  'にこり': ['にこり', 'smile2', 'にっこり', 'smile'],

  tehepero: ['tehepero', 'てへぺろ'],
  'てへぺろ': ['てへぺろ', 'tehepero'],

  tongue: ['tongue', 'ぺろっ', 'tongue_wide', '舌広げ'],
  'ぺろっ': ['ぺろっ', 'tongue', '舌広げ', 'tongue_wide'],
  tongue_wide: ['tongue_wide', '舌広げ', 'tongue', 'ぺろっ'],
  '舌広げ': ['舌広げ', 'tongue_wide', 'ぺろっ', 'tongue'],

  pupil_small: ['pupil_small', '瞳小'],
  '瞳小': ['瞳小', 'pupil_small'],

  pupil_big: ['pupil_big', '瞳大'],
  '瞳大': ['瞳大', 'pupil_big'],

  lifeless_eyes: ['lifeless_eyes', '光消', 'ハイライト消し'],
  '光消': ['光消', 'lifeless_eyes', 'ハイライト消し'],
  'ハイライト消し': ['ハイライト消し', '光消', 'lifeless_eyes'],

  shocked: ['shocked', '恐ろしい子！', 'ガーン'],
  '恐ろしい子！': ['恐ろしい子！', 'shocked', 'ガーン'],
  'ガーン': ['ガーン', '恐ろしい子！', 'shocked'],

  hau: ['hau', 'はぅ'],
  'はぅ': ['はぅ', 'hau'],

  hachu_eyes: ['hachu_eyes', 'はちゅ目'],
  'はちゅ目': ['はちゅ目', 'hachu_eyes'],

  wink2: ['wink2', 'ウィンク２'],
  'ウィンク２': ['ウィンク２', 'wink2'],

  wink2_right: ['wink2_right', 'ウィンク２右'],
  'ウィンク２右': ['ウィンク２右', 'wink2_right'],

  mouth_close: ['mouth_close', 'ん', '口結び'],
  'ん': ['ん', 'mouth_close', '口結び'],
  '口結び': ['口結び', 'ん', 'mouth_close'],

  laugh: ['laugh', '笑い', 'ワ', 'wa'],
  '笑い': ['笑い', 'laugh', 'ワ', 'wa'],
  'ワ': ['ワ', '笑い', 'laugh', 'wa'],
  wa: ['wa', 'ワ', '笑い', 'laugh'],

  serious: ['serious', '真面目'],
  '真面目': ['真面目', 'serious'],

  // 2. Core Emotions, Visemes & Blinks (Bidirectional English <-> Japanese)
  blink: ['blink', 'まばたき', 'Blink'],
  'まばたき': ['まばたき', 'blink', 'Blink'],

  blinkLeft: ['blinkLeft', 'ウィンク', 'blink_l', 'Blink_L', 'wink'],
  'ウィンク': ['ウィンク', 'blinkLeft', 'blink_l', 'wink'],
  blink_l: ['blinkLeft', 'ウィンク', 'blink_l', 'Blink_L'],

  blinkRight: ['blinkRight', 'ウィンク右', 'blink_r', 'Blink_R', 'wink_r'],
  'ウィンク右': ['ウィンク右', 'blinkRight', 'blink_r', 'wink_r'],
  blink_r: ['blinkRight', 'ウィンク右', 'blink_r', 'Blink_R'],

  happy: ['happy', '喜び', 'joy', 'fun', 'Happy', 'Joy', 'Fun'],
  '喜び': ['喜び', 'happy', 'joy', 'fun'],
  joy: ['joy', 'happy', '喜び', 'fun'],
  fun: ['fun', 'happy', '喜び', 'joy'],

  sad: ['sad', '困る', '悲しい', 'sorrow', 'Sad', 'Sorrow'],
  '困る': ['困る', 'sad', '悲しい', 'sorrow'],
  '悲しい': ['悲しい', '困る', 'sad', 'sorrow'],
  sorrow: ['sorrow', 'sad', '困る', '悲しい'],

  angry: ['angry', '怒り', '怒り目', 'Angry'],
  '怒り': ['怒り', 'angry', '怒り目'],
  '怒り目': ['怒り目', '怒り', 'angry'],

  surprised: ['surprised', 'びっくり', 'Surprised'],
  'びっくり': ['びっくり', 'surprised'],

  relaxed: ['relaxed', 'なごみ', 'Relaxed'],
  'なごみ': ['なごみ', 'relaxed'],

  neutral: ['neutral', 'Neutral'],

  aa: ['aa', 'あ', 'a', 'A'],
  'あ': ['あ', 'aa', 'a'],
  a: ['aa', 'あ', 'a'],

  ih: ['ih', 'い', 'i', 'I'],
  'い': ['い', 'ih', 'i'],
  i: ['ih', 'い', 'i'],

  ou: ['ou', 'う', 'u', 'U'],
  'う': ['う', 'ou', 'u'],
  u: ['ou', 'う', 'u'],

  ee: ['ee', 'え', 'e', 'E'],
  'え': ['え', 'ee', 'e'],
  e: ['ee', 'え', 'e'],

  oh: ['oh', 'お', 'o', 'O'],
  'お': ['お', 'oh', 'o'],
  o: ['oh', 'お', 'o'],
}

export class AnimationManager {
  vrm
  mixer
  actions = {}
  activeAction = null
  loader
  camera = null
  currentState = 'idle'
  mainIdle = 'Unarmed_idle01'
  currentExpression = 'neutral'
  targetExpression = 'neutral'
  targetExpressionWeights = { neutral: 1 }
  expressionTimer = null
  coreMoodKeys = ['neutral', 'happy', 'angry', 'sad', 'relaxed', 'surprised']
  specialKeys = [
    'blush',
    'tears',
    'blush_lines',
    'sweat',
    'anger_mark',
    'dizzy',
    'star_eyes',
    'smirk',
    'smile',
    'cat_mouth',
    'tongue',
    'tehepero',
    'pupil_small',
    'pupil_big',
    'lifeless_eyes',
    'shocked',
    'hau',
    'hachu_eyes',
    'wink2',
    'wink2_right',
    'laugh',
    'mouth_close',
    'serious',
  ]
  mouthKeys = ['aa', 'ee', 'ih', 'oh', 'ou']
  activeExpressionKeys = new Set(this.coreMoodKeys)
  supportedExpressionTrackCache = new Map()
  backgroundLoadPromise = null

  // ===== Transition Engine (eased, weight-driven crossfades) =====
  // A single active transition blends `from` -> `to` with smoothstep easing so
  // pre-recorded clips connect seamlessly instead of snapping between poses.
  transition = null
  _returningToIdle = false
  // Tuned fade windows (seconds). Smooth and natural transition curves.
  fadeTimings = {
    boot: 0.8, // first idle fading up gracefully from nothing
    gestureIn: 0.5, // idle/gesture -> gesture (calm, human-speed transition)
    gestureSwap: 0.4, // gesture -> gesture (smooth crossfade)
    idleReturn: 0.8, // gesture -> idle (gentle, relaxing return to rest)
  }
  // Clips that should hold their final pose instead of auto-returning to idle.
  holdPoseClips = new Set(['Macarena_dance'])

  // Blink State
  blinkTimer = 0
  nextBlinkTime = 3
  isBlinking = false
  blinkDuration = 0.15
  blinkProgress = 0

  // Micro-Expression State
  microTimer = 0
  microIntensity = 0

  // Speaking State
  isSpeaking = false
  speechIntensity = 0
  speechCadencePhase = 0
  speechCadence = 0
  speechTextCursor = ''
  speechPendingWord = ''
  speechBeatQueue = 0
  speechBeatProgress = 0
  speechBeatOpen = 0
  speechState = {
    intensity: 0,
    activity: 0,
    pulse: 0,
    openness: 0,
    wide: 0,
    round: 0,
    narrow: 0,
    aa: 0,
    ee: 0,
    ih: 0,
    oh: 0,
    ou: 0,
  }
  speechTarget = {
    intensity: 0,
    activity: 0,
    pulse: 0,
    openness: 0,
    wide: 0,
    round: 0,
    narrow: 0,
    aa: 0,
    ee: 0,
    ih: 0,
    oh: 0,
    ou: 0,
  }
  expressionStyle = {
    transitionSpeed: 5.0,
    microAmplitude: 0.02,
    microFrequency: 2.0,
    squint: 0.0,
    blinkMinInterval: 2.0,
    blinkMaxInterval: 5.0,
    blinkDuration: 0.15,
    mouthBias: { aa: 0, ee: 0, ih: 0, oh: 0, ou: 0 },
    mouthInfluenceWhileSpeaking: 0.28,
  }

  expressionMap
  speech2motion = null

  constructor(vrm, camera = null) {
    this.vrm = vrm
    this.camera = camera
    this.mixer = new THREE.AnimationMixer(vrm.scene)
    this.loader = new GLTFLoader()
    this.loader.setCrossOrigin('anonymous')
    this.loader.register((parser) => new VRMAnimationLoaderPlugin(parser))

    this.speech2motion = new Speech2MotionManager(vrm, {
      avatarName: 'Ani-default',
      animationManager: this,
      audioManager: typeof window !== 'undefined' ? window.vrmAudioManager : null,
      enabled: true,
    })

    if (this.vrm?.humanoid) {
      this.vrm.humanoid.update = () => {}
    }

    this.clearExpressionCache()
    this._tempKeysToUpdate = new Set()
    this._tempNextActiveKeys = new Set()

    this.expressionMap = {
      // ========== CORE BASE EMOTIONS (Pure) ==========
      neutral: 'neutral',
      happy: 'happy',
      sad: 'sad',
      angry: 'angry',
      surprised: 'surprised',
      relaxed: 'relaxed',

      // ========== SPECIAL ANIME & MORPH EXPRESSIONS ==========
      blush: { happy: 0.3, blush: 1.0 },
      '照れ': { happy: 0.3, blush: 1.0 },
      tears: { sad: 0.8, tears: 1.0 },
      '涙': { sad: 0.8, tears: 1.0 },
      blush_lines: { happy: 0.3, blush_lines: 1.0 },
      '////': { happy: 0.3, blush_lines: 1.0 },
      sweat: { surprised: 0.3, sweat: 1.0 },
      '汗': { surprised: 0.3, sweat: 1.0 },
      anger_mark: { angry: 0.9, anger_mark: 1.0 },
      '怒': { angry: 0.9, anger_mark: 1.0 },
      dizzy: { surprised: 0.6, dizzy: 1.0 },
      'ぐるぐる': { surprised: 0.6, dizzy: 1.0 },
      star_eyes: { happy: 0.8, surprised: 0.4, star_eyes: 1.0 },
      '星目': { happy: 0.8, surprised: 0.4, star_eyes: 1.0 },
      cat_mouth: { happy: 0.6, cat_mouth: 1.0 },
      'ω': { happy: 0.6, cat_mouth: 1.0 },
      smirk: { happy: 0.4, smirk: 1.0 },
      'にやり': { happy: 0.4, smirk: 1.0 },
      smile: { happy: 0.8, smile: 1.0 },
      'にっこり': { happy: 0.8, smile: 1.0 },
      tehepero: { happy: 0.5, tehepero: 1.0 },
      'てへぺろ': { happy: 0.5, tehepero: 1.0 },
      tongue: { happy: 0.5, tongue: 1.0 },
      'ぺろっ': { happy: 0.5, tongue: 1.0 },
      pupil_small: { surprised: 0.9, pupil_small: 1.0 },
      '瞳小': { surprised: 0.9, pupil_small: 1.0 },
      pupil_big: { happy: 0.7, pupil_big: 1.0 },
      '瞳大': { happy: 0.7, pupil_big: 1.0 },
      lifeless_eyes: { neutral: 0.8, sad: 0.4, lifeless_eyes: 1.0 },
      '光消': { neutral: 0.8, sad: 0.4, lifeless_eyes: 1.0 },
      shocked: { surprised: 1.0, shocked: 1.0, pupil_small: 0.8 },
      '恐ろしい子！': { surprised: 1.0, shocked: 1.0, pupil_small: 0.8 },
      hau: { sad: 0.5, surprised: 0.4, hau: 1.0 },
      'はぅ': { sad: 0.5, surprised: 0.4, hau: 1.0 },
      hachu_eyes: { happy: 0.8, hachu_eyes: 1.0 },
      'はちゅ目': { happy: 0.8, hachu_eyes: 1.0 },
      wink2: { happy: 0.5, wink2: 1.0 },
      'ウィンク２': { happy: 0.5, wink2: 1.0 },
      wink2_right: { happy: 0.5, wink2_right: 1.0 },
      'ウィンク２右': { happy: 0.5, wink2_right: 1.0 },
      mouth_close: { neutral: 0.5, mouth_close: 1.0 },
      'ん': { neutral: 0.5, mouth_close: 1.0 },
      cute: { happy: 0.7, cat_mouth: 0.9, blush: 0.6 },

      // ========== HAPPINESS SPECTRUM (20 variations) ==========
      joy: { happy: 1.0, ee: 0.15 },
      ecstatic: { happy: 1.0, surprised: 0.3, aa: 0.25, ee: 0.25 },
      euphoric: { happy: 1.0, relaxed: 0.4, ee: 0.2 },
      delighted: { happy: 0.9, surprised: 0.2, ee: 0.15 },
      cheerful: { happy: 0.7, relaxed: 0.2, ee: 0.1 },
      content: { happy: 0.5, relaxed: 0.5 },
      satisfied: { happy: 0.4, relaxed: 0.6 },
      amused: { happy: 0.6, surprised: 0.2, ee: 0.1 },
      giggly: { happy: 0.8, surprised: 0.3, ee: 0.2, ih: 0.15 },
      grinning: { happy: 0.9, ee: 0.25 },
      beaming: { happy: 1.0, surprised: 0.1, ee: 0.2 },
      radiant: { happy: 0.95, relaxed: 0.3, ee: 0.2 },
      blissful: { happy: 0.8, relaxed: 0.7, ee: 0.15 },
      gleeful: { happy: 0.95, surprised: 0.2, ee: 0.2 },
      jubilant: { happy: 1.0, surprised: 0.4, aa: 0.2, ee: 0.2 },
      thrilled: { happy: 0.9, surprised: 0.5, aa: 0.15, ee: 0.2 },
      elated: { happy: 0.95, surprised: 0.3, ee: 0.25 },
      overjoyed: { happy: 1.0, surprised: 0.5, aa: 0.25, ee: 0.25 },
      excited: { happy: 0.8, surprised: 0.6, aa: 0.2, ee: 0.15 },
      hyper: { happy: 0.7, surprised: 0.8, aa: 0.25, ee: 0.15 },

      // ========== LAUGH/SMILE (Explicit Mouth Expressions) ==========
      laugh: { happy: 1.0, laugh: 1.0, aa: 0.3, ee: 0.2, surprised: 0.2 },
      laughing: { happy: 1.0, laugh: 1.0, aa: 0.35, ee: 0.25, surprised: 0.3 },
      lol: { happy: 1.0, laugh: 1.0, aa: 0.3, ee: 0.2, surprised: 0.2 },
      lmao: { happy: 1.0, laugh: 1.0, aa: 0.4, ee: 0.25, surprised: 0.4 },
      smile: { happy: 0.8, smile: 1.0, ee: 0.15 },
      grin: { happy: 0.9, smile: 0.8, ee: 0.25 },
      smirk: { happy: 0.4, smirk: 1.0, relaxed: 0.3, neutral: 0.5, ee: 0.1 },
      chuckle: { happy: 0.7, smile: 0.6, aa: 0.15, ee: 0.2 },

      // ========== SADNESS SPECTRUM (20 variations) ==========
      sorrow: { sad: 1.0 },
      grief: { sad: 1.0, angry: 0.2 },
      heartbroken: { sad: 1.0, surprised: 0.3 },
      devastated: { sad: 1.0, angry: 0.3 },
      crushed: { sad: 0.95, surprised: 0.2 },
      despairing: { sad: 1.0, relaxed: 0.4 },
      hopeless: { sad: 0.9, relaxed: 0.5 },
      melancholy: { sad: 0.7, relaxed: 0.4 },
      gloomy: { sad: 0.6, neutral: 0.3 },
      downcast: { sad: 0.5, neutral: 0.4 },
      dejected: { sad: 0.7, neutral: 0.2 },
      crestfallen: { sad: 0.8, surprised: 0.1 },
      disappointed: { sad: 0.6, angry: 0.2 },
      let_down: { sad: 0.5, angry: 0.3 },
      blue: { sad: 0.6, relaxed: 0.3 },
      down: { sad: 0.5, neutral: 0.3 },
      crying: { sad: 1.0, tears: 1.0 },
      weeping: { sad: 1.0, surprised: 0.2, tears: 1.0 },
      sobbing: { sad: 1.0, angry: 0.1, tears: 1.0 },
      teary: { sad: 0.7, surprised: 0.1, tears: 0.7 },

      // ========== ANGER SPECTRUM (20 variations - VERY DISTINCT) ==========
      furious: { angry: 1.0, surprised: 0.3, anger_mark: 1.0 },
      enraged: { angry: 1.0, sad: 0.1, anger_mark: 1.0 },
      livid: { angry: 1.0 },
      seething: { angry: 0.95, neutral: 0.2 },
      fuming: { angry: 0.9, surprised: 0.2 },
      irate: { angry: 0.85 },
      wrathful: { angry: 1.0, sad: 0.2 },
      hostile: { angry: 0.8, neutral: 0.3 },
      aggressive: { angry: 0.9, surprised: 0.4 },
      irritated: { angry: 0.6, neutral: 0.2 },
      agitated: { angry: 0.7, surprised: 0.3 },
      annoyed: { angry: 0.5, neutral: 0.3 },
      peeved: { angry: 0.4, neutral: 0.4 },
      vexed: { angry: 0.6, surprised: 0.1 },
      miffed: { angry: 0.45, neutral: 0.3 },
      cross: { angry: 0.5, sad: 0.1 },
      grumpy: { angry: 0.4, sad: 0.2 },
      cranky: { angry: 0.5, relaxed: 0.1 },
      bitter: { angry: 0.6, sad: 0.4 },
      resentful: { angry: 0.7, sad: 0.3 },

      // ========== DISGUST SPECTRUM (15 variations - UNIQUE FROM ANGER) ==========
      disgusted: { angry: 0.3, sad: 0.6, surprised: 0.2, ih: 0.4 }, // Very different from pure angry
      revolted: { angry: 0.2, sad: 0.7, surprised: 0.4, ih: 0.5 },
      repulsed: { angry: 0.25, sad: 0.65, surprised: 0.3, ih: 0.4 },
      nauseated: { sad: 0.7, surprised: 0.2, relaxed: 0.3, ou: 0.3 },
      sickened: { sad: 0.8, angry: 0.1, surprised: 0.2, ou: 0.4 },
      appalled: { surprised: 0.6, angry: 0.3, sad: 0.3, oh: 0.3 },
      horrified: { surprised: 0.8, sad: 0.5, angry: 0.1, oh: 0.5, aa: 0.3 },
      repelled: { angry: 0.2, sad: 0.5, surprised: 0.5, ih: 0.3 },
      aversion: { angry: 0.3, sad: 0.5, neutral: 0.3, ih: 0.2 },
      distaste: { angry: 0.2, sad: 0.4, neutral: 0.5, ih: 0.2 },
      contempt: { angry: 0.5, sad: 0.2, neutral: 0.4, ih: 0.3 }, // More angry than disgust
      disdain: { angry: 0.4, neutral: 0.6, sad: 0.1, ih: 0.2 },
      scorn: { angry: 0.6, neutral: 0.4, happy: 0.1, ih: 0.4 },
      loathing: { angry: 0.4, sad: 0.7, ih: 0.5 },
      abhorrence: { angry: 0.3, sad: 0.8, surprised: 0.2, ih: 0.6 },

      // ========== FEAR/ANXIETY SPECTRUM (18 variations) ==========
      terrified: { surprised: 1.0, sad: 0.6 },
      petrified: { surprised: 1.0, sad: 0.5, neutral: 0.3 },
      frightened: { surprised: 0.9, sad: 0.4 },
      scared: { surprised: 0.8, sad: 0.3 },
      afraid: { surprised: 0.7, sad: 0.4 },
      fearful: { surprised: 0.7, sad: 0.5 },
      panicked: { surprised: 1.0, angry: 0.3 },
      alarmed: { surprised: 0.9, angry: 0.2 },
      startled: { surprised: 1.0 },
      shocked: { surprised: 1.0, neutral: 0.2 },
      stunned: { surprised: 0.9, neutral: 0.5 },
      anxious: { surprised: 0.4, sad: 0.5, angry: 0.2, sweat: 0.7 },
      nervous: { surprised: 0.3, sad: 0.3, neutral: 0.2, sweat: 0.8 },
      worried: { sad: 0.5, surprised: 0.3, angry: 0.2 },
      uneasy: { surprised: 0.3, neutral: 0.4, sad: 0.2 },
      apprehensive: { surprised: 0.4, sad: 0.4, neutral: 0.2 },
      tense: { angry: 0.3, surprised: 0.4, neutral: 0.3 },
      jittery: { surprised: 0.5, happy: 0.2, neutral: 0.2 },

      // ========== SURPRISE SPECTRUM (12 variations) ==========
      astonished: { surprised: 1.0, happy: 0.2, oh: 0.5 },
      astounded: { surprised: 1.0, happy: 0.3, oh: 0.6 },
      amazed: { surprised: 0.9, happy: 0.4, aa: 0.3, oh: 0.4, star_eyes: 0.9 },
      awestruck: { surprised: 0.8, happy: 0.5, neutral: 0.2, oh: 0.5 },
      flabbergasted: { surprised: 1.0, angry: 0.2, aa: 0.4, oh: 0.5 },
      dumbfounded: { surprised: 0.9, neutral: 0.4, oh: 0.3 },
      bewildered: { surprised: 0.7, sad: 0.3, neutral: 0.2, oh: 0.2 },
      baffled: { surprised: 0.6, angry: 0.3, neutral: 0.3, ou: 0.2 },
      perplexed: { surprised: 0.5, angry: 0.4, neutral: 0.3, ou: 0.3 },
      puzzled: { surprised: 0.4, angry: 0.3, neutral: 0.4, ou: 0.2 },
      curious: { surprised: 0.5, happy: 0.3, neutral: 0.2, ou: 0.1 },
      intrigued: { surprised: 0.4, happy: 0.4, relaxed: 0.2, ou: 0.2 },
      gasp: { surprised: 1.0, oh: 0.7, aa: 0.3 },

      // ========== CONFIDENCE/PRIDE SPECTRUM (15 variations) ==========
      confident: { happy: 0.4, relaxed: 0.6, neutral: 0.3 },
      self_assured: { happy: 0.3, relaxed: 0.7, neutral: 0.2 },
      proud: { happy: 0.6, relaxed: 0.4, neutral: 0.3 },
      triumphant: { happy: 0.8, surprised: 0.3, relaxed: 0.2 },
      victorious: { happy: 0.9, surprised: 0.4 },
      accomplished: { happy: 0.7, relaxed: 0.5 },
      smug: { happy: 0.3, relaxed: 0.4, neutral: 0.4, smirk: 0.8 },
      cocky: { happy: 0.4, relaxed: 0.3, neutral: 0.5 },
      arrogant: { neutral: 0.6, happy: 0.2, angry: 0.3 },
      haughty: { neutral: 0.7, angry: 0.4, happy: 0.1 },
      superior: { neutral: 0.6, relaxed: 0.4, angry: 0.2 },
      boastful: { happy: 0.5, relaxed: 0.3, surprised: 0.2 },
      cheeky: { happy: 0.6, relaxed: 0.2, surprised: 0.2 },
      sassy: { happy: 0.4, angry: 0.3, relaxed: 0.3 },

      // ========== EMBARRASSMENT/SHAME SPECTRUM (12 variations) ==========
      embarrassed: { sad: 0.4, happy: 0.3, surprised: 0.2, blush: 0.9 },
      ashamed: { sad: 0.7, angry: 0.3, neutral: 0.2 },
      humiliated: { sad: 0.9, angry: 0.4 },
      mortified: { sad: 0.85, surprised: 0.5 },
      sheepish: { sad: 0.3, happy: 0.2, neutral: 0.5 },
      bashful: { sad: 0.2, happy: 0.4, neutral: 0.4, blush: 0.8 },
      shy: { sad: 0.2, happy: 0.3, neutral: 0.5, blush: 1.0 },
      timid: { sad: 0.4, neutral: 0.5, surprised: 0.2 },
      flustered: { surprised: 0.5, sad: 0.3, angry: 0.2, blush: 0.9, sweat: 0.6 },
      self_conscious: { sad: 0.4, neutral: 0.5, surprised: 0.1 },
      guilt: { sad: 0.6, angry: 0.4 },
      remorseful: { sad: 0.8, angry: 0.2 },

      // ========== LOVE/AFFECTION SPECTRUM (12 variations) ==========
      loving: { happy: 0.7, relaxed: 0.6 },
      adoring: { happy: 0.8, relaxed: 0.5, surprised: 0.2 },
      affectionate: { happy: 0.6, relaxed: 0.5 },
      tender: { happy: 0.5, relaxed: 0.7, sad: 0.1 },
      caring: { happy: 0.5, relaxed: 0.6 },
      warm: { happy: 0.6, relaxed: 0.7 },
      fond: { happy: 0.5, relaxed: 0.5 },
      devoted: { happy: 0.6, relaxed: 0.6, sad: 0.2 },
      infatuated: { happy: 0.8, surprised: 0.4, relaxed: 0.3 },
      romantic: { happy: 0.7, relaxed: 0.5, surprised: 0.2 },
      passionate: { happy: 0.6, surprised: 0.5, angry: 0.3 },
      lustful: { happy: 0.5, surprised: 0.4, relaxed: 0.4 },

      // ========== PLAYFULNESS/MISCHIEF SPECTRUM (15 variations) ==========
      playful: { happy: 0.7, relaxed: 0.3, surprised: 0.2 },
      mischievous: { happy: 0.6, surprised: 0.3, neutral: 0.2 },
      impish: { happy: 0.65, surprised: 0.4, relaxed: 0.1 },
      teasing: { happy: 0.5, relaxed: 0.3, neutral: 0.3 },
      joking: { happy: 0.7, relaxed: 0.4 },
      silly: { happy: 0.8, surprised: 0.3 },
      goofy: { happy: 0.85, surprised: 0.4 },
      whimsical: { happy: 0.6, surprised: 0.3, relaxed: 0.4 },
      wink: { happy: 0.4, blinkLeft: 1.0 },
      winkleft: { happy: 0.3, blinkLeft: 1.0 },
      winkright: { happy: 0.3, blinkRight: 1.0 },
      flirty: { happy: 0.6, relaxed: 0.4, surprised: 0.2 },
      coy: { happy: 0.4, sad: 0.2, neutral: 0.5 },
      sly: { neutral: 0.5, happy: 0.3, relaxed: 0.3 },
      cunning: { neutral: 0.6, angry: 0.2, happy: 0.2 },
      devious: { neutral: 0.5, angry: 0.3, happy: 0.3 },
      scheming: { neutral: 0.7, angry: 0.3, surprised: 0.2 },

      // ========== TIREDNESS/RELAXATION SPECTRUM (12 variations) ==========
      exhausted: { relaxed: 0.9, sad: 0.5 },
      drained: { relaxed: 0.8, sad: 0.6 },
      fatigued: { relaxed: 0.7, sad: 0.4, neutral: 0.3 },
      weary: { relaxed: 0.6, sad: 0.5, neutral: 0.2 },
      tired: { relaxed: 0.6, sad: 0.3 },
      sleepy: { relaxed: 0.9, neutral: 0.4 },
      drowsy: { relaxed: 0.85, neutral: 0.5 },
      lethargic: { relaxed: 0.7, neutral: 0.6 },
      sluggish: { relaxed: 0.6, neutral: 0.5, sad: 0.2 },
      lazy: { relaxed: 0.8, neutral: 0.4, happy: 0.2 },
      chill: { relaxed: 0.9, happy: 0.3 },
      calm: { relaxed: 1.0, neutral: 0.3 },

      // ========== BOREDOM/DISINTEREST SPECTRUM (10 variations) ==========
      bored: { neutral: 0.8, relaxed: 0.4, sad: 0.2 },
      uninterested: { neutral: 0.9, relaxed: 0.3 },
      indifferent: { neutral: 1.0, relaxed: 0.2 },
      apathetic: { neutral: 0.95, sad: 0.3 },
      listless: { neutral: 0.7, sad: 0.4, relaxed: 0.3 },
      unamused: { neutral: 0.6, angry: 0.4 },
      unimpressed: { neutral: 0.7, angry: 0.3 },
      underwhelmed: { neutral: 0.6, sad: 0.2, relaxed: 0.3 },
      dismissive: { neutral: 0.5, angry: 0.4, relaxed: 0.2 },
      eye_roll: { neutral: 0.4, angry: 0.5, surprised: 0.2 },

      // ========== CONFUSION/CONTEMPLATION SPECTRUM (12 variations) ==========
      confused: { surprised: 0.5, angry: 0.3, neutral: 0.3 },
      thinking: { neutral: 0.6, angry: 0.2, relaxed: 0.3 },
      pondering: { neutral: 0.7, relaxed: 0.4, surprised: 0.1 },
      contemplating: { neutral: 0.8, relaxed: 0.5 },
      pensive: { sad: 0.3, neutral: 0.6, relaxed: 0.3 },
      reflective: { neutral: 0.7, sad: 0.2, relaxed: 0.4 },
      deep_in_thought: { neutral: 0.9, relaxed: 0.5 },
      concentrating: { angry: 0.4, neutral: 0.6 },
      focused: { angry: 0.3, neutral: 0.7 },
      absorbed: { neutral: 0.8, relaxed: 0.3 },
      engrossed: { neutral: 0.7, surprised: 0.2, relaxed: 0.2 },
      lost_in_thought: { neutral: 0.8, sad: 0.3, relaxed: 0.4 },

      // ========== PHYSICAL DISCOMFORT SPECTRUM (10 variations) ==========
      sick: { sad: 0.7, relaxed: 0.5, neutral: 0.2 },
      ill: { sad: 0.65, relaxed: 0.6 },
      unwell: { sad: 0.6, relaxed: 0.5, neutral: 0.3 },
      nauseous: { sad: 0.7, surprised: 0.3, angry: 0.2 },
      queasy: { sad: 0.6, surprised: 0.4, relaxed: 0.3 },
      pain: { angry: 0.5, sad: 0.6, surprised: 0.3 },
      aching: { sad: 0.5, angry: 0.3, relaxed: 0.4 },
      suffering: { sad: 0.8, angry: 0.4 },
      agonized: { sad: 0.9, angry: 0.6, surprised: 0.3 },
      grimace: { angry: 0.6, sad: 0.3, surprised: 0.4 },

      // ========== AWKWARDNESS/DISCOMFORT SPECTRUM (9 variations) ==========
      awkward: { sad: 0.4, surprised: 0.3, neutral: 0.4 },
      uncomfortable: { sad: 0.3, angry: 0.4, neutral: 0.3 },
      restless: { surprised: 0.4, angry: 0.3, neutral: 0.3 },
      fidgety: { surprised: 0.5, neutral: 0.3, happy: 0.2 },
      antsy: { surprised: 0.5, angry: 0.3, happy: 0.2 },
      edgy: { angry: 0.5, surprised: 0.4, neutral: 0.2 },
      on_edge: { angry: 0.4, surprised: 0.5, sad: 0.2 },
      stressed: { angry: 0.6, sad: 0.4, surprised: 0.3 },
      overwhelmed: { surprised: 0.6, sad: 0.5, angry: 0.3 },

      // ========== MIXED/COMPLEX EMOTIONS (15 variations) ==========
      bittersweet: { happy: 0.5, sad: 0.5 },
      conflicted: { surprised: 0.4, sad: 0.4, angry: 0.3 },
      ambivalent: { neutral: 0.7, surprised: 0.3 },
      nostalgic: { sad: 0.4, happy: 0.4, relaxed: 0.3 },
      wistful: { sad: 0.5, happy: 0.3, relaxed: 0.4 },
      yearning: { sad: 0.6, surprised: 0.3, happy: 0.2 },
      longing: { sad: 0.7, surprised: 0.2, relaxed: 0.3 },
      homesick: { sad: 0.7, relaxed: 0.4 },
      touched: { sad: 0.4, happy: 0.5, surprised: 0.2 },
      moved: { sad: 0.3, happy: 0.6, surprised: 0.3 },
      emotional: { sad: 0.5, happy: 0.4, surprised: 0.3 },
      sentimental: { sad: 0.4, happy: 0.4, relaxed: 0.4 },
      melancholic: { sad: 0.7, relaxed: 0.6 },
      melting: { relaxed: 0.9, sad: 0.4, happy: 0.2 },
      swooning: { happy: 0.6, relaxed: 0.7, surprised: 0.3 },

      // ========== NEUTRAL/EXPRESSIONLESS SPECTRUM (8 variations) ==========
      blank: { neutral: 1.0 },
      empty: { neutral: 0.95, sad: 0.2 },
      numb: { neutral: 0.9, sad: 0.3 },
      detached: { neutral: 0.85, relaxed: 0.4 },
      distant: { neutral: 0.8, sad: 0.3, relaxed: 0.2 },
      spaced_out: { neutral: 0.9, relaxed: 0.5 },
      zoned_out: { neutral: 0.85, relaxed: 0.6 },
      expressionless: { neutral: 1.0 },

      // ========== INTENSITY MODIFIERS (can combine with others) ==========
      slight: { neutral: 0.8 }, // Use for slight variations
      moderate: { neutral: 0.5 },
      intense: { angry: 0.3, surprised: 0.3 },
      extreme: { angry: 0.5, surprised: 0.5 },

      // ========== ALIASES & SHORTCUTS ==========
      deadpan: { neutral: 1.0 },
      serious: { angry: 0.4, neutral: 0.6 },
      determined: { angry: 0.5, neutral: 0.5, surprised: 0.2 },
      resolved: { angry: 0.3, neutral: 0.7 },
      stubborn: { angry: 0.6, neutral: 0.5 },
      defiant: { angry: 0.7, surprised: 0.3 },
      rebellious: { angry: 0.6, happy: 0.3, surprised: 0.2 },

      // ========== NOUN-FORM EMOTION ALIASES ==========
      // The model often emits emotion nouns (matching the animation names). Map
      // them so the FACE matches instead of silently falling back to neutral.
      happiness: { happy: 0.9, ee: 0.12 },
      love: { happy: 0.7, relaxed: 0.6 },
      adoration: { happy: 0.8, relaxed: 0.5, surprised: 0.2 },
      affection: { happy: 0.6, relaxed: 0.5 },
      amusement: { happy: 0.6, surprised: 0.2, ee: 0.1 },
      gratitude: { happy: 0.6, relaxed: 0.4 },
      admiration: { happy: 0.6, surprised: 0.3, relaxed: 0.2 },
      approval: { happy: 0.5, relaxed: 0.4 },
      satisfaction: { happy: 0.4, relaxed: 0.6 },
      excitement: { happy: 0.8, surprised: 0.6, aa: 0.2, ee: 0.15 },
      pride: { happy: 0.6, relaxed: 0.4, neutral: 0.3 },
      relief: { relaxed: 0.7, happy: 0.3 },
      calmness: { relaxed: 1.0, neutral: 0.3 },
      optimism: { happy: 0.6, relaxed: 0.3 },
      interest: { surprised: 0.4, happy: 0.3, relaxed: 0.2 },
      curiosity: { surprised: 0.5, happy: 0.3, neutral: 0.2 },
      confusion: { surprised: 0.5, angry: 0.3, neutral: 0.3 },
      concentration: { angry: 0.4, neutral: 0.6 },
      determination: { angry: 0.5, neutral: 0.5, surprised: 0.2 },
      realization: { surprised: 0.7, happy: 0.2 },
      sadness: { sad: 1.0 },
      disappointment: { sad: 0.6, angry: 0.2 },
      distress: { sad: 0.7, surprised: 0.3, angry: 0.2 },
      fear: { surprised: 0.7, sad: 0.4 },
      anxiety: { surprised: 0.4, sad: 0.5, angry: 0.2 },
      nervousness: { surprised: 0.3, sad: 0.3, neutral: 0.2 },
      awkwardness: { sad: 0.4, surprised: 0.3, neutral: 0.4 },
      embarrassment: { sad: 0.4, happy: 0.3, surprised: 0.2 },
      disgust: { angry: 0.3, sad: 0.6, surprised: 0.2, ih: 0.4 },
      anger: { angry: 1.0 },
      annoyance: { angry: 0.5, neutral: 0.3 },
      boredom: { neutral: 0.8, relaxed: 0.4, sad: 0.2 },
      desire: { happy: 0.5, surprised: 0.4, relaxed: 0.4 },
      remorse: { sad: 0.8, angry: 0.2 },
    }

    this._applyExpressionTarget('neutral')
    this.nextBlinkTime = this._getNextBlinkTime()
  }

  getAvailableAnimations() {
    return []
  }

  getAnimationCatalog() {
    return []
  }

  // Every animation the AI is allowed to trigger: mocap gesture keywords from Speech2Motion
  getTriggerableAnimationNames() {
    if (this.speech2motion && this.speech2motion.enabled) {
      return Object.keys(this.speech2motion.gestureKeywordMap)
    }
    return [
      'spin', 'spin_360', 'rotate', 'twirl',
      'shrug', 'as_you_insist', 'wave', 'greeting', 'hello',
      'clap', 'applause', 'heart_fingers', 'love',
      'hands_on_hips', 'sassy', 'nod', 'approval',
      'shake_head', 'bow', 'thinking', 'thumbs_up',
      'shy', 'jump', 'cry', 'quiet', 'cheering', 'joy'
    ]
  }

  getAnimationRepoBase() {
    return ''
  }

  async loadAnimationFile(file) {
    return null
  }

  async loadAnimationBatch(files, options = {}) {
    return Promise.resolve()
  }

  startBackgroundAnimationLoad(options = {}) {
    return Promise.resolve()
  }

  async initialize(options = {}) {
    const { onProgress } = options
    console.log('AnimationManager: Initializing with Speech2Motion (100% mocap synthesized motion online)...')

    if (!this.speech2motion) {
      this.speech2motion = new Speech2MotionManager(this.vrm, {
        avatarName: 'Ani-default',
        animationManager: this,
        audioManager: typeof window !== 'undefined' ? window.vrmAudioManager : null,
        enabled: true,
      })
    } else {
      this.speech2motion.enabled = true
      if (typeof window !== 'undefined' && window.vrmAudioManager) {
        this.speech2motion.audioManager = window.vrmAudioManager
      }
    }

    onProgress?.({ current: 1, total: 1, name: 'Speech2Motion' })

    // Start infinite continuous human mocap streaming immediately
    await this.speech2motion.startInfiniteMotion()
    console.log('AnimationManager Ready: Speech2Motion infinite streaming motion online')
  }

  async loadClipWithFallback(name, localPath, remoteUrl, isLoop) {
    return null
  }

  clearExpressionCache() {
    this.supportedExpressionTrackCache.clear()
  }

  _getValidExpressionName(name) {
    if (!name || !this.vrm?.expressionManager) return null
    if (this.supportedExpressionTrackCache.has(name)) {
      return this.supportedExpressionTrackCache.get(name)
    }

    const em = this.vrm.expressionManager

    // Helper: checks if expression exists and has at least one active morph/material bind
    const hasBinds = (exp) => {
      if (!exp) return false
      const binds = exp._binds ?? exp.binds
      return Array.isArray(binds) && binds.length > 0
    }

    const lower = typeof name === 'string' ? name.toLowerCase() : name

    // 1. Direct match with active binds
    const directExp = em.getExpression(name)
    if (hasBinds(directExp)) {
      this.supportedExpressionTrackCache.set(name, name)
      return name
    }

    // 2. Case-insensitive / lowercase match with active binds
    const lowerExp = em.getExpression(lower)
    if (hasBinds(lowerExp)) {
      this.supportedExpressionTrackCache.set(name, lower)
      return lower
    }

    // 3. Alias dictionary check: find candidate that exists AND has active binds
    const candidates = EXPRESSION_ALIASES[lower] || EXPRESSION_ALIASES[name]
    if (Array.isArray(candidates)) {
      for (const candidate of candidates) {
        const cExp = em.getExpression(candidate)
        if (hasBinds(cExp)) {
          this.supportedExpressionTrackCache.set(name, candidate)
          return candidate
        }
      }
    } else if (typeof candidates === 'string') {
      const cExp = em.getExpression(candidates)
      if (hasBinds(cExp)) {
        this.supportedExpressionTrackCache.set(name, candidates)
        return candidates
      }
    }

    // 4. Case-insensitive search across all registered expressions with active binds
    const allExpressions = em.expressions || []
    for (const exp of allExpressions) {
      if (exp.expressionName && exp.expressionName.toLowerCase() === lower && hasBinds(exp)) {
        this.supportedExpressionTrackCache.set(name, exp.expressionName)
        return exp.expressionName
      }
    }

    // 5. Fallback: If no candidate with active binds was found, accept registered expression
    if (directExp) {
      this.supportedExpressionTrackCache.set(name, name)
      return name
    }
    if (lowerExp) {
      this.supportedExpressionTrackCache.set(name, lower)
      return lower
    }
    if (Array.isArray(candidates)) {
      for (const candidate of candidates) {
        if (em.getExpression(candidate)) {
          this.supportedExpressionTrackCache.set(name, candidate)
          return candidate
        }
      }
    }
    for (const exp of allExpressions) {
      if (exp.expressionName && exp.expressionName.toLowerCase() === lower) {
        this.supportedExpressionTrackCache.set(name, exp.expressionName)
        return exp.expressionName
      }
    }

    this.supportedExpressionTrackCache.set(name, null)
    return null
  }

  _hasExpressionTrack(name) {
    if (!name || !this.vrm?.expressionManager) return false
    return Boolean(this._getValidExpressionName(name))
  }

  _normalizeExpressionWeights(weights = {}) {
    const normalized = {}

    for (const [key, value] of Object.entries(weights || {})) {
      const numericValue = Number(value)
      if (!Number.isFinite(numericValue) || numericValue <= 0) continue
      const validName = this._getValidExpressionName(key)
      if (!this.coreMoodKeys.includes(key) && !validName) continue
      const targetKey = validName || key
      normalized[targetKey] = THREE.MathUtils.clamp(numericValue, 0, 1)
    }

    if (Object.keys(normalized).length === 0) {
      normalized.neutral = 1
      return normalized
    }

    const coreSum = this.coreMoodKeys.reduce((sum, key) => sum + (normalized[key] || 0), 0)
    if (coreSum > 1.25) {
      const scale = 1.25 / coreSum
      for (const key of this.coreMoodKeys) {
        if (!normalized[key]) continue
        normalized[key] = THREE.MathUtils.clamp(normalized[key] * scale, 0, 1)
      }
    }

    const hasCoreMood = this.coreMoodKeys.some((key) => normalized[key] > 0)
    if (!hasCoreMood) {
      normalized.neutral = Math.max(normalized.neutral || 0, 0.15)
    }

    return normalized
  }

  _resolveExpressionTarget(name) {
    const rawName =
      typeof name === 'string' && name.trim().length > 0 ? name.trim().toLowerCase() : 'neutral'

    let resolvedName = rawName
    let resolvedWeights = null

    // 1. Check expressionMap directly
    let mapped = this.expressionMap[rawName] || this.expressionMap[name]

    // 2. If not found in expressionMap, check if an alias is in expressionMap
    if (!mapped) {
      const candidates = EXPRESSION_ALIASES[rawName] || EXPRESSION_ALIASES[name]
      if (Array.isArray(candidates)) {
        for (const candidate of candidates) {
          if (this.expressionMap[candidate]) {
            mapped = this.expressionMap[candidate]
            break
          }
        }
      }
    }

    if (typeof mapped === 'string') {
      resolvedName = mapped
      if (this._hasExpressionTrack(mapped) || this.coreMoodKeys.includes(mapped)) {
        resolvedWeights = { [mapped]: 1 }
      }
    } else if (mapped && typeof mapped === 'object') {
      resolvedWeights = { ...mapped }
    } else if (this._hasExpressionTrack(rawName) || this._hasExpressionTrack(name)) {
      const validTrack = this._getValidExpressionName(rawName) || this._getValidExpressionName(name) || rawName
      resolvedName = validTrack
      resolvedWeights = { [validTrack]: 1 }
    }

    if (!resolvedWeights) {
      resolvedName = 'neutral'
      resolvedWeights = { neutral: 1 }
    }

    return {
      resolvedName,
      weights: this._normalizeExpressionWeights(resolvedWeights),
    }
  }

  _buildExpressionStyle(weights = {}) {
    const mood = {}
    for (const key of this.coreMoodKeys) {
      mood[key] = THREE.MathUtils.clamp(Number(weights[key] || 0), 0, 1)
    }

    const smile = THREE.MathUtils.clamp(
      mood.happy * 0.65 + mood.relaxed * 0.35 - mood.sad * 0.3 - mood.angry * 0.35,
      0,
      1,
    )
    const frown = THREE.MathUtils.clamp(
      mood.sad * 0.75 + mood.angry * 0.55 - mood.happy * 0.25,
      0,
      1,
    )
    const awe = THREE.MathUtils.clamp(
      mood.surprised * 0.9 + mood.happy * 0.15 + mood.sad * 0.2,
      0,
      1,
    )
    const tension = THREE.MathUtils.clamp(mood.angry * 0.75 + mood.surprised * 0.35, 0, 1)

    const explicitVisemes = {
      aa: Number(weights.aa || 0),
      ee: Number(weights.ee || 0),
      ih: Number(weights.ih || 0),
      oh: Number(weights.oh || 0),
      ou: Number(weights.ou || 0),
    }

    // Default mouth bias is lowered significantly because VRM emotion blendshapes (happy, sad, etc)
    // already shape the mouth. We don't want to stack excessive visemes on top of them unless explicit.
    const mouthBias = {
      aa: Math.max(explicitVisemes.aa, THREE.MathUtils.clamp(awe * 0.05 + tension * 0.02, 0, 0.15)),
      ee: Math.max(explicitVisemes.ee, THREE.MathUtils.clamp(smile * 0.1, 0, 0.15)),
      ih: Math.max(explicitVisemes.ih, THREE.MathUtils.clamp(smile * 0.05 + frown * 0.05 + tension * 0.03, 0, 0.15)),
      oh: Math.max(explicitVisemes.oh, THREE.MathUtils.clamp(awe * 0.1 + mood.sad * 0.05, 0, 0.15)),
      ou: Math.max(explicitVisemes.ou, THREE.MathUtils.clamp(mood.sad * 0.05 + mood.relaxed * 0.05 + awe * 0.05, 0, 0.15)),
    }

    const blinkMinInterval = THREE.MathUtils.clamp(
      2.8 - mood.angry * 0.9 - mood.surprised * 0.8 + mood.relaxed * 1.1 + mood.sad * 0.5,
      1.2,
      5.4,
    )
    const blinkRange = THREE.MathUtils.clamp(
      1.6 + mood.relaxed * 1.4 + mood.sad * 0.6 - mood.angry * 0.3,
      1.2,
      3.8,
    )

    return {
      transitionSpeed: THREE.MathUtils.clamp(
        4.6 + mood.angry * 2.2 + mood.surprised * 1.8 + mood.happy * 0.8 - mood.sad * 0.2,
        4.2,
        8.5,
      ),
      microAmplitude: THREE.MathUtils.clamp(
        0.014 + mood.angry * 0.03 + mood.surprised * 0.026 + mood.happy * 0.015 + mood.sad * 0.02,
        0.01,
        0.08,
      ),
      microFrequency: THREE.MathUtils.clamp(
        1.6 + mood.angry * 1.2 + mood.surprised * 1.0 + mood.relaxed * 0.35,
        1.2,
        3.8,
      ),
      squint: THREE.MathUtils.clamp(
        mood.angry * 0.18 + mood.happy * 0.08 + mood.sad * 0.09 - mood.surprised * 0.15,
        0,
        0.3,
      ),
      blinkMinInterval,
      blinkMaxInterval: blinkMinInterval + blinkRange,
      blinkDuration: THREE.MathUtils.clamp(
        0.11 + mood.sad * 0.03 + mood.relaxed * 0.02 - mood.surprised * 0.02,
        0.08,
        0.18,
      ),
      mouthBias,
      mouthInfluenceWhileSpeaking: 0.18,
    }
  }

  _getNextBlinkTime() {
    const min = this.expressionStyle?.blinkMinInterval ?? 2
    const max = this.expressionStyle?.blinkMaxInterval ?? 5
    const safeMax = Math.max(min + 0.05, max)
    return min + Math.random() * (safeMax - min)
  }

  _applyExpressionTarget(name) {
    const resolved = this._resolveExpressionTarget(name)
    this.currentExpression = resolved.resolvedName
    this.targetExpression = resolved.resolvedName
    this.targetExpressionWeights = resolved.weights
    this.expressionStyle = this._buildExpressionStyle(this.targetExpressionWeights)
    this.blinkDuration = this.expressionStyle.blinkDuration
    this.nextBlinkTime = this._getNextBlinkTime()
    return resolved
  }

  setExpression(name, duration = 3.0) {
    const winkNames = ['wink', 'wink2', 'wink2_right', 'tehepero', 'てへぺろ', 'ウィンク', 'ウィンク２', 'ウィンク２右']
    const isWink = winkNames.includes(String(name || '').toLowerCase().trim())
    // Playful winks and tehepero expressions should be brief accents (~0.75s) so the eye never looks stuck shut
    const effectiveDuration = isWink ? Math.min(duration, 0.75) : duration

    const resolved = this._applyExpressionTarget(name)

    console.log(`Face: ${name} => ${resolved.resolvedName}`, resolved.weights, `(${effectiveDuration}s)`)

    this.targetExpression = resolved.resolvedName
    this.currentEmotion = name

    // Trigger full body mocap emotion posture only for genuine whole-body emotions,
    // and NEVER interrupt an active action gesture (like 360 spin or dance)
    const wholeBodyEmotions = [
      'shy', 'blush', 'sad', 'tears', 'angry', 'mad', 'happy', 'joy',
      'surprised', 'thinking', 'curious', 'bored', 'nervous', 'relief',
      'sassy', 'smug', 'tsundere', 'confident', 'pride', 'flustered', 'love', 'heart'
    ]
    const isWholeBodyEmotion = wholeBodyEmotions.includes(String(name || '').toLowerCase().trim())

    const hasActionGesture = Boolean(
      this.speech2motion?.isActionGestureActive ||
      this.speech2motion?.isFetchingActionGesture ||
      this.speech2motion?.currentTrack?.isActionGesture
    )

    if (this.speech2motion && this.speech2motion.enabled && !hasActionGesture) {
      if (isWholeBodyEmotion) {
        if (!this.speech2motion.isSpeechActive) {
          this.speech2motion.triggerEmotion(name)
        } else {
          this.speech2motion.currentEmotion = name
        }
      }
    }

    if (this.expressionTimer) clearTimeout(this.expressionTimer)
    if (effectiveDuration > 0) {
      this.expressionTimer = setTimeout(() => {
        this._applyExpressionTarget('neutral')
        this.currentEmotion = 'idle'
        if (this.speech2motion && !this.speech2motion.isSpeechActive && !this.speech2motion.isActionGestureActive) {
          this.speech2motion.triggerEmotion('idle')
        }
      }, effectiveDuration * 1000)
    }
  }

  setSpeakingState(isSpeaking) {
    this.isSpeaking = isSpeaking
    if (!isSpeaking) {
      this.speechIntensity = 0
      this.speechCadence = 0
      this.speechCadencePhase = 0
      this.speechTextCursor = ''
      this.speechPendingWord = ''
      this.speechBeatQueue = 0
      this.speechBeatProgress = 0
      this.speechBeatOpen = 0
      Object.keys(this.speechTarget).forEach((key) => {
        this.speechTarget[key] = 0
      })
    } else if (this.vrm?.expressionManager) {
      // Instantly clear mouth-closing / distorting morphs so lip-sync opens with zero latency
      const em = this.vrm.expressionManager
      const mouthClosingKeys = [
        'smirk', 'smile', 'cat_mouth', 'tongue', 'tehepero', 'mouth_close', 'serious', 'laugh',
        'にやり', 'にやり２', 'にっこり', 'ω', 'ん', 'てへぺろ', 'ぺろっ', '真面目', '口横狭め'
      ]
      for (const k of mouthClosingKeys) {
        if (em.getExpression(k)) {
          try {
            em.setValue(k, 0)
          } catch (e) {}
        }
      }
      em.update()
    }
    // We rely on isSpeaking flag to unlock mouth blendshapes for Audio2Face / AudioAnalyzer.
  }

  setSpeechIntensity(value = 0) {
    if (value && typeof value === 'object') {
      const intensity = THREE.MathUtils.clamp(
        Number.isFinite(Number(value.intensity)) ? Number(value.intensity) : 0,
        0,
        1,
      )

      this.speechIntensity = intensity
      this.speechTarget.intensity = intensity
      this.speechTarget.activity = THREE.MathUtils.clamp(
        Number.isFinite(Number(value.activity)) ? Number(value.activity) : intensity,
        0,
        1,
      )
      this.speechTarget.pulse = THREE.MathUtils.clamp(
        Number.isFinite(Number(value.pulse)) ? Number(value.pulse) : this.speechTarget.activity,
        0,
        1,
      )
      this.speechTarget.openness = THREE.MathUtils.clamp(
        Number.isFinite(Number(value.openness)) ? Number(value.openness) : intensity,
        0,
        1,
      )
      this.speechTarget.wide = THREE.MathUtils.clamp(
        Number.isFinite(Number(value.wide)) ? Number(value.wide) : 0,
        0,
        1,
      )
      this.speechTarget.round = THREE.MathUtils.clamp(
        Number.isFinite(Number(value.round)) ? Number(value.round) : 0,
        0,
        1,
      )
      this.speechTarget.narrow = THREE.MathUtils.clamp(
        Number.isFinite(Number(value.narrow)) ? Number(value.narrow) : 0,
        0,
        1,
      )

      const visemes = value.visemes && typeof value.visemes === 'object' ? value.visemes : {}
      for (const key of this.mouthKeys) {
        this.speechTarget[key] = THREE.MathUtils.clamp(
          Number.isFinite(Number(visemes[key])) ? Number(visemes[key]) : 0,
          0,
          1,
        )
      }
      return
    }

    const normalized = THREE.MathUtils.clamp(
      Number.isFinite(Number(value)) ? Number(value) : 0,
      0,
      1,
    )
    this.speechIntensity = normalized
    this.speechTarget.intensity = normalized
    this.speechTarget.activity = normalized
    this.speechTarget.pulse = normalized * 0.45
    this.speechTarget.openness = normalized
    this.speechTarget.wide = normalized * 0.18
    this.speechTarget.round = normalized * 0.28
    this.speechTarget.narrow = normalized * 0.12
    this.speechTarget.aa = normalized * 0.35
    this.speechTarget.ee = normalized * 0.28
    this.speechTarget.ih = normalized * 0.25
    this.speechTarget.oh = normalized * 0.22
    this.speechTarget.ou = normalized * 0.16
  }

  _estimateSyllables(word = '') {
    const cleaned = String(word || '')
      .toLowerCase()
      .replace(/[^a-z]/g, '')
    if (!cleaned) return 0
    if (cleaned.length <= 3) return 1

    const sanitized = cleaned.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '')
    const groups = sanitized.match(/[aeiouy]{1,2}/g)
    return Math.max(groups ? groups.length : 0, 1)
  }

  _estimateSpeechBeats(text = '') {
    const words = String(text || '')
      .toLowerCase()
      .match(/[a-z']+/g)

    if (!words?.length) return 0

    return words.reduce((count, word) => count + this._estimateSyllables(word), 0)
  }

  setSpeechTranscript(text = '', isFinal = false) {
    const normalized = typeof text === 'string' ? text : ''
    if (!normalized) {
      if (isFinal) {
        this.speechTextCursor = ''
        this.speechPendingWord = ''
      }
      return
    }

    let appended = normalized
    if (this.speechTextCursor && normalized.startsWith(this.speechTextCursor)) {
      appended = normalized.slice(this.speechTextCursor.length)
    } else if (this.speechTextCursor) {
      appended = normalized.replace(this.speechTextCursor, '')
    }

    const combined = `${this.speechPendingWord}${appended}`
    let completeChunk = combined
    let pendingWord = ''

    if (!isFinal) {
      const trailingWordMatch = combined.match(/[a-z']+$/i)
      if (trailingWordMatch) {
        pendingWord = trailingWordMatch[0]
        completeChunk = combined.slice(0, -pendingWord.length)
      }
    }

    let beatCount = this._estimateSpeechBeats(completeChunk)
    if (isFinal && pendingWord) {
      beatCount += this._estimateSpeechBeats(pendingWord)
      pendingWord = ''
    }

    if (beatCount > 0) {
      this.speechBeatQueue = Math.min(this.speechBeatQueue + beatCount, 24)
    }

    this.speechPendingWord = pendingWord
    this.speechTextCursor = normalized
    if (isFinal) {
      this.speechTextCursor = ''
      this.speechPendingWord = ''
    }
  }

  _updateSpeechBeat(delta, activity, pulse) {
    if (!this.isSpeaking) {
      this.speechBeatQueue = 0
      this.speechBeatProgress = 0
      this.speechBeatOpen = THREE.MathUtils.lerp(
        this.speechBeatOpen,
        0,
        THREE.MathUtils.clamp(delta * 10, 0, 1),
      )
      return this.speechBeatOpen
    }

    if (this.speechBeatQueue > 0) {
      const beatRate = THREE.MathUtils.clamp(
        4.2 + activity * 2.2 + pulse * 1.6 + Math.min(this.speechBeatQueue, 6) * 0.35,
        4.2,
        8.4,
      )
      this.speechBeatProgress += delta * beatRate

      const completedBeats = Math.floor(this.speechBeatProgress)
      if (completedBeats > 0) {
        this.speechBeatQueue = Math.max(0, this.speechBeatQueue - completedBeats)
        this.speechBeatProgress -= completedBeats
      }

      const beatShape = Math.sin(this.speechBeatProgress * Math.PI)
      const beatAccent = THREE.MathUtils.clamp(0.58 + pulse * 0.24 + activity * 0.1, 0.5, 0.94)
      this.speechBeatOpen = THREE.MathUtils.lerp(
        this.speechBeatOpen,
        beatShape * beatAccent,
        THREE.MathUtils.clamp(delta * 18, 0, 1),
      )
      return this.speechBeatOpen
    }

    const fallbackPulse = THREE.MathUtils.clamp(pulse * 0.45 + activity * 0.14, 0, 0.36)
    this.speechBeatOpen = THREE.MathUtils.lerp(
      this.speechBeatOpen,
      fallbackPulse,
      THREE.MathUtils.clamp(delta * 8, 0, 1),
    )
    return this.speechBeatOpen
  }

  _syncSpeechState(delta) {
    const attack = THREE.MathUtils.clamp(delta * 24, 0, 1)
    const release = THREE.MathUtils.clamp(delta * 12, 0, 1)

    for (const key in this.speechState) {
      if (Object.prototype.hasOwnProperty.call(this.speechState, key)) {
        const current = this.speechState[key] || 0
        const target = this.isSpeaking ? this.speechTarget[key] || 0 : 0
        const factor = target > current ? attack : release
        this.speechState[key] = THREE.MathUtils.lerp(current, target, factor)
      }
    }
  }

  update(delta) {
    const isSpeech2MotionActive = this.speech2motion && this.speech2motion.enabled

    if (isSpeech2MotionActive) {
      this.speech2motion.update(delta)
    } else {
      if (this.vrm && this.vrm.humanoid) {
        // Reset rotations of bones that we procedurally animate to prevent accumulated rotation drift
        const proceduralBones = ['spine', 'chest', 'hips', 'head', 'neck', 'leftShoulder', 'rightShoulder']
        proceduralBones.forEach((boneName) => {
          const bone = this.vrm.humanoid.getNormalizedBoneNode(boneName)
          if (bone) {
            bone.rotation.set(0, 0, 0)
          }
        })
      }

      // Drive crossfades + early idle-return before the mixer samples poses
      this._checkAutoReturn()
      this._updateTransition(delta)

      if (this.mixer) this.mixer.update(delta)
    }

    if (this.vrm) {
      // Procedural breathing, head sway, speaking nods, and emotional posture ONLY for fallback mixer mode
      if (this.vrm.humanoid && !isSpeech2MotionActive) {
        if (this._breathTimer === undefined) this._breathTimer = 0
        if (this._swayTimer === undefined) this._swayTimer = 0
        if (this._speechNodTimer === undefined) this._speechNodTimer = 0

        // Breathing rate smoothly adapts: slightly faster & more dynamic when talking
        const breathSpeed = this.isSpeaking ? 2.2 : 1.4
        this._breathTimer += delta * breathSpeed
        this._swayTimer += delta

        // Conversational head nods & subtle tilts when speaking
        const head = this.vrm.humanoid.getNormalizedBoneNode('head')
        if (head && this.isSpeaking) {
          this._speechNodTimer += delta * 3.4
          // Syllable rhythm nod: dynamic emphasis pulse
          const speechNod = Math.sin(this._speechNodTimer) * 0.016 * (0.6 + Math.sin(this._speechNodTimer * 0.4) * 0.4)
          const speechTilt = Math.cos(this._speechNodTimer * 0.55) * 0.010
          head.rotation.x += speechNod
          head.rotation.z += speechTilt
        }

        // 4. Dynamic emotional posture adjustments
        if (this.vrm.expressionManager) {
          const happy = this.vrm.expressionManager.getValue('happy') || 0
          const sad = this.vrm.expressionManager.getValue('sad') || 0
          const angry = this.vrm.expressionManager.getValue('angry') || 0
          const surprised = this.vrm.expressionManager.getValue('surprised') || 0

          const leftShoulder = this.vrm.humanoid.getNormalizedBoneNode('leftShoulder')
          const rightShoulder = this.vrm.humanoid.getNormalizedBoneNode('rightShoulder')
          if (leftShoulder && rightShoulder) {
            const shrugZ = (angry * 0.07) + (surprised * 0.08) - (sad * 0.06)
            leftShoulder.rotation.z += shrugZ
            rightShoulder.rotation.z -= shrugZ

            const shrugY = angry * 0.035
            leftShoulder.rotation.y += shrugY
            rightShoulder.rotation.y -= shrugY
          }

          const neck = this.vrm.humanoid.getNormalizedBoneNode('neck')
          if (neck) {
            const pitch = (sad * 0.07) + (angry * 0.05) - (surprised * 0.07) - (happy * 0.04)
            neck.rotation.x += pitch
          }
        }
      }

      if (this.vrm.expressionManager) {
        this.updateBlink(delta)
        this.updateExpressions(delta)
      }

      // LookAt implementation - eyes track camera with smooth ocular micro-saccades
      if (this.vrm.lookAt && this.camera) {
        if (!this._lookAtTarget) {
          this._lookAtTarget = new THREE.Object3D()
          this.camera.add(this._lookAtTarget)
        }

        if (this._saccadeTimer === undefined) this._saccadeTimer = 0
        if (this._saccadeOffset === undefined) this._saccadeOffset = new THREE.Vector3()
        if (this._saccadeTargetOffset === undefined) this._saccadeTargetOffset = new THREE.Vector3()

        this._saccadeTimer -= delta
        if (this._saccadeTimer <= 0) {
          this._saccadeTimer = 3.5 + Math.random() * 3.5
          if (!this.isSpeaking && Math.random() < 0.50) {
            this._saccadeTargetOffset.set(
              (Math.random() - 0.5) * 0.016,
              (Math.random() - 0.5) * 0.012,
              0
            )
          } else {
            this._saccadeTargetOffset.set(0, 0, 0)
          }
        }

        // Smooth ocular micro-saccade interpolation (eliminates sharp snapping)
        this._saccadeOffset.lerp(this._saccadeTargetOffset, Math.min(1.0, delta * 5.0))

        let gazeX = 0
        let gazeY = 0
        if (isSpeech2MotionActive) {
          const yaw = this.speech2motion._currentHeadYaw || 0
          const pitch = this.speech2motion._currentHeadPitch || 0
          // Subtle eye lead accompanying head glances (calibrated to prevent socket straining)
          gazeX = yaw * 0.20
          gazeY = -pitch * 0.20
        }

        this._lookAtTarget.position.set(
          this._saccadeOffset.x + gazeX,
          this._saccadeOffset.y + gazeY,
          this._saccadeOffset.z
        )
        this._lookAtTarget.updateMatrixWorld(true)
        this.vrm.lookAt.target = this._lookAtTarget
        this.vrm.lookAt.update(delta)
      }
    }
  }

  updateBlink(delta) {
    this.blinkTimer += delta
    if (this.blinkTimer >= this.nextBlinkTime) {
      this.isBlinking = true
      this.blinkTimer = 0
      this.nextBlinkTime = this._getNextBlinkTime()
    }

    if (this.isBlinking) {
      this.blinkProgress += delta
      if (this.blinkProgress >= this.blinkDuration) {
        this.isBlinking = false
        this.blinkProgress = 0

        // Double blink doublet logic: ~20% probability to trigger another blink immediately
        if (Math.random() < 0.20 && !this._isDoubleBlinking) {
          this._isDoubleBlinking = true
          this.blinkTimer = this.nextBlinkTime - (0.08 + Math.random() * 0.12)
        } else {
          this._isDoubleBlinking = false
        }
      }
    }
  }

  updateExpressions(delta) {
    const manager = this.vrm.expressionManager
    const speed = this.expressionStyle.transitionSpeed * delta

    // 1. Blink
    let blinkValue = 0
    if (this.isBlinking) {
      const t = Math.PI * (this.blinkProgress / this.blinkDuration)
      blinkValue = Math.sin(t)
    }

    // 2. Micro-Expressions (subtle organic facial micro-pulsing)
    this.microTimer += delta
    const baseFreq = this.expressionStyle.microFrequency
    this.microIntensity = (
      Math.sin(this.microTimer * baseFreq) +
      0.45 * Math.sin(this.microTimer * baseFreq * 2.3) +
      0.25 * Math.cos(this.microTimer * baseFreq * 4.7)
    ) * (this.expressionStyle.microAmplitude / 1.7)

    // 3. Moods
    const targetWeights = this.targetExpressionWeights || { neutral: 1 }
    const keysToUpdate = this._tempKeysToUpdate
    keysToUpdate.clear()

    for (let i = 0; i < this.coreMoodKeys.length; i++) {
      keysToUpdate.add(this.coreMoodKeys[i])
    }
    for (const key of this.activeExpressionKeys) {
      keysToUpdate.add(key)
    }
    for (const key in targetWeights) {
      if (Object.prototype.hasOwnProperty.call(targetWeights, key)) {
        keysToUpdate.add(key)
      }
    }

    const nextActiveKeys = this._tempNextActiveKeys
    nextActiveKeys.clear()
    for (let i = 0; i < this.coreMoodKeys.length; i++) {
      nextActiveKeys.add(this.coreMoodKeys[i])
    }

    keysToUpdate.forEach((key) => {
      const validKey = this._getValidExpressionName(key) || (this.coreMoodKeys.includes(key) ? key : null)
      if (!validKey) return

      // When speaking, phonemes/vowels, corner lift, and horizontal mouth width are exclusively driven by Audio2Face / AudioManager
      const speechVisemeKeys = ['aa', 'ee', 'ih', 'oh', 'ou', '口横広げ', '口横狭め', '口角上げ', 'あ', 'い', 'う', 'え', 'お', 'ワ', 'あ２', 'い１', 'い２']
      if (this.isSpeaking && speechVisemeKeys.includes(validKey)) {
        return
      }

      const currentVal = manager.getValue(validKey) || 0
      let baseTarget = targetWeights[key] ?? targetWeights[validKey] ?? 0.0

      // Suppress mouth-closing/distorting shapes during speech so the jaw and lips can move freely
      const mouthClosingKeys = [
        'smirk', 'smile', 'cat_mouth', 'tongue', 'tehepero', 'mouth_close', 'serious', 'laugh',
        'にやり', 'にやり２', 'にっこり', 'ω', 'ん', 'てへぺろ', 'ぺろっ', '真面目'
      ]
      if (this.isSpeaking && mouthClosingKeys.includes(validKey)) {
        baseTarget = 0.0
      } else if (this.isSpeaking && validKey === 'happy') {
        baseTarget *= 0.35 // Attenuate happy mouth corners (笑い, にこり) so jaw opening is unobstructed
      } else if (this.isSpeaking && this.coreMoodKeys.includes(validKey)) {
        baseTarget *= 0.65 // Duck core emotions slightly when speaking
      } else if (baseTarget > 0.05) {
        baseTarget += this.microIntensity * Math.min(1, baseTarget + 0.2)
      }
      baseTarget = THREE.MathUtils.clamp(baseTarget, 0, 1)

      const newVal = THREE.MathUtils.lerp(currentVal, baseTarget, speed)
      manager.setValue(validKey, newVal < 0.01 ? 0 : newVal)
      if (newVal >= 0.01 || baseTarget >= 0.01) {
        nextActiveKeys.add(validKey)
      }
    })

    this.activeExpressionKeys.clear()
    for (const key of nextActiveKeys) {
      this.activeExpressionKeys.add(key)
    }

    const squintTarget = THREE.MathUtils.clamp(
      this.expressionStyle.squint + Math.max(0, this.microIntensity * 0.2),
      0,
      0.35,
    )

    const currentTargetWeights = this.targetExpressionWeights || {}
    const explicitBlinkLeft = currentTargetWeights.blinkLeft || 0
    const explicitBlinkRight = currentTargetWeights.blinkRight || 0
    const explicitBlink = currentTargetWeights.blink || 0

    const leftVal = Math.max(blinkValue, squintTarget, explicitBlinkLeft, explicitBlink)
    const rightVal = Math.max(blinkValue, squintTarget, explicitBlinkRight, explicitBlink)

    if (this._hasExpressionTrack('blinkLeft') && this._hasExpressionTrack('blinkRight')) {
      manager.setValue('blinkLeft', leftVal)
      manager.setValue('blinkRight', rightVal)
      manager.setValue('blink', 0)
    } else {
      manager.setValue('blink', Math.max(leftVal, rightVal))
    }

    // 4. Mouth Movement Control: If not speaking, smoothly return mouth bias to target
    if (!this.isSpeaking) {
      for (const key of this.mouthKeys) {
        if (!this._hasExpressionTrack(key)) continue
        const currentVal = manager.getValue(key) || 0
        const emotionTarget = (this.expressionStyle.mouthBias[key] || 0) + Math.max(0, this.microIntensity * 0.25)
        const newVal = THREE.MathUtils.lerp(currentVal, emotionTarget, speed * 0.9)
        manager.setValue(key, newVal < 0.01 ? 0 : newVal)
      }
    }

    manager.update()
  }

  triggerNamedAnimation(name) {
    if (typeof name !== 'string' || !name.trim()) return
    const rawName = name.trim()
    const lowerName = rawName.toLowerCase().replace(/[\s-]+/g, '_')

    if (this.speech2motion && this.speech2motion.enabled) {
      return this.speech2motion.triggerGesture(lowerName)
    }

    // Alias dictionary mapping synonyms/variations to official catalog names
    const aliasMap = {
      wave: 'wave',
      waving: 'wave',
      hello: 'greeting',
      hi: 'greeting',
      greeting: 'greeting',
      greet: 'greeting',
      joy: 'joy',
      happy: 'joy',
      nod: 'nod',
      yes: 'nod',
      agree: 'nod',
      approval: 'approval',
      shake: 'shake_head',
      shakehead: 'shake_head',
      shake_head: 'shake_head',
      no: 'shake_head',
      disagree: 'shake_head',
      think: 'thinking',
      thinking: 'thinking',
      ponder: 'thinking',
      cheer: 'cheering',
      cheering: 'cheering',
      yay: 'cheering',
      laugh: 'laugh',
      laughing: 'laugh',
      haha: 'laugh',
      clap: 'clap',
      clapping: 'clap',
      applause: 'clap',
      thumbsup: 'thumbs_up',
      thumbs_up: 'thumbs_up',
      thumb_up: 'thumbs_up',
      shrug: 'shrug',
      shrugging: 'shrug',
      pointing: 'pointing',
      point: 'pointing',
      salute: 'salute',
      angry: 'angry',
      backflip: 'backflip',
      acknowledging: 'acknowledging',
      acknowledge: 'acknowledging',
      blowkiss: 'blow_kiss',
      blow_kiss: 'blow_kiss',
      kiss: 'blow_kiss',
      bored: 'bored',
      lookingaround: 'looking_around',
      looking_around: 'looking_around',
      look_around: 'looking_around',
      cutthroat: 'cutthroat',
      gangnamstyle: 'gangnam_style',
      gangnam_style: 'gangnam_style',
      sleeping: 'sleeping',
      sleep: 'sleeping',
      dance: 'dance',
      hiphop: 'dance',
      macarena: 'Macarena_dance',
      macarena_dance: 'Macarena_dance',
      love: 'love',
      gratitude: 'gratitude',
      thank: 'gratitude',
      thanks: 'gratitude',
      admiration: 'admiration',
      amusement: 'amusement',
      excitement: 'excitement',
      excited: 'excitement',
      surprise: 'surprise',
      surprised: 'surprise',
      curiosity: 'curiosity',
      curious: 'curiosity',
      confusion: 'confusion',
      confused: 'confusion',
      pride: 'pride',
      proud: 'pride',
      relief: 'relief',
      relieved: 'relief',
      sad: 'sadness',
      sadness: 'sadness',
      grief: 'grief',
      fear: 'fear',
      scared: 'fear',
      disgust: 'disgust',
      embarrassment: 'embarrassment',
      embarrassed: 'embarrassment',
      nervous: 'nervous',
      disappointment: 'disappointment',
      disappointed: 'disappointment',
      realization: 'realization',
      pat: 'pat',
      dab: 'dab',
      bow: 'bow',
      facepalm: 'facepalm',
      explaining: 'explaining',
      explain: 'explaining',
      hands_on_hips: 'hands_on_hips',
      handsonhips: 'hands_on_hips',
      sassy: 'hands_on_hips',
      heart: 'heart_fingers',
      heart_fingers: 'heart_fingers',
      shy: 'shy',
      taunt: 'taunt',
      idle: this.mainIdle,
      neutral: this.mainIdle,
      neutralidle: this.mainIdle,
      neutral_idle: this.mainIdle,
      happyidle: this.mainIdle,
      happy_idle: this.mainIdle,
    }

    const resolvedName = aliasMap[lowerName] || aliasMap[rawName] || rawName

    if (resolvedName === this.mainIdle || resolvedName.toLowerCase().includes('idle')) {
      if (this.actions[this.mainIdle]) {
        this.play(this.mainIdle, { fade: this.fadeTimings.idleReturn })
      }
      return
    }

    // 1. Play if already loaded in this.actions
    if (this.actions[resolvedName]) {
      this.play(resolvedName, { fade: this.fadeTimings.gestureIn })
      return
    }

    const matchKey = Object.keys(this.actions).find((k) => k.toLowerCase() === resolvedName.toLowerCase())
    if (matchKey) {
      this.play(matchKey, { fade: this.fadeTimings.gestureIn })
      return
    }

    // 2. On-demand load if in animation catalog
    const catalogFile = this.getAnimationCatalog().find(
      (f) => f.name.toLowerCase() === resolvedName.toLowerCase() || f.name.toLowerCase() === lowerName
    )
    if (catalogFile) {
      this.loadAnimationFile(catalogFile).then(() => {
        if (this.actions[catalogFile.name]) {
          this.play(catalogFile.name, { fade: this.fadeTimings.gestureIn })
        }
      }).catch((err) => console.warn(`Failed to lazy-load animation '${resolvedName}':`, err))
      return
    }

    console.warn(`[AnimationManager] Animation '${rawName}' not found in catalog or active clips.`)
  }

  onAnimationFinished(e) {
    const clipName = e.action.getClip().name
    const isLoopOnce = e.action.loop === THREE.LoopOnce

    // Safety net: _checkAutoReturn normally hands control back to idle before a
    // clip ends. This only fires for very short clips or anything that slipped
    // through, and never for the idle itself or pose-holding clips.
    if (isLoopOnce && clipName !== this.mainIdle && !this.holdPoseClips.has(clipName)) {
      if (this.activeAction !== this.actions[this.mainIdle]) {
        this.play(this.mainIdle, { fade: this.fadeTimings.idleReturn })
      }
    }
  }

  async loadClip(name, url, isLoop) {
    let arrayBuffer
    let fromCache = false

    // 1. Try Cache
    const cached = await cacheManager.getCached('animations', url)
    if (cached) {
      arrayBuffer = cached
      fromCache = true
    } else {
      // 2. Fetch
      const response = await fetch(url)
      if (!response.ok) throw new Error(`Failed to fetch ${url}`)
      arrayBuffer = await response.arrayBuffer()
    }

    // 4. Parse — Mixamo FBX is retargeted on the fly; .vrma uses the VRM plugin.
    try {
      const clip = /\.fbx(\?|#|$)/i.test(url)
        ? await this._retargetMixamoClip(arrayBuffer, name)
        : await this._parseVrmaClip(arrayBuffer, url)

      if (!fromCache) {
        cacheManager
          .setCached('animations', url, arrayBuffer)
          .catch((e) => console.warn('Anim cache failed', e))
      }

      return this._registerClip(name, clip, isLoop, url)
    } catch (parseErr) {
      if (fromCache) {
        // Cached buffer was outdated or corrupt — evict from cache and refetch fresh
        await cacheManager.deleteCached('animations', url).catch(() => {})
        const freshResponse = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now())
        if (!freshResponse.ok) throw parseErr
        const freshBuffer = await freshResponse.arrayBuffer()
        const clip = /\.fbx(\?|#|$)/i.test(url)
          ? await this._retargetMixamoClip(freshBuffer, name)
          : await this._parseVrmaClip(freshBuffer, url)
        cacheManager
          .setCached('animations', url, freshBuffer)
          .catch((e) => console.warn('Anim cache failed', e))
        return this._registerClip(name, clip, isLoop, url)
      }
      throw parseErr
    }
  }

  _parseVrmaClip(arrayBuffer, url) {
    return new Promise((resolve, reject) => {
      this.loader.parse(
        arrayBuffer,
        url,
        (gltf) => {
          let clip = null
          if (gltf.userData.vrmAnimations && gltf.userData.vrmAnimations.length > 0) {
            clip = createVRMAnimationClip(gltf.userData.vrmAnimations[0], this.vrm)
          } else if (gltf.animations && gltf.animations.length > 0) {
            clip = createVRMAnimationClip(gltf.animations[0], this.vrm)
          }
          resolve(clip)
        },
        (err) => reject(err),
      )
    })
  }

  async _getFbxLoader() {
    if (!this._fbxLoader) {
      // Lazy-loaded so FBXLoader (~100KB) only ships when a Mixamo clip is used.
      const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js')
      this._fbxLoader = new FBXLoader()
    }
    return this._fbxLoader
  }

  // Retarget a Mixamo FBX animation onto the current VRM's normalized humanoid
  // skeleton. Ported from the official @pixiv/three-vrm Mixamo example so the
  // bone orientation + VRM0 mirroring math matches a known-good reference.
  async _retargetMixamoClip(arrayBuffer, name) {
    if (!this.vrm?.humanoid) return null
    const loader = await this._getFbxLoader()
    const asset = loader.parse(arrayBuffer, '')

    const sourceClip =
      THREE.AnimationClip.findByName(asset.animations, 'mixamo.com') || asset.animations?.[0]
    if (!sourceClip) {
      console.warn(`⚠️ No animation track found in FBX: ${name}`)
      return null
    }

    const tracks = []
    const restRotationInverse = new THREE.Quaternion()
    const parentRestWorldRotation = new THREE.Quaternion()
    const _quat = new THREE.Quaternion()
    const _vec = new THREE.Vector3()

    // Scale the hips translation so the motion fits this VRM's proportions.
    const motionHips = asset.getObjectByName('mixamorigHips')
    const motionHipsHeight = motionHips ? motionHips.position.y : 1
    const vrmHips = this.vrm.humanoid.getNormalizedBoneNode('hips')
    const vrmHipsY = vrmHips ? vrmHips.getWorldPosition(_vec).y : 1
    const vrmRootY = this.vrm.scene.getWorldPosition(_vec).y
    const vrmHipsHeight = Math.abs(vrmHipsY - vrmRootY)
    const hipsPositionScale = motionHipsHeight ? vrmHipsHeight / motionHipsHeight : 1

    const isVrm0 = this.vrm.meta?.metaVersion === '0'

    sourceClip.tracks.forEach((track) => {
      const [rigName, propertyName] = track.name.split('.')
      const vrmBoneName = MIXAMO_VRM_RIG_MAP[rigName]
      const vrmNode = vrmBoneName ? this.vrm.humanoid.getNormalizedBoneNode(vrmBoneName) : null
      const rigNode = asset.getObjectByName(rigName)
      if (!vrmNode || !rigNode) return
      const vrmNodeName = vrmNode.name

      rigNode.getWorldQuaternion(restRotationInverse).invert()
      if (rigNode.parent) rigNode.parent.getWorldQuaternion(parentRestWorldRotation)
      else parentRestWorldRotation.identity()

      if (track instanceof THREE.QuaternionKeyframeTrack) {
        const values = Array.from(track.values)
        for (let i = 0; i < values.length; i += 4) {
          _quat.fromArray(values, i)
          _quat.premultiply(parentRestWorldRotation).multiply(restRotationInverse)
          _quat.toArray(values, i)
          if (isVrm0) {
            values[i] = -values[i] // mirror X
            values[i + 2] = -values[i + 2] // mirror Z
          }
        }
        tracks.push(
          new THREE.QuaternionKeyframeTrack(
            `${vrmNodeName}.${propertyName}`,
            Array.from(track.times),
            values,
          ),
        )
      } else if (track instanceof THREE.VectorKeyframeTrack) {
        const values = Array.from(track.values).map((v, i) => {
          const mirror = isVrm0 && i % 3 !== 1 ? -1 : 1
          return mirror * v * hipsPositionScale
        })
        tracks.push(
          new THREE.VectorKeyframeTrack(
            `${vrmNodeName}.${propertyName}`,
            Array.from(track.times),
            values,
          ),
        )
      }
    })

    return new THREE.AnimationClip(name, sourceClip.duration, tracks)
  }

  _optimizeIdleClip(rawClip) {
    if (!rawClip || !rawClip.tracks || rawClip.tracks.length === 0) return rawClip

    // Natural arm spacing without outward abduction (decreased to 0.0 for natural hand positioning)
    const leftSpreadQuat = new THREE.Quaternion().identity()
    const rightSpreadQuat = new THREE.Quaternion().identity()

    const q0 = new THREE.Quaternion()
    const qK = new THREE.Quaternion()
    const qOut = new THREE.Quaternion()
    const euler = new THREE.Euler(0, 0, 0, 'YXZ')

    const newTracks = []

    for (const track of rawClip.tracks) {
      const times = new Float32Array(track.times)
      const values = new Float32Array(track.values)
      const numFrames = times.length
      const stride = values.length / numFrames
      const isQuat = stride === 4
      const name = track.name

      // 1. Arm outward abduction to maintain clearance from Ani's flared skirt
      if (isQuat && name.includes('Left_arm')) {
        for (let k = 0; k < numFrames; k++) {
          const idx = k * 4
          qK.set(values[idx], values[idx + 1], values[idx + 2], values[idx + 3])
          qOut.copy(qK).multiply(leftSpreadQuat)
          values[idx] = qOut.x
          values[idx + 1] = qOut.y
          values[idx + 2] = qOut.z
          values[idx + 3] = qOut.w
        }
      } else if (isQuat && name.includes('Right_arm')) {
        for (let k = 0; k < numFrames; k++) {
          const idx = k * 4
          qK.set(values[idx], values[idx + 1], values[idx + 2], values[idx + 3])
          qOut.copy(qK).multiply(rightSpreadQuat)
          values[idx] = qOut.x
          values[idx + 1] = qOut.y
          values[idx + 2] = qOut.z
          values[idx + 3] = qOut.w
        }
      }

      // 2. Prevent head or neck from drooping or tilting down; maintain eye contact
      if (isQuat && (name.includes('Head.quaternion') || name.includes('Neck.quaternion'))) {
        for (let k = 0; k < numFrames; k++) {
          const idx = k * 4
          qK.set(values[idx], values[idx + 1], values[idx + 2], values[idx + 3])
          euler.setFromQuaternion(qK, 'YXZ')
          if (euler.x > 0.12) {
            euler.x = 0.05 + (euler.x - 0.12) * 0.2
            qK.setFromEuler(euler)
            values[idx] = qK.x
            values[idx + 1] = qK.y
            values[idx + 2] = qK.z
            values[idx + 3] = qK.w
          }
        }
      }

      // 3. Perfect seamless loop closure:
      // Blend the last ~0.6s smoothly into the start frame, snapping the final frame to frame 0
      const blendDuration = Math.min(0.8, duration * 0.15)
      const blendStartTime = duration - blendDuration
      const lastIdx = (numFrames - 1) * stride

      if (isQuat) {
        q0.set(values[0], values[1], values[2], values[3])
        for (let k = 0; k < numFrames; k++) {
          const t = times[k]
          if (t >= blendStartTime) {
            const raw = (t - blendStartTime) / (duration - blendStartTime)
            const w = raw * raw * (3 - 2 * raw) // Hermite smoothstep
            const idx = k * 4
            qK.set(values[idx], values[idx + 1], values[idx + 2], values[idx + 3])
            qOut.copy(qK).slerp(q0, w)
            values[idx] = qOut.x
            values[idx + 1] = qOut.y
            values[idx + 2] = qOut.z
            values[idx + 3] = qOut.w
          }
        }
        for (let s = 0; s < 4; s++) {
          values[lastIdx + s] = values[s]
        }
      } else {
        for (let k = 0; k < numFrames; k++) {
          const t = times[k]
          if (t >= blendStartTime) {
            const raw = (t - blendStartTime) / (duration - blendStartTime)
            const w = raw * raw * (3 - 2 * raw)
            const idx = k * stride
            for (let s = 0; s < stride; s++) {
              values[idx + s] = values[idx + s] * (1 - w) + values[s] * w
            }
          }
        }
        for (let s = 0; s < stride; s++) {
          values[lastIdx + s] = values[s]
        }
      }

      const TrackType = isQuat ? THREE.QuaternionKeyframeTrack : THREE.VectorKeyframeTrack
      newTracks.push(new TrackType(name, times, values))
    }

    return new THREE.AnimationClip(rawClip.name, duration, newTracks)
  }

  _registerClip(name, clip, isLoop, url) {
    if (!clip) {
      console.warn(`⚠️ Empty animation: ${url || name}`)
      return null
    }
    clip.name = name

    // Optimize idle animation for seamless loop, upright head posture, and arm clearance
    if (name === this.mainIdle || name.toLowerCase().includes('idle')) {
      clip = this._optimizeIdleClip(clip)
    }

    const action = this.mixer.clipAction(clip)
    if (isLoop) {
      action.setLoop(THREE.LoopRepeat, Infinity)
      action.clampWhenFinished = false
    } else {
      action.setLoop(THREE.LoopOnce, 0)
      action.clampWhenFinished = true
    }
    this.actions[name] = action
    return action
  }

  play(name, options = {}) {
    const action = this.actions[name]
    if (!action) return
    if (this.activeAction === action) return

    // Resolve any in-flight blend first so its outgoing clip can't be orphaned
    // at a fixed weight when a new gesture interrupts mid-crossfade.
    this._finalizeTransition()

    const prev = this.activeAction
    const isIdleTarget = name === this.mainIdle

    // Choose a fade window based on what kind of transition this is, so the
    // motion reads as intentional: snappy into gestures, gentle back to rest.
    let duration = options.fade
    if (duration == null) {
      if (!prev) {
        duration = this.fadeTimings.boot
      } else if (isIdleTarget) {
        duration = this.fadeTimings.idleReturn
      } else if (prev === this.actions[this.mainIdle]) {
        duration = this.fadeTimings.gestureIn
      } else {
        duration = this.fadeTimings.gestureSwap
      }
    }

    // Bring the incoming clip in at zero weight; the transition engine ramps it.
    action.reset()
    action.setEffectiveTimeScale(1)
    action.enabled = true
    action.setEffectiveWeight(0)
    action.play()

    // `from` may be null on the very first play — the engine then just fades the
    // incoming clip up from nothing for a graceful boot-in.
    this.transition = {
      from: prev || null,
      to: action,
      elapsed: 0,
      duration: Math.max(0.001, duration),
    }

    this.activeAction = action
    this._returningToIdle = isIdleTarget

    if (isIdleTarget) {
      this.currentState = 'idle'
    } else {
      this.currentState = name
    }
  }

  // Immediately complete the current blend: the incoming clip goes to full
  // weight and the outgoing clip is parked. Used before starting a new blend.
  _finalizeTransition() {
    const t = this.transition
    if (!t) return
    t.to.setEffectiveWeight(1)
    if (t.from) {
      t.from.stop()
      t.from.setEffectiveWeight(1)
    }
    this.transition = null
  }

  // Advance the active crossfade with smoothstep easing. Total weight stays ~1
  // across the blend so the avatar never sags toward an un-animated pose.
  _updateTransition(delta) {
    const t = this.transition
    if (!t) return

    t.elapsed += delta
    const raw = THREE.MathUtils.clamp(t.elapsed / t.duration, 0, 1)
    const eased = raw * raw * (3 - 2 * raw)

    t.to.setEffectiveWeight(eased)
    if (t.from) t.from.setEffectiveWeight(1 - eased)

    if (raw >= 1) {
      t.to.setEffectiveWeight(1)
      if (t.from) {
        // Park the outgoing clip and restore its weight so it can be reused later.
        t.from.stop()
        t.from.setEffectiveWeight(1)
      }
      this.transition = null
    }
  }

  // Begin blending back to idle *before* a one-shot gesture freezes on its final
  // frame, so the clip's natural settle overlaps the idle fade. This removes the
  // "freeze, then snap" beat and is what makes gestures feel continuous.
  _checkAutoReturn() {
    const action = this.activeAction
    if (!action || this._returningToIdle) return
    if (action.loop !== THREE.LoopOnce) return

    const clipName = action.getClip()?.name
    if (clipName === this.mainIdle || this.holdPoseClips.has(clipName)) return

    const clip = action.getClip()
    const dur = clip?.duration || 0
    if (dur <= 0) return

    // Start the return so the idle fade finishes right as the gesture would end.
    const lead = Math.min(this.fadeTimings.idleReturn, dur * 0.4)
    if (action.time >= dur - lead) {
      if (this.actions[this.mainIdle]) {
        this.play(this.mainIdle, { fade: this.fadeTimings.idleReturn })
      }
    }
  }

  cleanup() {
    if (this.mixer) this.mixer.stopAllAction()
    if (this.expressionTimer) clearTimeout(this.expressionTimer)
  }
}
