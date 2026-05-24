import logging
from typing import Any, Dict

logger = logging.getLogger(__name__)


def classify_intent(question: str, metadata: Dict[str, Any], history: list) -> Dict[str, Any]:
    """Classify user intent for legacy compatibility."""
    logger.debug("Classifying intent for question: %s", question)
    return {"intent": "information_retrieval", "confidence": 1.0}
