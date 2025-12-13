# Nexical CLI

The **Nexical CLI** is the official command-line interface for the Nexical Orchestrator. It allows developers, platform engineers, and administrators to interact with the Nexical API directly from their terminal.

Whether you are managing teams, configuring projects, triggering jobs, or handling authentication tokens, the CLI provides a robust and scriptable interface for all your orchestration needs.

---

## 🚀 Getting Started

### Prerequisites

- **Node.js**: v22 or higher
- **NPM**: v10 or higher

### Installation

Install the package from NPM package repository:

```bash
npm install -g @nexical/cli
```

### Local Development

To run the CLI locally during development, you can use `npm start`. To pass arguments to the CLI, use the `--` separator:

```bash
# Example: Running the 'whoami' command
npm start -- whoami

# Example: Logging in
npm start -- login
```

Alternatively, you can link the binary globally to use the `nexical` command directly:

```bash
npm link
nexical --help
```

---

## 🔑 Authentication

The CLI supports a secure **Device Flow** for authentication, making it easy to log in from your terminal without handling sensitive passwords directly.

### 1. Log In
Start the authentication process. This will provide a verification URL and a code.

```bash
nexical login
```
*Follow the on-screen instructions to authorize the device via your browser.*

### 2. Verify Session
Check your current logged-in status and user details.

```bash
nexical whoami
```

---

## 🛠️ Usage & Commands

The CLI is structured into resource-based commands. You can always run `nexical <command> --help` to see available subcommands and options.

### 👥 Teams (`team`)

Manage user teams and memberships.

| Command | Usage | Description |
| :--- | :--- | :--- |
| `list` | `nexical team list` | List all teams you belong to or own. |
| `create` | `nexical team create <name> [--slug <slug>]` | Create a new team. |
| `get` | `nexical team get <teamId>` | View details of a specific team. |
| `update` | `nexical team update <teamId> [--name <n>] [--slug <s>]` | Update team settings. |
| `invite` | `nexical team invite <teamId> <email> [--role <role>]` | Invite a user to a team. |
| `delete` | `nexical team delete <teamId> [--confirm]` | Delete a team permanently. |

### 📂 Projects (`project`)

Manage projects within your teams.

| Command | Usage | Description |
| :--- | :--- | :--- |
| `list` | `nexical project list <teamId>` | List all projects in a team. |
| `create` | `nexical project create <teamId> <name> [--repo <url>]` | Create a new project. |
| `get` | `nexical project get <teamId> <projectId>` | Get project details. |
| `update` | `nexical project update <teamId> <projectId> ...` | Update project configuration. |
| `delete` | `nexical project delete <teamId> <projectId>` | Delete a project. |

### 🌿 Branches (`branch`)

Manage development branches for your projects.

| Command | Usage | Description |
| :--- | :--- | :--- |
| `list` | `nexical branch list <teamId> <projectId>` | List branches. |
| `create` | `nexical branch create <teamId> <projectId> <name>` | Create a branch. |
| `get` | `nexical branch get <teamId> <projectId> <branchId>` | Get branch details. |
| `delete` | `nexical branch delete ...` | Delete a branch. |

### ⚙️ Jobs (`job`)

Trigger and monitor orchestration jobs.

| Command | Usage | Description |
| :--- | :--- | :--- |
| `list` | `nexical job list <teamId> <projectId> <branchId>` | List recent jobs. |
| `trigger`| `nexical job trigger ... <type> [--input <json>]` | Trigger a new job (e.g., deploy). |
| `get` | `nexical job get ... <jobId>` | Get job details. |
| `logs` | `nexical job logs ... <jobId>` | Stream or view logs for a job. |

### 🎟️ API Tokens (`token`)

Manage personal access tokens for scripting and CI/CD.

| Command | Usage | Description |
| :--- | :--- | :--- |
| `list` | `nexical token list` | List your active tokens. |
| `create` | `nexical token create <name> [--scopes <list>]` | Generate a new API token. |
| `revoke` | `nexical token revoke <id>` | Revoke a token. |

### 🛡️ Admin (`admin`)

System administration commands (requires elevated permissions).

| Command | Usage | Description |
| :--- | :--- | :--- |
| `create-user` | `nexical admin create-user <name> <email> <password>` | Create a system user. |

---

## 🏗️ Project Structure

The codebase is organized to be modular and extensible:

```
src/
├── commands/           # Command implementations
│   ├── team/           # Team-related commands
│   ├── project/        # Project-related commands
│   └── ...
├── utils/              # Shared utilities (API client, config)
└── index.ts            # CLI entry point
```

Each command is a class extending `BaseCommand` from `@nexical/cli-core`, enforcing a consistent structure for arguments, help text, and error handling.

---

## 🧪 Testing

We use **Vitest** for testing.

```bash
# Run unit tests
npm run test:unit
```

---

## 🤝 Contributing

1.  **Fork** the repository.
2.  **Clone** your fork.
3.  **Install** dependencies (`npm install`).
4.  **Creating a Command**:
    - Add a new file in `src/commands/<topic>/<verb>.ts`.
    - Extend `BaseCommand`.
    - Define `static description` and `static args`.
    - Implement `run()`.
5.  **Test** your changes.
6.  **Submit** a Pull Request.

---

## License

Apache-2.0
