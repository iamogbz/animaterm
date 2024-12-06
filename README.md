# Animaterm

📟 Automatically create terminal animations from script

## Usage

Install from the github repo

```sh
npm i -g 'github:iamogbz/animaterm'
```

Run the `animaterm` bin with cli options

```sh
animaterm script.json output.svg
```

![demo](./docs/usage.svg)

> This demo animation was created using only `animaterm`

### Script

Samples available in the [end-to-end scripts](./e2e/).

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

> TODO: add instructions on overriding the default config

## Inspirations

- <https://github.com/faressoft/terminalizer>
- <https://github.com/asciinema/asciinema>
