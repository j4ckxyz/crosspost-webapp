import { useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Loader2, ShieldCheck, TriangleAlert } from 'lucide-react'

import { saveGatewayBaseUrl, saveSecrets } from '@/lib/api'
import type { HelperSettings, ThemePreference } from '@/lib/types'
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

type SettingsPaneProps = {
  settings: HelperSettings | null
  helperMode: string
  theme: ThemePreference
  setTheme: (theme: ThemePreference) => void
  reloadSettings: () => Promise<void>
}

export function SettingsPane({
  settings,
  helperMode,
  theme,
  setTheme,
  reloadSettings,
}: SettingsPaneProps) {
  const [gatewayBaseUrl, setGatewayBaseUrl] = useState('')
  const [gatewayApiKey, setGatewayApiKey] = useState('')
  const [xAuthToken, setXAuthToken] = useState('')
  const [blueskyIdentifier, setBlueskyIdentifier] = useState('')
  const [blueskyPdsUrl, setBlueskyPdsUrl] = useState('https://bsky.social')
  const [blueskyAppPassword, setBlueskyAppPassword] = useState('')
  const [mastodonInstanceUrl, setMastodonInstanceUrl] = useState('')
  const [mastodonAccessToken, setMastodonAccessToken] = useState('')
  const [mastodonVisibility, setMastodonVisibility] = useState('public')
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const [statusIsError, setStatusIsError] = useState(false)
  const [savingSection, setSavingSection] = useState<string | null>(null)

  useEffect(() => {
    if (!settings) {
      return
    }

    setGatewayBaseUrl(settings.gatewayBaseUrl)
    setBlueskyIdentifier(settings.profile.blueskyIdentifier)
    setBlueskyPdsUrl(settings.profile.blueskyPdsUrl || 'https://bsky.social')
    setMastodonInstanceUrl(settings.profile.mastodonInstanceUrl)
    setMastodonVisibility(settings.profile.mastodonVisibility || 'public')
  }, [settings])

  const credentialSummary = useMemo(() => {
    if (!settings) {
      return []
    }

    return [
      {
        label: 'Gateway API key',
        active: settings.configured.gatewayApiKey,
      },
      {
        label: 'X auth token',
        active: settings.configured.x,
      },
      {
        label: 'Bluesky app password',
        active: settings.configured.bluesky,
      },
      {
        label: 'Mastodon access token',
        active: settings.configured.mastodon,
      },
    ]
  }, [settings])

  async function runSaveAction(section: string, action: () => Promise<unknown>) {
    setStatusMessage(null)
    setStatusIsError(false)
    setSavingSection(section)

    try {
      await action()
      await reloadSettings()
      setStatusMessage('Saved securely to local keychain helper.')
      setStatusIsError(false)
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : 'Unable to save settings.')
      setStatusIsError(true)
    } finally {
      setSavingSection(null)
    }
  }

  return (
    <div className='grid gap-4 lg:grid-cols-[1.5fr_1fr]'>
      <div className='space-y-4'>
        <Card className='animate-fade-in'>
          <CardHeader>
            <CardTitle>Gateway + Security</CardTitle>
            <CardDescription>
              Credentials stay in your OS keychain through the local helper process.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-6'>
            <div className='space-y-2'>
              <Label htmlFor='gateway-url'>Gateway base URL</Label>
              <div className='flex gap-2'>
                <Input
                  id='gateway-url'
                  value={gatewayBaseUrl}
                  onChange={(event) => setGatewayBaseUrl(event.target.value)}
                  placeholder='http://127.0.0.1:38081'
                  autoComplete='off'
                />
                <Button
                  onClick={() =>
                    runSaveAction('gateway-url', () => saveGatewayBaseUrl(gatewayBaseUrl))
                  }
                  disabled={savingSection === 'gateway-url'}
                >
                  {savingSection === 'gateway-url' ? (
                    <Loader2 className='h-4 w-4 animate-spin' />
                  ) : (
                    'Save URL'
                  )}
                </Button>
              </div>
            </div>

            <div className='space-y-2'>
              <Label htmlFor='gateway-key'>Gateway API key</Label>
              <div className='flex flex-wrap gap-2'>
                <Input
                  id='gateway-key'
                  type='password'
                  value={gatewayApiKey}
                  onChange={(event) => setGatewayApiKey(event.target.value)}
                  placeholder='Paste bearer key'
                  autoComplete='new-password'
                />
                <Button
                  variant='secondary'
                  onClick={() =>
                    runSaveAction('gateway-key', async () => {
                      await saveSecrets({ gatewayApiKey })
                      setGatewayApiKey('')
                    })
                  }
                  disabled={savingSection === 'gateway-key' || !gatewayApiKey.trim()}
                >
                  Save key
                </Button>
                <Button
                  variant='outline'
                  onClick={() => runSaveAction('gateway-key-clear', () => saveSecrets({ gatewayApiKey: '' }))}
                  disabled={savingSection === 'gateway-key-clear'}
                >
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className='animate-fade-in'>
          <CardHeader>
            <CardTitle>X (Twitter)</CardTitle>
            <CardDescription>Store your `auth_token` cookie securely.</CardDescription>
          </CardHeader>
          <CardContent className='space-y-2'>
            <Label htmlFor='x-token'>X auth token</Label>
            <div className='flex flex-wrap gap-2'>
              <Input
                id='x-token'
                type='password'
                value={xAuthToken}
                onChange={(event) => setXAuthToken(event.target.value)}
                placeholder='auth_token'
                autoComplete='new-password'
              />
              <Button
                variant='secondary'
                onClick={() =>
                  runSaveAction('x-token', async () => {
                    await saveSecrets({ xAuthToken })
                    setXAuthToken('')
                  })
                }
                disabled={savingSection === 'x-token' || !xAuthToken.trim()}
              >
                Save
              </Button>
              <Button
                variant='outline'
                onClick={() => runSaveAction('x-token-clear', () => saveSecrets({ xAuthToken: '' }))}
                disabled={savingSection === 'x-token-clear'}
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className='animate-fade-in'>
          <CardHeader>
            <CardTitle>Bluesky</CardTitle>
            <CardDescription>
              Save identifier, PDS URL, and app password as a secure tuple.
            </CardDescription>
          </CardHeader>
          <CardContent className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-2 sm:col-span-2'>
              <Label htmlFor='bluesky-identifier'>Identifier</Label>
              <Input
                id='bluesky-identifier'
                value={blueskyIdentifier}
                onChange={(event) => setBlueskyIdentifier(event.target.value)}
                placeholder='you.bsky.social'
                autoComplete='off'
              />
            </div>
            <div className='space-y-2 sm:col-span-2'>
              <Label htmlFor='bluesky-pds'>PDS URL</Label>
              <Input
                id='bluesky-pds'
                value={blueskyPdsUrl}
                onChange={(event) => setBlueskyPdsUrl(event.target.value)}
                placeholder='https://bsky.social'
                autoComplete='off'
              />
            </div>
            <div className='space-y-2 sm:col-span-2'>
              <Label htmlFor='bluesky-password'>App password</Label>
              <Input
                id='bluesky-password'
                type='password'
                value={blueskyAppPassword}
                onChange={(event) => setBlueskyAppPassword(event.target.value)}
                placeholder='xxxx-xxxx-xxxx-xxxx'
                autoComplete='new-password'
              />
            </div>
            <div className='sm:col-span-2 flex flex-wrap gap-2'>
              <Button
                variant='secondary'
                onClick={() =>
                  runSaveAction('bluesky', async () => {
                    await saveSecrets({
                      blueskyIdentifier,
                      blueskyPdsUrl,
                      blueskyAppPassword,
                    })
                    setBlueskyAppPassword('')
                  })
                }
                disabled={
                  savingSection === 'bluesky' ||
                  !blueskyIdentifier.trim() ||
                  !blueskyPdsUrl.trim() ||
                  !blueskyAppPassword.trim()
                }
              >
                Save
              </Button>
              <Button
                variant='outline'
                onClick={() =>
                  runSaveAction('bluesky-clear', () =>
                    saveSecrets({
                      blueskyIdentifier: '',
                      blueskyPdsUrl: '',
                      blueskyAppPassword: '',
                    }),
                  )
                }
                disabled={savingSection === 'bluesky-clear'}
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card className='animate-fade-in'>
          <CardHeader>
            <CardTitle>Mastodon</CardTitle>
            <CardDescription>Store instance URL, access token, and visibility.</CardDescription>
          </CardHeader>
          <CardContent className='grid gap-3 sm:grid-cols-2'>
            <div className='space-y-2 sm:col-span-2'>
              <Label htmlFor='mastodon-instance'>Instance URL</Label>
              <Input
                id='mastodon-instance'
                value={mastodonInstanceUrl}
                onChange={(event) => setMastodonInstanceUrl(event.target.value)}
                placeholder='https://mastodon.social'
                autoComplete='off'
              />
            </div>
            <div className='space-y-2 sm:col-span-2'>
              <Label htmlFor='mastodon-token'>Access token</Label>
              <Input
                id='mastodon-token'
                type='password'
                value={mastodonAccessToken}
                onChange={(event) => setMastodonAccessToken(event.target.value)}
                placeholder='Mastodon token'
                autoComplete='new-password'
              />
            </div>
            <div className='space-y-2 sm:col-span-2'>
              <Label>Mastodon visibility</Label>
              <Select value={mastodonVisibility} onValueChange={setMastodonVisibility}>
                <SelectTrigger>
                  <SelectValue placeholder='Visibility' />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value='public'>public</SelectItem>
                  <SelectItem value='unlisted'>unlisted</SelectItem>
                  <SelectItem value='private'>private</SelectItem>
                  <SelectItem value='direct'>direct</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className='sm:col-span-2 flex flex-wrap gap-2'>
              <Button
                variant='secondary'
                onClick={() =>
                  runSaveAction('mastodon', async () => {
                    await saveSecrets({
                      mastodonInstanceUrl,
                      mastodonAccessToken,
                      mastodonVisibility,
                    })
                    setMastodonAccessToken('')
                  })
                }
                disabled={
                  savingSection === 'mastodon' ||
                  !mastodonInstanceUrl.trim() ||
                  !mastodonAccessToken.trim()
                }
              >
                Save
              </Button>
              <Button
                variant='outline'
                onClick={() =>
                  runSaveAction('mastodon-clear', () =>
                    saveSecrets({
                      mastodonInstanceUrl: '',
                      mastodonAccessToken: '',
                      mastodonVisibility,
                    }),
                  )
                }
                disabled={savingSection === 'mastodon-clear'}
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className='space-y-4'>
        <Card className='animate-fade-in'>
          <CardHeader>
            <CardTitle>Appearance</CardTitle>
            <CardDescription>Default is system theme with auto light/dark sync.</CardDescription>
          </CardHeader>
          <CardContent>
            <Label className='mb-2 block'>Theme mode</Label>
            <Select value={theme} onValueChange={(value) => setTheme(value as ThemePreference)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value='system'>System</SelectItem>
                <SelectItem value='light'>Light</SelectItem>
                <SelectItem value='dark'>Dark</SelectItem>
              </SelectContent>
            </Select>
          </CardContent>
        </Card>

        <Card className='animate-fade-in'>
          <CardHeader>
            <CardTitle>Security status</CardTitle>
            <CardDescription>
              The helper runs locally and proxies gateway requests with keychain secrets.
            </CardDescription>
          </CardHeader>
          <CardContent className='space-y-3'>
            <div className='flex items-center justify-between rounded-md border border-border/60 bg-muted/40 px-3 py-2'>
              <span className='text-sm'>Helper mode</span>
              <Badge variant='outline'>{helperMode}</Badge>
            </div>
            {credentialSummary.map((item) => (
              <div
                key={item.label}
                className='flex items-center justify-between rounded-md border border-border/60 bg-muted/40 px-3 py-2'
              >
                <span className='text-sm'>{item.label}</span>
                {item.active ? (
                  <Badge variant='success'>Stored</Badge>
                ) : (
                  <Badge variant='outline'>Missing</Badge>
                )}
              </div>
            ))}
            <div className='rounded-md border border-border/60 bg-muted/40 p-3 text-xs text-muted-foreground'>
              Secrets are never written to localStorage and are never returned to the UI after save.
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
        ) : (
          <Card className='animate-fade-in'>
            <CardContent className='flex items-start gap-2 p-4 text-sm text-muted-foreground'>
              <ShieldCheck className='mt-0.5 h-4 w-4 text-primary' />
              Set your credentials once and publish without re-unlocking each request.
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
