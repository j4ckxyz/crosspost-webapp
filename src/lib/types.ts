export type ThemePreference = 'system' | 'light' | 'dark'

export type AppTab = 'compose' | 'queue' | 'settings'

export type Platform = 'x' | 'bluesky' | 'mastodon'

export type ThreadSegment = {
  text: string
}

export type TargetSelection = {
  x: boolean
  bluesky: boolean
  mastodon: boolean
}

export type DraftMedia = {
  id: string
  file: File
  threadIndex: number
  altText: string
}

export type ComposeDraft = {
  mode: 'single' | 'thread'
  text: string
  thread: ThreadSegment[]
  scheduleAt: string
  selectedTargets: TargetSelection
  clientRequestId: string
  media: DraftMedia[]
}

export type HelperSettings = {
  gatewayBaseUrl: string
  configured: {
    gatewayApiKey: boolean
    x: boolean
    bluesky: boolean
    mastodon: boolean
  }
  profile: {
    blueskyIdentifier: string
    blueskyPdsUrl: string
    mastodonInstanceUrl: string
    mastodonVisibility: string
  }
}

export type LimitsResponse = {
  x: {
    maxCharacters: number
    assumedUserTier: string
  }
  bluesky: {
    maxCharacters: number
    mediaRule: string
  }
  mastodon?: {
    instanceUrl: string
    maxCharacters: number
    maxMediaAttachments: number
    charactersReservedPerUrl?: number
    supportedMimeTypes?: string[]
    imageSizeLimit?: number
    videoSizeLimit?: number
    fetchedAt?: string
  }
}

export type PublishRequestBody = {
  text?: string
  thread?: ThreadSegment[]
  scheduleAt?: string
  clientRequestId?: string
  selectedTargets: TargetSelection
  media?: {
    threadIndex: number
    altText?: string
  }[]
}

export type PublishResponse = {
  overall?: 'success' | 'partial' | 'failed'
  postedAt?: string
  clientRequestId?: string
  deliveries?: Record<
    string,
    {
      ok: boolean
      platform: string
      id?: string
      url?: string
      error?: string
    }
  >
  scheduled?: boolean
  job?: JobSummary
}

export type JobSummary = {
  id: string
  createdAt: string
  runAt: string
  status: string
  attemptCount: number
  completedAt?: string
}

export type JobsResponse = {
  jobs: JobSummary[]
}

export type ProblemDetails = {
  type?: string
  title?: string
  status?: number
  detail?: string
  instance?: string
}
