# turn-chime

A Claude Code mod that tells you when a long turn has finished, so you can look away during slow tasks.

- After a turn of **40 seconds or more**, a short chime plays.
- After a turn of **5 minutes or more**, it also announces, in a British voice:
  `"{session title}. {task} is completed, sir."`

Interrupted turns and subagent turns stay silent. On macOS the sound goes through `afplay` and `say`, which mix with whatever is playing, so your music is never paused.

## Install

From a terminal session of Claude Code:

```
/plugin install turn-chime --marketplace loucimj/turn-chime
```

Answer `y` to add the marketplace, then pick the **user** scope so it loads in every session, including the desktop app.

## Options

Set them in `/config` (or `/plugin configure turn-chime@loucimj-turn-chime`):

| Option | Default | What it does |
| --- | --- | --- |
| Minimum turn length | 40 s | How long a turn must run before the chime plays |
| Chime sound | Glass | One of the bundled macOS system sounds |
| Speak after | 300 s | How long a turn must run before it is also announced by voice |
| Voice | Daniel | A macOS system voice (`say -v '?'` lists them) |

## Development

```
claude plugin validate .
claude plugin test .
```

Run a session with `claude --plugin-dir .` to try changes before installing.
