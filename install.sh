#!/usr/bin/env bash
# Harmus installer for macOS and Linux
# Usage: curl -fsSL https://raw.githubusercontent.com/aarvsn/harmus/main/install.sh | bash

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────
HARMUS_VERSION="${HARMUS_VERSION:-latest}"
REQUIRED_NODE_MAJOR=22
INSTALL_DIR="${HARMUS_INSTALL_DIR:-/usr/local/bin}"
NPM_PACKAGE="@harmus/cli"
TUI_PACKAGE="@harmus/tui"

# ─── Colors ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
RESET='\033[0m'

print_header() {
  echo ""
  echo -e "${CYAN}${BOLD}"
  echo "  ██╗  ██╗ █████╗ ██████╗ ███╗   ███╗██╗   ██╗███████╗"
  echo "  ██║  ██║██╔══██╗██╔══██╗████╗ ████║██║   ██║██╔════╝"
  echo "  ███████║███████║██████╔╝██╔████╔██║██║   ██║███████╗"
  echo "  ██╔══██║██╔══██║██╔══██╗██║╚██╔╝██║██║   ██║╚════██║"
  echo "  ██║  ██║██║  ██║██║  ██║██║ ╚═╝ ██║╚██████╔╝███████║"
  echo "  ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═╝╚═╝     ╚═╝ ╚═════╝ ╚══════╝"
  echo -e "${RESET}"
  echo -e "  ${BOLD}Autonomous coding agent${RESET}"
  echo ""
}

info()    { echo -e "  ${CYAN}→${RESET}  $1"; }
success() { echo -e "  ${GREEN}✓${RESET}  $1"; }
warn()    { echo -e "  ${YELLOW}⚠${RESET}  $1"; }
error()   { echo -e "  ${RED}✗${RESET}  $1" >&2; }
die()     { error "$1"; exit 1; }

# ─── OS Detection ────────────────────────────────────────────────────────────
detect_os() {
  case "$(uname -s)" in
    Darwin)  OS="macos" ;;
    Linux)   OS="linux" ;;
    *)       die "Unsupported OS: $(uname -s). Use install.sh on macOS or Linux." ;;
  esac

  ARCH="$(uname -m)"
  case "$ARCH" in
    x86_64)  ARCH="x64" ;;
    arm64|aarch64) ARCH="arm64" ;;
    *)       warn "Unrecognized architecture: $ARCH. Continuing anyway." ;;
  esac
}

# ─── Dependency Checks ───────────────────────────────────────────────────────
check_node() {
  if ! command -v node &>/dev/null; then
    warn "Node.js not found. Attempting to install via nvm..."
    install_node_via_nvm
    return
  fi

  local version major
  version="$(node --version | sed 's/v//')"
  major="${version%%.*}"

  if [ "$major" -lt "$REQUIRED_NODE_MAJOR" ]; then
    warn "Node.js $version found, but Harmus requires ≥ v${REQUIRED_NODE_MAJOR}."
    warn "Attempting to install a newer version via nvm..."
    install_node_via_nvm
  else
    success "Node.js v${version}"
  fi
}

install_node_via_nvm() {
  if ! command -v nvm &>/dev/null && [ ! -f "$HOME/.nvm/nvm.sh" ]; then
    info "Installing nvm..."
    curl -fsSL https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.7/install.sh | bash
    export NVM_DIR="$HOME/.nvm"
    # shellcheck source=/dev/null
    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
  else
    export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
    # shellcheck source=/dev/null
    [ -s "$NVM_DIR/nvm.sh" ] && source "$NVM_DIR/nvm.sh"
  fi

  nvm install "$REQUIRED_NODE_MAJOR" --lts || die "Failed to install Node.js via nvm."
  nvm use "$REQUIRED_NODE_MAJOR"
  success "Node.js $(node --version) installed via nvm"
}

check_npm() {
  if ! command -v npm &>/dev/null; then
    die "npm not found. Please install Node.js first: https://nodejs.org"
  fi
  success "npm $(npm --version)"
}

check_git() {
  if command -v git &>/dev/null; then
    success "git $(git --version | cut -d' ' -f3)"
  else
    warn "git not found — git tools (git_status, git_commit, etc.) will not work."
    warn "Install git: https://git-scm.com/downloads"
  fi
}

# ─── Installation ────────────────────────────────────────────────────────────
install_harmus() {
  info "Installing ${NPM_PACKAGE}..."

  local install_flags="-g"
  if [ "$HARMUS_VERSION" != "latest" ]; then
    NPM_PACKAGE="${NPM_PACKAGE}@${HARMUS_VERSION}"
    TUI_PACKAGE="${TUI_PACKAGE}@${HARMUS_VERSION}"
  fi

  # Try global install; fall back to user-level if permission denied
  if ! npm install $install_flags "$NPM_PACKAGE" "$TUI_PACKAGE" 2>/dev/null; then
    warn "Global install failed (permission denied?). Trying with --prefix ~/.harmus..."
    mkdir -p "$HOME/.harmus"
    npm install --prefix "$HOME/.harmus" "$NPM_PACKAGE" "$TUI_PACKAGE"
    setup_user_local_bin
  fi
}

