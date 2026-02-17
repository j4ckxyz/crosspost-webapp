import Fastify from 'fastify'
import fastifyMultipart from '@fastify/multipart'
import fastifyStatic from '@fastify/static'
import keytar from 'keytar'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { existsSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const HELPER_PORT = Number(process.env.HELPER_PORT ?? 43123)
const HELPER_HOST = process.env.HELPER_HOST ?? '127.0.0.1'
const KEYCHAIN_SERVICE = 'crosspost-webapp'
const KEYCHAIN_ACCOUNT = 'gateway-secrets'
const CONFIG_DIR = path.join(os.homedir(), '.crosspost-webapp')
const CONFIG_PATH = path.join(CONFIG_DIR, 'config.json')
const DIST_DIR = path.resolve(__dirname, '../dist')
const DEFAULT_GATEWAY_BASE_URL = 'http://127.0.0.1:38081'

class HelperError extends Error {
  constructor(status, message) {
    super(message)
    this.name = 'HelperError'
    this.status = status
  }
}

function problem(status, title, detail, type = 'about:blank') {
  return { type, title, status, detail }
}

function normalizeBaseUrl(input) {
  if (typeof input !== 'string' || !input.trim()) {
    return null
  }

  let normalized

  try {
    normalized = new URL(input.trim())
  } catch {
    return null
  }

  if (normalized.protocol !== 'http:' && normalized.protocol !== 'https:') {
    return null
  }

  normalized.pathname = normalized.pathname.replace(/\/$/, '')
  normalized.search = ''
  normalized.hash = ''

  return normalized.toString().replace(/\/$/, '')
}

function trimToUndefined(value) {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : undefined
}

async function ensureConfigDir() {
  await mkdir(CONFIG_DIR, { recursive: true })
}

async function readConfig() {
  await ensureConfigDir()

  if (!existsSync(CONFIG_PATH)) {
    return { gatewayBaseUrl: DEFAULT_GATEWAY_BASE_URL }
  }

  try {
    const raw = await readFile(CONFIG_PATH, 'utf8')
    const parsed = JSON.parse(raw)
    const normalized = normalizeBaseUrl(parsed.gatewayBaseUrl)
    return {
      gatewayBaseUrl: normalized ?? DEFAULT_GATEWAY_BASE_URL,
    }
  } catch {
    return { gatewayBaseUrl: DEFAULT_GATEWAY_BASE_URL }
  }
}

async function writeConfig(config) {
  await ensureConfigDir()
  await writeFile(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8')
}

async function readSecrets() {
  const raw = await keytar.getPassword(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)

  if (!raw) {
    return {}
  }

  try {
    return JSON.parse(raw)
  } catch {
    return {}
  }
}

async function writeSecrets(nextSecrets) {
  await keytar.setPassword(
    KEYCHAIN_SERVICE,
    KEYCHAIN_ACCOUNT,
    JSON.stringify(nextSecrets),
  )
}

function summarizeSecrets(secrets) {
  return {
    gatewayApiKey: Boolean(secrets.gatewayApiKey),
    x: Boolean(secrets.x?.authToken),
    bluesky: Boolean(
      secrets.bluesky?.identifier &&
        secrets.bluesky?.pdsUrl &&
        secrets.bluesky?.appPassword,
    ),
    mastodon: Boolean(secrets.mastodon?.instanceUrl && secrets.mastodon?.accessToken),
  }
}

function resolveTargetsFromSelection(secrets, requestedTargets) {
  const hasX = Boolean(secrets.x?.authToken)
  const hasBluesky = Boolean(
    secrets.bluesky?.identifier &&
      secrets.bluesky?.pdsUrl &&
      secrets.bluesky?.appPassword,
  )
  const hasMastodon = Boolean(
    secrets.mastodon?.instanceUrl && secrets.mastodon?.accessToken,
  )

  const selected = requestedTargets ?? {
    x: hasX,
    bluesky: hasBluesky,
    mastodon: hasMastodon,
  }

  const missing = []
  const targets = {}

  if (selected.x) {
    if (!hasX) {
      missing.push('x')
    } else {
      targets.x = {
        authToken: secrets.x.authToken,
        client: 'web',
      }
    }
  }

  if (selected.bluesky) {
    if (!hasBluesky) {
      missing.push('bluesky')
    } else {
      targets.bluesky = {
        identifier: secrets.bluesky.identifier,
        pdsUrl: secrets.bluesky.pdsUrl,
        appPassword: secrets.bluesky.appPassword,
      }
    }
  }

  if (selected.mastodon) {
    if (!hasMastodon) {
      missing.push('mastodon')
    } else {
      targets.mastodon = {
        instanceUrl: secrets.mastodon.instanceUrl,
        accessToken: secrets.mastodon.accessToken,
        visibility: secrets.mastodon.visibility ?? 'public',
      }
    }
  }

  return {
    targets,
    missing,
    selectedCount: Object.values(selected).filter(Boolean).length,
  }
}

function sanitizeThread(thread) {
  if (!Array.isArray(thread)) {
    return undefined
  }

  const normalized = thread.map((segment) => ({
    text:
      typeof segment?.text === 'string'
        ? segment.text
        : segment?.text == null
          ? ''
          : String(segment.text),
  }))

  return normalized.length > 0 ? normalized : undefined
}

function sanitizeMedia(media) {
  if (!Array.isArray(media)) {
    return undefined
  }

  const normalized = media
    .map((item) => {
      const threadIndex = Number(item?.threadIndex)
      if (!Number.isInteger(threadIndex) || threadIndex < 0) {
        return null
      }

      const entry = { threadIndex }
      if (typeof item?.altText === 'string' && item.altText.trim().length > 0) {
        entry.altText = item.altText.trim()
      }

      return entry
    })
    .filter(Boolean)

  return normalized.length > 0 ? normalized : undefined
}

function buildGatewayPayload(clientPayload, targets) {
  const payload = {
    targets,
  }

  if (typeof clientPayload?.text === 'string' && clientPayload.text.length > 0) {
    payload.text = clientPayload.text
  }

  const thread = sanitizeThread(clientPayload?.thread)
  if (thread) {
    payload.thread = thread
  }

  if (
    typeof clientPayload?.scheduleAt === 'string' &&
    clientPayload.scheduleAt.trim().length > 0
  ) {
    payload.scheduleAt = clientPayload.scheduleAt
  }

  if (
    typeof clientPayload?.clientRequestId === 'string' &&
    clientPayload.clientRequestId.trim().length > 0
  ) {
    payload.clientRequestId = clientPayload.clientRequestId.trim()
  }

  const media = sanitizeMedia(clientPayload?.media)
  if (media) {
    payload.media = media
  }

  return payload
}

async function gatewayFetch(config, secrets, route, options = {}) {
  if (!secrets.gatewayApiKey) {
    throw new HelperError(400, 'Missing gateway API key in secure local storage.')
  }

  const url = new URL(route, config.gatewayBaseUrl)

  const headers = new Headers(options.headers ?? {})
  headers.set('Authorization', `Bearer ${secrets.gatewayApiKey}`)

  return fetch(url, {
    ...options,
    headers,
  })
}

async function relayUpstream(reply, upstreamResponse) {
  const contentType = upstreamResponse.headers.get('content-type')
  const payloadText = await upstreamResponse.text()

  if (contentType) {
    reply.header('content-type', contentType)
  }

  reply.code(upstreamResponse.status)

  if (contentType?.includes('application/json') || contentType?.includes('problem+json')) {
    try {
      return reply.send(JSON.parse(payloadText))
    } catch {
      return reply.send(payloadText)
    }
  }

  return reply.send(payloadText)
}

const app = Fastify({
  logger: true,
  bodyLimit: 80 * 1024 * 1024,
})

await app.register(fastifyMultipart, {
  limits: {
    files: 12,
    fileSize: 60 * 1024 * 1024,
  },
})

app.addHook('onSend', async (_request, reply, payload) => {
  reply.header('x-content-type-options', 'nosniff')
  reply.header('x-frame-options', 'DENY')
  reply.header('referrer-policy', 'no-referrer')
  return payload
})

app.get('/api/health', async () => {
  return {
    ok: true,
    mode: existsSync(DIST_DIR) ? 'production' : 'development',
  }
})

app.get('/api/settings', async () => {
  const [config, secrets] = await Promise.all([readConfig(), readSecrets()])
  return {
    gatewayBaseUrl: config.gatewayBaseUrl,
    configured: summarizeSecrets(secrets),
    profile: {
      blueskyIdentifier: secrets.bluesky?.identifier ?? '',
      blueskyPdsUrl: secrets.bluesky?.pdsUrl ?? 'https://bsky.social',
      mastodonInstanceUrl: secrets.mastodon?.instanceUrl ?? '',
      mastodonVisibility: secrets.mastodon?.visibility ?? 'public',
    },
  }
})

app.post('/api/settings/gateway', async (request, reply) => {
  const body =
    request.body && typeof request.body === 'object' ? request.body : {}
  const nextUrl = normalizeBaseUrl(body?.gatewayBaseUrl)

  if (!nextUrl) {
    return reply.code(400).send(
      problem(
        400,
        'Invalid gateway URL',
        'Provide a valid http:// or https:// gateway base URL.',
      ),
    )
  }

  await writeConfig({ gatewayBaseUrl: nextUrl })

  return { gatewayBaseUrl: nextUrl }
})

app.post('/api/settings/secrets', async (request, reply) => {
  const body =
    request.body && typeof request.body === 'object' ? request.body : {}
  const current = await readSecrets()
  const next = { ...current }

  if (Object.hasOwn(body, 'gatewayApiKey')) {
    const gatewayApiKey = trimToUndefined(body.gatewayApiKey)
    if (gatewayApiKey) {
      next.gatewayApiKey = gatewayApiKey
    } else {
      delete next.gatewayApiKey
    }
  }

  if (Object.hasOwn(body, 'xAuthToken')) {
    const authToken = trimToUndefined(body.xAuthToken)
    if (authToken) {
      next.x = { authToken }
    } else {
      delete next.x
    }
  }

  const touchesBluesky =
    Object.hasOwn(body, 'blueskyIdentifier') ||
    Object.hasOwn(body, 'blueskyPdsUrl') ||
    Object.hasOwn(body, 'blueskyAppPassword')

  if (touchesBluesky) {
    const identifier = trimToUndefined(body.blueskyIdentifier)
    const pdsUrlRaw = trimToUndefined(body.blueskyPdsUrl)
    const appPassword = trimToUndefined(body.blueskyAppPassword)
    const pdsUrl = pdsUrlRaw ? normalizeBaseUrl(pdsUrlRaw) : undefined

    if (!identifier && !pdsUrl && !appPassword) {
      delete next.bluesky
    } else if (identifier && pdsUrl && appPassword) {
      next.bluesky = {
        identifier,
        pdsUrl,
        appPassword,
      }
    } else {
      return reply.code(400).send(
        problem(
          400,
          'Bluesky credentials incomplete',
          'Set identifier, PDS URL, and app password together, or clear all three.',
        ),
      )
    }
  }

  const touchesMastodon =
    Object.hasOwn(body, 'mastodonInstanceUrl') ||
    Object.hasOwn(body, 'mastodonAccessToken') ||
    Object.hasOwn(body, 'mastodonVisibility')

  if (touchesMastodon) {
    const instanceUrlRaw = trimToUndefined(body.mastodonInstanceUrl)
    const accessToken = trimToUndefined(body.mastodonAccessToken)
    const visibility = trimToUndefined(body.mastodonVisibility) ?? 'public'
    const instanceUrl = instanceUrlRaw ? normalizeBaseUrl(instanceUrlRaw) : undefined

    if (!instanceUrl && !accessToken) {
      delete next.mastodon
    } else if (instanceUrl && accessToken) {
      next.mastodon = {
        instanceUrl,
        accessToken,
        visibility,
      }
    } else {
      return reply.code(400).send(
        problem(
          400,
          'Mastodon credentials incomplete',
          'Set instance URL and access token together, or clear both fields.',
        ),
      )
    }
  }

  await writeSecrets(next)

  return {
    configured: summarizeSecrets(next),
    profile: {
      blueskyIdentifier: next.bluesky?.identifier ?? '',
      blueskyPdsUrl: next.bluesky?.pdsUrl ?? 'https://bsky.social',
      mastodonInstanceUrl: next.mastodon?.instanceUrl ?? '',
      mastodonVisibility: next.mastodon?.visibility ?? 'public',
    },
  }
})

app.get('/api/limits', async (request, reply) => {
  try {
    const [config, secrets] = await Promise.all([readConfig(), readSecrets()])
    const query = new URLSearchParams()

    if (secrets.mastodon?.instanceUrl) {
      query.set('mastodonInstanceUrl', secrets.mastodon.instanceUrl)
    }

    if (secrets.mastodon?.accessToken) {
      query.set('mastodonAccessToken', secrets.mastodon.accessToken)
    }

    const upstream = await gatewayFetch(
      config,
      secrets,
      `/v1/limits${query.size > 0 ? `?${query.toString()}` : ''}`,
    )
    return relayUpstream(reply, upstream)
  } catch (error) {
    const status = error instanceof HelperError ? error.status : 500
    return reply
      .code(status)
      .send(problem(status, 'Failed to fetch limits', error.message))
  }
})

app.post('/api/posts', async (request, reply) => {
  const contentType = request.headers['content-type'] ?? ''

  try {
    const [config, secrets] = await Promise.all([readConfig(), readSecrets()])

    if (contentType.includes('multipart/form-data')) {
      const parts = request.parts()
      let payloadRaw = ''
      const uploadedMedia = []

      for await (const part of parts) {
        if (part.type === 'file') {
          uploadedMedia.push({
            filename: part.filename ?? 'upload.bin',
            mimetype: part.mimetype ?? 'application/octet-stream',
            data: await part.toBuffer(),
          })
        } else if (part.type === 'field' && part.fieldname === 'payload') {
          payloadRaw = String(part.value ?? '')
        }
      }

      if (!payloadRaw) {
        return reply
          .code(400)
          .send(problem(400, 'Missing payload', 'payload field is required.'))
      }

      let clientPayload

      try {
        clientPayload = JSON.parse(payloadRaw)
      } catch {
        return reply
          .code(400)
          .send(problem(400, 'Invalid payload JSON', 'payload must be valid JSON.'))
      }

      const resolvedTargets = resolveTargetsFromSelection(
        secrets,
        clientPayload.selectedTargets,
      )

      if (resolvedTargets.selectedCount === 0) {
        return reply.code(400).send(
          problem(
            400,
            'No targets selected',
            'Select at least one platform target before publishing.',
          ),
        )
      }

      if (resolvedTargets.missing.length > 0) {
        return reply.code(400).send(
          problem(
            400,
            'Missing credentials',
            `Credentials missing for: ${resolvedTargets.missing.join(', ')}`,
          ),
        )
      }

      const gatewayPayload = buildGatewayPayload(clientPayload, resolvedTargets.targets)
      const formData = new FormData()
      formData.append('payload', JSON.stringify(gatewayPayload))

      for (const media of uploadedMedia) {
        formData.append(
          'media',
          new Blob([media.data], { type: media.mimetype }),
          media.filename,
        )
      }

      const upstream = await gatewayFetch(config, secrets, '/v1/posts', {
        method: 'POST',
        body: formData,
      })

      return relayUpstream(reply, upstream)
    }

    const clientPayload =
      request.body && typeof request.body === 'object' ? request.body : {}
    const resolvedTargets = resolveTargetsFromSelection(
      secrets,
      clientPayload.selectedTargets,
    )

    if (resolvedTargets.selectedCount === 0) {
      return reply.code(400).send(
        problem(
          400,
          'No targets selected',
          'Select at least one platform target before publishing.',
        ),
      )
    }

    if (resolvedTargets.missing.length > 0) {
      return reply.code(400).send(
        problem(
          400,
          'Missing credentials',
          `Credentials missing for: ${resolvedTargets.missing.join(', ')}`,
        ),
      )
    }

    const gatewayPayload = buildGatewayPayload(clientPayload, resolvedTargets.targets)
    const upstream = await gatewayFetch(config, secrets, '/v1/posts', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
      },
      body: JSON.stringify(gatewayPayload),
    })

    return relayUpstream(reply, upstream)
  } catch (error) {
    const status = error instanceof HelperError ? error.status : 500
    return reply.code(status).send(problem(status, 'Publish failed', error.message))
  }
})

