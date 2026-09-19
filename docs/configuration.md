# Configuration

Project config is `.sol-codex.json`. User config is `~/.config/sol-codex/config.json` (or `$XDG_CONFIG_HOME`). Project values override user values.

Unknown configuration fields are rejected deliberately so typos do not silently disable safeguards.

`packedCommands` are named argv arrays. Example:

```json
{"name":"test","command":["npm","test"],"timeoutMs":180000}
```

Action Fusion refers to named commands or conservative auto-detection; it never executes free-form model-generated shell strings.
