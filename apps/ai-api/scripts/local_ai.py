"""Install or verify the two development models, using user-level caches."""

from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import time
import urllib.error
import urllib.request

CHAT_MODEL = "qwen3:8b-q4_K_M"
EMBEDDING_MODEL = "Qwen/Qwen3-Embedding-0.6B"
OLLAMA_URL = "http://127.0.0.1:11434"


def run(*command: str) -> None:
    subprocess.run(command, check=True)


def ensure_ollama() -> None:
    if shutil.which("ollama"):
        return
    if not shutil.which("brew"):
        raise RuntimeError("Install Homebrew first, then rerun this command.")
    run("brew", "install", "ollama")


def wait_for_ollama() -> None:
    for _ in range(30):
        try:
            urllib.request.urlopen(f"{OLLAMA_URL}/api/tags", timeout=1).read()
            return
        except urllib.error.URLError, TimeoutError:
            time.sleep(1)
    raise RuntimeError("Ollama did not become ready at 127.0.0.1:11434.")


def setup() -> None:
    ensure_ollama()
    try:
        wait_for_ollama()
    except RuntimeError:
        if not shutil.which("brew"):
            raise
        run("brew", "services", "start", "ollama")
        wait_for_ollama()
    run("ollama", "pull", CHAT_MODEL)
    from sentence_transformers import SentenceTransformer

    SentenceTransformer(EMBEDDING_MODEL, trust_remote_code=True)
    print("Installed exactly the configured local chat and embedding models.")


def post(path: str, payload: dict[str, object]) -> dict[str, object]:
    request = urllib.request.Request(
        f"{OLLAMA_URL}{path}",
        data=json.dumps(payload).encode(),
        headers={"content-type": "application/json"},
    )
    with urllib.request.urlopen(request, timeout=120) as response:
        body = json.loads(response.read())
    if not isinstance(body, dict):
        raise TypeError("Unexpected Ollama response.")
    return body


def check() -> None:
    wait_for_ollama()
    tags = json.loads(urllib.request.urlopen(f"{OLLAMA_URL}/api/tags").read())
    names = {model.get("name") for model in tags.get("models", [])}
    if CHAT_MODEL not in names:
        raise RuntimeError(f"Missing Ollama model: {CHAT_MODEL}")
    result = post(
        "/api/chat",
        {
            "model": CHAT_MODEL,
            "messages": [{"role": "user", "content": "Reply with exactly: local-ok"}],
            "stream": False,
            "options": {"num_ctx": 16_384, "temperature": 0},
        },
    )
    answer = str(result.get("message", {}).get("content", "")).strip()
    if not answer:
        raise RuntimeError("The local chat model returned an empty answer.")
    from sentence_transformers import SentenceTransformer

    model = SentenceTransformer(EMBEDDING_MODEL, trust_remote_code=True)
    vector = model.encode("AlgoMemtor local embedding check")
    if len(vector) != 1_024:
        raise RuntimeError(f"Expected 1024 dimensions, received {len(vector)}.")
    print(f"chat={CHAT_MODEL} context=16384 answer={answer!r}")
    print(f"embedding={EMBEDDING_MODEL} dimensions={len(vector)}")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("action", choices=["setup", "check"])
    args = parser.parse_args()
    setup() if args.action == "setup" else check()


if __name__ == "__main__":
    main()
