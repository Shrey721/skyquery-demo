import difflib
import logging
import re
from typing import Any, Dict, List

from app.services.table_selector import normalize_tables

logger = logging.getLogger(__name__)

PREVIEW_WORDS = {"one": 1, "single": 1, "sample": 10, "preview": 10}
OPERATION_WORDS = {
    "show",
    "list",
    "get",
    "find",
    "filter",
    "one",
    "ones",
    "row",
    "rows",
    "record",
    "records",
}
COMPARISON_WORDS = {"with", "where", "having", "equal", "equals", "contains"}
REFERENCE_WORDS = {
    "previous",
    "that",
    "this",
    "same",
    "these",
    "those",
    "ones",
    "it",
    "them",
    "result",
    "results",
    "more",
    "another",
}
ANALYTIC_TASK_WORDS = {
    "average",
    "avg",
    "count",
    "sum",
    "total",
    "top",
    "bottom",
    "group",
    "trend",
    "compare",
    "distribution",
    "rate",
    "min",
    "max",
}
RELATION_WORDS = {
    "from",
    "in",
    "at",
    "near",
    "between",
    "before",
    "after",
    "during",
    "by",
    "over",
    "under",
    "last",
    "next",
    "today",
    "yesterday",
    "tomorrow",
}
METADATA_WORDS = {"schema", "table", "tables", "column", "columns", "catalog", "describe", "metadata"}
ERROR_OR_EMPTY_CATEGORIES = {"error", "empty", "invalid"}
STOP_WORDS = {
    "a",
    "an",
    "and",
    "by",
    "for",
    "from",
    "get",
    "give",
    "list",
    "me",
    "of",
    "one",
    "ones",
    "record",
    "records",
    "row",
    "rows",
    "show",
    "table",
    "the",
    "with",
    "where",
    "having",
    "equal",
    "equals",
    "contains",
}


def _intent_category(intent: Any) -> str | None:
    if isinstance(intent, str):
        return intent
    if isinstance(intent, dict):
        return intent.get("category") or intent.get("intent") or intent.get("mode")
    return None


def _quote_identifier(value: Any) -> str:
    return '"' + str(value).replace('"', '""') + '"'


def _quote_table_ref(table: Dict[str, Any]) -> str:
    return ".".join(
        _quote_identifier(part)
        for part in [table.get("catalog"), table.get("schema_name"), table.get("table_name")]
        if part
    )


def _quote_literal(value: Any) -> str:
    return "'" + str(value).replace("'", "''") + "'"


def _tokens(text: str) -> List[str]:
    return [token for token in re.split(r"[^a-zA-Z0-9_]+", text.lower()) if token]


def _normalize(value: Any) -> str:
    return re.sub(r"[^a-z0-9]+", "", str(value).lower())


def _edit_distance(left: str, right: str) -> int:
    if left == right:
        return 0
    if abs(len(left) - len(right)) > 2:
        return 3

    previous = list(range(len(right) + 1))
    for i, left_char in enumerate(left, start=1):
        current = [i]
        for j, right_char in enumerate(right, start=1):
            current.append(
                min(
                    previous[j] + 1,
                    current[j - 1] + 1,
                    previous[j - 1] + (left_char != right_char),
                )
            )
        previous = current
    return previous[-1]


def _column_name(column: Any) -> str:
    if isinstance(column, dict):
        return column.get("name") or column.get("column_name") or column.get("column") or ""
    return str(column)


def _parse_previous_table_ref(sql: str | None) -> Dict[str, str] | None:
    if not sql:
        return None
    match = re.search(
        r"\bFROM\s+((?:\"[^\"]+\"|[A-Za-z0-9_$-]+)\.(?:\"[^\"]+\"|[A-Za-z0-9_$-]+)\.(?:\"[^\"]+\"|[A-Za-z0-9_$-]+))",
        sql,
        re.IGNORECASE,
    )
    if not match:
        return None
    parts = [part.strip().strip('"') for part in match.group(1).split(".")]
    if len(parts) != 3:
        return None
    return {"catalog": parts[0], "schema_name": parts[1], "table_name": parts[2]}


