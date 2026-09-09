# Genius Idea

Add support for Ollama models. This will set us up for the next upcoming change.

The user can define the model, for example `ornith-1.5:35b`, in the config where the Claude model name would go, but with an `ollama:` prefix. For Ornith 1.5 35b as the summary model, the user would set -

```json
{
  "models": {
    "summary": "ollama:ornith-1.5:35b",
    "final": "sonnet"
  }
}
```

You'll need to understand the Ollama API. From what I understand it has some partial compatibility with both the OpenAI API shape and the Anthropic API shape. It also might have its own unique API shape entirely. You're welcome to use whichever is most appropriate.

Start your research from <https://docs.ollama.com/llms.txt> and your `ollama-api` skill.

An additional change, while you’re at it at the same time; an `ignore:` directive to go along with `lowPriorityPaths:` to list paths to totally ignore entirely.
