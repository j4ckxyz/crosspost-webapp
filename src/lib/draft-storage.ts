import type { ComposeDraft } from '@/lib/types'

const DRAFT_STORAGE_KEY = 'crosspost.compose-draft.v1'

type SerializableDraft = Omit<ComposeDraft, 'media'> & {
  media: {
    id: string
    threadIndex: number
    altText: string
  }[]
}

export function loadDraft(): SerializableDraft | null {
  const raw = localStorage.getItem(DRAFT_STORAGE_KEY)
  if (!raw) {
    return null
  }

  try {
    const parsed = JSON.parse(raw) as SerializableDraft

    if (!Array.isArray(parsed.thread) || !Array.isArray(parsed.media)) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}

export function saveDraft(draft: SerializableDraft) {
  localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft))
}

export function clearDraft() {
  localStorage.removeItem(DRAFT_STORAGE_KEY)
}
