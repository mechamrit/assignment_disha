FROM python:3.11.15-slim-bookworm
COPY --from=ghcr.io/astral-sh/uv:0.11.8 /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock ./
# The uv download cache lives in a BuildKit cache mount, so it never lands in an image layer.
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev --no-install-project
COPY . .
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --locked --no-dev
RUN useradd --system --uid 10001 --create-home app
USER app
EXPOSE 7860
# Compose runs this image with host networking, so 127.0.0.1 is the host's loopback.
CMD ["uv", "run", "--no-sync", "bot.py", "-t", "webrtc", "--host", "127.0.0.1"]
