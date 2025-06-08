export type NrmConfig = {
  /** Options for input MIDI files */
  input: InputOptions;
  /** Options for output MIDI files */
  output: OutputOptions;
  /** Options for normalizing velocities */
  velocities: VelocitiesOptions;
  /** Options for normalizing channels */
  channels: ChannelsOptions;
}

export type InputOptions = {
  /** Path to the directory containing all MIDI files */
  directory: string;
  /** Pattern to match MIDI files - defaults to `.*\\.midi?$` */
  filePattern?: string;
  /** Which flags to use for the file pattern RegExp - defaults to none */
  patternFlags?: string;
};

export type OutputOptions = {
  /** Path to the directory where normalized MIDI files will be saved */
  directory: string;
  /** Whether to clear the output directory before writing new files - defaults to true */
  clearDirectory?: boolean;
  /** Name pattern for each normalized MIDI file */
  fileName: string;
};

export type VelocitiesOptions = {
  /** Minimum allowed velocity */
  min: number;
  /** Maximum allowed velocity */
  max: number;
  /** Whether to remove silent notes (velocity <= 0.x) */
  removeSilent?: boolean;
};

export type ChannelsOptions = {
  match: Array<
    & {
      /** The normalized MIDI channel to assign to the instrument */
      channel: number;
    }
    & (
      | {
        /** RegExps to use to match the instrument name */
        patterns: string[];
        /** Flags to use for the RegExp patterns - defaults to "i" */
        patternFlags?: string;
      }
      | {
        /** Strings to use to match the instrument name via .includes() */
        includes: string[];
      }
    )
  >;
};
