---
name: commander-skilld
description: 'ALWAYS use when writing code importing "commander". Consult for debugging, best practices, or modifying commander, commander.js.'
metadata:
  version: 15.0.0
  generated_by: Anthropic · Haiku 4.5
  generated_at: 2026-06-30
---

# tj/commander.js `commander@15.0.0`

**Tags:** 2_x: 2.20.3, latest: 15.0.0, next: 15.0.0-0

**References:** [package.json](./.skilld/pkg/package.json) • [Docs](./.skilld/docs/_INDEX.md) • [Issues](./.skilld/issues/_INDEX.md) • [Releases](./.skilld/releases/_INDEX.md)

## Search

Use `skilld search "query" -p commander` instead of grepping `.skilld/` directories. Run `skilld search --guide -p commander` for full syntax, filters, and operators.

<!-- skilld:api-changes -->

## Commander API Changes

This section documents version-specific API changes in commander, focusing on breaking changes, newly introduced APIs, and deprecated functionality that LLMs trained on older data will get wrong.

## API Changes

### BREAKING: ESM-only module system

Commander 15 migrated entirely from CommonJS to ESM. This is a silent breakage if you're using CommonJS and haven't configured your tooling to handle ESM imports. Node.js supports importing ESM from CommonJS natively, but your testing framework, bundler, or other tooling may not yet support this setup.

You can continue using Commander 14 until your environment catches up. Commander 14 receives security updates until May 2027 [source](./.skilld/releases/v15.0.0.md:L9-L12).

[source](./.skilld/releases/v15.0.0.md:L25)

### BREAKING: Node.js v22.12.0 or higher required in v15

Commander 15 requires Node.js v22.12.0 or higher (up from v20 in v14). This is necessary to support the `require(esm)` feature used by the ESM-only build [source](./.skilld/releases/v15.0.0.md:L26).

### BREAKING: Lone `--no-*` option default value behaviour

v15 changed how the `--no-*` negated option sets default values. Previously, defining both positive and negative variants of an option (regardless of order) would automatically set the default to `true`. Now only a lone `--no-*` option (without a positive variant) sets the default to `true` [source](./.skilld/releases/v15.0.0.md:L20).

Old code that relied on implicit default-setting when defining both `--flag` and `--no-flag` will silently change behaviour — the default will no longer be auto-set to `true`.

### BREAKING: Removed `commander/esm.mjs` export

The explicit ESM entry point `commander/esm.mjs` has been removed. Import directly from `commander` instead [source](./.skilld/releases/v15.0.0.md:L31).

```js
// OLD (no longer works)
import { Command } from "commander/esm.mjs";

// NEW (use this)
import { Command } from "commander";
```

### NEW: `.helpGroup()`, `.optionsGroup()`, and `.commandsGroup()` for grouping

v14 introduced support for grouping options and commands in the help output. Use `.helpGroup()` on individual `Option` and `Command` objects, or chain `.optionsGroup()` and `.commandsGroup()` to set the group for following options/commands [source](./.skilld/releases/v14.0.0.md:L11-L13).

```ts
const option = new Option("--flag", "description");
option.helpGroup("Advanced Options");
program.addOption(option);

// or chain style:
program
  .optionsGroup("Common Options")
  .option("--port <number>", "port")
  .option("--host <string>", "host")
  .optionsGroup("Advanced")
  .option("--debug", "debug mode");
```

### NEW: Support for unescaped negative numbers

v14 added support for negative numbers as option and command arguments without requiring escapes like `--` [source](./.skilld/releases/v14.0.0.md:L14).

```js
// This now works directly in v14+
program.option("--count <number>");
program.parse(["-5", "--count", "-10"]);
```

### NEW: `Argument.parseArg` TypeScript property

TypeScript now properly reflects the `parseArg` property on the `Argument` class. This property was available at runtime but not in type definitions prior to v14 [source](./.skilld/releases/v14.0.0.md:L15).

```ts
// Type-safe in v14+
const arg = new Argument("<value>");
arg.parseArg = (value: string, previous: any) => parseInt(value, 10);
```

### BREAKING: `allowExcessArguments` defaults to false in v13

v13 changed the default behaviour so excess command-arguments now cause an error by default. Previously, excess arguments were silently allowed and accessible via `program.args` [source](./.skilld/releases/v13.0.0.md:L20).

Old code that relied on catching excess arguments will break:

```js
// v12 and earlier: excess args silently allowed
program.option("-p, --port <number>");
program.action((options) => {
  console.log(program.args); // ['a', 'b', 'c'] when called with "a b c"
});

// v13+: throws "error: too many arguments. Expected 0 arguments but got 3"
// Fix: declare the expected arguments
program.argument("[args...]", "variadic arguments");
program.action((args, options) => {
  console.log(args); // ['a', 'b', 'c']
});

// Or allow excess arguments explicitly
program.allowExcessArguments();
```

