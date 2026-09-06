export const SUPPORTED_LANGUAGES = Object.freeze([
  { code: 'en', label: 'English' },
  { code: 'uz', label: "O'zbek" },
  { code: 'ru', label: 'Русский' },
])

export const UI_LANGUAGE_STORAGE_KEY = 'vrm_ui_language'

const UI_LANGUAGE_SET = new Set(SUPPORTED_LANGUAGES.map((item) => item.code))

const UI_MESSAGES = Object.freeze({
  en: {
    app: {
      dragAndDrop: 'Drag and Drop',
      uploadAvatar: 'Upload VRM Avatar',
      liveSessionActive: 'Live Session Active',
      systemStandby: 'System Standby',
      voiceLinkStable: 'Voice link stable',
      connectVoiceVision: 'Connect to start voice + vision tools',
      screenShareEnabled: 'Screen share enabled',
      renderFps: 'Render FPS',
      sceneReady: 'Scene ready',
      initializingScene: 'Initializing scene',
    },
    settings: {
      systemControl: 'System Control',
      identityMatrix: 'Identity Matrix',
      defaultRiko: 'Default Riko',
      systemModel: 'System Model',
      aiPersona: 'AI Persona',
      defaultPersonaDescription: 'Original Riko personality used by the app.',
      unknownModel: 'Unknown Model',
      editPersonas: 'Edit Personas',
      projectionScale: 'Projection Scale',
      backgroundColor: 'Background Color',
      visionSensors: 'Vision Sensors',
      faceTrack: 'Face Track',
      screenSense: 'Screen Sense',
      languageMode: 'Language Mode',
      languageHint: 'UI + AI reply preference',
      voiceMode: 'Voice Mode',
      voiceHint: 'AI voice selection',
      unknownDate: 'Unknown date',
      justNow: 'Just now',
      cachedAgo: 'Cached {relative}',
      liveCaptions: 'Live Subtitles & Captions',
    },
    dock: {
      uploadAvatarTitle: 'Upload avatar',
      upload: 'Upload',
      toggleScreenShareTitle: 'Toggle screen share',
      screen: 'Screen',
      toggleCueCardTitle: 'Toggle IELTS Cue Card',
      cueCard: 'Cue Card',
      connecting: 'Connecting...',
      disconnect: 'Disconnect',
      connect: 'Connect',
      toggleChatTitle: 'Toggle chat',
      chat: 'Chat',
      toggleSubtitlesTitle: 'Toggle live subtitles',
      subtitles: 'Subtitles',
      settingsTitle: 'Settings',
      settings: 'Settings',
    },
    chat: {
      conversationLog: 'Conversation Log ({count})',
      clear: 'Clear',
      noMessagesYet: 'No messages yet',
      you: 'You',
      assistant: 'Riko',
    },
    personaDialog: {
      editPersonas: 'Edit Personas',
      availablePersonas: 'Available Personas',
      new: 'New',
      default: 'Default',
      editPersonaTitle: 'Edit persona',
      deletePersonaTitle: 'Delete persona',
      editPersona: 'Edit Persona',
      createPersona: 'Create Persona',
      cancel: 'Cancel',
      title: 'Title',
      titlePlaceholder: 'Persona title',
      shortDescription: 'Short Description',
      summaryPlaceholder: '1-line summary',
      personaPrompt: 'Persona Prompt',
      promptPlaceholder: 'Describe personality, style, and behavior',
      saveChanges: 'Save Changes',
      addPersona: 'Add Persona',
      pickPersonaHint: 'Pick a persona and press Edit, or create a new one.',
      editLockHint: 'Editing is locked to this persona. Save or Cancel to edit others.',
    },
    toasts: {
      lookAtUserTitle: 'Look At User',
      lookAtUserEnabled: 'AI can now look at you through camera.',
      lookAtUserDisabled: 'AI look-at-user is disabled.',
      lookAtScreenTitle: 'Look At Screen',
      lookAtScreenEnabled: 'AI can now analyze your shared screen.',
      lookAtScreenDisabled: 'AI look-at-screen is disabled.',
      screenShareTitle: 'Screen Share',
      screenShareActive: 'Screen sharing active',
      screenShareStopped: 'Screen sharing stopped',
      avatarMissingTitle: 'Avatar Missing',
      avatarMissingSaved: 'Saved model not found. Upload a .vrm file.',
      avatarMissingDefault: 'Default model not found. Upload a .vrm file.',
      initializationFailedTitle: 'Initialization Failed',
      performanceTipTitle: 'Performance Tip',
      performanceTipMessage:
        'Frequent reconnects detected. Open chat and clear history to lighten the session.',
      noAvatarTitle: 'No Avatar',
      noAvatarMessage: 'Load a VRM model before connecting.',
      connectingTitle: 'Connecting',
      connectingMessage: 'Establishing live voice session...',
      callEndedTitle: 'Call Ended',
      aiEndedCall: 'AI ended the conversation. Goodbye!',
      connectionFailedTitle: 'Connection Failed',
      screenShareCouldNotStart: 'Could not start screen sharing.',
      screenSharePermissionBlocked: 'Screen share permission was blocked.',
      personaQueuedTitle: 'Persona Queued',
      personaQueuedMessage: 'Disconnect and reconnect to apply the new persona.',
      personaErrorTitle: 'Persona Error',
      personaRequiredFields: 'Title, description, and prompt are required.',
      personaAddedTitle: 'Persona Added',
      personaAddedMessage: '"{title}" is ready to use.',
      personaUpdatedTitle: 'Persona Updated',
      personaUpdatedMessage: '"{title}" saved.',
      personaDeleteConfirm: 'Delete persona "{title}"?',
      personaDeletedTitle: 'Persona Deleted',
      personaDeletedMessage: '"{title}" removed.',
      switchingAvatarTitle: 'Switching Avatar',
      switchingAvatarMessage: 'Loading cached model...',
      avatarUpdatedTitle: 'Avatar Updated',
      avatarLoadedFromCache: 'Model loaded from cache.',
      loadFailedTitle: 'Load Failed',
      cachedModelLoadFailed: 'Could not load cached model.',
      modelDeletedTitle: 'Deleted',
      modelDeletedMessage: 'Model removed from cache.',
      errorTitle: 'Error',
      modelDeleteFailed: 'Failed to delete model.',
      modelDeleteConfirm: 'Are you sure you want to delete this model?',
      invalidFileTitle: 'Invalid File',
      invalidFileMessage: 'Please upload a .vrm file.',
      loadingAvatarTitle: 'Loading Avatar',
      loadingAvatarMessage: 'Processing {fileName}...',
      newAvatarLoaded: 'New model loaded successfully.',
      vrmLoadFailed: 'Could not load this VRM file.',
      languageChangedTitle: 'Language Updated',
      languageChangedMessage: 'AI language preference will apply in the current session.',
      languageChangeFailedTitle: 'Language Hint Failed',
      languageChangeFailedMessage:
        'Language preference was saved. Reconnect to apply it to AI responses.',
      voiceChangedTitle: 'Voice Updated',
      voiceChangedMessage: 'AI voice set to {voiceName}. Reconnecting to apply...',
    },
    aiLanguage: {
      english: 'English',
      uzbek: 'Uzbek',
      russian: 'Russian',
      preferenceInstruction:
        'Preferred response language is {languageName}. This is only a preference, not mandatory. Use it by default when natural, but follow the user language if they switch or explicitly request another language.',
      runtimeHint:
        '[SYSTEM LANGUAGE PREFERENCE] Prefer replying in {languageName}. This is a soft preference, not strict. Follow the user language if they switch. Do not ask for confirmation.',
    },
  },
  uz: {
    app: {
      dragAndDrop: 'Sudrab olib tashlang',
      uploadAvatar: 'VRM avatar yuklash',
      liveSessionActive: 'Jonli sessiya faol',
      systemStandby: 'Tizim kutish holatida',
      voiceLinkStable: 'Ovoz ulanishi barqaror',
      connectVoiceVision: "Ovoz va ko'rish vositalarini boshlash uchun ulang",
      screenShareEnabled: 'Ekran ulashish yoqilgan',
      renderFps: 'Render FPS',
      sceneReady: 'Sahna tayyor',
      initializingScene: 'Sahna ishga tushmoqda',
    },
    settings: {
      systemControl: 'Tizim boshqaruvi',
      identityMatrix: 'Identifikatsiya matriksasi',
      defaultRiko: 'Standart Riko',
      systemModel: 'Tizim modeli',
      aiPersona: 'AI personasi',
      defaultPersonaDescription: 'Ilovadagi asl Riko personasi.',
      unknownModel: "Noma'lum model",
      editPersonas: 'Personalarni tahrirlash',
      projectionScale: "Proeksiya o'lchami",
      backgroundColor: 'Fon rangi',
      visionSensors: "Ko'rish sensorlari",
      faceTrack: 'Yuz kuzatuvi',
      screenSense: 'Ekran sensori',
      languageMode: 'Til rejimi',
      languageHint: 'UI + AI javob afzalligi',
      voiceMode: 'Ovoz rejimi',
      voiceHint: 'AI ovozini tanlash',
      unknownDate: "Noma'lum sana",
      justNow: 'Hozirgina',
      cachedAgo: 'Keshlangan: {relative}',
      liveCaptions: 'Jonli subtitrlar',
    },
    dock: {
      uploadAvatarTitle: 'Avatar yuklash',
      upload: 'Yuklash',
      toggleScreenShareTitle: 'Ekran ulashishni almashtirish',
      screen: 'Ekran',
      toggleCueCardTitle: 'IELTS Cue Card ochish/yopish',
      cueCard: 'Cue Card',
      connecting: 'Ulanmoqda...',
      disconnect: 'Uzish',
      connect: 'Ulanish',
      toggleChatTitle: 'Chatni almashtirish',
      chat: 'Chat',
      toggleSubtitlesTitle: 'Subtitrlarni yoqish/oʻchirish',
      subtitles: 'Subtitr',
      settingsTitle: 'Sozlamalar',
      settings: 'Sozlamalar',
    },
    chat: {
      conversationLog: 'Suhbat jurnali ({count})',
      clear: 'Tozalash',
      noMessagesYet: "Hali xabarlar yo'q",
      you: 'Siz',
      assistant: 'Riko',
    },
    personaDialog: {
      editPersonas: 'Personalarni tahrirlash',
      availablePersonas: 'Mavjud personalar',
      new: 'Yangi',
      default: 'Standart',
      editPersonaTitle: 'Personani tahrirlash',
      deletePersonaTitle: "Personani o'chirish",
      editPersona: 'Personani tahrirlash',
      createPersona: 'Persona yaratish',
      cancel: 'Bekor qilish',
      title: 'Sarlavha',
      titlePlaceholder: 'Persona sarlavhasi',
      shortDescription: 'Qisqa tavsif',
      summaryPlaceholder: '1 qatorli xulosa',
      personaPrompt: 'Persona prompti',
      promptPlaceholder: 'Shaxsiyat, uslub va xatti-harakatni tavsiflang',
      saveChanges: 'Oʻzgarishlarni saqlash',
      addPersona: 'Persona qoʻshish',
      pickPersonaHint: "Personani tanlang va Tahrirlashni bosing, yoki yangisini qo'shing.",
      editLockHint:
        'Tahrirlash ushbu persona uchun qulflangan. Boshqalarni tahrirlash uchun Saqlash yoki Bekor qilishni bosing.',
    },
    toasts: {
      lookAtUserTitle: 'Foydalanuvchiga qarash',
      lookAtUserEnabled: 'AI endi kamera orqali sizga qaray oladi.',
      lookAtUserDisabled: "AI foydalanuvchiga qarash o'chirilgan.",
      lookAtScreenTitle: 'Ekranga qarash',
      lookAtScreenEnabled: 'AI endi ulashilgan ekranni tahlil qila oladi.',
      lookAtScreenDisabled: "AI ekranga qarash o'chirilgan.",
      screenShareTitle: 'Ekran ulashish',
      screenShareActive: 'Ekran ulashish faol',
      screenShareStopped: "Ekran ulashish to'xtatildi",
      avatarMissingTitle: 'Avatar topilmadi',
      personaErrorTitle: 'Persona xatosi',
      personaRequiredFields: 'Sarlavha, tavsif va prompt majburiy.',
      personaAddedTitle: "Persona qo'shildi",
      personaAddedMessage: '"{title}" foydalanishga tayyor.',
      personaUpdatedTitle: 'Persona yangilandi',
      personaUpdatedMessage: '"{title}" saqlandi.',
      personaDeleteConfirm: '"{title}" personasi o‘chirilsinmi?',
      personaDeletedTitle: "Persona o'chirildi",
      personaDeletedMessage: '"{title}" olib tashlandi.',
      switchingAvatarTitle: 'Avatar almashtirilmoqda',
      switchingAvatarMessage: 'Keshlangan model yuklanmoqda...',
      avatarUpdatedTitle: 'Avatar yangilandi',
      avatarLoadedFromCache: 'Model keshdan yuklandi.',
      loadFailedTitle: 'Yuklash xatosi',
      cachedModelLoadFailed: 'Keshlangan modelni yuklab bo‘lmadi.',
      modelDeletedTitle: "O'chirildi",
      modelDeletedMessage: 'Model keshdan olib tashlandi.',
      errorTitle: 'Xato',
      modelDeleteFailed: "Modelni o'chirib bo'lmadi.",
      modelDeleteConfirm: "Ushbu modelni o'chirishni tasdiqlaysizmi?",
      invalidFileTitle: 'Noto‘g‘ri fayl',
      invalidFileMessage: 'Iltimos, .vrm fayl yuklang.',
      loadingAvatarTitle: 'Avatar yuklanmoqda',
      loadingAvatarMessage: '{fileName} qayta ishlanmoqda...',
      newAvatarLoaded: 'Yangi model muvaffaqiyatli yuklandi.',
      vrmLoadFailed: 'Ushbu VRM faylni yuklab bo‘lmadi.',
      languageChangedTitle: 'Til yangilandi',
      languageChangedMessage: 'AI til afzalligi joriy sessiyada qo‘llanadi.',
      languageChangeFailedTitle: 'Til ko‘rsatmasi yuborilmadi',
      languageChangeFailedMessage:
        'Til saqlandi. AI javoblariga qo‘llash uchun qayta ulanishingiz mumkin.',
      voiceChangedTitle: 'Ovoz yangilandi',
      voiceChangedMessage: "AI ovozi {voiceName} ga o'rnatildi. Ulanish qayta tiklanmoqda...",
    },
    aiLanguage: {
      english: 'Ingliz tili',
      uzbek: "O'zbek tili",
      russian: 'Rus tili',
      preferenceInstruction:
        "Afzal javob tili: {languageName}. Bu majburiy emas, faqat tavsiya. Odatda shu tilda javob bering, lekin foydalanuvchi tilni almashtirsa yoki boshqa tilni so'rasa, moslashing.",
      runtimeHint:
        '[SYSTEM LANGUAGE PREFERENCE] Javoblarda asosan {languageName} tilidan foydalaning. Bu yumshoq afzallik, qatʼiy emas. Foydalanuvchi tilni almashtirsa moslashing. Tasdiq so‘ramang.',
    },
  },
  ru: {
    app: {
      dragAndDrop: 'Перетащите файл',
      uploadAvatar: 'Загрузить VRM аватар',
      liveSessionActive: 'Сессия активна',
      systemStandby: 'Система в режиме ожидания',
      voiceLinkStable: 'Голосовое соединение стабильно',
      connectVoiceVision: 'Подключитесь, чтобы запустить голос и визуальные инструменты',
      screenShareEnabled: 'Демонстрация экрана включена',
      renderFps: 'Render FPS',
      sceneReady: 'Сцена готова',
      initializingScene: 'Инициализация сцены',
    },
    settings: {
      systemControl: 'Управление системой',
      identityMatrix: 'Матрица идентичности',
      defaultRiko: 'Riko по умолчанию',
      systemModel: 'Системная модель',
      aiPersona: 'Персона AI',
      defaultPersonaDescription: 'Оригинальная персона Riko, используемая в приложении.',
      unknownModel: 'Неизвестная модель',
      editPersonas: 'Редактировать персоны',
      projectionScale: 'Масштаб проекции',
      backgroundColor: 'Цвет фона',
      visionSensors: 'Визуальные сенсоры',
      faceTrack: 'Отслеживание лица',
      screenSense: 'Анализ экрана',
      languageMode: 'Режим языка',
      languageHint: 'UI + предпочтение ответа AI',
      voiceMode: 'Голосовой режим',
      voiceHint: 'Выбор голоса AI',
      unknownDate: 'Дата неизвестна',
      justNow: 'Только что',
      cachedAgo: 'Кэшировано: {relative}',
      liveCaptions: 'Живые субтитры',
    },
    dock: {
      uploadAvatarTitle: 'Загрузить аватар',
      upload: 'Загрузка',
      toggleScreenShareTitle: 'Переключить демонстрацию экрана',
      screen: 'Экран',
      toggleCueCardTitle: 'Открыть карточку IELTS Cue Card',
      cueCard: 'Кью-карта',
      connecting: 'Подключение...',
      disconnect: 'Отключить',
      connect: 'Подключить',
      toggleChatTitle: 'Переключить чат',
      chat: 'Чат',
      toggleSubtitlesTitle: 'Включить/выключить субтитры',
      subtitles: 'Субтитры',
      settingsTitle: 'Настройки',
      settings: 'Настройки',
    },
    chat: {
      conversationLog: 'Журнал диалога ({count})',
      clear: 'Очистить',
      noMessagesYet: 'Сообщений пока нет',
      you: 'Вы',
      assistant: 'Riko',
    },
    personaDialog: {
      editPersonas: 'Редактировать персоны',
      availablePersonas: 'Доступные персоны',
      new: 'Новая',
      default: 'По умолчанию',
      editPersonaTitle: 'Редактировать персону',
      deletePersonaTitle: 'Удалить персону',
      editPersona: 'Редактирование персоны',
      createPersona: 'Создание персоны',
      cancel: 'Отмена',
      title: 'Название',
      titlePlaceholder: 'Название персоны',
      shortDescription: 'Краткое описание',
      summaryPlaceholder: 'Краткая строка',
      personaPrompt: 'Промпт персоны',
      promptPlaceholder: 'Опишите характер, стиль и поведение',
      saveChanges: 'Сохранить изменения',
      addPersona: 'Добавить персону',
      pickPersonaHint: 'Выберите персону и нажмите Edit, либо создайте новую.',
      editLockHint:
        'Редактирование заблокировано для этой персоны. Сохраните или отмените, чтобы редактировать другие.',
    },
    toasts: {
      lookAtUserTitle: 'Взгляд на пользователя',
      lookAtUserEnabled: 'AI теперь может видеть вас через камеру.',
      lookAtUserDisabled: 'Взгляд на пользователя отключен.',
      lookAtScreenTitle: 'Взгляд на экран',
      lookAtScreenEnabled: 'AI теперь может анализировать ваш экран.',
      lookAtScreenDisabled: 'Взгляд на экран отключен.',
      screenShareTitle: 'Демонстрация экрана',
      screenShareActive: 'Демонстрация экрана активна',
      screenShareStopped: 'Демонстрация экрана остановлена',
      avatarMissingTitle: 'Аватар не найден',
      avatarMissingSaved: 'Сохраненная модель не найдена. Загрузите .vrm файл.',
      avatarMissingDefault: 'Модель по умолчанию не найдена. Загрузите .vrm файл.',
      initializationFailedTitle: 'Ошибка инициализации',
      performanceTipTitle: 'Совет по производительности',
      performanceTipMessage: 'Обнаружены частые переподключения. Откройте чат и очистите историю.',
      noAvatarTitle: 'Нет аватара',
      noAvatarMessage: 'Загрузите VRM модель перед подключением.',
      connectingTitle: 'Подключение',
      connectingMessage: 'Запускаем живую голосовую сессию...',
      callEndedTitle: 'Звонок завершен',
      aiEndedCall: 'AI завершил беседу. До свидания!',
      connectionFailedTitle: 'Ошибка подключения',
      screenShareCouldNotStart: 'Не удалось запустить демонстрацию экрана.',
      screenSharePermissionBlocked: 'Доступ к демонстрации экрана заблокирован.',
      personaQueuedTitle: 'Персона в очереди',
      personaQueuedMessage: 'Переподключитесь, чтобы применить новую персону.',
      personaErrorTitle: 'Ошибка персоны',
      personaRequiredFields: 'Название, описание и промпт обязательны.',
      personaAddedTitle: 'Персона добавлена',
      personaAddedMessage: '"{title}" готова к использованию.',
      personaUpdatedTitle: 'Персона обновлена',
      personaUpdatedMessage: '"{title}" сохранена.',
      personaDeleteConfirm: 'Удалить персону "{title}"?',
      personaDeletedTitle: 'Персона удалена',
      personaDeletedMessage: '"{title}" удалена.',
      switchingAvatarTitle: 'Смена аватара',
      switchingAvatarMessage: 'Загрузка модели из кэша...',
      avatarUpdatedTitle: 'Аватар обновлен',
      avatarLoadedFromCache: 'Модель загружена из кэша.',
      loadFailedTitle: 'Ошибка загрузки',
      cachedModelLoadFailed: 'Не удалось загрузить модель из кэша.',
      modelDeletedTitle: 'Удалено',
      modelDeletedMessage: 'Модель удалена из кэша.',
      errorTitle: 'Ошибка',
      modelDeleteFailed: 'Не удалось удалить модель.',
      modelDeleteConfirm: 'Удалить эту модель?',
      invalidFileTitle: 'Неверный файл',
      invalidFileMessage: 'Пожалуйста, загрузите .vrm файл.',
      loadingAvatarTitle: 'Загрузка аватара',
      loadingAvatarMessage: 'Обрабатывается {fileName}...',
      newAvatarLoaded: 'Новая модель успешно загружена.',
      vrmLoadFailed: 'Не удалось загрузить этот VRM файл.',
      languageChangedTitle: 'Язык обновлен',
      languageChangedMessage: 'Языковое предпочтение AI применится в текущей сессии.',
      languageChangeFailedTitle: 'Подсказка языка не отправлена',
      languageChangeFailedMessage:
        'Язык сохранен. Переподключитесь, чтобы точно применить его к ответам AI.',
      voiceChangedTitle: 'Голос обновлен',
      voiceChangedMessage: 'Голос AI изменен на {voiceName}. Переподключение для применения...',
    },
    aiLanguage: {
      english: 'Английский',
      uzbek: 'Узбекский',
      russian: 'Русский',
      preferenceInstruction:
        'Предпочтительный язык ответа: {languageName}. Это не строгое требование, а рекомендация. Обычно отвечай на этом языке, но если пользователь переключится или попросит другой язык, адаптируйся.',
      runtimeHint:
        '[SYSTEM LANGUAGE PREFERENCE] Предпочитай ответы на {languageName}. Это мягкое предпочтение, не строгое правило. Если пользователь сменит язык, адаптируйся. Подтверждение не требуется.',
    },
  },
})

