# Animaterm

## Usage

![demo](./docs/usage.gif)

### Script

Samples available in the [scripts folder](./scripts/).

This is a `JSON` file with the following structure:

```ts
Step[]
```

That is a `JSON` array at the root where each `Step` is defined by the following interface:

```ts
interface Step {
  action: "clear" | "copy" | "enter" | "paste" | "type" | "waitForOutput";
  payload:
    | string
    | { startLine: number; endLine: number; startPos: number; endPos: number };
  timeoutMs: number;
}
```

#### Descriptions

##### clear

Flush terminal output

##### copy

Copy from start line and position to end line and position as defined in `payload`

##### enter

Return and run commands typed in previous steps

##### paste

Paste last copied text

> NOTE: does not paste from system clipboard

##### type

Simulate user typing characters from text in `payload`

##### waitForOutput

Wait for data in `payload` to be displayed in the terminal

### Config

TODO: add instructions on overriding the default config

## Inspirations

- <https://github.com/faressoft/terminalizer>
- <https://github.com/asciinema/asciinema>
