# @app/cli

The core framework for building powerful, extensible Command Line Interfaces (CLIs) within the Nexical ecosystem.

This package provides the foundational architecture for specialized CLI toolsets, including command discovery, execution orchestration, and a class-based command pattern. It is designed to be **agnostic**, allowing it to be used as the backbone for other CLI tools that need a similar structure and extensibility.

## Table of Contents

- [Features](#features)
- [Installation](#installation)
- [Usage](#usage)
  - [Configuration](#configuration)
  - [Directory Structure](#directory-structure)
- [Creating Commands](#creating-commands)
  - [The BaseCommand](#the-basecommand)
  - [Defining Arguments & Options](#defining-arguments--options)
  - [Command Discovery Rules](#command-discovery-rules)
- [Architecture](#architecture)
- [License](#license)

---

## Features

- **Class-Based Architecture**: Build commands as TypeScript classes with inheritance and lifecycle methods.
- **Dynamic Discovery**: Automatically recursively finds and registers commands from specified directories.
- **Type-Safe Definitions**: Declarative definition of arguments and options.
- **Built-in Help**: Automatic generation of help text for commands and subcommands.
- **Configuration Support**: Aware of project-level configuration (e.g., `{command_name}.yml`).
- **Robust Error Handling**: Standardized error reporting and debug modes.

---

## Installation

This package is typically used as a dependency within a specific CLI implementation (like `@app/cli`).

```bash
npm install @nexical/cli-core
```

---

## Usage

To use the core framework, you need to instantiate the `CLI` class and start it. This is typically done in your CLI's entry point (e.g., `index.ts`).

### Configuration

The `CLI` class accepts a `CLIConfig` object to customize behavior:

```typescript
import { CLI } from "@nexical/cli-core";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app = new CLI({
  // 1. The name of your binary/command (displayed in help)
  commandName: "my-cli",

  // 2. Directories to recursively search for command files
  searchDirectories: [
    path.resolve(__dirname, "commands"),
    // You can add multiple directories, e.g., for plugins
    path.resolve(process.cwd(), "plugins/commands"),
  ],
});

app.start();
```

### Directory Structure

A typical project using `@nexical/cli-core` looks like this:

```
my-cli/
├── package.json
├── src/
│   ├── index.ts        <-- Entry point (initializes CLI)
│   └── commands/       <-- Command files
│       ├── init.ts
│       ├── build.ts
│       └── module/     <-- Subcommands
│           ├── add.ts
│           └── list.ts
```

---

## Creating Commands

The core framework itself only includes a **Help** command. All functional commands must be implemented by consuming libraries.

### The BaseCommand

All commands must extend the `BaseCommand` abstract class exported by the core.

```typescript
// src/commands/greet.ts
import { BaseCommand } from "@nexical/cli-core";

export default class GreetCommand extends BaseCommand {
  // Description shown in help
  static description = "Greets the user";

  // Implement the run method
  async run(options: any) {
    this.info("Hello from my-cli!");
  }
}
```

### Defining Arguments & Options

You can define arguments and options using the static `args` property.

```typescript
export default class GreetCommand extends BaseCommand {
  static description = "Greets the user with a custom message";

  static args = {
    // Positional arguments
    args: [
      {
        name: "name",
        required: false,
        description: "Name to greet",
        default: "World",
      },
    ],
    // Flags/Options
    options: [
      {
        name: "--shout",
        description: "Print in uppercase",
        default: false,
      },
      {
        name: "--count <n>",
        description: "Number of times to greet",
        default: 1,
      },
    ],
  };

  async run(options: any) {
    // 'name' comes from args (mapped to options by name)
    // 'shout' and 'count' come from options
    const { name, shout, count } = options;

    const message = `Hello, ${name}!`;
    const finalMessage = shout ? message.toUpperCase() : message;

    for (let i = 0; i < count; i++) {
      this.info(finalMessage);
    }
  }
}
```

### Command Discovery Rules

The `CommandLoader` uses the file structure to determine command names:

- **File Name = Command Name**:
  - `commands/build.ts` -> `my-cli build`
- **Nested Directories = Subcommands**:
  - `commands/user/create.ts` -> `my-cli user create`
- **Index Files = Parent Command**:
  - `commands/user/index.ts` -> `my-cli user` (The handler for the root `user` command)

> **Note**: A file must default export a class extending `BaseCommand` to be registered.

---

## Architecture

The core is built around three main components:

1.  **`CLI`**: The main entry point. It wraps [CAC](https://github.com/cacjs/cac) to handle argument parsing and acts as the dependency injection container for commands.
2.  **`CommandLoader`**: Scans the filesystem for command files. It handles importing typescript files and validating that they export a valid command class.
3.  **`BaseCommand`**: Provides the interface for commands, including:
    - `init()`: Async initialization hook (pre-run).
    - `run()`: The main execution logic.
    - `this.projectRoot`: Automatically resolved path to the project root (if running in a project context).
    - Output helpers:
      - `this.success(msg)`: Logs success message (✔) in green.
      - `this.warn(msg)`: Logs warning message (⚠) in yellow.
      - `this.error(msg, code?)`: Logs error (✖) in red and exits.
      - `this.notice(msg)`: Logs a notice (📢) in blue.
      - `this.input(msg)`: Logs an input prompt display (?) in cyan.
      - `this.info(msg)`: Standard informational message.
    - Input helpers:
      - `this.prompt(msg)`: Prompts the user for input and returns the result.

---

## License

Apache-2.0
