# Purge browser tools before the OAR / Pi 1.4 migration

This migration is gated behind purging all 29 browser tools. The tools below must be removed from the codebase, not moved to MCP or any other wrapper.

## Read (always enabled with the browser)

- browser_open
- browser_list_tabs
- browser_navigate
- browser_back
- browser_forward
- browser_reload
- browser_close
- browser_wait
- browser_snapshot
- browser_inspect
- browser_screenshot
- browser_visual_compare

## Interact

- browser_click
- browser_click_at
- browser_type
- browser_press
- browser_scroll

## Advanced (opt-in)

- browser_execute_javascript
- browser_send_cdp_command
- browser_get_cookies
- browser_set_request_header_rules
- browser_set_response_header_rules
- browser_network_list
- browser_network_wait
- browser_network_body
- browser_network_replay
- browser_network_summary
- browser_console_list
- browser_console_wait
- browser_page_code_list
- browser_page_code_get

Source: `src/agent-host/browser-tools.ts`, `src/agent-host/browser-agent-runtime.ts`, `src/agent-host/browser-capability-runtime.ts`.

Done when: none of these names appear in `src/`, and the browser runtime files above are deleted.
