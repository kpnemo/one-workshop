#!/usr/bin/env bash
set -euo pipefail

# ─────────────────────────────────────────────
# deploy.sh — Deploy pipeline for one-workshop
# ─────────────────────────────────────────────

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# Load .env for ANTHROPIC_API_KEY
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if [[ -f "$SCRIPT_DIR/.env" ]]; then
  set -a
  source "$SCRIPT_DIR/.env"
  set +a
fi

# ─────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────

banner() {
  echo ""
  echo -e "${CYAN}╭─────────────────────────────╮${NC}"
  echo -e "${CYAN}│${NC}   ${BOLD}🚀 Deploy Pipeline${NC}        ${CYAN}│${NC}"
  echo -e "${CYAN}╰─────────────────────────────╯${NC}"
  echo ""
}

confirm() {
  local msg="$1"
  echo ""
  echo -e "${YELLOW}${msg}${NC}"
  echo -ne "${BOLD}  Continue? [y/N]: ${NC}"
  read -r answer
  if [[ "$answer" != "y" && "$answer" != "Y" ]]; then
    echo -e "${RED}  Aborted.${NC}"
    exit 1
  fi
}

success() {
  echo -e "${GREEN}  ✓ $1${NC}"
}

info() {
  echo -e "${DIM}  $1${NC}"
}

# ─────────────────────────────────────────────
# Ensure we're on develop
# ─────────────────────────────────────────────

current_branch=$(git rev-parse --abbrev-ref HEAD)
if [[ "$current_branch" != "develop" ]]; then
  echo -e "${RED}  ✗ Not on develop branch (currently on: ${current_branch})${NC}"
  echo -e "${DIM}  Switch to develop first: git checkout develop${NC}"
  exit 1
fi

# Check for uncommitted changes
if ! git diff --quiet || ! git diff --cached --quiet; then
  echo -e "${RED}  ✗ You have uncommitted changes. Commit or stash them first.${NC}"
  exit 1
fi

# ─────────────────────────────────────────────
# Menu: Staging or Production
# ─────────────────────────────────────────────

banner

echo -e "  ${BOLD}Where are we shipping?${NC}"
echo ""
echo -e "  ${YELLOW}[1]${NC} 🟡 Staging      ${DIM}— push develop → origin/develop${NC}"
echo -e "  ${YELLOW}[2]${NC} 🔴 Production   ${DIM}— merge develop → main, push main${NC}"
echo ""
echo -ne "  ${BOLD}Enter choice (1-2): ${NC}"
read -r choice

case "$choice" in
  1) deploy_target="staging" ;;
  2) deploy_target="production" ;;
  *)
    echo -e "${RED}  Invalid choice.${NC}"
    exit 1
    ;;
esac

# ─────────────────────────────────────────────
# Staging: push develop → origin/develop
# ─────────────────────────────────────────────

if [[ "$deploy_target" == "staging" ]]; then
  echo ""
  echo -e "  ${BOLD}📋 Staging Deploy Summary${NC}"
  info "Branch: develop → origin/develop"
  info "Commits to push:"
  git log origin/develop..develop --oneline 2>/dev/null | sed 's/^/    /' || echo "    (new branch — all commits)"

  confirm "Push develop to staging?"

  git push -u origin develop
  success "Pushed develop to origin/develop"
  echo ""
  exit 0
fi

# ─────────────────────────────────────────────
# Production: merge develop → main, push main
# ─────────────────────────────────────────────

echo ""
echo -e "  ${BOLD}📋 Production Deploy Summary${NC}"
info "Merge: develop → main"
info "Commits to merge:"
git log main..develop --oneline | sed 's/^/    /'

confirm "Merge develop into main and push?"

info "Switching to main..."
git checkout main
info "Merging develop → main..."
git merge develop --no-edit
info "Pushing main to origin..."
git push origin main
success "Merged develop → main and pushed"

# ─────────────────────────────────────────────
# Release Notes (still on main)
# ─────────────────────────────────────────────

echo ""
echo -ne "  ${BOLD}Generate release notes? [y/N]: ${NC}"
read -r gen_notes

if [[ "$gen_notes" != "y" && "$gen_notes" != "Y" ]]; then
  info "Switching back to develop..."
  git checkout develop
  echo ""
  success "Production deploy complete (no release notes)"
  echo ""
  exit 0
fi

