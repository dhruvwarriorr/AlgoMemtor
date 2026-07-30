from fastapi import FastAPI

app = FastAPI(title="AlgoMemtor AI API", version="0.1.0")


@app.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok", "service": "ai-api"}