def _find_schema_table(schema: Dict[str, Any], ref: Dict[str, str] | None) -> Dict[str, Any] | None:
    if not ref:
        return None
    for table in normalize_tables(schema).values():
        if not isinstance(table, dict):
            continue
        if (
            str(table.get("catalog", "")).lower() == ref["catalog"].lower()
            and str(table.get("schema_name", "")).lower() == ref["schema_name"].lower()
            and str(table.get("table_name", "")).lower() == ref["table_name"].lower()
        ):
            return table
    return None


def _match_column(query_tokens: List[str], columns: List[Any]) -> tuple[Dict[str, Any], bool] | tuple[None, bool]:
    column_items = []
    for column in columns:
        name = _column_name(column)
        if not name:
            continue
        column_items.append({"name": name, "meta": column if isinstance(column, dict) else {"name": name}})

    exact = []
    fuzzy = []
    for item in column_items:
        normalized_name = _normalize(item["name"])
        name_parts = {_normalize(part) for part in re.split(r"[_\W]+", item["name"]) if len(part) > 1}
        for token in query_tokens:
            normalized_token = _normalize(token)
            if normalized_token == normalized_name or normalized_token in name_parts:
                exact.append(item)
            elif len(normalized_token) >= 4:
                ratio = difflib.SequenceMatcher(None, normalized_token, normalized_name).ratio()
                part_ratio = max(
                    [difflib.SequenceMatcher(None, normalized_token, part).ratio() for part in name_parts] or [0]
                )
                if max(ratio, part_ratio) >= 0.82:
                    fuzzy.append(item)

    matches = exact or fuzzy
    unique = {item["name"]: item for item in matches}
    if len(unique) == 1:
        return next(iter(unique.values()))["meta"], False
    if len(unique) > 1:
        return None, True
    return None, False


def _sample_values(column: Dict[str, Any]) -> List[str]:
    values = column.get("sample_values") or column.get("samples") or []
    return [str(value) for value in values if value is not None]


def _previous_values_for_column(context: Dict[str, Any] | None, column_name: str) -> List[str]:
    rows = (context or {}).get("previous_rows") or []
    values = []
    for row in rows:
        if not isinstance(row, dict):
            continue
        for key, value in row.items():
            if _normalize(key) == _normalize(column_name) and value is not None:
                values.append(str(value))
    return values


def _context_values(column: Dict[str, Any], context: Dict[str, Any] | None) -> List[str]:
    seen = set()
    values = []
    for value in [*_sample_values(column), *_previous_values_for_column(context, _column_name(column))]:
        normalized = _normalize(value)
        if normalized and normalized not in seen:
            seen.add(normalized)
            values.append(value)
    return values


def _fuzzy_candidate(token: str, candidates: List[tuple[str, str]], category: str) -> tuple[str, str, float] | None:
    normalized_token = _normalize(token)
    if not normalized_token:
        return None

    best = None
    allowed_matches = []
    for canonical, candidate in candidates:
        normalized_candidate = _normalize(candidate)
        if not normalized_candidate:
            continue
        if normalized_token == normalized_candidate:
            score = 1.0
            distance = 0
        else:
            score = difflib.SequenceMatcher(None, normalized_token, normalized_candidate).ratio()
            distance = _edit_distance(normalized_token, normalized_candidate)

        if category in {"operation", "comparison"}:
            allowed = (
                (len(normalized_token) <= 3 and distance <= 1 and score >= 0.66)
                or (len(normalized_token) >= 4 and distance <= 2 and score >= 0.78)
            )
        elif category == "schema":
            allowed = len(normalized_token) >= 4 and distance <= 2 and score >= 0.72
        else:
            allowed = (
                (len(normalized_token) >= 4 and distance <= 1 and score >= 0.76)
                or (len(normalized_token) >= 5 and distance <= 2 and score >= 0.82)
            )

        if allowed:
            current = (canonical, candidate, score)
            allowed_matches.append(current)
            if best is None or score > best[2]:
                best = current

    if not best:
        return None

    tied = [
        candidate
        for candidate in allowed_matches
        if _normalize(candidate[1]) != _normalize(best[1]) and abs(candidate[2] - best[2]) < 0.03
    ]
    if tied:
        return None
    return best