# Determine date range for commits
NOTES_FILE="$SCRIPT_DIR/RELEASE_NOTES.md"
if [[ -f "$NOTES_FILE" ]]; then
  # Extract the most recent date from release notes (format: ## YYYY-MM-DD)
  last_date=$(grep -m1 '^## [0-9]\{4\}-[0-9]\{2\}-[0-9]\{2\}' "$NOTES_FILE" | sed 's/^## //' | awk '{print $1}')
  if [[ -n "$last_date" ]]; then
    info "Last release date: $last_date"
    commits=$(git log --after="$last_date" --oneline main)
  else
    commits=$(git log --oneline -20 main)
  fi
else
  info "No RELEASE_NOTES.md found — will create initial one"
  commits=$(git log --oneline main)
fi

if [[ -z "$commits" ]]; then
  echo -e "${YELLOW}  No new commits since last release.${NC}"
  exit 0
fi

info "Commits for release notes:"
echo "$commits" | sed 's/^/    /'

# Call Anthropic API to generate release notes
if [[ -z "${ANTHROPIC_API_KEY:-}" ]]; then
  echo -e "${RED}  ✗ ANTHROPIC_API_KEY not set. Cannot generate release notes.${NC}"
  echo -e "${DIM}  Add it to .env or export it.${NC}"
  exit 1
fi

TODAY=$(date +%Y-%m-%d)

info "Generating release notes with Claude..."

# Read existing notes for context (first 50 lines)
existing_notes=""
if [[ -f "$NOTES_FILE" ]]; then
  existing_notes=$(head -50 "$NOTES_FILE")
fi

# Build the prompt
prompt="Generate a release notes entry for date ${TODAY}.

Here are the git commits to summarize:
${commits}

$(if [[ -n "$existing_notes" ]]; then echo "Here are the existing release notes for style reference (match this format exactly):
${existing_notes}"; else echo "This is the first release. Create the file with a '# Release Notes' title, then the entry."; fi)

Rules:
- Use heading format: ## ${TODAY}
- Group changes by category (Features, Fixes, Chores, etc.) using ### subheadings
- Each item is a bullet point, concise, user-facing language
- Do not include commit hashes
- If this is the first release, start with '# Release Notes' title followed by a blank line
- Return ONLY the markdown content, no code fences, no explanation"

# API call
response=$(curl -s https://api.anthropic.com/v1/messages \
  -H "content-type: application/json" \
  -H "x-api-key: $ANTHROPIC_API_KEY" \
  -H "anthropic-version: 2023-06-01" \
  -d "$(jq -n \
    --arg prompt "$prompt" \
    '{
      model: "claude-sonnet-4-20250514",
      max_tokens: 1024,
      messages: [{role: "user", content: $prompt}]
    }')")

# Extract text from response
notes_content=$(echo "$response" | jq -r '.content[0].text // empty')

if [[ -z "$notes_content" ]]; then
  echo -e "${RED}  ✗ Failed to generate release notes.${NC}"
  error_msg=$(echo "$response" | jq -r '.error.message // empty')
  if [[ -n "$error_msg" ]]; then
    echo -e "${RED}  Error: ${error_msg}${NC}"
  fi
  exit 1
fi

# Write or prepend to RELEASE_NOTES.md
if [[ -f "$NOTES_FILE" ]]; then
  # Prepend new entry after the title line
  title_line=$(head -1 "$NOTES_FILE")
  rest=$(tail -n +2 "$NOTES_FILE")
  {
    echo "$title_line"
    echo ""
    echo "$notes_content"
    echo "$rest"
  } > "$NOTES_FILE"
else
  echo "$notes_content" > "$NOTES_FILE"
fi

success "Release notes written to RELEASE_NOTES.md"

# Show preview
echo ""
echo -e "  ${BOLD}Preview:${NC}"
echo "$notes_content" | sed 's/^/  │ /'
echo ""

# Commit release notes on main
info "Committing release notes on main..."
git add RELEASE_NOTES.md
git commit -m "docs: add release notes for ${TODAY}"
info "Pushing main with release notes..."
git push origin main
success "Release notes committed and pushed to main"

# Sync release notes back to develop
info "Switching to develop..."
git checkout develop
info "Merging main → develop (sync release notes)..."
git merge main --no-edit
info "Pushing develop..."
git push origin develop
success "Release notes synced to develop"
echo ""
