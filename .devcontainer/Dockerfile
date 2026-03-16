FROM mcr.microsoft.com/devcontainers/base:ubuntu-24.04

# Switch default apt sources to HTTPS to avoid environments that block plain HTTP
RUN sed -i 's|http://ports.ubuntu.com/ubuntu-ports/|https://ports.ubuntu.com/ubuntu-ports/|g' /etc/apt/sources.list.d/ubuntu.sources

ARG DEBIAN_FRONTEND=noninteractive
ARG TZ=Asia/Tokyo
ENV TZ=${TZ}
ARG CLAUDE_CODE_VERSION=latest
ARG GIT_DELTA_VERSION=0.18.2
ARG ZSH_IN_DOCKER_VERSION=1.2.0
ARG YQ_VERSION=v4.44.1

# =============================================================================
# Multi-Runtime Base Image
# =============================================================================
# This image includes Python, Node.js, and Java to support multiple project types
# without requiring rebuilds. Project-specific packages are installed via
# post-create.sh based on requirements.yaml profile configuration.
# =============================================================================

# Install core development tools and all runtime dependencies
RUN apt-get update -o Acquire::Retries=5 -o Acquire::http::Timeout=30 \
 && apt-get install -y --no-install-recommends \
      # Core CLI tools
      tmux vim nano less procps fzf zsh man-db unzip gnupg2 wget curl jq \
      # Python runtime
      python3 python3-venv python3-pip \
      # Java runtime (OpenJDK 21)
      openjdk-21-jdk maven gradle \
      # Security/network tools (for firewall feature)
      iptables ipset iproute2 dnsutils aggregate iputils-ping \
 && apt-get clean && rm -rf /var/lib/apt/lists/*

# Install Node.js LTS and devcontainer CLI
RUN curl -fsSL https://deb.nodesource.com/setup_lts.x | bash - \
 && apt-get install -y --no-install-recommends nodejs \
 && npm install -g @devcontainers/cli \
 && rm -rf /var/lib/apt/lists/*

# Install yq for YAML parsing (used by parse-requirements.sh)
RUN ARCH=$(dpkg --print-architecture) && \
 wget -qO /usr/local/bin/yq "https://github.com/mikefarah/yq/releases/download/${YQ_VERSION}/yq_linux_${ARCH}" && \
 chmod +x /usr/local/bin/yq

# Install act (GitHub Actions runner) - Multi-arch compatible
RUN ARCH=$(dpkg --print-architecture) \
 && if [ "$ARCH" = "arm64" ]; then ACT_ARCH="arm64"; \
    elif [ "$ARCH" = "amd64" ]; then ACT_ARCH="x86_64"; \
    else ACT_ARCH="$ARCH"; fi \
 && curl -fsSL https://github.com/nektos/act/releases/latest/download/act_Linux_${ACT_ARCH}.tar.gz -o /tmp/act.tar.gz \
 && tar -xzf /tmp/act.tar.gz -C /usr/local/bin act \
 && rm /tmp/act.tar.gz \
 && chmod +x /usr/local/bin/act

# Install GitHub CLI
RUN curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg \
 && chmod go+r /usr/share/keyrings/githubcli-archive-keyring.gpg \
 && echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
 && apt-get update \
 && apt-get install -y gh \
 && rm -rf /var/lib/apt/lists/*

# Install git-delta for better diff viewing
RUN ARCH=$(dpkg --print-architecture) && \
 wget "https://github.com/dandavison/delta/releases/download/${GIT_DELTA_VERSION}/git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
 dpkg -i "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb" && \
 rm "git-delta_${GIT_DELTA_VERSION}_${ARCH}.deb"

# Create developer user from existing vscode user
ARG USERNAME=developer
ARG USER_UID=1000
ARG USER_GID=$USER_UID

# Rename vscode user to developer
RUN usermod -l ${USERNAME} vscode && \
 usermod -d /home/${USERNAME} -m ${USERNAME} && \
 groupmod -n ${USERNAME} vscode && \
 echo "${USERNAME} ALL=(ALL) NOPASSWD:ALL" > /etc/sudoers.d/${USERNAME} && \
 chmod 0440 /etc/sudoers.d/${USERNAME}

# Ensure npm global directory exists with proper permissions
RUN mkdir -p /usr/local/share/npm-global && \
 chown -R ${USERNAME}:${USERNAME} /usr/local/share

# Persist bash history
RUN mkdir -p /commandhistory && \
 touch /commandhistory/.bash_history && \
 chown -R ${USERNAME}:${USERNAME} /commandhistory

# Set DEVCONTAINER environment variable
ENV DEVCONTAINER=true

# Set up npm global path
ENV NPM_CONFIG_PREFIX=/usr/local/share/npm-global
ENV PATH=$PATH:/usr/local/share/npm-global/bin

# Set Java environment dynamically based on architecture
# Creates /etc/profile.d/java.sh for shell sessions
RUN ARCH=$(dpkg --print-architecture) && \
    if [ "$ARCH" = "arm64" ]; then \
        JAVA_PATH="/usr/lib/jvm/java-21-openjdk-arm64"; \
    else \
        JAVA_PATH="/usr/lib/jvm/java-21-openjdk-amd64"; \
    fi && \
    echo "export JAVA_HOME=$JAVA_PATH" > /etc/profile.d/java.sh && \
    echo "export PATH=\$PATH:\$JAVA_HOME/bin" >> /etc/profile.d/java.sh && \
    chmod +x /etc/profile.d/java.sh && \
    ln -sf "$JAVA_PATH" /usr/lib/jvm/default-java
ENV JAVA_HOME=/usr/lib/jvm/default-java
ENV PATH=$PATH:$JAVA_HOME/bin

# Set default editor
ENV EDITOR=nano
ENV VISUAL=nano

# Switch to non-root user for remaining setup
USER ${USERNAME}

# Install zsh with Oh My Zsh (theme set separately)
# Note: fzf from apt package works directly, no Oh My Zsh plugin needed
RUN sh -c "$(wget -O- https://github.com/deluan/zsh-in-docker/releases/download/v${ZSH_IN_DOCKER_VERSION}/zsh-in-docker.sh)" -- \
 -p git \
 -a "export PROMPT_COMMAND='history -a' && export HISTFILE=/commandhistory/.bash_history" \
 -a "[ -f /usr/share/doc/fzf/examples/key-bindings.zsh ] && source /usr/share/doc/fzf/examples/key-bindings.zsh || true" \
 -a "[ -f /usr/share/doc/fzf/examples/completion.zsh ] && source /usr/share/doc/fzf/examples/completion.zsh || true" \
 -x

# Set Powerlevel10k theme (zsh-in-docker already clones it)
RUN sed -i 's/ZSH_THEME=".*"/ZSH_THEME="powerlevel10k\/powerlevel10k"/' ~/.zshrc

# Set zsh as default shell
ENV SHELL=/bin/zsh

# Install Claude Code globally
RUN npm install -g @anthropic-ai/claude-code@${CLAUDE_CODE_VERSION}

# Create directories for workspace and Claude config
USER root
RUN mkdir -p /workspace /home/${USERNAME}/.claude /home/${USERNAME}/.claude-state && \
 chown -R ${USERNAME}:${USERNAME} /workspace /home/${USERNAME}/.claude /home/${USERNAME}/.claude-state

# Copy Powerlevel10k configuration
COPY dot.p10k.zsh /home/${USERNAME}/.p10k.zsh
RUN chown ${USERNAME}:${USERNAME} /home/${USERNAME}/.p10k.zsh

# Copy and set up firewall script (optional security feature)
COPY init-firewall.sh /usr/local/bin/init-firewall.sh
RUN chmod +x /usr/local/bin/init-firewall.sh && \
 echo "${USERNAME} ALL=(root) NOPASSWD: /usr/local/bin/init-firewall.sh" > /etc/sudoers.d/${USERNAME}-firewall && \
 chmod 0440 /etc/sudoers.d/${USERNAME}-firewall

# Switch back to non-root user
USER ${USERNAME}

WORKDIR /workspace

# Note: Claude config symlinks are created in post-start.sh
# (not here) because ~/.claude is a volume mount that overwrites Dockerfile changes

# Alias for dangerous mode
RUN echo "alias claude-hard=\"claude --dangerously-skip-permissions\"" >> "/home/${USERNAME}/.zshrc"
RUN echo "alias claude-teams-hard='tmux new-session -s claude-agents \"CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1 claude --dangerously-skip-permissions --teammate-mode tmux\"'" >> "/home/${USERNAME}/.zshrc"

# Enable vi mode
RUN echo "bindkey -v" >> "/home/${USERNAME}/.zshrc"

# Source project .env exports (generated by post-start.sh)
RUN echo '[[ -f ~/.env_exports ]] && source ~/.env_exports' >> "/home/${USERNAME}/.zshrc"

# Source Powerlevel10k configuration
RUN echo '[[ ! -f ~/.p10k.zsh ]] || source ~/.p10k.zsh' >> "/home/${USERNAME}/.zshrc"