def _normalization_candidates(table: Dict[str, Any], columns: List[Any], context: Dict[str, Any] | None) -> Dict[str, List[tuple[str, str]]]:
    operation = [(word, word) for word in OPERATION_WORDS]
    comparison = [(word, word) for word in COMPARISON_WORDS]
    schema_terms = []
    values = []

    for part in [table.get("catalog"), table.get("schema_name"), table.get("table_name")]:
        if part:
            schema_terms.append((str(part), str(part)))
            schema_terms.extend((str(part), token) for token in re.split(r"[_\W]+", str(part)) if token)

    for column in columns:
        name = _column_name(column)
        if not name:
            continue
        meta = column if isinstance(column, dict) else {"name": name}
        schema_terms.append((name, name))
        schema_terms.extend((name, token) for token in re.split(r"[_\W]+", name) if token)
        values.extend((str(value), str(value)) for value in _context_values(meta, context))

    return {
        "operation": operation,
        "comparison": comparison,
        "schema": schema_terms,
        "value": values,
    }


def _generic_route_tokens(question: str) -> tuple[List[str], List[Dict[str, Any]]]:
    raw_tokens = _tokens(question)
    candidates = {
        "operation": [(word, word) for word in OPERATION_WORDS],
        "comparison": [(word, word) for word in COMPARISON_WORDS],
    }
    normalized = []
    corrections = []
    for token in raw_tokens:
        corrected = token
        for category in ["operation", "comparison"]:
            match = _fuzzy_candidate(token, candidates[category], category)
            if match:
                canonical, matched, score = match
                corrected = _normalize(canonical)
                if corrected != _normalize(token):
                    corrections.append(
                        {
                            "from": token,
                            "to": canonical,
                            "matched": matched,
                            "category": category,
                            "confidence": round(score, 3),
                        }
                    )
                break
        normalized.append(corrected)
    return normalized, corrections


def _previous_context_trust_score(context: Dict[str, Any] | None) -> float:
    if not isinstance(context, dict) or not context.get("previous_sql"):
        return 0.0

    category = _intent_category(context.get("previous_result_intent"))
    if category in ERROR_OR_EMPTY_CATEGORIES:
        return 0.2

    rows = context.get("previous_rows") or []
    columns = context.get("previous_columns") or []
    score = 0.45
    if columns:
        score += 0.2
    if rows:
        score += 0.15
    if category in {"preview", "analytics", "metadata"} or isinstance(context.get("previous_result_intent"), dict):
        score += 0.1
    if context.get("executionError") or context.get("error_type"):
        score -= 0.35
    return max(0.0, min(score, 0.9))


def _collect_schema_terms(schema: Dict[str, Any]) -> set[str]:
    terms = set()
    for table in normalize_tables(schema).values():
        if not isinstance(table, dict):
            continue
        for part in [table.get("catalog"), table.get("schema_name"), table.get("table_name")]:
            if part:
                terms.add(_normalize(part))
                terms.update(_normalize(token) for token in re.split(r"[_\W]+", str(part)) if len(token) > 2)
        columns = table.get("columns") or []
        for column in columns:
            name = _column_name(column)
            if name:
                terms.add(_normalize(name))
                terms.update(_normalize(token) for token in re.split(r"[_\W]+", name) if len(token) > 2)
    return {term for term in terms if term}


def _collect_context_value_terms(schema: Dict[str, Any], context: Dict[str, Any] | None) -> set[str]:
    previous_table = _find_schema_table(schema, _parse_previous_table_ref((context or {}).get("previous_sql")))
    if not previous_table:
        return set()
    terms = set()
    for column in previous_table.get("columns") or []:
        meta = column if isinstance(column, dict) else {"name": str(column)}
        for value in _context_values(meta, context):
            normalized = _normalize(value)
            if normalized:
                terms.add(normalized)
    return terms


def _high_confidence_fuzzy_hits(tokens: List[str], terms: set[str], category: str) -> List[str]:
    candidates = [(term, term) for term in terms]
    hits = []
    for token in tokens:
        if _normalize(token) in terms:
            hits.append(token)
            continue
        match = _fuzzy_candidate(token, candidates, category)
        if match:
            hits.append(token)
    return hits


