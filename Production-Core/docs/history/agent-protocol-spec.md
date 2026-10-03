# AGENT COMMUNICATION PROTOCOL SPECIFICATION

## Message Format (Standard)
```json
{
  "message_id": "uuid-v4",
  "correlation_id": "session-uuid",  // Links related messages
  "from_agent": "agent-name",
  "to_agent": "agent-name",
  "timestamp": "ISO-8601",
  "action": "action-type",
  "payload": {},  // Action-specific data
  "priority": "high|normal|low",
  "reply_to": "message-id"  // If this is a response
}
```

## Communication Channels (Redis Pub/Sub)

Channels:
- `orchestrator.commands`    # Orchestrator publishes here
- `teaching.requests`        # Teaching agent subscribes
- `assessment.requests`      # Assessment agent subscribes
- `knowledge.requests`       # Knowledge agent subscribes
- `analyst.requests`         # Analyst agent subscribes
- `orchestrator.responses`   # All agents publish responses here

## Message Types

### Orchestrator → Knowledge Agent
Action: "retrieve_content"
Payload:
```json
{
  "concept_id": "string",
  "student_level": "beginner|intermediate|advanced",
  "context": {
    "student_id": "string",
    "learning_style": "string",
    "previous_concepts": ["string"]
  }
}
```

Response:
```json
{
  "content_package": {
    "definition": "string",
    "explanation": "string",
    "code_examples": [],
    "visual_aids": [],
    "difficulty_level": "string"
  },
  "metadata": {
    "retrieval_confidence": 0.95,
    "sources_used": ["source1", "source2"]
  }
}
```

### Orchestrator → Teaching Agent
Action: "teach_concept"
Payload:
```json
{
  "concept_id": "string",
  "student_id": "string",
  "content_package": {},  // From Knowledge Agent
  "teaching_strategy": "socratic|worked_example|analogy|visual",
  "context": {
    "student_profile": {},
    "session_history": []
  }
}
```

Response:
```json
{
  "lesson_content": {
    "introduction": "string",
    "main_explanation": "string",
    "examples": [],
    "practice_problems": [],
    "comprehension_checks": []
  },
  "estimated_duration_minutes": 15,
  "next_steps": ["string"]
}
```

### Orchestrator → Assessment Agent
Action: "generate_assessment"
Payload:
```json
{
  "concept_id": "string",
  "student_id": "string",
  "difficulty_level": "number",
  "question_count": "number",
  "assessment_type": "quick_check|comprehensive|diagnostic"
}
```

Response:
```json
{
  "questions": [
    {
      "question_id": "string",
      "question_text": "string",
      "question_type": "mcq|code|explanation",
      "options": [],  // if MCQ
      "difficulty": "number",
      "targets_misconception": "string"
    }
  ],
  "assessment_id": "string"
}
```

Action: "evaluate_answer"
Payload:
```json
{
  "assessment_id": "string",
  "question_id": "string",
  "student_answer": "mixed",
  "context": {
    "time_taken_seconds": "number",
    "hints_used": "number"
  }
}
```

Response:
```json
{
  "is_correct": "boolean",
  "score": "number",  // 0-1, supports partial credit
  "feedback": "string",
  "misconception_detected": "string",
  "analysis": {
    "what_student_knows": ["string"],
    "what_student_missing": ["string"],
    "recommended_action": "continue|review|switch"
  }
}
```

### Orchestrator → Analyst Agent
Action: "analyze_session"
Payload:
```json
{
  "session_id": "string",
  "student_id": "string",
  "session_data": {
    "concepts_covered": [],
    "questions_answered": [],
    "time_spent": "number",
    "teaching_strategies_used": []
  }
}
```

Response:
```json
{
  "insights": {
    "mastery_changes": [
      {
        "concept_id": "string",
        "before": 0.6,
        "after": 0.75,
        "trend": "improving"
      }
    ],
    "learning_patterns_detected": ["string"],
    "emotional_state": "engaged|frustrated|confused|confident",
    "recommendations": [
      {
        "type": "teaching_strategy_change|topic_switch|break",
        "reason": "string",
        "priority": "high|medium|low"
      }
    ]
  },
  "student_profile_updates": {}  // Changes to apply to profile
}
```

Action: "predict_performance"
Payload:
```json
{
  "student_id": "string",
  "concept_id": "string"
}
```

Response:
```json
{
  "predicted_mastery": 0.7,
  "confidence": 0.85,
  "factors": [
    {
      "factor": "strong_in_prerequisites",
      "impact": 0.3
    },
    {
      "factor": "learning_style_match",
      "impact": 0.2
    }
  ]
}
```

## Error Handling

Error Response Format:
```json
{
  "error": true,
  "error_code": "string",
  "error_message": "string",
  "retry_strategy": "immediate|backoff|skip",
  "fallback_action": "string"
}
```

Common Error Codes:
- "LLM_API_FAILURE": LLM provider unavailable
- "TIMEOUT": Agent didn't respond in time
- "INVALID_PAYLOAD": Message format error
- "RESOURCE_NOT_FOUND": Requested data doesn't exist
- "RATE_LIMIT_EXCEEDED": Too many requests

## Performance Requirements

- Message delivery: < 100ms
- Agent response time: < 3 seconds
- Message ordering: FIFO guaranteed within same correlation_id
- Reliability: At-least-once delivery
