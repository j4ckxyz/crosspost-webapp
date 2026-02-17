import type {
  HelperSettings,
  JobsResponse,
  LimitsResponse,
  ProblemDetails,
  PublishRequestBody,
  PublishResponse,
} from '@/lib/types'

function normalizeBasePath(input: string) {
  const trimmed = input.trim()

  if (!trimmed || trimmed === '/' || trimmed === '__CROSSPOST_BASE_PATH__') {
    return ''
  }

  return `/${trimmed.replace(/^\/+|\/+$/g, '')}`
}

function inferBasePathFromLocation() {
  if (typeof window === 'undefined') {
    return ''
  }

  const pathname = window.location.pathname

  if (!pathname || pathname === '/') {
    return ''
  }

  const trimmed = pathname.replace(/\/+$/, '')
  const segments = trimmed.split('/').filter(Boolean)

  if (segments.length === 0) {
    return ''
  }

  return `/${segments[0]}`
}

function resolveBasePath() {
  const globalValue =
    globalThis && typeof globalThis === 'object'
      ? (globalThis as { __CROSSPOST_BASE_PATH__?: unknown }).__CROSSPOST_BASE_PATH__
      : undefined
  const injected = typeof globalValue === 'string' ? normalizeBasePath(globalValue) : ''

  if (injected) {
    return injected
  }

  return inferBasePathFromLocation()
}

const APP_BASE_PATH = resolveBasePath()

function withBasePath(url: string) {
  const normalized = url.startsWith('/') ? url : `/${url}`
  return `${APP_BASE_PATH}${normalized}`
}

export class ApiError extends Error {
  status: number
  problem: ProblemDetails | null

  constructor(message: string, status: number, problem: ProblemDetails | null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.problem = problem
  }
}

async function request<T>(input: RequestInfo, init?: RequestInit): Promise<T> {
  const response = await fetch(input, {
    credentials: 'same-origin',
    ...init,
  })

  const contentType = response.headers.get('content-type') ?? ''
  const rawBody = await response.text()
  const parsed = contentType.includes('application/json')
    ? (rawBody ? JSON.parse(rawBody) : null)
    : rawBody

  if (!response.ok) {
    const problem =
      parsed && typeof parsed === 'object' ? (parsed as ProblemDetails) : null

    throw new ApiError(
      problem?.detail ??
        problem?.title ??
        `Request failed with status ${response.status}`,
      response.status,
      problem,
    )
  }

  return parsed as T
}

export function getHealth() {
  return request<{ ok: boolean; mode: string }>(withBasePath('/api/health'))
}

export function getSettings() {
  return request<HelperSettings>(withBasePath('/api/settings'))
}

export function saveGatewayBaseUrl(gatewayBaseUrl: string) {
  return request<{ gatewayBaseUrl: string }>(withBasePath('/api/settings/gateway'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ gatewayBaseUrl }),
  })
}

export function saveSecrets(input: {
  gatewayApiKey?: string
  xAuthToken?: string
  blueskyIdentifier?: string
  blueskyPdsUrl?: string
  blueskyAppPassword?: string
  mastodonInstanceUrl?: string
  mastodonAccessToken?: string
  mastodonVisibility?: string
}) {
  return request<{
    configured: HelperSettings['configured']
    profile: HelperSettings['profile']
  }>(withBasePath('/api/settings/secrets'), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(input),
  })
}

export function fetchLimits() {
  return request<LimitsResponse>(withBasePath('/api/limits'))
}

export function listJobs() {
  return request<JobsResponse>(withBasePath('/api/jobs'))
}

export function cancelJob(jobId: string) {
  return request<{ cancelled: boolean }>(
    withBasePath('/api/jobs/' + encodeURIComponent(jobId)),
    {
      method: 'DELETE',
    },
  )
}

export function publish(
  payload: PublishRequestBody,
  files: File[],
): Promise<PublishResponse> {
  if (files.length === 0) {
    return request<PublishResponse>(withBasePath('/api/posts'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
  }

  const formData = new FormData()
  formData.append('payload', JSON.stringify(payload))

  for (const file of files) {
    formData.append('media', file, file.name)
  }

  return request<PublishResponse>(withBasePath('/api/posts'), {
    method: 'POST',
    body: formData,
  })
}