def classify_followup_routing(
    question: str,
    schema: Dict[str, Any],
    context: Dict[str, Any] | None,
) -> Dict[str, Any]:
    tokens, generic_corrections = _generic_route_tokens(question)
    words = set(tokens)
    trust = _previous_context_trust_score(context)
    action_type = (context or {}).get("action_type") or ""
    explicit_context_action = isinstance(action_type, str) and bool(action_type)
    previous_category = _intent_category((context or {}).get("previous_result_intent"))

    schema_terms = _collect_schema_terms(schema)
    context_value_terms = _collect_context_value_terms(schema, context)
    semantic_terms = [
        token
        for token in tokens
        if token not in STOP_WORDS
        and token not in OPERATION_WORDS
        and token not in COMPARISON_WORDS
        and token not in REFERENCE_WORDS
    ]
    schema_term_hits = _high_confidence_fuzzy_hits(semantic_terms, schema_terms, "schema")
    context_value_hits = _high_confidence_fuzzy_hits(semantic_terms, context_value_terms, "value")
    previous_context_term_hits = set(schema_term_hits + context_value_hits)
    non_schema_semantic_terms = [
        token
        for token in semantic_terms
        if _normalize(token) not in schema_terms and token not in previous_context_term_hits
    ]

    standalone_signals = []
    followup_signals = []
    standalone_score = 0.0
    followup_score = 0.0

    if non_schema_semantic_terms:
        standalone_score += min(0.45, 0.15 * len(non_schema_semantic_terms))
        standalone_signals.append(f"non_schema_subject_terms:{','.join(non_schema_semantic_terms[:5])}")
    if len(semantic_terms) >= 3:
        standalone_score += 0.2
        standalone_signals.append("multiple_semantic_terms")
    if words.intersection(RELATION_WORDS):
        standalone_score += 0.2
        standalone_signals.append("has_filter_location_time_relation")
    if words.intersection(ANALYTIC_TASK_WORDS):
        standalone_score += 0.25
        standalone_signals.append("new_analytic_task")
    if words.intersection(METADATA_WORDS) and semantic_terms:
        standalone_score += 0.2
        standalone_signals.append("metadata_or_schema_task")
    if len(tokens) >= 6 and len(non_schema_semantic_terms) >= 2:
        standalone_score += 0.25
        standalone_signals.append("complete_query_length")

    if explicit_context_action:
        followup_score += 0.45
        followup_signals.append("explicit_ui_context_action")
    if len(tokens) <= 6:
        followup_score += 0.2
        followup_signals.append("short_query")
    if words.intersection(REFERENCE_WORDS):
        followup_score += 0.25
        followup_signals.append("reference_word")
    if words.intersection(COMPARISON_WORDS) or words.intersection(OPERATION_WORDS):
        followup_score += 0.15
        followup_signals.append("operation_or_filter_word")
    if schema_term_hits and not non_schema_semantic_terms:
        followup_score += 0.25
        followup_signals.append("only_previous_schema_terms")
    if len(tokens) <= 6 and schema_term_hits and len(non_schema_semantic_terms) <= 1:
        followup_score += 0.25
        followup_signals.append("short_filter_mentions_previous_column")
    if len(tokens) <= 6 and context_value_hits:
        followup_score += 0.25
        followup_signals.append("short_filter_mentions_previous_value")
    if previous_category in ERROR_OR_EMPTY_CATEGORIES and not words.intersection(REFERENCE_WORDS):
        followup_score -= 0.4
        standalone_signals.append("previous_context_low_trust_error_or_empty")

    followup_score *= trust
    standalone_score = min(1.0, standalone_score)
    followup_score = max(0.0, min(1.0, followup_score))

    if trust == 0 and looks_like_elliptical_filter(question):
        decision = "ambiguous_needs_clarification"
        confidence = 0.7
        reason = "vague_filter_without_previous_context"
    elif followup_score >= 0.55 and followup_score > standalone_score + 0.2:
        decision = "contextual_followup"
        confidence = followup_score
        reason = "high_confidence_contextual_followup"
    else:
        decision = "standalone_query"
        confidence = max(standalone_score, 1.0 - followup_score)
        reason = "standalone_signals_dominate_or_followup_confidence_low"

    return {
        "routing_decision": decision,
        "routing_confidence": round(confidence, 3),
        "standalone_signals": standalone_signals,
        "followup_signals": followup_signals,
        "previous_context_trust_score": round(trust, 3),
        "generic_corrections_applied": generic_corrections,
        "semantic_terms": semantic_terms,
        "non_schema_semantic_terms": non_schema_semantic_terms,
        "schema_term_hits": schema_term_hits,
        "context_value_hits": context_value_hits,
        "reason": reason,
    }


