# Nexical CLI Core Development Guide

This guide details how to build command libraries and CLIs using the `@nexical/cli-core` framework within this project.

## Overview

The project is configured to use `@nexical/cli-core` as its CLI framework. usage entails:

1.  **Entry Point**: `index.ts` initializes the `CLI` instance.
2.  **Command Discovery**: The CLI automatically scans `src/commands` for command files.
3.  **Command Implementation**: Commands are TypeScript classes extending `BaseCommand`.

## Directory Structure

Commands are defined in `src/commands`. The file structure directly maps to the command hierarchy.

| File Path                     | Command           | Description                       |
| :---------------------------- | :---------------- | :-------------------------------- |
| `src/commands/init.ts`        | `app init`        | Root level command                |
| `src/commands/user/create.ts` | `app user create` | Subcommand                        |
| `src/commands/user/index.ts`  | `app user`        | Parent command handler (optional) |

> **Note**: The CLI name (`app`) is configured in `index.ts`.

## Creating a New Command

To create a new command, add a `.ts` file in `src/commands`.

### 1. Basic Command Template

Create `src/commands/hello.ts`:

```typescript
import { BaseCommand } from '@nexical/cli-core';

export default class HelloCommand extends BaseCommand {
  // Description displayed in help menus
  static description = 'Prints a hello message';

  // The main execution method
  async run(options: any) {
    this.success('Hello World!');
  }
}
```

**Run it:**

```bash
npm run cli hello
```

### 2. Arguments and Options

Use the static `args` property to define inputs.

```typescript
import { BaseCommand } from '@nexical/cli-core';

export default class GreetCommand extends BaseCommand {
  static description = 'Greets a user';

  static args = {
    // Positional Arguments
    args: [
      {
        name: 'name',
        description: 'Name of the user',
        required: true,
      },
    ],
    // Options (Flags)
    options: [
      {
        name: '--loud',
        description: 'Print in uppercase',
        default: false,
      },
      {
        name: '-c, --count <n>',
        description: 'Number of times to greet',
        default: 1,
      },
    ],
  };

  async run(options: any) {
    // 'name' is mapped from args
    // 'loud' and 'count' are mapped from options
    const { name, loud, count } = options;

    let message = `Hello, ${name}`;
    if (loud) message = message.toUpperCase();

    for (let i = 0; i < count; i++) {
      this.info(message);
    }
  }
}
```

**Run it:**

```bash
npm run cli greet Adrian --loud --count 3
```

### 3. User Input & Prompts

`BaseCommand` provides built-in methods for interactivity.

```typescript
export default class InteractiveCommand extends BaseCommand {
  async run() {
    // Simple confirmation or input
    const name = await this.prompt('What is your name?');

    this.success(`Nice to meet you, ${name}`);
  }
}
```

### 4. Output Helpers

Use the built-in helper methods for consistent logging:

- `this.success(msg)`: Green checkmark (✔ Success)
- `this.error(msg)`: Red cross (✖ Error) - **Exits process**
- `this.warn(msg)`: Yellow warning (⚠ Warning)
- `this.info(msg)`: Standard log
- `this.notice(msg)`: Blue notice (📢 Note)
- `this.input(msg)`: Cyan input prompt (? Question)

## Subcommands

To create grouped commands (e.g., `user create`, `user list`), use directories.

1.  **Create Directory**: `src/commands/user/`
2.  **Add Commands**:
    - `src/commands/user/create.ts` -> `app user create`
    - `src/commands/user/list.ts` -> `app user list`

### Index Commands (Container Commands)

If you need the parent command `app user` to do something (or just provide a description for the group), create `src/commands/user/index.ts`.

```typescript
// src/commands/user/index.ts
import { BaseCommand } from '@nexical/cli-core';

export default class UserCommand extends BaseCommand {
  static description = 'Manage users';

  async run() {
    // This runs when user types 'app user' without a subcommand
    // Often used to show help
    this.cli.getRawCLI().outputHelp();
  }
}
```

## Internal API Reference

### `BaseCommand`

All commands inherit from `BaseCommand`.

**Properties:**

- `cli`: Access to the main `CLI` instance.
- `projectRoot`: Path to the project root (if detected).
- `config`: Loaded configuration from `{cliName}.yml`.
- `globalOptions`: Global flags passed to the CLI (e.g., `--debug`).

**Methods:**

- `init()`: Called before `run()`. Useful for setup.
- `run(options)`: Abstract method. Must be implemented.
- `prompt(message)`: Async, returns string.

**Static Properties:**

- `description`: String. Shown in help.
- `args`: Object. Defines arguments and options.
  - `args`: Array of `{ name, description, required, default }`.
  - `options`: Array of `{ name, description, default }`.
- `requiresProject`: Boolean. If true, command fails if not run inside a project with a config file.

## Best Practices

1.  **Type Safety**: While `options` is `any` in `run()`, validate inputs early.
2.  **Error Handling**: Use `this.error()` for fatal errors to ensure proper exit codes.
3.  **Clean Output**: Use the helper methods (`success`, `info`, etc.) instead of `console.log` for a consistent UI.
4.  **Async**: The `run` method is async. Always `await` asynchronous operations.

## Troubleshooting

- **Command not found**: Ensure the file exports a class leveraging `export default` and extends `BaseCommand`.
- **Changes not reflected**: If using `tsup`, ensure you are building or running in dev mode (`npm run dev`). For `npm run cli` using `ts-node` (via `cli.ts` or similar), changes should be instant.
