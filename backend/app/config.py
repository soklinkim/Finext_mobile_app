from pydantic_settings import BaseSettings, SettingsConfigDict


class AppConfig(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env")
    database_url: str
    supabase_url: str
    # Public (publishable) key, handed to the lender portal so bank staff can sign in.
    supabase_publishable_key: str | None = None
    # Extra web origins allowed to call the API, comma-separated (e.g. a deployed web app).
    # The Expo web dev server on this computer / LAN is always allowed; native apps need no entry.
    allowed_origins: str = ""


config = AppConfig()