def _normalize_query_tokens(
    question: str,
    table: Dict[str, Any],
    columns: List[Any],
    context: Dict[str, Any] | None,
) -> tuple[List[str], str, List[Dict[str, Any]], float]:
    raw_tokens = _tokens(question)
    candidates = _normalization_candidates(table, columns, context)
    normalized_tokens = []
    corrections = []
    scores = []

    for token in raw_tokens:
        chosen = None
        for category in ["operation", "comparison", "schema", "value"]:
            chosen = _fuzzy_candidate(token, candidates[category], category)
            if chosen:
                canonical, matched, score = chosen
                corrected = _normalize(canonical)
                normalized_tokens.append(corrected)
                scores.append(score)
                if corrected != _normalize(token):
                    corrections.append(
                        {
                            "from": token,
                            "to": canonical,
                            "matched": matched,
                            "category": category,
                            "confidence": round(score, 3),
                        }
                    )
                break
        if not chosen:
            normalized_tokens.append(token)

    confidence = min(scores) if scores else 1.0
    return normalized_tokens, " ".join(normalized_tokens), corrections, confidence


def _match_value_for_column(query_tokens: List[str], column: Dict[str, Any], context: Dict[str, Any] | None) -> str | None:
    samples = _context_values(column, context)
    meaningful_tokens = [token for token in query_tokens if token not in STOP_WORDS]
    for token in meaningful_tokens:
        for sample in samples:
            if _normalize(token) == _normalize(sample):
                return sample
    for token in meaningful_tokens:
        for sample in samples:
            normalized_token = _normalize(token)
            normalized_sample = _normalize(sample)
            if len(normalized_token) >= 4 and _edit_distance(normalized_token, normalized_sample) <= 1:
                return sample
    for token in meaningful_tokens:
        if token != _normalize(_column_name(column)):
            return token
    return None


def _infer_column_from_values(
    query_tokens: List[str],
    columns: List[Any],
    context: Dict[str, Any] | None,
) -> tuple[Dict[str, Any], str, bool] | tuple[None, None, bool]:
    matches = []
    meaningful_tokens = [token for token in query_tokens if token not in STOP_WORDS]
    for column in columns:
        meta = column if isinstance(column, dict) else {"name": str(column)}
        for token in meaningful_tokens:
            for sample in _context_values(meta, context):
                normalized_token = _normalize(token)
                normalized_sample = _normalize(sample)
                if normalized_token == normalized_sample or (
                    len(normalized_token) >= 4 and _edit_distance(normalized_token, normalized_sample) <= 1
                ):
                    matches.append((meta, sample))

    unique_columns = {_column_name(column): (column, value) for column, value in matches}
    if len(unique_columns) == 1:
        return (*next(iter(unique_columns.values())), False)
    if len(unique_columns) > 1:
        return None, None, True
    return None, None, False


def _preview_limit(question: str) -> int:
    words = set(_tokens(question))
    for word, limit in PREVIEW_WORDS.items():
        if word in words:
            return limit
    match = re.search(r"\b(?:limit|top|first)\s+(\d{1,3})\b", question, re.IGNORECASE)
    if match:
        return max(1, min(int(match.group(1)), 100))
    return 100


