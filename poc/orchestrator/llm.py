#!/usr/bin/env python3
"""
Shared LLM client — the single swap point for every planner / classifier / tagger call.
======================================================================================
Order of preference:
  1. Anthropic Claude Haiku 4.5  — when ANTHROPIC_API_KEY is set (the cloud / prod path)
  2. Local Ollama qwen2.5:7b     — fallback for offline dev on a Mac with Ollama running

Why this exists: the orchestrator stages used to call `ollama.chat(...)` directly, which
hard-crashes in any environment without a local Ollama server (i.e. every cloud container).
Routing all calls through llm_chat() means the pipeline behaves identically on a Mac with
Ollama AND in a Docker/Render container that only has the Anthropic API. This is the one
place to change if we ever switch LLM backends (Five Pillars: extensible, swap not modify).
"""

import os

ANTHROPIC_MODEL = os.environ.get("ANTHROPIC_MODEL", "claude-haiku-4-5")
OLLAMA_MODEL = os.environ.get("OLLAMA_MODEL", "qwen2.5:7b")


def llm_available() -> str:
    """Report which backend will be used: 'anthropic' | 'ollama'."""
    return "anthropic" if os.environ.get("ANTHROPIC_API_KEY") else "ollama"


def llm_chat(system: str, user: str, max_tokens: int = 2000, temperature: float = 0.2) -> str:
    """Single chat-completion call. Prefers Claude Haiku; falls back to local Ollama.

    Returns the assistant's text. Raises only if BOTH backends are unavailable
    (no API key AND no reachable Ollama)."""
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if api_key:
        import anthropic
        client = anthropic.Anthropic(api_key=api_key)
        resp = client.messages.create(
            model=ANTHROPIC_MODEL,
            max_tokens=max_tokens,
            temperature=temperature,
            system=system or "",
            messages=[{"role": "user", "content": user}],
        )
        return resp.content[0].text

    # Fallback: local Ollama (dev only). Imported lazily so cloud builds don't need it.
    import ollama
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": user})
    response = ollama.chat(
        model=OLLAMA_MODEL,
        messages=messages,
        options={"temperature": temperature, "num_predict": max_tokens},
    )
    return response["message"]["content"]
