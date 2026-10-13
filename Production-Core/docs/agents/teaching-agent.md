# Teaching Agent (Adaptive Pedagogy)

Turns a content package from the Knowledge agent into a lesson in one of five teaching strategies. Overview of all agents:
[ARCHITECTURE.md](../ARCHITECTURE.md#agents).

## Strategies (`agents/teaching/strategies.py`)

| Strategy | Style |
|---|---|
| `analogy` | Everyday analogies; default for beginners |
| `visual` | ASCII diagrams and structure maps; default for visual learners |
| `worked_example` | Step-by-step problem solving; default for intermediate learners and hands-on learners |
| `socratic` | Guiding questions toward discovery (interactive) |
| `incremental` | Scaffolding from foundation to mastery; default for advanced learners and readers |

## Flow (`agents/teaching/agent.py`)

1. **Select** (`_select_strategy`): if the previous strategy failed, try the next alternative; otherwise match the
   learner's style (visual → `visual`, kinesthetic → `worked_example`, reading → `incremental`), otherwise choose by level.
2. **Generate**: the strategy builds a prompt and calls `LLMService`, which uses the shared router
   (Mistral → Gemini → Groq by default, `LLM_PROVIDERS`). If no provider answers, the agent returns a plain
   "I can't reach the language model right now" message instead of inventing text.
3. **Check**: comprehension-check questions are added to the lesson, and next steps are suggested.
4. **Adapt** (`adapt_explanation`): rewrites an explanation when the learner reports confusion.

## Relation to the measured teaching-style bandit

The learner-facing choice of style in *Learn* is made by `learning/strategy.py` (a per-learner Thompson-sampling bandit
over `socratic`, `worked_example`, `analogy` and `default`, rewarded by the next check question). That is where
"which style works for me" is measured; see [LEARNING.md](../LEARNING.md#meta-learning-strategypy). This agent applies a
chosen strategy to content.

## API

`POST /api/v1/agents/teaching/teach` (authenticated; acts on the caller only).

```json
{ "concept_title": "Binary Search", "teaching_strategy": "analogy",
  "lesson_content": { "title": "Analogy: Binary Search", "content": "...", "comprehension_checks": "..." } }
```
