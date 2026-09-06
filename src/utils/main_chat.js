import fs from 'fs'
import path from 'path'
import axios from 'axios'
import yaml from 'js-yaml'

// === Load YAML config (like Python) ===
const CONFIG_PATH = 'character_config.yaml'
let charConfig = {}

try {
  const fileContents = fs.readFileSync(CONFIG_PATH, 'utf8')
  charConfig = yaml.load(fileContents)
} catch (e) {
  console.error('[ERROR] Could not load YAML config:', e)
}

// === SoVITS function ===
export async function sovitsGen(inText, outputPath = 'output.wav') {
  const url = '  http://127.0.0.1:9880/'

  const refAudioPath = charConfig?.sovits_ping_config?.ref_audio_path
  if (!refAudioPath || !fs.existsSync(refAudioPath)) {
    console.error(`[ERROR] Reference audio path invalid: ${refAudioPath}`)
    return null
  }

  const payload = {
    text: inText,
    text_lang: charConfig.sovits_ping_config?.text_lang || 'en',
    ref_audio_path: refAudioPath,
    prompt_text: charConfig.sovits_ping_config?.prompt_text || '',
    prompt_lang: charConfig.sovits_ping_config?.prompt_lang || 'en',
    media_type: 'wav',
    streaming_mode: false,
  }

  try {
    const response = await axios.post(url, payload, {
      responseType: 'arraybuffer',
    })

    fs.writeFileSync(outputPath, response.data)
    console.log(`[INFO] Audio saved to ${outputPath}`)
    return outputPath
  } catch (err) {
    console.error('[SoVITS ERROR]', err.message)
    return null
  }
}

// === Example LLM (illm) ===
export async function illm(userMessage) {
  const url = 'http://127.0.0.1:11434/api/chat'

  try {
    const response = await axios.post(url, {
      model: charConfig.model || 'qwen3:4b',
      messages: [
        {
          role: 'system',
          content: charConfig.presets?.default?.system_prompt || '',
        },
        { role: 'user', content: userMessage },
      ],
    })

    return response.data.message || 'No reply'
  } catch (err) {
    console.error('[LLM ERROR]', err.message)
    return 'Something went wrong.'
  }
}

// === Orchestrator ===
export async function mainChat(userMessage) {
  console.log('>> User:', userMessage)

  const reply = await illm(userMessage)
  console.log('<< AI:', reply)

  // Generate voice
  await sovitsGen(reply)

  return reply
}
