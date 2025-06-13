import type { MidiEvent } from "midi-file";
import type { ChannelsOptions, MidiObj, MiscOptions, VelocitiesOptions } from "./types.js";

//#region normalizeVelocities

/**
 * Normalizes the velocities of all noteOn events in the given MIDI data.  
 * 1. Extracts the normal range of velocities from each channel.
 * 2. Scales the velocities to fit within the range of `minVelocity` and `maxVelocity`, while not messing up the relative differences between velocities, also across channels.
 */
export function normalizeVelocities(midi: MidiObj, opts: VelocitiesOptions): MidiObj {
  const channelVelocities: Record<number, { min: number; max: number }> = {};

  // 1. extract normal range of velocities
  for(const track of midi.data.tracks) {
    for(const event of track) {
      if(event.type === "noteOn" && event.velocity > 0) {
        const channel = event.channel;
        if(!channelVelocities[channel])
          channelVelocities[channel] = { min: event.velocity, max: event.velocity };
        else {
          channelVelocities[channel].min = Math.min(channelVelocities[channel].min, event.velocity);
          channelVelocities[channel].max = Math.max(channelVelocities[channel].max, event.velocity);
        }
      }
    }
  }

  // 2. scale velocities - don't mess up relative differences between velocities, also across channels
  for (const track of midi.data.tracks) {
    for (const event of track) {
      if (event.type === "noteOn" && event.velocity > 0) {
        const channel = event.channel;
        const { min, max } = channelVelocities[channel];
        if (min === max) {
          // if all velocities in the channel are the same, set to median of the range
          event.velocity = Math.round((opts.min + opts.max) / 2);
        } else {
          // scale velocity to fit within new range
          event.velocity = Math.round(((event.velocity - min) / (max - min)) * (opts.max - opts.min) + opts.min);
        }
      }
    }
  }

  return midi;
}

/** Removes all noteOn events and their associated noteOff event with a velocity of 0 from the MIDI data. */
export function removeSilent(midi: MidiObj): MidiObj {
  for (const track of midi.data.tracks) {
    for (let i = track.length - 1; i >= 0; i--) {
      const event = track[i];
      if (event.type === "noteOn" && event.velocity === 0) {
        track.splice(i, 1);
        // find the next noteOff event for the same note and channel
        for (let j = i; j < track.length; j++) {
          const nextEvent = track[j];
          if (nextEvent.type === "noteOff" && nextEvent.noteNumber === event.noteNumber && nextEvent.channel === event.channel) {
            track.splice(j, 1);
            break;
          }
        }
      }
    }
  }
  return midi;
}

//#region normalizeChannels

/**
 * Normalizes the channels of the MIDI files according to the given options.  
 * The goal is to have a consistent set of channels associated to instruments, regardless of the original MIDI file input.
 */
export function normalizeChannels(midi: MidiObj, options: ChannelsOptions): MidiObj {
  for(const match of options.match) {
    midi.data.tracks.forEach((track, ti) => {
      if("patterns" in match) {
        if(match.patterns.some(pattern =>
          (midi.instrumentNames[ti] && new RegExp(pattern, match.patternFlags ?? "i").test(midi.instrumentNames[ti])) ||
          (midi.trackNames[ti] && new RegExp(pattern, match.patternFlags ?? "i").test(midi.trackNames[ti]))
        )) {
          track.forEach(event => {
            if("channel" in event)
              event.channel = match.channel;
          });
        }
      }
      else if("includes" in match) {
        if(match.includes.some(include =>
          (midi.instrumentNames[ti] && midi.instrumentNames[ti].includes(include)) ||
          (midi.trackNames[ti] && midi.trackNames[ti].includes(include))
        )) {
          track.forEach(event => {
            if("channel" in event)
              event.channel = match.channel;
          });
        }
      }
    });
  }
  return midi;
}

//#region addBuffers

/** Adds buffers to the beginning or end of the shortest or longest track of the MIDI file, if specified in the options. */
export function addBuffers(midi: MidiObj, opts: MiscOptions): MidiObj {
  const tpb = midi.data.header.ticksPerBeat ?? 480;

  // increment all event times by opts.startBuffer (seconds)
  if(opts.startBuffer) {
    const startBufferTicks = Math.round(opts.startBuffer * tpb);
    for(const track of midi.data.tracks)
      for(const event of track)
        event.deltaTime += startBufferTicks;
  }

  // add a ghost note at the end of the track containing the event with the latest time, if opts.endBuffer is specified
  if(opts.endBuffer) {
    const endBufferTicks = Math.round(opts.endBuffer * tpb);
    const longestTrack = midi.data.tracks.reduce((longest, current) => (
      current.length > longest.length ? current : longest
    ), midi.data.tracks[0]);
    const lastEvent = longestTrack[longestTrack.length - 1];

    const channel = longestTrack.some(event => "channel" in event) ? longestTrack.find(event => "channel" in event)?.channel ?? 1 : 1;

    if(lastEvent) {
      const notes = [
        {
          type: "noteOn",
          noteNumber: 60,
          velocity: 0,
          deltaTime: lastEvent.deltaTime + endBufferTicks,
          channel,
        },
        {
          type: "noteOff",
          noteNumber: 60,
          velocity: 0,
          deltaTime: lastEvent.deltaTime + endBufferTicks + 1,
          channel,
        }
      ] satisfies MidiEvent[];

      // shift notes in at the end of the longestTrack, after the last note events
      const lastNoteIndex = longestTrack.findLastIndex(event => event.type === "noteOn" || event.type === "noteOff");
      if(lastNoteIndex !== -1)
        longestTrack.splice(lastNoteIndex + 1, 0, ...notes);
    }
  }
  return midi;
}
