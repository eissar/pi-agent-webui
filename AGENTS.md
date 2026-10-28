# Live WebUI operations

The live frontend runs on port 5173 and proxies `/rpc` and `/healthz` to the backend on 127.0.0.1:7860.

The backend is supervised independently by the piagent user systemd service `pi-webui-backend.service`. Do not kill its PID, run broad pkill commands, or replace it with an agent-managed process. In particular, an agent hosted by this backend must not attempt to restart its own host via a process tool: stopping the backend interrupts that tool and can leave the UI offline.

For maintenance from an independent terminal:

```bash
export XDG_RUNTIME_DIR=/run/user/1001
export DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus
cd /srv/code/pi-agent-webui
npm run build:server
# Only restart after a successful build; this interrupts active WebUI turns.
systemctl --user restart pi-webui-backend.service
curl -fsS http://127.0.0.1:5173/healthz
journalctl --user -u pi-webui-backend.service -n 50 --no-pager
```

The service starts the existing `out/server/main.mjs` bundle, not a watcher or an automatic build. Test experimental backends on a separate port (for example 7891); do not displace the live backend. Coordinate any necessary live restart with the user and verify both HTTP health and the `/rpc` WebSocket afterward.
