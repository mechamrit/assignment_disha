FROM python:3.11.15-slim-bookworm
COPY --from=ghcr.io/astral-sh/uv:0.11.8 /uv /uvx /bin/
ENV UV_COMPILE_BYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PYTHON_DOWNLOADS=never
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --locked --no-dev --no-install-project
COPY . .
RUN uv sync --locked --no-dev
EXPOSE 7860
CMD ["uv", "run", "--no-sync", "bot.py", "-t", "webrtc", "--host", "0.0.0.0"]
