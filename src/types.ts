export type NrmConfig = {
  /** Options for normalizing velocities */
  velocities: NrmVelocitiesOptions;
  /** Options for normalizing channels */
  channels: NrmChannelsOptions;
}

export type NrmVelocitiesOptions = {
  /** Minimum allowed velocity */
  min: number;
  /** Maximum allowed velocity */
  max: number;
  /** Whether to apply a logarithmic scale to the velocities */
  scaleFactor?: number;
};

export type NrmChannelsOptions = {
  match: Array<
    & {
      /** The normalized MIDI channels to assign to the instrument */
      channels: number[];
    }
    & (
      | {
        /** RegExps to use to match the instrument name */
        patterns: RegExp[];
      }
      | {
        /** Strings to use to match the instrument name via .includes() */
        includes: string[];
      }
    )
  >;
};