### NEW: Help formatting methods in v13

v13 added new public methods to the `Help` class for styling and layout:

- `.displayWidth()` — display width of string, ignoring ANSI escapes
- `.styleTitle()`, `.styleUsage()`, `.styleCommandText()` and related style methods
- `.boxWrap()` — wrap text at whitespace
- `.preformatted()` — detect manually wrapped strings
- `.formatItem()` — format a term and description pair
- `.formatItemList()` — format a list of items with heading
- `.groupItems()` — group items by help group heading

These methods enable custom Help subclasses [source](./.skilld/releases/v13.0.0.md:L13-L16).

### NEW: Parse state management in v13

v13 introduced `.saveStateBeforeParse()` and `.restoreStateBeforeParse()` methods to allow subclasses to call `.parse()` multiple times with proper state handling [source](./.skilld/releases/v13.0.0.md:L11-L12).

### NEW: Color support in `.configureOutput()`

v13 added colour-related helpers to `.configureOutput()`:

- `getOutHasColors()` — whether output stream supports colours
- `getErrHasColors()` — whether error stream supports colours
- `stripColor()` — remove ANSI colour codes from string

These are useful for custom Help subclasses [source](./.skilld/releases/v13.0.0.md:L14).

### BREAKING: Option construction throws for unsupported flags in v13

v13 changed to throw during Option construction if option flags are unsupported, such as multiple characters after a single `-` [source](./.skilld/releases/v13.0.0.md:L21).

```js
// v12 and earlier: silently ignored or processed
new Option("-ws"); // previously accepted

// v13+: throws immediately
// Error: options with short flags must be a single character
```

### BREAKING: `.storeOptionsAsProperties()` throws on multiple parse calls in v13

Calling `.parse()` multiple times with `storeOptionsAsProperties: true` now throws an error [source](./.skilld/releases/v13.0.0.md:L22).

### BREAKING: Removed `Help.wrap()` method in v13

The `Help.wrap()` method was refactored into public methods `.formatItem()` and `.boxWrap()`. Custom Help subclasses using `.wrap()` must migrate to the new methods [source](./.skilld/releases/v13.0.0.md:L27).

### BREAKING: Node.js v20 required in v14, v18 in v12

- v14 requires Node.js v20 or higher [source](./.skilld/releases/v14.0.0.md:L24)
- v12 requires Node.js v18 or higher [source](./.skilld/releases/v12.0.0.md:L21)

### BREAKING: `.configureOutput()` now copies settings in v14

`.configureOutput()` now makes a copy of settings instead of modifying them in-place, fixing side-effects when reusing configuration objects [source](./.skilld/releases/v14.0.0.md:L20).

```js
const config = { writeOut: customOut };
program.configureOutput(config);
// v13 and earlier: modifying `config` would affect the program
// v14+: `config` is not mutated, safe to reuse
```

### NEW: `.helpCommand()` and `.addHelpOption()` in v12

v12 introduced two new configuration methods:

- `.helpCommand()` — configure the built-in help command (replaces deprecated `.addHelpCommand(string|boolean)`)
- `.addHelpOption()` — alternative way to configure the built-in help option [source](./.skilld/releases/v12.0.0.md:L11-L12).

```ts
program.helpCommand("assist [command]");
program.helpCommand(false); // disable help command
program.addHelpOption(); // enable/configure help option
```

### BREAKING: Duplicate option flags throw in v12

v12 throws an error if you attempt to add an option with a flag that is already in use. Previously this was silently allowed [source](./.skilld/releases/v12.0.0.md:L22).

```js
program.option("--port <number>");
program.option("--port <string>"); // v12+: throws error
```

### BREAKING: Duplicate command names throw in v12

v12 throws an error if you attempt to add a command with a name or alias that is already in use [source](./.skilld/releases/v12.0.0.md:L23).

### BREAKING: Executable subcommand exit codes in v12