def _preview_limit_from_tokens(query_tokens: List[str], question: str) -> int:
    words = set(query_tokens)
    if "one" in words and "ones" not in words:
        return 1
    if "single" in words:
        return 1
    if "sample" in words or "preview" in words:
        return 10
    match = re.search(r"\b(?:limit|top|first)\s+(\d{1,3})\b", question, re.IGNORECASE)
    if match:
        return max(1, min(int(match.group(1)), 100))
    return 100


def resolve_followup_query(question: str, schema: Dict[str, Any], context: Dict[str, Any] | None) -> Dict[str, Any] | None:
    if not isinstance(context, dict) or not context.get("previous_sql"):
        return None

    previous_table_ref = _parse_previous_table_ref(context.get("previous_sql"))
    table = _find_schema_table(schema, previous_table_ref)
    if not table:
        return None

    columns = table.get("columns") or []
    previous_columns = context.get("previous_columns") or []
    if previous_columns:
        allowed_previous = {_normalize(column) for column in previous_columns}
        schema_columns = [
            column for column in columns if _normalize(_column_name(column)) in allowed_previous
        ]
        if schema_columns:
            columns = schema_columns

    query_tokens, normalized_query, corrections, confidence = _normalize_query_tokens(question, table, columns, context)
    column, ambiguous_column = _match_column(query_tokens, columns)
    value = None
    ambiguous_value = False

    if column:
        value = _match_value_for_column(query_tokens, column if isinstance(column, dict) else {"name": str(column)}, context)
    else:
        column, value, ambiguous_value = _infer_column_from_values(query_tokens, columns, context)

    if ambiguous_column or ambiguous_value:
        choices = [
            _column_name(column_meta)
            for column_meta in columns
            if _column_name(column_meta)
        ]
        return {
            "status": "clarification",
            "summary": "Which column should I filter on?",
            "choices": choices[:8],
            "table": table,
        }

    if not column or value is None:
        return None

    column_name = _column_name(column)
    sql = (
        f"SELECT * FROM {_quote_table_ref(table)} "
        f"WHERE LOWER(CAST({_quote_identifier(column_name)} AS VARCHAR)) = LOWER({_quote_literal(value)}) "
        f"LIMIT {_preview_limit_from_tokens(query_tokens, question)}"
    )
    resolved = {
        "status": "resolved",
        "table": table,
        "filters": [{"column": column_name, "operator": "=", "value": value}],
        "sql": sql,
        "limit": _preview_limit_from_tokens(query_tokens, question),
        "normalized_query": normalized_query,
        "token_corrections": corrections,
        "normalization_confidence": confidence,
    }
    logger.debug(
        "Resolved follow-up query dynamically | raw_query=%s | normalized_query=%s | token_corrections=%s | confidence=%s | resolved_table=%s | resolved_filters=%s",
        question,
        normalized_query,
        corrections,
        confidence,
        ".".join(str(part) for part in [table.get("catalog"), table.get("schema_name"), table.get("table_name")] if part),
        resolved["filters"],
    )
    return resolved


def _column_meta_by_name(columns: List[Any], column_name: str) -> Dict[str, Any]:
    for column in columns:
        if _normalize(_column_name(column)) == _normalize(column_name):
            return column if isinstance(column, dict) else {"name": str(column)}
    return {"name": column_name}


def _is_numeric_type(data_type: Any) -> bool:
    text = str(data_type or "").lower()
    return any(part in text for part in ["int", "decimal", "double", "real", "number", "numeric", "float"])


def _looks_numeric(value: Any) -> bool:
    try:
        float(str(value).replace(",", ""))
        return True
    except Exception:
        return False


