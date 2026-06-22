from app.core.config import settings

try:
    from copilot import CopilotClient, SubprocessConfig
except ImportError:
    CopilotClient = None
    SubprocessConfig = None


async def approve_permission(*args, **kwargs):
    return {"approve": True}


async def get_copilot_chat_completion(
    github_token: str,
    model: str,
    prompt: str,
) -> dict:
    if CopilotClient is None or SubprocessConfig is None:
        return {
            "success": False,
            "response_text": None,
            "error_message": "Copilot SDK not installed or import failed",
        }

    client = None

    try:
        print("[Copilot SDK] Starting SDK request")

        config = SubprocessConfig(
            github_token=github_token,
            use_logged_in_user=False,
        )

        client = CopilotClient(config=config)

        await client.start()
        print("[Copilot SDK] Client started")

        # --- COPILOT AUTH DIAGNOSTICS ---
        env_token = settings.GITHUB_COPILOT_TOKEN
        token_source = "NONE"
        if github_token:
            if env_token and github_token == env_token:
                token_source = "ENV_FALLBACK"
            else:
                token_source = "REDIS/OAUTH"

        print("\n" + "="*40)
        print("COPILOT AUTH DIAGNOSTICS")
        print(f"TOKEN PROVIDED: {bool(github_token)}")
        print(f"ENV TOKEN EXISTS: {bool(env_token)}")
        print(f"FINAL TOKEN EXISTS: {bool(github_token)}")
        print(f"TOKEN SOURCE: {token_source}")
        print(f"TOKEN PREFIX: {github_token[:20] if github_token else 'NONE'}...")
        print(f"TOKEN LENGTH: {len(github_token) if github_token else 0}")
        print(f"MODEL NAME: {model}")
        print("="*40 + "\n")

        if not github_token:
            raise RuntimeError("NO EXPLICIT USER TOKEN PROVIDED")

        session = await client.create_session(
            on_permission_request=approve_permission,
            model=model,
            session_id="skyquery-test-session",
        )

        print("[Copilot SDK] Session created")

        response = await session.send_and_wait(prompt)

        print("[Copilot SDK] Prompt sent successfully")

        if isinstance(response, dict):
            content = (
                response.get("content")
                or response.get("text")
                or response.get("response")
                or str(response)
            )
        else:
            content = (
                getattr(response, "content", None)
                or getattr(response, "text", None)
                or getattr(response, "message", None)
                or str(response)
            )

        return {
            "success": True,
            "response_text": content,
            "error_message": None,
        }

    except Exception as e:
        print(f"[Copilot SDK] Error: {str(e)}")
        return {
            "success": False,
            "response_text": None,
            "error_message": str(e),
        }

    finally:
        if client is not None:
            try:
                await client.stop()
            except Exception:
                pass
