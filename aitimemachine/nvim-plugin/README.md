# AITimeMachine Neovim Plugin

## Installation

### lazy.nvim
```lua
{
  "aitimemachine/nvim-plugin",
  config = function()
    require("aitimemachine").setup({
      auto_checkpoint = false,
      checkpoint_on_save = false,
    })
  end,
}
```

### packer.nvim
```lua
use {
  "aitimemachine/nvim-plugin",
  config = function()
    require("aitimemachine").setup()
  end
}
```

## Commands

| Command | Description |
|---------|-------------|
| `:ATMCheckpoint [desc]` | Create checkpoint |
| `:ATMTimeline` | Open web timeline |
| `:ATMStatus` | Show stats |
| `:ATMRestore <id>` | Restore to checkpoint |

## Telescope Integration

```lua
-- Add to your keymaps
vim.keymap.set("n", "<leader>at", require("aitimemachine").telescope_sessions)
```

## Requirements

- AITimeMachine CLI: `npm install -g aitimemachine`
- Optional: Telescope.nvim for session picker