def sanity_check_followup_resolution(
    question: str,
    schema: Dict[str, Any],
    context: Dict[str, Any] | None,
    resolution: Dict[str, Any],
    routing: Dict[str, Any],
) -> Dict[str, Any]:
    if not resolution or resolution.get("status") != "resolved":
        return {"accepted": False, "reason": "resolver_did_not_resolve"}

    table = resolution.get("table") or {}
    columns = table.get("columns") or []
    schema_terms = _collect_schema_terms(schema)
    semantic_terms = routing.get("semantic_terms") or []
    non_schema_semantic_terms = routing.get("non_schema_semantic_terms") or []
    filters = resolution.get("filters") or []
    reasons = []

    for filter_item in filters:
        value = filter_item.get("value")
        normalized_value = _normalize(value)
        if normalized_value in schema_terms:
            reasons.append("table_or_schema_name_used_as_filter_value")

        column_meta = _column_meta_by_name(columns, filter_item.get("column"))
        if _is_numeric_type(column_meta.get("data_type")) and not _looks_numeric(value):
            reasons.append("numeric_column_compared_to_non_numeric_value")

    schema_corrections = [
        correction
        for correction in resolution.get("token_corrections", [])
        if correction.get("category") == "schema" and _normalize(correction.get("from")) != _normalize(correction.get("to"))
    ]
    if schema_corrections and routing.get("routing_confidence", 0) < 0.75:
        reasons.append("important_terms_replaced_by_schema_objects_without_high_confidence")

    resolved_filter_values = {_normalize(filter_item.get("value")) for filter_item in filters}
    resolved_filter_columns = {_normalize(filter_item.get("column")) for filter_item in filters}
    ignored_terms = [
        term
        for term in non_schema_semantic_terms
        if _normalize(term) not in resolved_filter_values and _normalize(term) not in resolved_filter_columns
    ]
    if len(semantic_terms) >= 3 and ignored_terms and routing.get("routing_decision") != "contextual_followup":
        reasons.append("generated_sql_ignores_key_user_terms")

    if routing.get("routing_decision") != "contextual_followup":
        reasons.append("routing_did_not_accept_contextual_followup")

    if reasons:
        return {"accepted": False, "reason": "; ".join(sorted(set(reasons)))}
    return {"accepted": True, "reason": "resolver_sql_matches_contextual_followup"}


def build_followup_clarification_response(
    question: str,
    schema: Dict[str, Any],
    reason: str,
    choices: List[str] | None = None,
) -> Dict[str, Any]:
    table_rows = [
        {"available_option": choice}
        for choice in (choices or [])
    ]
    if not table_rows:
        table_rows = [
            {
                "available_option": ".".join(
                    str(part)
                    for part in [
                        table.get("catalog"),
                        table.get("schema_name"),
                        table.get("table_name"),
                    ]
                    if part
                )
            }
            for table in normalize_tables(schema).values()
            if isinstance(table, dict)
        ][:8]

    return {
        "intent": {"intent": "clarification", "reason": reason},
        "result_intent": {"category": "clarification", "signals": ["followup_ambiguity"]},
        "selected_tables": [],
        "sql": "-- Clarification required before generating SQL",
        "validation": {"valid": True, "is_valid": True, "errors": []},
        "execution": {
            "rows": table_rows,
            "preview": table_rows,
            "columns": list(table_rows[0].keys()) if table_rows else [],
            "chart_suggestion": "table",
            "visualization": "table",
            "rendering": {
                "mode": "clarification",
                "header": "Clarification needed",
                "default_tab": "table",
                "chart_default_active": False,
            },
        },
        "summary": reason,
        "metadata": {"routing_reason": "followup_clarification"},
        "rendering": {
            "mode": "clarification",
            "header": "Clarification needed",
            "default_tab": "table",
            "chart_default_active": False,
        },
    }


def looks_like_elliptical_filter(question: str) -> bool:
    words = set(_tokens(question))
    normalized_words = set()
    generic_candidates = {
        "operation": [(word, word) for word in OPERATION_WORDS],
        "comparison": [(word, word) for word in COMPARISON_WORDS],
    }
    for word in words:
        normalized_words.add(word)
        for category in ["operation", "comparison"]:
            match = _fuzzy_candidate(word, generic_candidates[category], category)
            if match:
                normalized_words.add(_normalize(match[0]))
    has_preview_action = bool(normalized_words.intersection({"show", "list", "find", "get"}))
    has_filter_marker = bool(normalized_words.intersection({"with", "where", "filter", "having"}))
    has_preview_size = bool(normalized_words.intersection(set(PREVIEW_WORDS) | {"ones"}))
    meaningful = [word for word in normalized_words if word not in STOP_WORDS]
    return has_preview_action and (has_filter_marker or has_preview_size) and len(meaningful) <= 4