const resolvePath = (source, path) => {
  if (!source || typeof path !== 'string' || !path) return undefined
  return path.split('.').reduce((acc, part) => {
    if (acc && Object.prototype.hasOwnProperty.call(acc, part)) {
      return acc[part]
    }
    return undefined
  }, source)
}

export const resolveLanguage = (language) => {
  const normalized = typeof language === 'string' ? language.trim().toLowerCase() : ''
  return UI_LANGUAGE_SET.has(normalized) ? normalized : 'en'
}

export const getLocaleForLanguage = (language) => {
  const normalized = resolveLanguage(language)
  if (normalized === 'uz') return 'uz-UZ'
  if (normalized === 'ru') return 'ru-RU'
  return 'en-US'
}

export const translateUi = (language, key, params = {}) => {
  const normalized = resolveLanguage(language)
  const fromLanguage = resolvePath(UI_MESSAGES[normalized], key)
  const fromEnglish = resolvePath(UI_MESSAGES.en, key)
  const template = typeof fromLanguage === 'string' ? fromLanguage : fromEnglish
  if (typeof template !== 'string') return key

  return template.replace(/\{(\w+)\}/g, (_, token) => {
    if (Object.prototype.hasOwnProperty.call(params, token)) {
      const value = params[token]
      return value === null || value === undefined ? '' : String(value)
    }
    return ''
  })
}

export const getAiLanguageName = (language) => {
  const normalized = resolveLanguage(language)
  if (normalized === 'uz') return 'Uzbek'
  if (normalized === 'ru') return 'Russian'
  return 'English'
}

export const buildAiLanguagePreferenceInstruction = (language) => {
  const normalized = resolveLanguage(language)
  const languageName = getAiLanguageName(normalized)
  return translateUi('en', 'aiLanguage.preferenceInstruction', { languageName })
}

export const buildAiRuntimeLanguageHint = (language) => {
  const normalized = resolveLanguage(language)
  const languageName = getAiLanguageName(normalized)
  return translateUi('en', 'aiLanguage.runtimeHint', { languageName })
}
