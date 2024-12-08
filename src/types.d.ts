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
    renderer: "gif" | "svg" | "terminalizer";
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
  copy: {
    payload: {
      startLine: number;
      endLine: number;
      startPos: number;
      endPos: number;
    };
  };
  clear: {};
  enter: {};
  /** Pastes from internal clipboard not system */
  paste: {};
  type: {
    /** the text to type */
    payload: string;
  };
  waitForOutput: {
    /** the text to wait for */
    payload: string;
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
