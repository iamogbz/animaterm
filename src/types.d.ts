interface Config {
  title: string;
  lineCount: number;
  dimensionsPx: {
    gap: number;
    padding: {
      x: number;
      y: number;
    };
    text: number;
    width: number;
    height: number;
    lineHeight: number;
  };
  animation: {
    css: React.CSSProperties;
    cursor: {
      /** Set to 0 to disable blinking */
      blinkMs: number;
      /** Set to empty string "" to disable cursor e.g "█" */
      token: string;
    };
    fps: number;
    lineNumber: boolean;
    quality: number;
    /** Terminalizer (tlz) renders a GIF as well */
    renderer: "gif" | "svg" | "tlz";
    /** 0 means repeat forever */
    repeat: number;
    typing: {
      speedMs: number;
    };
    msPerFrame: number;
  };
}

/** Returns the file path the render was saved at */
type Renderer = (state: State, config: Config) => string;

interface State {
  clipboard: string;
  env: NodeJS.ProcessEnv;
  frames: string[][];
  outputPath: string;
  pendingExecution: string;
  terminalContent: string;
}

interface StepArgs {
  /** Copy from start line and column position to end line and position */
  copy: {
    payload: {
      startLine: number;
      startPos: number;
      endLine: number;
      endPos: number;
    };
  };
  /** Flush terminal output */
  clear: {};
  /** Deletes only from the lastest entry */
  delete: {
    payload: number;
  };
  /** Return and run commands typed in previous steps */
  enter: {};
  /** Pastes from internal clipboard not system */
  paste: {};
  /** Simulate user typing characters from text in payload */
  type: {
    /** the text to type */
    payload: string;
  };
  /** Wait for data in payload to be displayed in the terminal */
  waitForOutput: {
    /** the text to wait for */
    payload: string;
    /** How long to wait before terminating run */
    timeoutMs: number;
  };
}

type Action = keyof StepArgs;

type Steps = {
  [k in Action]: { action: k } & StepArgs[k];
};

type Step = Steps[Action];

type ActionHandlers = {
  [k in Action]: (step: Steps[k], state: State) => Promise<void>;
};
