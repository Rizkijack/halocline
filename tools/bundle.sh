#!/usr/bin/env bash
# Build HALOCLINE's transcript bundle. Every fact in the run record is stated here exactly as it
# is: harness hermes-agent 0.22.7, provider deepseek (served through the custom endpoint the config
# names), the model id the provider returns, the harness's own effort level, and the MCP servers
# this session actually had in its tool list.
#
# Run from the kit directory:
#   bash G:/PROJECT/MAKEFUN/halocline/tools/bundle.sh
set -euo pipefail

KIT="G:/PROJECT/MAKEFUN/best-game-01-kit"
REPO="G:/PROJECT/MAKEFUN/halocline"
STATE="C:/Users/USER/AppData/Local/hermes/state.db"
SESSION="local-f280e62539bd86138448e60c6c2dd9b420043ada7f64e4ef788eee0d79cba26d"

cd "$KIT"
export PATH="/c/Program Files/Git/cmd:$PATH"

exec node cli/makefun.mjs bundle \
  --repo "$REPO" \
  --session "$STATE" \
  --session-id "$SESSION" \
  --harness hermes-agent \
  --harness-version 0.22.7 \
  --provider deepseek \
  --model deepseek/deepseek-v4.1-flash \
  --effort default \
  --mcp nodriver=stdio:python -m nodriver_mcp \
  --mcp rea=stdio:node G:/NPMGLOBAL/node_modules/rea-agents/scripts/rea.mjs mcp \
  --mcp modlens=stdio:node C:/Users/USER/.modlens/mcp/server.mjs \
  --mcp vercel=https://mcp.vercel.com \
  --mcp "tinyfish=https://agent.tinyfish.ai/mcp" \
  --mcp mcpcredit=https://mcp.credit/mcp \
  --notes "HALOCLINE, a sonar-lit descent: built end to end in one session, balance measured with tools/balance.mjs and screenshots captured from a real headless Chrome" \
  --out "$REPO/transcripts.tar.gz"