app.get('/api/jobs', async (_request, reply) => {
  try {
    const [config, secrets] = await Promise.all([readConfig(), readSecrets()])
    const upstream = await gatewayFetch(config, secrets, '/v1/jobs')
    return relayUpstream(reply, upstream)
  } catch (error) {
    const status = error instanceof HelperError ? error.status : 500
    return reply.code(status).send(problem(status, 'Failed to load jobs', error.message))
  }
})

app.get('/api/jobs/:jobId', async (request, reply) => {
  try {
    const [config, secrets] = await Promise.all([readConfig(), readSecrets()])
    const upstream = await gatewayFetch(
      config,
      secrets,
      `/v1/jobs/${request.params.jobId}`,
    )
    return relayUpstream(reply, upstream)
  } catch (error) {
    const status = error instanceof HelperError ? error.status : 500
    return reply
      .code(status)
      .send(problem(status, 'Failed to load job details', error.message))
  }
})

app.delete('/api/jobs/:jobId', async (request, reply) => {
  try {
    const [config, secrets] = await Promise.all([readConfig(), readSecrets()])
    const upstream = await gatewayFetch(
      config,
      secrets,
      `/v1/jobs/${request.params.jobId}`,
      { method: 'DELETE' },
    )
    return relayUpstream(reply, upstream)
  } catch (error) {
    const status = error instanceof HelperError ? error.status : 500
    return reply.code(status).send(problem(status, 'Failed to cancel job', error.message))
  }
})

if (existsSync(DIST_DIR)) {
  await app.register(fastifyStatic, {
    root: DIST_DIR,
    prefix: '/',
  })

  const indexHtml = await readFile(path.join(DIST_DIR, 'index.html'), 'utf8')

  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith('/api/')) {
      return reply
        .code(404)
        .send(problem(404, 'Not found', 'No matching helper API route found.'))
    }

    reply.type('text/html').send(indexHtml)
  })
} else {
  app.setNotFoundHandler((request, reply) => {
    if (request.raw.url?.startsWith('/api/')) {
      return reply
        .code(404)
        .send(problem(404, 'Not found', 'No matching helper API route found.'))
    }

    return reply.code(404).send(
      problem(
        404,
        'Frontend not built yet',
        'Run "npm run build" then "npm run start" to serve the web app from the helper.',
      ),
    )
  })
}

try {
  await app.listen({
    port: HELPER_PORT,
    host: HELPER_HOST,
  })
} catch (error) {
  app.log.error(error)
  process.exit(1)
}
