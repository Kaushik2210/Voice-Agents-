from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    # VoiceStudio local API (OpenAI-compatible audio endpoint)
    voicestudio_url: str = "http://127.0.0.1:3900"
    voicestudio_api_key: str = ""
    asr_model: str = "whisper-1"
    asr_language: str = ""  # empty = let the engine auto-detect
    asr_timeout_s: float = 900.0

    # Local LLM (Ollama)
    ollama_url: str = "http://127.0.0.1:11434"
    ollama_model: str = "llama3.1:8b"
    ollama_num_ctx: int = 8192
    llm_timeout_s: float = 300.0

    # Privacy and retention
    data_dir: Path = Path("./data")
    keep_audio: bool = False  # delete the recording as soon as it is transcribed
    redact_identifiers: bool = True
    retention_days: int = 30  # consultations older than this are purged
    max_upload_mb: int = 200

    # Access
    api_key: str = ""  # if set, every /api request must send X-API-Key
    cors_origins: str = "http://localhost:5173"

    @property
    def audio_dir(self) -> Path:
        return self.data_dir / "audio"

    @property
    def database_url(self) -> str:
        return f"sqlite:///{(self.data_dir / 'clinicscribe.db').as_posix()}"


settings = Settings()
