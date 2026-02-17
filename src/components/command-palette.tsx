import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandShortcut,
  CommandSeparator,
} from '@/components/ui/command'

type CommandAction = {
  id: string
  label: string
  shortcut?: string
  group: string
  onSelect: () => void
}

type CommandPaletteProps = {
  open: boolean
  onOpenChange: (open: boolean) => void
  actions: CommandAction[]
}

export function CommandPalette({
  open,
  onOpenChange,
  actions,
}: CommandPaletteProps) {
  const groups = actions.reduce<Record<string, CommandAction[]>>((acc, action) => {
    if (!acc[action.group]) {
      acc[action.group] = []
    }
    acc[action.group].push(action)
    return acc
  }, {})

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className='p-0'>
        <DialogHeader className='sr-only'>
          <DialogTitle>Command Palette</DialogTitle>
          <DialogDescription>
            Search actions and execute with your keyboard.
          </DialogDescription>
        </DialogHeader>
        <Command>
          <CommandInput placeholder='Type a command or search…' />
          <CommandList>
            <CommandEmpty>No matching actions.</CommandEmpty>
            {Object.entries(groups).map(([group, groupActions], index) => (
              <div key={group}>
                {index > 0 ? <CommandSeparator /> : null}
                <CommandGroup heading={group}>
                  {groupActions.map((action) => (
                    <CommandItem
                      key={action.id}
                      onSelect={() => {
                        action.onSelect()
                        onOpenChange(false)
                      }}
                    >
                      {action.label}
                      {action.shortcut ? (
                        <CommandShortcut>{action.shortcut}</CommandShortcut>
                      ) : null}
                    </CommandItem>
                  ))}
                </CommandGroup>
              </div>
            ))}
          </CommandList>
        </Command>
      </DialogContent>
    </Dialog>
  )
}

export type { CommandAction }