v12 changed to use a non-zero exit code when a spawned executable subcommand terminates due to a signal (previously this wasn't handled consistently) [source](./.skilld/releases/v12.0.0.md:L16).

### BREAKING: `.storeOptionsAsProperties()` validation in v12

Calling `.storeOptionsAsProperties()` after setting an option value now throws an error [source](./.skilld/releases/v12.0.0.md:L24).

### BREAKING: CommonJS global export removed in v12

The default CommonJS export of a global Command instance was removed. Use the named export `program` or create a new `Command` instance [source](./.skilld/releases/v12.0.0.md:L36).

```js
// v11 and earlier (no longer works)
const program = require("commander");

// v12+ (use this)
const { program } = require("commander");
// or
const { Command } = require("commander");
const program = new Command();
```

### DEPRECATED: `.addHelpCommand()` with string or boolean in v12

Passing a string or boolean to `.addHelpCommand()` is deprecated as of v12. Use `.helpCommand()` instead, or pass a `Command` object to `.addHelpCommand()` [source](./.skilld/releases/v12.0.0.md:L32).

### DEPRECATED: `InvalidOptionArgumentError` (replaced by `InvalidArgumentError`)

`InvalidOptionArgumentError` was deprecated in v8 and replaced by `InvalidArgumentError`, which can be used for both option and command-argument parsing [source](./.skilld/docs/deprecated.md:L141-L169).

## Deprecated but Still Available

- `cmd._args` — use `.registeredArguments` instead (deprecated from v11) [source](./.skilld/docs/deprecated.md:L171-L183)
- `.on('--help')` — use `.addHelpText()` instead (deprecated from v7)
- `.on('command:*')` — use `.showSuggestionAfterError()` or catch `unknownCommand` error (deprecated from v8.3)
- `.command('*')` — use `isDefault: true` option when adding a command (deprecated from v8.3)
- `cmd.description(cmdDescription, argDescriptions)` — use `.argument()` method instead (deprecated from v8)
- RegExp `.option()` parameter — use `.choices()` or custom parser instead (deprecated from v7)
- `noHelp` — renamed to `hidden` in v5.1 (deprecated from v7)

**Also changed:** Node.js v18 baseline (v12) · Node.js v20 baseline (v14) · Node.js v22.12.0 baseline (v15) · Leading/trailing spaces ignored by `.arguments()` (v11) · `.passThroughOptions` constraints in `.addCommand()` (v12) · Help class refactoring (v13)

<!-- /skilld:api-changes -->

<!-- skilld:best-practices -->

## Best Practices

- Declare command arguments explicitly with `.argument()` for clarity — avoid relying on implicit command-arguments captured by `program.args`, which provides less help text control and makes the API contract unclear [source](./.skilld/docs/deprecated.md#cmddescriptioncmddescription-argdescriptions)

- Use `.choices()` for option and argument validation instead of the deprecated RegExp parameter — provides consistent error messages and validation across the codebase [source](./.skilld/docs/deprecated.md#regexp-option-parameter)

- Use `.helpCommand()` to configure the help command instead of `.addHelpCommand()` with string/boolean parameters — unified API for both configuration and programmatic addition [source](./.skilld/docs/deprecated.md#addhelpcommandstringbooleanundefined)

- Resolve parsing ambiguity with optional option-arguments by putting options last in your usage syntax — prevents users from needing to learn when to use `--` as a workaround [source](./.skilld/docs/options-in-depth.md:L104:124)

- Use `.implies()` on options to declaratively express when one option should automatically set others — cleaner than manual validation in the action handler [source](./.skilld/pkg/typings/index.d.ts:L151:156)

- Use `.conflicts()` on mutually exclusive options instead of manual validation in action handlers — centralises conflict detection and provides automatic error messages [source](./.skilld/pkg/typings/index.d.ts:L141:144)

- Use `.helpGroup()` (v14+) or `.optionsGroup()/. commandsGroup()` to organize related options and commands in help — improves navigation and discoverability for complex CLIs [source](./.skilld/releases/v14.0.0.md:L11:13)

- Use `.showSuggestionAfterError()` for built-in suggestions on unknown commands or options instead of the deprecated `.on('command:*')` event — automatic and user-friendly error recovery [source](./.skilld/docs/deprecated.md#oncommand)

- Use `.preset()` on options with optional arguments to specify the value when the option is used without an argument — cleaner than checking if value is `true` in the action handler [source](./.skilld/pkg/typings/index.d.ts:L124:131)

- Use `.env()` on options to support loading values from environment variables alongside CLI flags — follows twelve-factor principles for flexible configuration [source](./.skilld/pkg/typings/index.d.ts:L159:164)

- Use `.configureHelp()` with style routines like `styleTitle()` to add ANSI colors to help output — respects `NO_COLOR` / `FORCE_COLOR` environment variables automatically (v13+) [source](./.skilld/releases/v13.0.0.md:L13:16)

- Use `.hook()` for lifecycle events (`preSubcommand`, `preAction`, `postAction`) instead of event emitters like `.on('--help')` — composable and supports async handlers [source](./.skilld/docs/parsing-and-hooks.md:L1:24)

- Define options with dual long flags like `--ws, --workspace` to allow memorable abbreviated aliases — more ergonomic than single-character short flags for frequently-used options (v13.1+) [source](./.skilld/releases/v13.1.0.md:L10)

<!-- /skilld:best-practices -->
