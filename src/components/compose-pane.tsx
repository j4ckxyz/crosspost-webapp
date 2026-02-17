import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  CheckCircle2,
  Clock3,
  Loader2,
  Plus,
  Save,
  Send,
  Trash2,
  TriangleAlert,
  Upload,
  X,
} from 'lucide-react'

import { publish } from '@/lib/api'
import { loadDraft, saveDraft } from '@/lib/draft-storage'
import type {
  ComposeDraft,
  DraftMedia,
  HelperSettings,
  LimitsResponse,
  PublishRequestBody,
  PublishResponse,
  TargetSelection,
  ThreadSegment,
} from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Switch } from '@/components/ui/switch'
import { Textarea } from '@/components/ui/textarea'

export type ComposePaneRef = {
  publishNow: () => void
  publishScheduled: () => void
  saveCurrentDraft: () => void
}

type ComposePaneProps = {
  limits: LimitsResponse | null
  configured: HelperSettings['configured'] | null
  onRefreshLimits: () => Promise<void>
  onPublished: () => void
}

const DEFAULT_TARGETS: TargetSelection = {
  x: true,
  bluesky: true,
  mastodon: true,
}

function countCharacters(input: string) {
  return [...input].length
}

function formatBytes(bytes: number) {
  if (bytes < 1024) {
    return `${bytes} B`
  }
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`
  }
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function createDraftId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `media-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`
}

export const ComposePane = forwardRef<ComposePaneRef, ComposePaneProps>(function ComposePane(
  { limits, configured, onRefreshLimits, onPublished },
  ref,
) {
  const [mode, setMode] = useState<'single' | 'thread'>('single')
  const [text, setText] = useState('')
  const [thread, setThread] = useState<ThreadSegment[]>([{ text: '' }, { text: '' }])
  const [scheduleAt, setScheduleAt] = useState('')
  const [selectedTargets, setSelectedTargets] = useState<TargetSelection>(DEFAULT_TARGETS)
  const [clientRequestId, setClientRequestId] = useState('')
  const [media, setMedia] = useState<DraftMedia[]>([])
  const [publishing, setPublishing] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [statusIsError, setStatusIsError] = useState(false)
  const [lastResponse, setLastResponse] = useState<PublishResponse | null>(null)
  const fileInputRef = useRef<HTMLInputElement | null>(null)
  const initializedTargetsRef = useRef(false)

  useEffect(() => {
    const draft = loadDraft()

    if (!draft) {
      return
    }

    setMode(draft.mode)
    setText(draft.text)
    setThread(draft.thread.length > 0 ? draft.thread : [{ text: '' }])
    setScheduleAt(draft.scheduleAt)
    setSelectedTargets(draft.selectedTargets)
    setClientRequestId(draft.clientRequestId)
    setMedia([])
  }, [])

  useEffect(() => {
    if (!configured || initializedTargetsRef.current) {
      return
    }

    const nextTargets = {
      x: configured.x,
      bluesky: configured.bluesky,
      mastodon: configured.mastodon,
    }

    if (!Object.values(nextTargets).some(Boolean)) {
      initializedTargetsRef.current = true
      return
    }

    setSelectedTargets(nextTargets)
    initializedTargetsRef.current = true
  }, [configured])

  function setTargetEnabled(target: keyof TargetSelection, enabled: boolean) {
    setSelectedTargets((current) => ({
      ...current,
      [target]: enabled,
    }))
  }

  function addThreadSegment() {
    setThread((current) => [...current, { text: '' }])
  }

  function removeThreadSegment(index: number) {
    setThread((current) => {
      if (current.length <= 1) {
        return current
      }
      return current.filter((_, itemIndex) => itemIndex !== index)
    })

    setMedia((current) =>
      current.map((entry) => {
        if (entry.threadIndex > index) {
          return { ...entry, threadIndex: entry.threadIndex - 1 }
        }
        if (entry.threadIndex === index) {
          return { ...entry, threadIndex: Math.max(0, entry.threadIndex - 1) }
        }
        return entry
      }),
    )
  }

  function updateThreadSegment(index: number, nextValue: string) {
    setThread((current) =>
      current.map((segment, segmentIndex) =>
        segmentIndex === index ? { ...segment, text: nextValue } : segment,
      ),
    )
  }

  function addMediaFiles(files: FileList | null) {
    if (!files || files.length === 0) {
      return
    }

    const nextItems: DraftMedia[] = Array.from(files).map((file) => ({
      id: createDraftId(),
      file,
      threadIndex: 0,
      altText: '',
    }))

    setMedia((current) => [...current, ...nextItems])
  }

  function removeMedia(mediaId: string) {
    setMedia((current) => current.filter((entry) => entry.id !== mediaId))
  }

  function updateMedia(mediaId: string, next: Partial<DraftMedia>) {
    setMedia((current) =>
      current.map((entry) => (entry.id === mediaId ? { ...entry, ...next } : entry)),
    )
  }

  function getValidationErrors(wantsSchedule: boolean) {
    const errors: string[] = []
    const hasSelectedTarget = Object.values(selectedTargets).some(Boolean)

    if (!hasSelectedTarget) {
      errors.push('Select at least one target platform.')
    }

    const texts = mode === 'single' ? [text] : thread.map((segment) => segment.text)
    const trimmedSegments = texts.map((value) => value.trim())

    if (trimmedSegments.every((value) => value.length === 0)) {
      errors.push('Add post text before publishing.')
    }

    if (mode === 'thread' && trimmedSegments.some((value) => value.length === 0)) {
      errors.push('Each thread segment should contain text.')
    }

    const xLimit = limits?.x.maxCharacters ?? 280
    const blueskyLimit = limits?.bluesky.maxCharacters ?? 300
    const mastodonLimit = limits?.mastodon?.maxCharacters

    trimmedSegments.forEach((segment, index) => {
      const label = mode === 'single' ? 'Post' : `Segment ${index + 1}`
      const length = countCharacters(segment)

      if (selectedTargets.x && length > xLimit) {
        errors.push(`${label} exceeds X limit (${length}/${xLimit}).`)
      }

      if (selectedTargets.bluesky && length > blueskyLimit) {
        errors.push(`${label} exceeds Bluesky limit (${length}/${blueskyLimit}).`)
      }

      if (selectedTargets.mastodon && mastodonLimit && length > mastodonLimit) {
        errors.push(`${label} exceeds Mastodon limit (${length}/${mastodonLimit}).`)
      }
    })

    if (selectedTargets.bluesky) {
      const mediaBySegment = new Map<number, DraftMedia[]>()
      for (const entry of media) {
        const existing = mediaBySegment.get(entry.threadIndex) ?? []
        existing.push(entry)
        mediaBySegment.set(entry.threadIndex, existing)
      }

      for (const [threadIndex, entries] of mediaBySegment.entries()) {
        const videos = entries.filter((entry) => entry.file.type.startsWith('video/'))
        const images = entries.filter((entry) => entry.file.type.startsWith('image/'))

        if (videos.length > 1) {
          errors.push(`Bluesky segment ${threadIndex + 1} allows only one video.`)
        }

        if (videos.length === 1 && images.length > 0) {
          errors.push(
            `Bluesky segment ${threadIndex + 1} cannot mix video and images together.`,
          )
        }

        if (videos.length === 0 && images.length > 4) {
          errors.push(`Bluesky segment ${threadIndex + 1} supports up to 4 images.`)
        }
      }
    }

    if (selectedTargets.mastodon && limits?.mastodon?.maxMediaAttachments) {
      const mediaBySegment = new Map<number, number>()
      for (const entry of media) {
        mediaBySegment.set(entry.threadIndex, (mediaBySegment.get(entry.threadIndex) ?? 0) + 1)
      }

      for (const [threadIndex, total] of mediaBySegment.entries()) {
        if (total > limits.mastodon.maxMediaAttachments) {
          errors.push(
            `Mastodon segment ${threadIndex + 1} exceeds max media (${total}/${limits.mastodon.maxMediaAttachments}).`,
          )
        }
      }
    }

    if (wantsSchedule) {
      if (!scheduleAt.trim()) {
        errors.push('Set a schedule date/time before scheduling.')
      } else if (Number.isNaN(new Date(scheduleAt).getTime())) {
        errors.push('Schedule date/time is invalid.')
      }
    }

    return errors
  }

  function buildPayload(wantsSchedule: boolean): PublishRequestBody {
    const payload: PublishRequestBody = {
      selectedTargets,
    }

    if (mode === 'single') {
      payload.text = text
    } else {
      payload.thread = thread
    }

    if (wantsSchedule && scheduleAt.trim().length > 0) {
      payload.scheduleAt = new Date(scheduleAt).toISOString()
    }

    const trimmedClientRequestId = clientRequestId.trim()
    if (trimmedClientRequestId.length > 0) {
      payload.clientRequestId = trimmedClientRequestId
    } else {
      payload.clientRequestId = `web-${Date.now()}`
    }

    if (media.length > 0) {
      payload.media = media.map((entry) => ({
        threadIndex: mode === 'single' ? 0 : entry.threadIndex,
        altText: entry.altText.trim() || undefined,
      }))
    }

    return payload
  }

  function saveCurrentDraft() {
    const serializableDraft: Omit<ComposeDraft, 'media'> & {
      media: Array<{ id: string; threadIndex: number; altText: string }>
    } = {
      mode,
      text,
      thread,
      scheduleAt,
      selectedTargets,
      clientRequestId,
      media: media.map((entry) => ({
        id: entry.id,
        threadIndex: entry.threadIndex,
        altText: entry.altText,
      })),
    }

    saveDraft(serializableDraft)
    setStatusMessage('Draft saved locally. Media files are not persisted by the browser.')
    setStatusIsError(false)
  }

  async function submit(wantsSchedule: boolean) {
    const errors = getValidationErrors(wantsSchedule)

    if (errors.length > 0) {
      setStatusMessage(errors[0])
      setStatusIsError(true)
      return
    }

    setPublishing(true)
    setStatusMessage(null)
    setStatusIsError(false)

    try {
      const payload = buildPayload(wantsSchedule)
      const files = media.map((entry) => entry.file)
      const response = await publish(payload, files)

      setLastResponse(response)
      setStatusIsError(false)
      setStatusMessage(
        response.scheduled
          ? `Scheduled successfully (${response.job?.id ?? 'job queued'}).`
          : response.overall === 'partial'
            ? 'Published with partial delivery. Review target results below.'
            : 'Published successfully.',
      )

      if (response.scheduled || response.overall === 'success') {
        setMedia([])
      }

      onPublished()
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to publish.')
      setStatusIsError(true)
    } finally {
      setPublishing(false)
    }
  }

  useImperativeHandle(ref, () => ({
    publishNow: () => {
      void submit(false)
    },
    publishScheduled: () => {
      void submit(true)
    },
    saveCurrentDraft,
  }))

  const deliveryEntries = useMemo(
    () =>
      lastResponse?.deliveries
        ? Object.entries(lastResponse.deliveries)
        : ([] as Array<[string, { ok: boolean; error?: string; url?: string }]>),
    [lastResponse],
  )

  return (
    <div className='grid gap-4 lg:grid-cols-[1.5fr_1fr]'>
      <Card className='animate-fade-in'>
        <CardHeader>
          <CardTitle>Compose</CardTitle>
          <CardDescription>
            Draft once, then fan out to X, Bluesky, and Mastodon through your helper.
          </CardDescription>
        </CardHeader>
        <CardContent className='space-y-5'>
          <div className='flex flex-wrap items-center gap-2'>
            <Button
              type='button'
              size='sm'
              variant={mode === 'single' ? 'default' : 'outline'}
              onClick={() => setMode('single')}
            >
              Single post
            </Button>
            <Button
              type='button'
              size='sm'
              variant={mode === 'thread' ? 'default' : 'outline'}
              onClick={() => setMode('thread')}
            >
              Thread
            </Button>
            <Badge variant='outline'>Shortcut: Ctrl/Cmd + Enter</Badge>
          </div>

          {mode === 'single' ? (
            <div className='space-y-2'>
              <Label htmlFor='single-text'>Post text</Label>
              <Textarea
                id='single-text'
                rows={7}
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder='Write your post...'
              />
              <div className='text-xs text-muted-foreground'>
                {countCharacters(text)} chars · X {limits?.x.maxCharacters ?? 280} · Bluesky{' '}
                {limits?.bluesky.maxCharacters ?? 300}
                {limits?.mastodon ? ` · Mastodon ${limits.mastodon.maxCharacters}` : ''}
              </div>
            </div>
          ) : (
            <div className='space-y-3'>
              {thread.map((segment, index) => (
                <div key={`segment-${index}`} className='rounded-md border border-border/70 p-3'>
                  <div className='mb-2 flex items-center justify-between'>
                    <Label htmlFor={`thread-${index}`}>Segment {index + 1}</Label>
                    <div className='flex items-center gap-2'>
                      <span className='text-xs text-muted-foreground'>
                        {countCharacters(segment.text)} chars
                      </span>
                      {thread.length > 1 ? (
                        <Button
                          type='button'
                          variant='ghost'
                          size='icon'
                          onClick={() => removeThreadSegment(index)}
                        >
                          <X className='h-4 w-4' />
                        </Button>
                      ) : null}
                    </div>
                  </div>
                  <Textarea
                    id={`thread-${index}`}
                    value={segment.text}
                    onChange={(event) => updateThreadSegment(index, event.target.value)}
                    rows={4}
                    placeholder={`Thread segment ${index + 1}`}
                  />
                </div>
              ))}
              <Button type='button' variant='outline' onClick={addThreadSegment}>
                <Plus className='h-4 w-4' /> Add segment
              </Button>
            </div>
          )}

          <Separator />

          <div className='space-y-3'>
            <Label>Targets</Label>
            <div className='grid gap-2 sm:grid-cols-3'>
              <div className='flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2'>
                <span className='text-sm'>X</span>
                <Switch
                  checked={selectedTargets.x}
                  onCheckedChange={(checked) => setTargetEnabled('x', checked)}
                />
              </div>
              <div className='flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2'>
                <span className='text-sm'>Bluesky</span>
                <Switch
                  checked={selectedTargets.bluesky}
                  onCheckedChange={(checked) => setTargetEnabled('bluesky', checked)}
                />
              </div>
              <div className='flex items-center justify-between rounded-md border border-border/60 bg-muted/30 px-3 py-2'>
                <span className='text-sm'>Mastodon</span>
                <Switch
                  checked={selectedTargets.mastodon}
                  onCheckedChange={(checked) => setTargetEnabled('mastodon', checked)}
                />
              </div>
            </div>
            <p className='text-xs text-muted-foreground'>
              Configured secrets: API key{' '}
              {configured?.gatewayApiKey ? 'ready' : 'missing'} · X {configured?.x ? 'ready' : 'missing'}
              {' · '}Bluesky {configured?.bluesky ? 'ready' : 'missing'} · Mastodon{' '}
              {configured?.mastodon ? 'ready' : 'missing'}
            </p>
          </div>

          <Separator />

          <div className='space-y-3'>
            <div className='flex flex-wrap items-center justify-between gap-2'>
              <Label>Media + alt text</Label>
              <Button
                type='button'
                variant='outline'
                size='sm'
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className='h-4 w-4' /> Add files
              </Button>
              <input
                ref={fileInputRef}
                type='file'
                multiple
                accept='image/*,video/mp4'
                className='hidden'
                onChange={(event) => {
                  addMediaFiles(event.target.files)
                  event.target.value = ''
                }}
              />
            </div>

            {media.length === 0 ? (
              <div className='rounded-md border border-dashed border-border/70 bg-muted/20 px-3 py-5 text-center text-sm text-muted-foreground'>
                No media attached yet.
              </div>
            ) : (
              <div className='space-y-3'>
                {media.map((entry, index) => (
                  <div
                    key={entry.id}
                    className='rounded-md border border-border/70 bg-muted/20 p-3'
                  >
                    <div className='mb-2 flex items-center justify-between gap-2'>
                      <div>
                        <p className='text-sm font-semibold'>{entry.file.name}</p>
                        <p className='text-xs text-muted-foreground'>
                          {entry.file.type || 'unknown'} · {formatBytes(entry.file.size)}
                        </p>
                      </div>
                      <Button
                        type='button'
                        variant='ghost'
                        size='icon'
                        onClick={() => removeMedia(entry.id)}
                      >
                        <Trash2 className='h-4 w-4' />
                      </Button>
                    </div>
                    <div className='grid gap-2 sm:grid-cols-[180px_1fr]'>
                      {mode === 'thread' ? (
                        <div className='space-y-2'>
                          <Label>Thread segment</Label>
                          <Select
                            value={String(entry.threadIndex)}
                            onValueChange={(value) =>
                              updateMedia(entry.id, { threadIndex: Number(value) })
                            }
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {thread.map((_, segmentIndex) => (
                                <SelectItem
                                  key={`media-${index}-segment-${segmentIndex}`}
                                  value={String(segmentIndex)}
                                >
                                  Segment {segmentIndex + 1}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : null}
                      <div className='space-y-2'>
                        <Label>Alt text</Label>
                        <Input
                          value={entry.altText}
                          onChange={(event) =>
                            updateMedia(entry.id, { altText: event.target.value })
                          }
                          placeholder='Describe this media for accessibility'
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Separator />

          <div className='grid gap-3 sm:grid-cols-[1fr_1fr]'>
            <div className='space-y-2'>
              <Label htmlFor='schedule-at'>Schedule at (optional)</Label>
              <Input
                id='schedule-at'
                type='datetime-local'
                value={scheduleAt}
                onChange={(event) => setScheduleAt(event.target.value)}
              />
            </div>
            <div className='space-y-2'>
              <Label htmlFor='client-request-id'>Client request ID (optional)</Label>
              <Input
                id='client-request-id'
                value={clientRequestId}
                onChange={(event) => setClientRequestId(event.target.value)}
                placeholder='ios-app-req-42'
                autoComplete='off'
              />
            </div>
          </div>

          <div className='flex flex-wrap gap-2'>
            <Button onClick={() => void submit(false)} disabled={publishing}>
              {publishing ? (
                <Loader2 className='h-4 w-4 animate-spin' />
              ) : (
                <Send className='h-4 w-4' />
              )}
              Publish now
            </Button>
            <Button variant='secondary' onClick={() => void submit(true)} disabled={publishing}>
              <Clock3 className='h-4 w-4' /> Schedule
            </Button>
            <Button variant='outline' onClick={saveCurrentDraft}>
              <Save className='h-4 w-4' /> Save draft
            </Button>
            <Button variant='ghost' onClick={() => void onRefreshLimits()}>
              Refresh limits
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className='space-y-4'>
        <Card className='animate-fade-in'>
          <CardHeader>
            <CardTitle>Validation</CardTitle>
            <CardDescription>Client checks mirror gateway preflight rules.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-2 text-sm text-muted-foreground'>
            <div className='rounded-md border border-border/60 bg-muted/30 px-3 py-2'>
              X char limit: {limits?.x.maxCharacters ?? 280}
            </div>
            <div className='rounded-md border border-border/60 bg-muted/30 px-3 py-2'>
              Bluesky char limit: {limits?.bluesky.maxCharacters ?? 300}
            </div>
            <div className='rounded-md border border-border/60 bg-muted/30 px-3 py-2'>
              Bluesky media rule: 1 video or 1-4 images per segment
            </div>
            <div className='rounded-md border border-border/60 bg-muted/30 px-3 py-2'>
              Mastodon char limit:{' '}
              {limits?.mastodon?.maxCharacters ? limits.mastodon.maxCharacters : 'not loaded'}
            </div>
          </CardContent>
        </Card>

        {statusMessage ? (
          <Card className='animate-fade-in'>
            <CardContent className='flex items-start gap-2 p-4'>
              {statusIsError ? (
                <TriangleAlert className='mt-0.5 h-4 w-4 text-destructive' />
              ) : (
                <CheckCircle2 className='mt-0.5 h-4 w-4 text-emerald-500' />
              )}
              <p className='text-sm'>{statusMessage}</p>
            </CardContent>
          </Card>
        ) : null}

        {deliveryEntries.length > 0 || lastResponse?.job ? (
          <Card className='animate-fade-in'>
            <CardHeader>
              <CardTitle>Last result</CardTitle>
              <CardDescription>
                {lastResponse?.scheduled
                  ? 'Scheduled response from gateway.'
                  : 'Per-platform delivery from gateway.'}
              </CardDescription>
            </CardHeader>
            <CardContent className='space-y-2'>
              {lastResponse?.job ? (
                <div className='rounded-md border border-border/60 bg-muted/30 px-3 py-2 text-sm'>
                  Job: <span className='font-mono text-xs'>{lastResponse.job.id}</span>
                </div>
              ) : null}
              {deliveryEntries.map(([platform, details]) => (
                <div
                  key={platform}
                  className='rounded-md border border-border/60 bg-muted/30 px-3 py-2'
                >
                  <div className='mb-1 flex items-center justify-between'>
                    <span className='text-sm font-semibold capitalize'>{platform}</span>
                    <Badge variant={details.ok ? 'success' : 'destructive'}>
                      {details.ok ? 'ok' : 'failed'}
                    </Badge>
                  </div>
                  {details.url ? (
                    <a
                      href={details.url}
                      target='_blank'
                      rel='noreferrer'
                      className='text-xs text-primary underline-offset-2 hover:underline'
                    >
                      {details.url}
                    </a>
                  ) : null}
                  {details.error ? (
                    <p className='text-xs text-destructive'>{details.error}</p>
                  ) : null}
                </div>
              ))}
            </CardContent>
          </Card>
        ) : null}
      </div>
    </div>
  )
})
