import { relayTelegramMethod } from '../../server/telegramRelay.js'

export default async function handler(req, res) {
  return relayTelegramMethod(req, res, 'getUpdates')
}
