-- AITimeMachine Neovim Plugin
local M = {}

M.config = {
  auto_checkpoint = false,
  checkpoint_on_save = false,
}

function M.setup(opts)
  M.config = vim.tbl_deep_extend("force", M.config, opts or {})
  
  -- Commands
  vim.api.nvim_create_user_command("ATMCheckpoint", function(args)
    M.checkpoint(args.args ~= "" and args.args or nil)
  end, { nargs = "?" })
  
  vim.api.nvim_create_user_command("ATMTimeline", M.timeline, {})
  vim.api.nvim_create_user_command("ATMStatus", M.status, {})
  vim.api.nvim_create_user_command("ATMRestore", function(args)
    M.restore(args.args)
  end, { nargs = 1 })
  
  -- Auto-checkpoint on save
  if M.config.checkpoint_on_save then
    vim.api.nvim_create_autocmd("BufWritePost", {
      callback = function()
        M.checkpoint("Auto-save checkpoint")
      end
    })
  end
end

function M.checkpoint(desc)
  local cmd = "aitm checkpoint"
  if desc then cmd = cmd .. ' "' .. desc .. '"' end
  local result = vim.fn.system(cmd)
  vim.notify(result, vim.log.levels.INFO)
end

function M.timeline()
  -- Open web UI
  vim.fn.jobstart("aitm ui", { detach = true })
  vim.defer_fn(function()
    vim.fn.system("open http://localhost:3333")
  end, 1500)
end

function M.status()
  local result = vim.fn.system("aitm stats")
  vim.notify(result, vim.log.levels.INFO)
end

function M.restore(id)
  local confirm = vim.fn.confirm("Restore to " .. id .. "?", "&Yes\n&No", 2)
  if confirm == 1 then
    local result = vim.fn.system("aitm restore " .. id)
    vim.notify(result, vim.log.levels.INFO)
    vim.cmd("checktime") -- Reload buffers
  end
end

-- Telescope integration
function M.telescope_sessions()
  local ok, telescope = pcall(require, "telescope.builtin")
  if not ok then
    vim.notify("Telescope not installed", vim.log.levels.ERROR)
    return
  end
  
  local pickers = require("telescope.pickers")
  local finders = require("telescope.finders")
  local conf = require("telescope.config").values
  local actions = require("telescope.actions")
  local action_state = require("telescope.actions.state")
  
  local output = vim.fn.system("aitm list --json 2>/dev/null")
  local sessions = vim.fn.json_decode(output) or {}
  
  pickers.new({}, {
    prompt_title = "AITimeMachine Sessions",
    finder = finders.new_table({
      results = sessions,
      entry_maker = function(entry)
        return {
          value = entry,
          display = entry.description .. " (" .. entry.id:sub(1, 12) .. ")",
          ordinal = entry.description,
        }
      end,
    }),
    sorter = conf.generic_sorter({}),
    attach_mappings = function(prompt_bufnr)
      actions.select_default:replace(function()
        actions.close(prompt_bufnr)
        local selection = action_state.get_selected_entry()
        M.restore(selection.value.id)
      end)
      return true
    end,
  }):find()
end

return M
