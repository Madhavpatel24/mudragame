# mudra-game

Gamified mudra learning with two modes, chosen on the first screen:

- **Asamyukta** (single-hand): the NrityaNetra on-device model.
- **Samyukta** (two-hand): Aparna's model server.

| Folder | What it is |
| --- | --- |
| `asamyukta/` | NrityaNetra code, imported with its history. Unchanged. |
| `vendor/samyukta-hasta-game/` | Aparna's repo, imported with its history. Unchanged. |
| `switcher/` | New. The mode registry and the manager that switches between models. |

Only `switcher/` (and later the app that uses it) is new code. The two imported
folders are not edited, so each can be updated from its own upstream.
