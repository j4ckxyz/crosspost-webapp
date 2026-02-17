import { forwardRef, useEffect, useImperativeHandle, useMemo, useState } from 'react'
import { Loader2, RefreshCw, Trash2 } from 'lucide-react'

import { cancelJob, listJobs } from '@/lib/api'
import type { JobSummary } from '@/lib/types'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'

export type QueuePaneRef = {
  refreshNow: () => Promise<void>
}

function getBadgeVariant(status: string) {
  if (status === 'scheduled') {
    return 'secondary'
  }
  if (status === 'completed') {
    return 'success'
  }
  if (status === 'cancelled') {
    return 'outline'
  }
  if (status === 'failed') {
    return 'destructive'
  }
  return 'outline'
}

function formatDateTime(input: string) {
  const date = new Date(input)
  if (Number.isNaN(date.getTime())) {
    return input
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date)
}

export const QueuePane = forwardRef<QueuePaneRef>(function QueuePane(_, ref) {
  const [jobs, setJobs] = useState<JobSummary[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [cancellingJobId, setCancellingJobId] = useState<string | null>(null)

  async function refreshNow() {
    setLoading(true)
    setError(null)
    try {
      const response = await listJobs()
      setJobs(response.jobs ?? [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to load scheduled jobs.')
    } finally {
      setLoading(false)
    }
  }

  useImperativeHandle(ref, () => ({ refreshNow }))

  useEffect(() => {
    void refreshNow()

    const interval = window.setInterval(() => {
      void refreshNow()
    }, 30000)

    return () => window.clearInterval(interval)
  }, [])

  const sortedJobs = useMemo(
    () => [...jobs].sort((a, b) => new Date(b.runAt).getTime() - new Date(a.runAt).getTime()),
    [jobs],
  )

  async function handleCancel(jobId: string) {
    setCancellingJobId(jobId)

    try {
      await cancelJob(jobId)
      await refreshNow()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to cancel this job.')
    } finally {
      setCancellingJobId(null)
    }
  }

  return (
    <Card className='animate-fade-in'>
      <CardHeader>
        <div className='flex items-center justify-between gap-3'>
          <div>
            <CardTitle>Scheduled jobs</CardTitle>
            <CardDescription>
              Shows jobs queued by the gateway scheduler endpoint.
            </CardDescription>
          </div>
          <Button variant='outline' size='sm' onClick={() => void refreshNow()} disabled={loading}>
            {loading ? (
              <Loader2 className='h-4 w-4 animate-spin' />
            ) : (
              <RefreshCw className='h-4 w-4' />
            )}
            Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className='space-y-3'>
        {error ? <p className='text-sm text-destructive'>{error}</p> : null}
        {sortedJobs.length === 0 ? (
          <div className='rounded-md border border-border/60 bg-muted/40 px-3 py-8 text-center text-sm text-muted-foreground'>
            No jobs queued yet.
          </div>
        ) : (
          sortedJobs.map((job) => (
            <div
              key={job.id}
              className='flex flex-col gap-3 rounded-lg border border-border/60 bg-muted/30 p-3 sm:flex-row sm:items-center sm:justify-between'
            >
              <div className='space-y-1'>
                <div className='flex flex-wrap items-center gap-2'>
                  <Badge variant={getBadgeVariant(job.status)}>{job.status}</Badge>
                  <span className='font-mono text-xs text-muted-foreground'>{job.id}</span>
                </div>
                <p className='text-sm'>Run at: {formatDateTime(job.runAt)}</p>
                <p className='text-xs text-muted-foreground'>
                  Created: {formatDateTime(job.createdAt)} · Attempts: {job.attemptCount}
                </p>
              </div>
              <div>
                <Button
                  size='sm'
                  variant='ghost'
                  onClick={() => void handleCancel(job.id)}
                  disabled={job.status !== 'scheduled' || cancellingJobId === job.id}
                >
                  {cancellingJobId === job.id ? (
                    <Loader2 className='h-4 w-4 animate-spin' />
                  ) : (
                    <Trash2 className='h-4 w-4' />
                  )}
                  Cancel
                </Button>
              </div>
            </div>
          ))
        )}
      </CardContent>
    </Card>
  )
})
