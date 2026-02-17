import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Command, Keyboard, Loader2, Sparkles } from 'lucide-react'

import { CommandPalette, type CommandAction } from '@/components/command-palette'
import { ComposePane, type ComposePaneRef } from '@/components/compose-pane'
import { QueuePane, type QueuePaneRef } from '@/components/queue-pane'
import { SettingsPane } from '@/components/settings-pane'
import { ShortcutsDialog } from '@/components/shortcuts-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { fetchLimits, getHealth, getSettings } from '@/lib/api'
import { useThemePreference } from '@/hooks/use-theme'
import type { AppTab, HelperSettings, LimitsResponse } from '@/lib/types'

function isEditableTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  return (
    target.tagName === 'INPUT' ||
    target.tagName === 'TEXTAREA' ||
    target.tagName === 'SELECT' ||
    target.isContentEditable
  )
}

function App() {
  const [activeTab, setActiveTab] = useState<AppTab>('compose')
  const [settings, setSettings] = useState<HelperSettings | null>(null)
  const [limits, setLimits] = useState<LimitsResponse | null>(null)
  const [helperMode, setHelperMode] = useState('unknown')
  const [loading, setLoading] = useState(true)
  const [bootError, setBootError] = useState<string | null>(null)
  const [commandOpen, setCommandOpen] = useState(false)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)
  const composeRef = useRef<ComposePaneRef>(null)
  const queueRef = useRef<QueuePaneRef>(null)
  const { theme, resolvedTheme, setTheme } = useThemePreference()

  const reloadSettings = useCallback(async () => {
    const settingsResponse = await getSettings()
    setSettings(settingsResponse)
  }, [])

  const reloadLimits = useCallback(async () => {
    const limitsResponse = await fetchLimits()
    setLimits(limitsResponse)
  }, [])

  const loadInitialData = useCallback(async () => {
    setLoading(true)
    setBootError(null)

    try {
      const [healthResponse, settingsResponse] = await Promise.all([
        getHealth(),
        getSettings(),
      ])

      setHelperMode(healthResponse.mode)
      setSettings(settingsResponse)

      try {
        const limitsResponse = await fetchLimits()
        setLimits(limitsResponse)
      } catch {
        setLimits(null)
      }
    } catch (error) {
      setBootError(
        error instanceof Error
          ? error.message
          : 'Unable to connect to local helper process.',
      )
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadInitialData()
  }, [loadInitialData])

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const commandPressed = event.ctrlKey || event.metaKey
      const key = event.key.toLowerCase()
      const editable = isEditableTarget(event.target)

      if (commandPressed && key === 'k') {
        event.preventDefault()
        setCommandOpen((current) => !current)
        return
      }

      if (commandPressed && key === '1') {
        event.preventDefault()
        setActiveTab('compose')
        return
      }

      if (commandPressed && key === '2') {
        event.preventDefault()
        setActiveTab('queue')
        return
      }

      if (commandPressed && key === '3') {
        event.preventDefault()
        setActiveTab('settings')
        return
      }

      if (commandPressed && key === 's') {
        if (activeTab === 'compose') {
          event.preventDefault()
          composeRef.current?.saveCurrentDraft()
        }
        return
      }

      if (commandPressed && key === 'enter') {
        if (activeTab === 'compose') {
          event.preventDefault()
          if (event.shiftKey) {
            composeRef.current?.publishScheduled()
          } else {
            composeRef.current?.publishNow()
          }
        }
        return
      }

      if (!editable && event.key === '?') {
        event.preventDefault()
        setShortcutsOpen(true)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [activeTab])

  const commandActions = useMemo<CommandAction[]>(
    () => [
      {
        id: 'go-compose',
        label: 'Go to Compose',
        shortcut: 'Cmd/Ctrl+1',
        group: 'Navigate',
        onSelect: () => setActiveTab('compose'),
      },
      {
        id: 'go-queue',
        label: 'Go to Queue',
        shortcut: 'Cmd/Ctrl+2',
        group: 'Navigate',
        onSelect: () => setActiveTab('queue'),
      },
      {
        id: 'go-settings',
        label: 'Go to Settings',
        shortcut: 'Cmd/Ctrl+3',
        group: 'Navigate',
        onSelect: () => setActiveTab('settings'),
      },
      {
        id: 'publish-now',
        label: 'Publish now',
        shortcut: 'Cmd/Ctrl+Enter',
        group: 'Compose',
        onSelect: () => {
          setActiveTab('compose')
          composeRef.current?.publishNow()
        },
      },
      {
        id: 'schedule-post',
        label: 'Schedule post',
        shortcut: 'Cmd/Ctrl+Shift+Enter',
        group: 'Compose',
        onSelect: () => {
          setActiveTab('compose')
          composeRef.current?.publishScheduled()
        },
      },
      {
        id: 'save-draft',
        label: 'Save draft',
        shortcut: 'Cmd/Ctrl+S',
        group: 'Compose',
        onSelect: () => {
          setActiveTab('compose')
          composeRef.current?.saveCurrentDraft()
        },
      },
      {
        id: 'refresh-jobs',
        label: 'Refresh queue jobs',
        group: 'Operations',
        onSelect: () => {
          setActiveTab('queue')
          void queueRef.current?.refreshNow()
        },
      },
      {
        id: 'refresh-limits',
        label: 'Refresh platform limits',
        group: 'Operations',
        onSelect: () => {
          void reloadLimits()
        },
      },
      {
        id: 'reload-settings',
        label: 'Reload secure settings',
        group: 'Operations',
        onSelect: () => {
          void reloadSettings()
        },
      },
      {
        id: 'open-shortcuts',
        label: 'Open keyboard shortcuts',
        shortcut: '?',
        group: 'Help',
        onSelect: () => setShortcutsOpen(true),
      },
    ],
    [reloadLimits, reloadSettings],
  )

  return (
    <div className='mx-auto min-h-screen w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8'>
      <header className='mb-6 flex flex-col gap-4 rounded-2xl border border-border/60 bg-card/70 p-5 shadow-sm backdrop-blur lg:flex-row lg:items-end lg:justify-between'>
        <div className='space-y-2'>
          <div className='inline-flex items-center gap-2 rounded-full border border-border/60 bg-background/80 px-3 py-1 text-xs text-muted-foreground'>
            <Sparkles className='h-3.5 w-3.5 text-primary' />
            Self-hosted crosspost console
          </div>
          <h1 className='text-2xl font-semibold tracking-tight sm:text-3xl'>Crosspost Web App</h1>
          <p className='max-w-2xl text-sm text-muted-foreground'>
            Vite + React + shadcn client with a local keychain helper, secure credential handling,
            and keyboard-first publishing.
          </p>
        </div>

        <div className='flex flex-wrap items-center gap-2'>
          <Badge variant='outline'>Theme: {theme}</Badge>
          <Badge variant='outline'>Resolved: {resolvedTheme}</Badge>
          <Badge variant='secondary'>Helper: {helperMode}</Badge>
          <Button variant='outline' size='sm' onClick={() => setShortcutsOpen(true)}>
            <Keyboard className='h-4 w-4' />
            Shortcuts
          </Button>
          <Button variant='outline' size='sm' onClick={() => setCommandOpen(true)}>
            <Command className='h-4 w-4' />
            Command palette
          </Button>
        </div>
      </header>

      {loading ? (
        <Card>
          <CardContent className='flex items-center gap-2 py-10 text-sm text-muted-foreground'>
            <Loader2 className='h-4 w-4 animate-spin' />
            Loading helper connection and settings...
          </CardContent>
        </Card>
      ) : bootError ? (
        <Card>
          <CardHeader>
            <CardTitle>Helper connection failed</CardTitle>
          </CardHeader>
          <CardContent className='space-y-3 text-sm'>
            <p className='text-destructive'>{bootError}</p>
            <p className='text-muted-foreground'>
              Start the local helper with <code>npm run dev</code> (or <code>npm run start</code>{' '}
              after build), then refresh.
            </p>
            <Button onClick={() => void loadInitialData()}>Retry connection</Button>
          </CardContent>
        </Card>
      ) : (
        <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as AppTab)}>
          <TabsList>
            <TabsTrigger value='compose'>Compose</TabsTrigger>
            <TabsTrigger value='queue'>Queue</TabsTrigger>
            <TabsTrigger value='settings'>Settings</TabsTrigger>
          </TabsList>

          <TabsContent value='compose'>
            <ComposePane
              ref={composeRef}
              limits={limits}
              configured={settings?.configured ?? null}
              onRefreshLimits={reloadLimits}
              onPublished={() => {
                void queueRef.current?.refreshNow()
              }}
            />
          </TabsContent>

          <TabsContent value='queue'>
            <QueuePane ref={queueRef} />
          </TabsContent>

          <TabsContent value='settings'>
            <SettingsPane
              settings={settings}
              helperMode={helperMode}
              theme={theme}
              setTheme={setTheme}
              reloadSettings={reloadSettings}
            />
          </TabsContent>
        </Tabs>
      )}

      <CommandPalette
        open={commandOpen}
        onOpenChange={setCommandOpen}
        actions={commandActions}
      />
      <ShortcutsDialog open={shortcutsOpen} onOpenChange={setShortcutsOpen} />
    </div>
  )
}

export default App
