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
    # Secret (service role) key, used only by scripts/add_lender.py --invite to email bank staff an invite. Never give
    # it to the app or the portal.
    supabase_secret_key: str | None = None
    # Where invite and password-reset emails send bank staff. Add it in Supabase: Authentication > URL Configuration >
    # Redirect URLs.
    portal_url: str = "http://localhost:8000/portal/"


config = AppConfig()