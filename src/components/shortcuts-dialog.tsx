import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Separator } from '@/components/ui/separator'

type ShortcutsDialogProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const SHORTCUTS = [
  { keys: 'Ctrl/Cmd + K', label: 'Open command palette' },
  { keys: 'Ctrl/Cmd + 1', label: 'Go to Compose' },
  { keys: 'Ctrl/Cmd + 2', label: 'Go to Queue' },
  { keys: 'Ctrl/Cmd + 3', label: 'Go to Settings' },
  { keys: 'Ctrl/Cmd + Enter', label: 'Publish now' },
  { keys: 'Ctrl/Cmd + Shift + Enter', label: 'Schedule post' },
  { keys: 'Ctrl/Cmd + S', label: 'Save draft' },
  { keys: '?', label: 'Open shortcuts help' },
]

export function ShortcutsDialog({ open, onOpenChange }: ShortcutsDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
          <DialogDescription>
            Fast navigation for a clean publishing workflow.
          </DialogDescription>
        </DialogHeader>
        <Separator />
        <div className='space-y-3'>
          {SHORTCUTS.map((item) => (
            <div
              key={item.keys}
              className='flex items-center justify-between rounded-md border border-border/60 bg-muted/40 px-3 py-2'
            >
              <span className='text-sm text-muted-foreground'>{item.label}</span>
              <kbd className='rounded border border-border bg-background px-2 py-1 font-mono text-xs'>
                {item.keys}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
