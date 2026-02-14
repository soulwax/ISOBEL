// Type declaration for ffmpeggy (package exports don't expose types for ESM resolution)
declare module 'ffmpeggy' {
  export interface FFmpeggyOptions {
    cwd?: string;
    input?: string | NodeJS.ReadableStream;
    output?: string | NodeJS.WritableStream;
    pipe?: boolean;
    globalOptions?: string[];
    inputOptions?: string[];
    outputOptions?: string[];
    overwriteExisting?: boolean;
    hideBanner?: boolean;
    autorun?: boolean;
  }

  export class FFmpeggy {
    constructor(opts?: FFmpeggyOptions);
    run(): Promise<unknown>;
    stop(signal?: number): Promise<void>;
    toStream(): NodeJS.ReadableStream;
    on(event: 'error', listener: (error: Error) => void): this;
    on(event: 'start', listener: (args: readonly string[]) => void): this;
  }
}
