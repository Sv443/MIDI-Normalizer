import { writeFile, readFile, stat, mkdir, readdir, unlink } from "node:fs/promises";
import { resolve, basename } from "node:path";
import { styleText } from "node:util";
import { parseMidi, writeMidi } from "midi-file";
import { mapRange, scheduleExit } from "@sv443-network/coreutils";
import { addBuffers, normalizeChannels, normalizeVelocities, removeSilent } from "./normalize.js";
import { findInstrumentAndTrackNames, getOutFileName, getPathRelativeToCaller } from "./utils.js";
import { loadConfig } from "./config.js";
import type { MidiObj } from "./types.js";

//#region run

async function run() {
  const config = await loadConfig();

  console.log("Loaded configuration.");

  const inputDir = config.input.directory;
  const filePattern = new RegExp(config.input.filePattern ?? ".*\\.midi?$", config.input.patternFlags);

  const midiFilePaths = (await readdir(getPathRelativeToCaller(inputDir)))
    .filter(path => filePattern.test(basename(path)))
    .map(file => resolve(inputDir, file));

  if(midiFilePaths.length === 0) {
    console.error(styleText("red", "No MIDI files found in the specified directory."));
    return scheduleExit(1);
  }

  const midisRaw: (MidiObj | null)[] = (await Promise.all(
    midiFilePaths.map(async (file) => {
      try {
        const data = parseMidi(await readFile(file));
        const [instrumentNames, trackNames] = findInstrumentAndTrackNames(data);
        return {
          path: file,
          data,
          instrumentNames,
          trackNames,
        };
      }
      catch(e) {
        console.error(styleText("red", `Error reading MIDI file ${file}:`), e);
        return null;
      }
    })
  ));

  const midis = midisRaw.filter((midi): midi is MidiObj => midi !== null);

  if(midis.length === 0) {
    console.error(styleText("red", "No valid MIDI files found."));
    return scheduleExit(1);
  }

  const noSilent = midis.map(removeSilent);

  console.log("Removed silent notes.");

  const velNormalized = noSilent.map(midi => normalizeVelocities(midi, config.velocities));

  console.log("Normalized velocities.");

  const chNormalized = velNormalized.map(midi => normalizeChannels(midi, config.channels));

  console.log("Normalized channels.");

  const buffersAdded = chNormalized.map(midi => addBuffers(midi, config.misc));

  console.log("Added buffers, if specified.");

  const finalMidis = buffersAdded;

  console.log("Finalizing...");

  const outDir = getPathRelativeToCaller(config.output.directory);

  try {
    const outDirStat = await stat(outDir);
    if(!outDirStat.isDirectory())
      throw new Error(`Output directory ${outDir} is not a directory.`);
  }
  catch {
    await mkdir(outDir, { recursive: true });
    console.log("Created output directory:", outDir);
  }

  if(config.output.clearDirectory !== false) {
    const outFiles = (await readdir(outDir)).filter(file => filePattern.test(file));
    if(outFiles.length > 0) {
      await Promise.all(outFiles.map(file => unlink(resolve(outDir, file))));
      console.log("Cleared output directory:", outDir);
    }
  }

  console.log("Writing files...\n");

  const concurrencyLimit = 10;
  const promises: Promise<void>[] = [];
  for(let i = 0; i < finalMidis.length; i++) {
    const midi = finalMidis[i];
    const outFile = resolve(`${outDir}/${getOutFileName(midi, config.output)}`);
    
    const writePromise = (async () => {
      try {
        await writeFile(outFile, Buffer.from(writeMidi(midi.data, { running: true, useByte9ForNoteOff: true })));
        console.log(`- Finished processing: ${outFile}`);
      }
      catch(e) {
        console.error(styleText("red", `Error saving MIDI file ${outFile}:`), e);
      }
    })();

    promises.push(writePromise);

    if(promises.length >= concurrencyLimit) {
      await Promise.all(promises);
      promises.length = 0;
      const perc = mapRange(i + 1, finalMidis.length, 100);
      console.log(`  ${styleText("green", `${perc.toFixed(0)}%`)} (${i + 1}/${finalMidis.length})`);
    }
  }

  if(promises.length > 0)
    await Promise.all(promises);

  console.log(styleText("greenBright", `\nAll ${finalMidis.length} MIDI files processed successfully.`));
  return scheduleExit(0);
}

run();