setup_user_local_bin() {
  local bin_dir="$HOME/.local/bin"
  mkdir -p "$bin_dir"

  # Create wrapper scripts
  cat > "$bin_dir/harmus" << 'EOF'
#!/usr/bin/env bash
exec "$HOME/.harmus/node_modules/.bin/harmus" "$@"
EOF
  cat > "$bin_dir/harmus-tui" << 'EOF'
#!/usr/bin/env bash
exec "$HOME/.harmus/node_modules/.bin/harmus-tui" "$@"
EOF
  chmod +x "$bin_dir/harmus" "$bin_dir/harmus-tui"

  if [[ ":$PATH:" != *":$bin_dir:"* ]]; then
    warn "$bin_dir is not in your PATH."
    add_to_path "$bin_dir"
  fi
}

add_to_path() {
  local bin_dir="$1"
  local shell_rc=""

  if [ -n "${ZSH_VERSION:-}" ] || [ "$SHELL" = "*/zsh" ]; then
    shell_rc="$HOME/.zshrc"
  elif [ -n "${BASH_VERSION:-}" ] || [ "$SHELL" = "*/bash" ]; then
    shell_rc="$HOME/.bashrc"
    [ -f "$HOME/.bash_profile" ] && shell_rc="$HOME/.bash_profile"
  fi

  if [ -n "$shell_rc" ]; then
    echo "" >> "$shell_rc"
    echo '# Harmus' >> "$shell_rc"
    echo "export PATH=\"\$PATH:$bin_dir\"" >> "$shell_rc"
    warn "Added $bin_dir to PATH in $shell_rc — restart your shell or run:"
    warn "  source $shell_rc"
  else
    warn "Could not detect shell. Add this to your shell config manually:"
    warn "  export PATH=\"\$PATH:$bin_dir\""
  fi
}

# ─── Shell Completions ────────────────────────────────────────────────────────
install_completions() {
  local harmus_bin
  harmus_bin="$(command -v harmus 2>/dev/null || true)"
  if [ -z "$harmus_bin" ]; then return; fi

  # Zsh
  if command -v zsh &>/dev/null; then
    local zsh_completion_dir="${ZSH_COMPLETIONS_DIR:-/usr/local/share/zsh/site-functions}"
    if [ -d "$zsh_completion_dir" ] && [ -w "$zsh_completion_dir" ]; then
      harmus completions zsh > "$zsh_completion_dir/_harmus" 2>/dev/null || true
      success "Zsh completions installed"
    fi
  fi

  # Bash
  if command -v bash &>/dev/null; then
    local bash_completion_dir="/etc/bash_completion.d"
    if [ -d "$bash_completion_dir" ] && [ -w "$bash_completion_dir" ]; then
      harmus completions bash > "$bash_completion_dir/harmus" 2>/dev/null || true
      success "Bash completions installed"
    fi
  fi
}

# ─── Verification ────────────────────────────────────────────────────────────
verify_installation() {
  if command -v harmus &>/dev/null; then
    local installed_version
    installed_version="$(harmus --version 2>/dev/null || echo "unknown")"
    success "harmus ${installed_version} installed at $(command -v harmus)"
  else
    warn "harmus not found in PATH. You may need to restart your shell."
  fi
}

# ─── Post-install instructions ───────────────────────────────────────────────
print_next_steps() {
  echo ""
  echo -e "${BOLD}  Next steps:${RESET}"
  echo ""
  echo -e "  ${CYAN}1.${RESET} Set your API key:"
  echo -e "     ${BOLD}export ANTHROPIC_API_KEY=sk-ant-...${RESET}"
  echo ""
  echo -e "  ${CYAN}2.${RESET} Run your first command:"
  echo -e "     ${BOLD}cd your-project && harmus plan \"add a health check\"${RESET}"
  echo ""
  echo -e "  ${CYAN}3.${RESET} Launch the interactive TUI:"
  echo -e "     ${BOLD}harmus-tui${RESET}"
  echo ""
  echo -e "  ${CYAN}4.${RESET} Read the docs:"
  echo -e "     ${BOLD}https://github.com/aarvsn/harmus${RESET}"
  echo ""
}

# ─── Main ─────────────────────────────────────────────────────────────────────
main() {
  print_header

  echo -e "  ${BOLD}Checking dependencies...${RESET}"
  detect_os
  check_node
  check_npm
  check_git

  echo ""
  echo -e "  ${BOLD}Installing Harmus...${RESET}"
  install_harmus
  install_completions

  echo ""
  echo -e "  ${BOLD}Verifying installation...${RESET}"
  verify_installation

  echo ""
  echo -e "  ${GREEN}${BOLD}Installation complete!${RESET}"
  print_next_steps
}

main "$@"
