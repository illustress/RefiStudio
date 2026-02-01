FROM oven/bun:1.3.3-alpine

# Install necessary packages for development
RUN apk add --no-cache \
    git \
    curl \
    wget \
    jq \
    sudo \
    postgresql-client \
    vim \
    nano \
    bash \
    bash-completion \
    zsh \
    zsh-vcs \
    ca-certificates \
    shadow

# Create a non-root user with matching UID/GID
ARG USERNAME=bun
ARG USER_UID=1000
ARG USER_GID=$USER_UID

# Create user group if it doesn't exist
RUN if ! getent group $USER_GID >/dev/null; then \
        addgroup -g $USER_GID $USERNAME; \
    fi

# Create user if it doesn't exist
RUN if ! getent passwd $USER_UID >/dev/null; then \
        adduser -D -u $USER_UID -G $(getent group $USER_GID | cut -d: -f1) $USERNAME; \
    fi

# Add sudo support
RUN echo "$USERNAME ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/$USERNAME \
    && chmod 0440 /etc/sudoers.d/$USERNAME

# Set up shell environment
RUN echo "export PATH=\$PATH:/home/$USERNAME/.bun/bin" >> /etc/profile

# Writable temp dir for Bun (avoids "unable to write files to tempdir: AccessDenied" in containers)
RUN mkdir -p /home/$USERNAME/.bun/tmp && chown -R $USERNAME:$(getent group $USER_GID | cut -d: -f1) /home/$USERNAME/.bun
ENV TMPDIR=/home/bun/.bun/tmp

# Entrypoint ensures /tmp is writable at container start (Bun uses it; survives devcontainer compose merge)
COPY .devcontainer/entrypoint.sh /usr/local/bin/devcontainer-entrypoint.sh
RUN chmod +x /usr/local/bin/devcontainer-entrypoint.sh
ENTRYPOINT ["/usr/local/bin/devcontainer-entrypoint.sh"]

WORKDIR /workspace

# Expose the ports we're interested in
EXPOSE 3000
EXPOSE 3001
EXPOSE 3002