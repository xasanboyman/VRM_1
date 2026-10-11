import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  WidthType,
  BorderStyle,
  AlignmentType,
  HeadingLevel,
  ShadingType,
} from 'docx'

/**
 * StudyDocumentManager
 * 
 * Generates professional Microsoft Word (.docx) study documents
 * compiling candidate speech errors, grammar corrections, advanced vocabulary,
 * and example sentences with automatic download to the user's PC.
 */
export class StudyDocumentManager {
  constructor() {
    this.storageKey = 'vrm_study_notes'
  }

  /**
   * Retrieve all saved study notes from localStorage.
   */
  getStoredItems() {
    try {
      if (typeof window === 'undefined' || !window.localStorage) return []
      const raw = localStorage.getItem(this.storageKey)
      if (!raw) return []
      const parsed = JSON.parse(raw)
      return Array.isArray(parsed) ? parsed : []
    } catch (e) {
      console.warn('Failed to parse stored study notes:', e)
      return []
    }
  }

  /**
   * Save a study item (error correction, vocabulary, or idiom) into local storage.
   */
  saveItem(item) {
    if (!item || typeof item !== 'object') return null
    const items = this.getStoredItems()
    const newItem = {
      id: item.id || `item_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      timestamp: item.timestamp || Date.now(),
      type: item.type || 'vocabulary', // 'grammar_correction' | 'vocabulary' | 'idiom' | 'pronunciation'
      original: String(item.original || '').trim(),
      improved: String(item.improved || item.word || '').trim(),
      explanation: String(item.explanation || item.meaning || '').trim(),
      examples: Array.isArray(item.examples)
        ? item.examples.map(String).filter((s) => s.trim().length > 0)
        : item.example ? [String(item.example).trim()] : [],
    }

    // Deduplicate against existing items by improved or original
    const exists = items.some(
      (existing) =>
        (existing.improved && existing.improved.toLowerCase() === newItem.improved.toLowerCase()) ||
        (existing.original && existing.original.toLowerCase() === newItem.original.toLowerCase())
    )

    if (!exists && (newItem.improved || newItem.original)) {
      items.push(newItem)
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(items.slice(-100)))
      } catch (e) {
        console.warn('Failed to save study note to storage:', e)
      }
    }

    return newItem
  }

  /**
   * Clear stored study notes.
   */
  clearItems() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.removeItem(this.storageKey)
      }
    } catch {}
  }

  /**
   * Extract potential grammar corrections and vocabulary suggestions from chat history.
   */
  extractItemsFromHistory(history = []) {
    if (!Array.isArray(history) || history.length === 0) return []
    const extracted = []

    for (const msg of history) {
      if (msg?.role !== 'model' || typeof msg.text !== 'string') continue
      const text = msg.text

      // Pattern 1: "Instead of 'X', try/use 'Y'" or "Instead of X, say Y"
      const insteadRegex = /(?:instead of|rather than)\s+["'“]([^"'”]+)["'”],?\s+(?:try(?:\s+saying)?|use|consider)\s+["'“]([^"'”]+)["'”](?:[.,]?\s*(?:because|since|as)?\s*([^.!?\n]*))?/gi
      let match
      while ((match = insteadRegex.exec(text)) !== null) {
        extracted.push({
          type: 'grammar_correction',
          original: match[1].trim(),
          improved: match[2].trim(),
          explanation: match[3]?.trim() || 'More natural phrasing in speaking.',
          examples: [],
        })
      }

      // Pattern 2: "Correction: X -> Y" or "Correction: X should be Y"
      const correctionRegex = /(?:correction|correct version|better phrasing):\s*["'“]?([^"'”\n]+)["'”]?\s*(?:->|should be|is)\s*["'“]?([^"'”\n]+)["'”]?(?:[.,]?\s*(.*))?/gi
      while ((match = correctionRegex.exec(text)) !== null) {
        extracted.push({
          type: 'grammar_correction',
          original: match[1].trim(),
          improved: match[2].trim(),
          explanation: match[3]?.trim() || 'Grammar correction.',
          examples: [],
        })
      }

      // Pattern 3: "Vocabulary: X means Y" or "Word of note: X - Y"
      const vocabRegex = /(?:vocabulary upgrade|advanced word|good expression):\s*["'“]?([^"'”:\n]+)["'”]?\s*[-–:]\s*([^.!?\n]+)(?:[.!?]\s*For example,?\s*["'“]?([^"'\n]+)["'”]?)?/gi
      while ((match = vocabRegex.exec(text)) !== null) {
        extracted.push({
          type: 'vocabulary',
          original: '',
          improved: match[1].trim(),
          explanation: match[2].trim(),
          examples: match[3] ? [match[3].trim()] : [],
        })
      }
    }

    return extracted
  }

  /**
   * Generate and trigger the download of a professional Microsoft Word document (.docx).
   */
  async generateAndDownloadDocx(options = {}) {
    const {
      title = 'IELTS Speaking Study Notes & Improvement File',
      summary = '',
      items = [],
      overallFeedback = '',
      candidateName = (typeof localStorage !== 'undefined' ? localStorage.getItem('vrm_user_name') : '') || 'Candidate',
      history = [],
      filename = '',
    } = options

    // Combine explicit items with stored notes and extracted history items
    const stored = this.getStoredItems()
    const historyExtracted = this.extractItemsFromHistory(history)
    const combinedMap = new Map()

    const addUnique = (it) => {
      if (!it) return
      const key = `${it.original || ''}:::${it.improved || ''}`.toLowerCase().trim()
      if (key !== ':::' && !combinedMap.has(key)) {
        combinedMap.set(key, it)
      }
    }

    // Order: explicit items first, then stored notes, then history
    for (const it of items) addUnique(it)
    for (const it of stored) addUnique(it)
    for (const it of historyExtracted) addUnique(it)

    const allItems = Array.from(combinedMap.values())

    // If still empty, provide meaningful instructional templates based on IELTS Speaking criteria
    if (allItems.length === 0) {
      allItems.push(
        {
          type: 'grammar_correction',
          original: 'I have many homeworks to finish.',
          improved: 'I have a lot of homework / numerous assignments to complete.',
          explanation: "'Homework' is an uncountable noun. Use 'a lot of homework' or count nouns like 'assignments'.",
          examples: ['I have a great deal of homework to complete before tomorrow.'],
        },
        {
          type: 'vocabulary',
          original: 'very important',
          improved: 'paramount / pivotal / of vital importance',
          explanation: 'Replaces generic, overused intensifiers with Band 8+ academic collocations.',
          examples: ['Sustainable energy is of paramount importance for combating climate change.'],
        },
        {
          type: 'idiom',
          original: 'I was very happy',
          improved: 'over the moon / on cloud nine / thrilled to bits',
          explanation: 'Demonstrates natural idiomatic range required for IELTS Speaking Band 7+.',
          examples: ['When I received my admission letter, I was absolutely over the moon.'],
        }
      )
    }

    // Separate items by category
    const grammarItems = allItems.filter((i) => i.type === 'grammar_correction')
    const vocabItems = allItems.filter((i) => i.type === 'vocabulary')
    const idiomItems = allItems.filter((i) => i.type === 'idiom' || i.type === 'pronunciation')
    const otherItems = allItems.filter(
      (i) => i.type !== 'grammar_correction' && i.type !== 'vocabulary' && i.type !== 'idiom' && i.type !== 'pronunciation'
    )

    const now = new Date()
    const formattedDate = now.toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
    const formattedTime = now.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
    })

    // Colors
    const NAVY = '1E3A8A'
    const TEAL = '0D9488'
    const SLATE = '475569'
    const ROSE = 'BE123C'
    const EMERALD = '059669'
    const LIGHT_BG = 'F8FAFC'
    const BORDER_COLOR = 'CBD5E1'

    const tableBorderConfig = {
      top: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
      bottom: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
      left: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
      right: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
      insideHorizontal: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
      insideVertical: { style: BorderStyle.SINGLE, size: 1, color: BORDER_COLOR },
    }

    const docChildren = []

    // 1. Title Banner
    docChildren.push(
      new Paragraph({
        text: title,
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 120 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 300 },
        children: [
          new TextRun({
            text: 'Personalized Error Corrections, Vocabulary Upgrades & Native Examples',
            italics: true,
            color: SLATE,
            size: 22,
          }),
        ],
      })
    )

    // 2. Metadata Information Table
    const metaTable = new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      borders: tableBorderConfig,
      rows: [
        new TableRow({
          children: [
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Student Name: ', bold: true, color: NAVY }),
                    new TextRun({ text: candidateName }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Session Date: ', bold: true, color: NAVY }),
                    new TextRun({ text: `${formattedDate} (${formattedTime})` }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 50, type: WidthType.PERCENTAGE },
              shading: { fill: LIGHT_BG, type: ShadingType.CLEAR },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Tutor / Examiner: ', bold: true, color: NAVY }),
                    new TextRun({ text: 'Riko AI (Academy Edition)' }),
                  ],
                }),
                new Paragraph({
                  children: [
                    new TextRun({ text: 'Total Items Saved: ', bold: true, color: NAVY }),
                    new TextRun({ text: `${allItems.length} Corrections & Expressions`, bold: true, color: EMERALD }),
                  ],
                }),
              ],
            }),
          ],
        }),
      ],
    })
    docChildren.push(metaTable)
    docChildren.push(new Paragraph({ spacing: { after: 200 } }))

    // 3. Executive Summary / Overall Feedback
    if (summary || overallFeedback) {
      docChildren.push(
        new Paragraph({
          text: 'Session Summary & Performance Insights',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 200, after: 100 },
        }),
        new Paragraph({
          spacing: { after: 250 },
          children: [
            new TextRun({
              text: summary || overallFeedback,
              size: 22,
              color: '1E293B',
            }),
          ],
        })
      )
    }

    // Helper: Build Table for Items
    const createItemsTable = (categoryItems, categoryType) => {
      const headerRow = new TableRow({
        tableHeader: true,
        children: [
          new TableCell({
            width: { size: 28, type: WidthType.PERCENTAGE },
            shading: { fill: NAVY, type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: categoryType === 'grammar' ? 'Original Phrasing (Error)' : 'Basic / Context Phrase',
                    bold: true,
                    color: 'FFFFFF',
                    size: 20,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 30, type: WidthType.PERCENTAGE },
            shading: { fill: NAVY, type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: categoryType === 'grammar' ? 'Corrected Phrasing' : 'Advanced Upgrade (Band 8+)',
                    bold: true,
                    color: 'FFFFFF',
                    size: 20,
                  }),
                ],
              }),
            ],
          }),
          new TableCell({
            width: { size: 42, type: WidthType.PERCENTAGE },
            shading: { fill: NAVY, type: ShadingType.CLEAR },
            children: [
              new Paragraph({
                children: [
                  new TextRun({
                    text: 'Explanation & Example Sentences',
                    bold: true,
                    color: 'FFFFFF',
                    size: 20,
                  }),
                ],
              }),
            ],
          }),
        ],
      })

      const dataRows = categoryItems.map((item, idx) => {
        const rowShading = idx % 2 === 1 ? LIGHT_BG : 'FFFFFF'
        const exampleParagraphs = []

        if (item.explanation) {
          exampleParagraphs.push(
            new Paragraph({
              spacing: { after: 60 },
              children: [
                new TextRun({ text: 'Rule/Note: ', bold: true, color: SLATE, size: 19 }),
                new TextRun({ text: item.explanation, size: 19 }),
              ],
            })
          )
        }

        if (Array.isArray(item.examples) && item.examples.length > 0) {
          item.examples.forEach((ex) => {
            exampleParagraphs.push(
              new Paragraph({
                spacing: { after: 40 },
                children: [
                  new TextRun({ text: '• Example: ', bold: true, color: TEAL, size: 19 }),
                  new TextRun({ text: `"${ex}"`, italics: true, size: 19 }),
                ],
              })
            )
          })
        }

        return new TableRow({
          children: [
            new TableCell({
              width: { size: 28, type: WidthType.PERCENTAGE },
              shading: { fill: rowShading, type: ShadingType.CLEAR },
              children: [
                new Paragraph({
                  children: [
                    item.original
                      ? new TextRun({ text: item.original, strike: categoryType === 'grammar', color: ROSE, bold: true })
                      : new TextRun({ text: '(Self-expression)', italics: true, color: SLATE }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 30, type: WidthType.PERCENTAGE },
              shading: { fill: rowShading, type: ShadingType.CLEAR },
              children: [
                new Paragraph({
                  children: [
                    new TextRun({ text: item.improved, bold: true, color: EMERALD }),
                  ],
                }),
              ],
            }),
            new TableCell({
              width: { size: 42, type: WidthType.PERCENTAGE },
              shading: { fill: rowShading, type: ShadingType.CLEAR },
              children: exampleParagraphs.length > 0 ? exampleParagraphs : [new Paragraph({ text: '-' })],
            }),
          ],
        })
      })

      return new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: tableBorderConfig,
        rows: [headerRow, ...dataRows],
      })
    }

    // 4. Section: Grammar Corrections
    if (grammarItems.length > 0) {
      docChildren.push(
        new Paragraph({
          text: '1. Grammar Corrections & Speech Errors',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 120 },
        }),
        createItemsTable(grammarItems, 'grammar'),
        new Paragraph({ spacing: { after: 200 } })
      )
    }

    // 5. Section: Vocabulary Upgrades
    if (vocabItems.length > 0) {
      docChildren.push(
        new Paragraph({
          text: '2. High-Scoring Vocabulary & Lexical Upgrades',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 120 },
        }),
        createItemsTable(vocabItems, 'vocab'),
        new Paragraph({ spacing: { after: 200 } })
      )
    }

    // 6. Section: Idiomatic & Conversational Expressions
    if (idiomItems.length > 0) {
      docChildren.push(
        new Paragraph({
          text: '3. Idiomatic & Native Expressions',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 120 },
        }),
        createItemsTable(idiomItems, 'idiom'),
        new Paragraph({ spacing: { after: 200 } })
      )
    }

    // 7. Section: Other Practice Items
    if (otherItems.length > 0) {
      docChildren.push(
        new Paragraph({
          text: '4. Additional Practice Items & Collocations',
          heading: HeadingLevel.HEADING_2,
          spacing: { before: 280, after: 120 },
        }),
        createItemsTable(otherItems, 'other'),
        new Paragraph({ spacing: { after: 200 } })
      )
    }

    // 8. Closing Advice
    docChildren.push(
      new Paragraph({
        text: 'Actionable Next Steps for Speaking Fluency',
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 280, after: 100 },
      }),
      new Paragraph({
        children: [
          new TextRun({ text: '1. Active Recall: ', bold: true, color: NAVY }),
          new TextRun({ text: 'Read the corrected sentences aloud 3 times, paying attention to rhythm and intonation.\n' }),
          new TextRun({ text: '2. Shadowing Technique: ', bold: true, color: NAVY }),
          new TextRun({ text: 'Create your own original sentence for each vocabulary upgrade listed above.\n' }),
          new TextRun({ text: '3. Consistency: ', bold: true, color: NAVY }),
          new TextRun({ text: 'Review these corrections right before your next speaking session with Riko.' }),
        ],
        spacing: { after: 240 },
      }),
      new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { before: 300 },
        children: [
          new TextRun({
            text: '★ Generated by Riko AI Tutor • Keep practicing daily for speaking mastery! ★',
            italics: true,
            color: SLATE,
            size: 18,
          }),
        ],
      })
    )

    // Build Word Document
    const doc = new Document({
      title,
      creator: 'Riko AI Speaking Tutor',
      description: 'IELTS Speaking error corrections and vocabulary study notes',
      styles: {
        default: {
          document: {
            run: {
              font: 'Calibri',
              size: 22,
              color: '1E293B',
            },
          },
        },
      },
      sections: [
        {
          properties: {
            page: {
              margin: {
                top: 1000,
                bottom: 1000,
                left: 1200,
                right: 1200,
              },
            },
          },
          children: docChildren,
        },
      ],
    })

    // Generate Blob and trigger browser download
    const blob = await Packer.toBlob(doc)
    const dateStamp = now.toISOString().slice(0, 10)
    const timeStamp = now.toTimeString().slice(0, 5).replace(':', '')
    const downloadFilename =
      filename ||
      `Riko_Speaking_Notes_${dateStamp}_${timeStamp}.docx`

    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = downloadFilename
      anchor.style.display = 'none'
      document.body.appendChild(anchor)
      anchor.click()
      setTimeout(() => {
        document.body.removeChild(anchor)
        URL.revokeObjectURL(url)
      }, 500)
    }

    return {
      success: true,
      filename: downloadFilename,
      itemCount: allItems.length,
      blob,
    }
  }
}
