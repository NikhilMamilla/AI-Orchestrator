
import httpx
from backend.app.config import settings
from typing import Dict, Any, Optional
import logging

logger = logging.getLogger(__name__)

class CodeExecutionService:
    """Execute code safely using Judge0 API"""

    def __init__(self):
        self.judge0_url = settings.dict().get("JUDGE0_API_URL", "https://judge0-ce.p.rapidapi.com")
        self.api_key = settings.dict().get("JUDGE0_API_KEY", "")

    async def execute_code(
        self,
        code: str,
        language: str = "python",
        stdin: str = "",
        timeout: int = 5
    ) -> Dict[str, Any]:
        """
        Execute code and return results
        
        Args:
            code: Source code to execute
            language: Programming language
            stdin: Standard input
            timeout: Execution timeout in seconds
        
        Returns:
            {
                "stdout": str,
                "stderr": str,
                "status": str,
                "time": float,
                "memory": int
            }
        """
        # Language ID mapping for Judge0
        language_ids = {
            "python": 71,  # Python 3
            "javascript": 63,  # JavaScript (Node.js)
            "java": 62,
            "cpp": 54
        }

        language_id = language_ids.get(language, 71)

        # Submit code
        try:
            async with httpx.AsyncClient() as client:
                response = await client.post(
                    f"{self.judge0_url}/submissions",
                    json={
                        "source_code": code,
                        "language_id": language_id,
                        "stdin": stdin,
                        "cpu_time_limit": timeout
                    },
                    headers={
                        "X-RapidAPI-Key": self.api_key or "",
                        "X-RapidAPI-Host": "judge0-ce.p.rapidapi.com"
                    },
                    params={"base64_encoded": "false", "wait": "true"},
                    timeout=timeout + 5
                )

                if response.status_code != 201:
                    logger.error(f"Code execution failed: {response.status_code}")
                    return {
                        "stdout": "",
                        "stderr": f"Execution service failed with status {response.status_code}",
                        "status": "error",
                        "time": 0.0,
                        "memory": 0
                    }

                result = response.json()

                return {
                    "stdout": result.get("stdout", ""),
                    "stderr": result.get("stderr", ""),
                    "status": result.get("status", {}).get("description", "Unknown"),
                    "time": float(result.get("time", 0.0) or 0.0),
                    "memory": int(result.get("memory", 0) or 0)
                }
        except Exception as e:
            logger.error(f"❌ Judge0 Execution Error: {e}")
            return {
                "stdout": "",
                "stderr": str(e),
                "status": "error",
                "time": 0.0,
                "memory": 0
            }
