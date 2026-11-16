import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BGM_LOUDNESS,
  bgmFilter,
  bgmGain,
  bgmLayer,
  describeBgm,
  parseDuration,
  parseIntegratedLoudness,
  probeBgm,
  resolveBgm,
} from "../src/audio/bgm.js";
import { type AudioLayer, buildMixGraph, finishAudio, loudnormApply, parseLoudnorm } from "../src/audio/finish.js";
import type { SessionFacts } from "../src/facts.js";
import { VideoScriptSchema } from "../src/script/schema.js";
import { SilentSynthesizer } from "../src/tts/silent.js";
import { encodeWav, type Pcm, silence } from "../src/tts/wav.js";
import { buildHtml } from "../src/video/template.js";
import { buildTimeline, type TimedScene } from "../src/video/timeline.js";
import { loadReport, prepareOutputRoot, renderReport } from "../src/pipeline.js";
import { VoicevoxSynthesizer } from "../src/tts/voicevox.js";
import { bgmBand, durationOfFile, levelDb, loudnessOf, makeSine, meanLevel } from "./audio.js";
import { canRender, hasFfmpeg, voicevoxAvailable, voicevoxUrl } from "./support.js";

const fixtures = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

describe("BGM の設定", () => {
  const recorded = { file: "/music/recorded.mp3", credit: "音楽：記録", volume: -3 };

  it("オプション > 環境変数 > script.json の順に使う", () => {
    const env = { DOPAGAKIX_BGM: "/music/env.mp3", DOPAGAKIX_BGM_CREDIT: "音楽：環境", DOPAGAKIX_BGM_VOLUME: "-6" };
    expect(resolveBgm({ bgm: "/music/option.mp3", bgmCredit: "音楽：オプション", bgmVolume: 2 }, env, recorded)).toEqual({
      file: "/music/option.mp3",
      credit: "音楽：オプション",
      volume: 2,
    });
    expect(resolveBgm({}, env, recorded)).toEqual({ file: "/music/env.mp3", credit: "音楽：環境", volume: -6 });
    expect(resolveBgm({}, {}, recorded)).toEqual(recorded);
    // 記録の曲を使うときは、クレジットと音量だけをオプションで変えられる
    expect(resolveBgm({ bgmVolume: 4 }, { DOPAGAKIX_BGM_CREDIT: "音楽：環境" }, recorded)).toEqual({
      file: "/music/recorded.mp3",
      credit: "音楽：環境",
      volume: 4,
    });
  });

  it("別の曲を指定したときは、記録のクレジットと音量を引き継がない", () => {
    expect(resolveBgm({ bgm: "/music/other.mp3" }, {}, recorded)).toEqual({ file: "/music/other.mp3", volume: 0 });
  });

  it("--no-bgm なら、環境変数や記録があっても BGM なし", () => {
    expect(resolveBgm({ bgm: false }, { DOPAGAKIX_BGM: "/music/env.mp3" }, recorded)).toBeUndefined();
    expect(resolveBgm({}, {})).toBeUndefined();
    expect(resolveBgm({}, { DOPAGAKIX_BGM: "" })).toBeUndefined();
  });

  it("相対パスと ~ を絶対パスにし、音量の環境変数が数値でなければエラーにする", () => {
    expect(resolveBgm({ bgm: "music/a.mp3" }, {})?.file).toBe(path.resolve("music/a.mp3"));
    expect(resolveBgm({ bgm: "~/a.mp3" }, {})?.file).toBe(path.join(os.homedir(), "a.mp3"));
    expect(() => resolveBgm({ bgm: "/a.mp3" }, { DOPAGAKIX_BGM_VOLUME: "大きめ" })).toThrow(/DOPAGAKIX_BGM_VOLUME/);
  });

  it("環境の表示に、ファイル・長さ・クレジットを出す", () => {
    expect(describeBgm({ file: "/m/a.mp3", credit: "音楽：魔王魂", volume: -3, loudness: -14, duration: 95.04 })).toBe(
      "/m/a.mp3(95.0 秒、音量 -3 dB)。クレジット「音楽：魔王魂」",
    );
    expect(describeBgm({ file: "/m/a.mp3", volume: 0, loudness: -14 })).toMatch(/^\/m\/a\.mp3\(長さ不明\)。クレジットなし/);
  });
});

describe("フィルタグラフ", () => {
  it("BGM を動画の長さで切り、-30 LUFS にそろえて音量を足し、冒頭 1 秒と末尾 2 秒をフェードする", () => {
    const track = { loudness: -14, volume: -6 };
    expect(bgmGain(track)).toBe(BGM_LOUDNESS + 14 - 6);
    expect(bgmFilter(track, 42.5, { input: "1:a", key: "key0", output: "layer0" })).toBe(
      "[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:42.5,asetpts=PTS-STARTPTS," +
        "volume=-22dB,afade=t=in:d=1,afade=t=out:st=40.5:d=2[bgm];" +
        "[bgm][key0]sidechaincompress=threshold=0.01:ratio=20:attack=5:release=400[layer0]",
    );
    // 短い動画ではフェードが重ならないよう縮める
    expect(bgmFilter(track, 3, { input: "1:a", key: "k", output: "o" })).toContain("afade=t=in:d=1,afade=t=out:st=1.5:d=1.5");
  });

  it("曲は -stream_loop -1 でループさせ、読み上げを sidechain に使う", () => {
    const layer = bgmLayer({ file: "/m/a.mp3", volume: 0, loudness: -20 }, 30);
    expect(layer.inputArgs).toEqual(["-stream_loop", "-1", "-i", "/m/a.mp3"]);
    expect(buildMixGraph([layer])).toBe(
      "[0:a]aresample=48000,aformat=channel_layouts=stereo,asplit=2[voice][key0];" +
        "[1:a]aresample=48000,aformat=channel_layouts=stereo,atrim=0:30,asetpts=PTS-STARTPTS," +
        "volume=-10dB,afade=t=in:d=1,afade=t=out:st=28:d=2[bgm];" +
        "[bgm][key0]sidechaincompress=threshold=0.01:ratio=20:attack=5:release=400[layer0];" +
        "[voice][layer0]amix=inputs=2:duration=first:normalize=0[mix]",
    );
  });

  it("追加の音がなければ、読み上げを 48 kHz ステレオにするだけ。sidechain を使わない音には読み上げを分けない", () => {
    expect(buildMixGraph([])).toBe("[0:a]aresample=48000,aformat=channel_layouts=stereo[voice];[voice]anull[mix]");
    const effect: AudioLayer = { inputArgs: ["-i", "e.wav"], filter: ({ input, output }) => `[${input}]adelay=1000:all=1[${output}]` };
    expect(buildMixGraph([effect])).toBe(
      "[0:a]aresample=48000,aformat=channel_layouts=stereo[voice];[1:a]adelay=1000:all=1[layer0];" +
        "[voice][layer0]amix=inputs=2:duration=first:normalize=0[mix]",
    );
  });

  it("loudnorm の測定結果を読み、2 回目に linear=true で渡す", () => {
    const stderr = `[Parsed_loudnorm_0 @ 0x1]\n{\n\t"input_i" : "-24.31",\n\t"input_tp" : "-6.02",\n\t"input_lra" : "5.10",\n\t"input_thresh" : "-34.50",\n\t"target_offset" : "0.21"\n}\n`;
    const measured = parseLoudnorm(stderr);
    expect(loudnormApply(measured)).toBe(
      "loudnorm=I=-16:TP=-1.5:LRA=20:measured_I=-24.31:measured_TP=-6.02:measured_LRA=5.10:measured_thresh=-34.50:offset=0.21:linear=true:print_format=json",
    );
  });

  it("ebur128 の要約からラウドネスを、入力の情報から長さを読む", () => {
    const stderr =
      "  Duration: 00:01:35.04, start: 0.000000, bitrate: 128 kb/s\n" +
      "[Parsed_ebur128_0 @ 0x1] Summary:\n\n  Integrated loudness:\n    I:         -14.2 LUFS\n    Threshold: -24.5 LUFS\n";
    expect(parseIntegratedLoudness(stderr)).toBe(-14.2);
    expect(parseDuration(stderr)).toBeCloseTo(95.04);
    expect(parseIntegratedLoudness("Integrated loudness:\n    I:         -inf LUFS")).toBe(-Infinity);
    expect(parseIntegratedLoudness("")).toBeUndefined();
  });
});

describe("BGM のクレジット", () => {
  const facts: SessionFacts = {
    sessionId: "11111111-2222-3333-4444-555555555555",
    startTime: "2026-10-01T01:00:00.000Z",
    endTime: "2026-10-01T01:42:00.000Z",
    elapsedMinutes: 42,
    userPrompts: 3,
    toolCalls: 4,
    toolCounts: {},
    commandsRun: 0,
    commandsFailed: 0,
    files: [],
    models: [],
  };

  it("最終ページのクレジットにそのまま出し、下部の柱には出さない", async () => {
    const script = VideoScriptSchema.parse(JSON.parse(await readFile(path.join(fixtures, "script.json"), "utf8")));
    const timeline = await buildTimeline(script, new SilentSynthesizer(), { maxSeconds: 120, speed: 1, maxSpeed: 1.3 });
    const html = buildHtml({
      script,
      facts,
      scenes: timeline.scenes,
      credit: "VOICEVOX:ずんだもん",
      bgmCredit: "音楽：魔王魂",
      author: "agent",
    });
    expect(html).toContain("<div>音声: VOICEVOX:ずんだもん</div><div>音楽：魔王魂</div>");
    expect(html.match(/音楽：魔王魂/g)).toHaveLength(1);
    expect(buildHtml({ script, facts, scenes: timeline.scenes, author: "agent" })).not.toContain("音楽");
  });
});

describe("曲ファイルの確認", () => {
  let dir: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "dopagakix-bgm-"));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("ファイルが無ければ、直し方を添えてエラーにする", async () => {
    await expect(probeBgm({ file: path.join(dir, "none.mp3"), volume: 0 })).rejects.toThrow(
      /BGM の曲ファイルが見つかりません: .*none\.mp3\n--bgm\(環境変数 DOPAGAKIX_BGM\)を確かめるか、--no-bgm/,
    );
    await expect(probeBgm({ file: dir, volume: 0 })).rejects.toThrow(/フォルダです/);
  });

  it.runIf(hasFfmpeg)("音声として読めないファイルはエラーにし、読める曲はラウドネスと長さを測る", async () => {
    const text = path.join(dir, "not-audio.mp3");
    await writeFile(text, "これは音声ではありません");
    await expect(probeBgm({ file: text, volume: 0 })).rejects.toThrow(/BGM の曲ファイルを音声として読めません/);

    const sine = path.join(dir, "sine.wav");
    makeSine(sine, { frequency: 440, seconds: 3 });
    const track = await probeBgm({ file: sine, volume: -2 });
    expect(track.duration).toBeCloseTo(3, 1);
    expect(track.loudness).toBeLessThan(-10);
    expect(track.loudness).toBeGreaterThan(-30);

    const quiet = path.join(dir, "quiet.wav");
    await writeFile(quiet, encodeWav(silence(2, 24_000)));
    await expect(probeBgm({ file: quiet, volume: 0 })).rejects.toThrow(/無音/);
  });
});

/** 読み上げの代わりの音。1 kHz の音を、文・シーンの区切りに合わせて鳴らす(24 kHz モノラル) */
function narration(seconds: number, segments: Array<[number, number]>): Pcm {
  const pcm = silence(seconds, 24_000);
  for (const [start, end] of segments) {
    for (let i = Math.round(start * 24_000); i < Math.round(end * 24_000); i++) {
      pcm.samples[i] = Math.round(0.3 * 32767 * Math.sin((2 * Math.PI * 1000 * i) / 24_000));
    }
  }
  return pcm;
}

describe.runIf(hasFfmpeg)("音声の仕上げ(結合テスト)", () => {
  let dir: string;
  const length = 20;
  // 文と文の間は 0.15 秒、シーンの間は 1.1 秒(timeline.ts の値)
  const speech: Array<[number, number]> = [
    [0.5, 2.5],
    [2.65, 4.5],
    [5.6, 8.0],
    [8.15, 10.5],
    [11.6, 14.0],
    [14.15, 16.5],
  ];
  let voiceFile: string;
  beforeAll(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "dopagakix-finish-"));
    voiceFile = path.join(dir, "narration.wav");
    await writeFile(voiceFile, encodeWav(narration(length, speech)));
  });
  afterAll(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("BGM がなくても、-16 ±1 LUFS・トゥルーピーク -1.5 dBTP 以下の 48 kHz ステレオにそろえる", async () => {
    const outFile = path.join(dir, "plain.wav");
    const result = await finishAudio({ narrationFile: voiceFile, outFile });
    const measured = loudnessOf(outFile);
    expect(Math.abs(measured.integrated + 16)).toBeLessThanOrEqual(1);
    expect(measured.truePeak).toBeLessThanOrEqual(-1.5);
    expect(result.outputLoudness).toBeCloseTo(-16, 0);
    expect(durationOfFile(outFile)).toBeCloseTo(length, 1);
    const header = await readFile(outFile);
    expect(header.readUInt16LE(22)).toBe(2);
    expect(header.readUInt32LE(24)).toBe(48_000);
  });

  it("無音(字幕のみで BGM なし)なら、音量をそろえずに書き出す", async () => {
    const quiet = path.join(dir, "quiet.wav");
    await writeFile(quiet, encodeWav(silence(3, 24_000)));
    const outFile = path.join(dir, "quiet-out.wav");
    const result = await finishAudio({ narrationFile: quiet, outFile });
    expect(result.normalization).toBe("none");
    expect(existsSync(outFile)).toBe(true);
  });

  it("短い曲はループし、動画の長さで切り、冒頭と末尾をフェードし、読み上げ中だけ 6 dB 以上下げる", async () => {
    const song = path.join(dir, "sine60.wav");
    makeSine(song, { frequency: 60, seconds: 10 });
    const track = await probeBgm({ file: song, volume: 0 });
    const outFile = path.join(dir, "bgm.wav");
    await finishAudio({ narrationFile: voiceFile, layers: [bgmLayer(track, length)], outFile });

    expect(durationOfFile(outFile)).toBeCloseTo(length, 1);
    const measured = loudnessOf(outFile);
    expect(Math.abs(measured.integrated + 16)).toBeLessThanOrEqual(1);
    expect(measured.truePeak).toBeLessThanOrEqual(-1.5);

    const band = bgmBand(outFile);
    const during = meanLevel(
      band,
      speech.map(([start, end]) => [start + 0.1, end - 0.05]),
    );
    // シーンの間(次の読み上げの直前)
    const between = meanLevel(band, [
      [5.25, 5.55],
      [11.25, 11.55],
    ]);
    expect(between - during).toBeGreaterThanOrEqual(6);
    // 曲(10 秒)が終わったあともループして鳴っている
    expect(Math.abs(levelDb(band, 17.2, 17.9) - between)).toBeLessThan(3);
    // フェードイン・フェードアウト
    expect(levelDb(band, 0, 0.1)).toBeLessThan(between - 10);
    expect(levelDb(band, length - 0.15, length)).toBeLessThan(between - 10);
  });

  it("動画より長い曲は動画の長さで切る", async () => {
    const song = path.join(dir, "sine60-long.wav");
    makeSine(song, { frequency: 60, seconds: 40 });
    const track = await probeBgm({ file: song, volume: 0 });
    const outFile = path.join(dir, "bgm-long.wav");
    await finishAudio({ narrationFile: voiceFile, layers: [bgmLayer(track, length)], outFile });
    expect(durationOfFile(outFile)).toBeCloseTo(length, 1);
  });
});

/*
 * 実際の読み上げ(VOICEVOX)と合成音の BGM で動画を作り、全体の音量と、読み上げ中・シーンの間の BGM の音量差を確かめる。
 * CI の「VOICEVOX との結合」ジョブで実行する。
 */
describe.runIf(voicevoxAvailable && canRender)("BGM 付きの動画(VOICEVOX との結合テスト)", () => {
  let dir: string;
  afterAll(async () => {
    if (dir) await rm(dir, { recursive: true, force: true });
  });

  it("読み上げ中は BGM が 6 dB 以上下がり、シーンの間では戻る。全体は -16 ±1 LUFS", async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "dopagakix-bgm-voiced-"));
    const example = path.join(fixtures, "..", "..", "examples", "script.example.json");
    const report = await loadReport(example);
    const song = path.join(dir, "sine60.wav");
    makeSine(song, { frequency: 60, seconds: 10 });
    const bgm = await probeBgm({ file: song, volume: 0 });
    const workDir = path.join(dir, "out");
    await prepareOutputRoot(workDir);
    const synth = await VoicevoxSynthesizer.create({ baseUrl: voicevoxUrl, speaker: 3 });
    const result = await renderReport(
      { script: report.script, facts: report.facts!, author: "manual", bgm },
      { outFile: path.join(workDir, "summary.mp4"), workDir, synth, speed: 1.25, maxSpeed: 1.45, maxSeconds: 120, fps: 2, scale: 0.25 },
    );

    const measured = loudnessOf(result.outFile);
    expect(Math.abs(measured.integrated + 16)).toBeLessThanOrEqual(1);
    expect(measured.truePeak).toBeLessThanOrEqual(-1.5);

    const { scenes, duration } = JSON.parse(await readFile(path.join(workDir, "timeline.json"), "utf8")) as {
      scenes: TimedScene[];
      duration: number;
    };
    const inside = (start: number, end: number) => start >= 1.2 && end <= duration - 2.2 && end - start > 0.1;
    const during = scenes.flatMap((scene) => scene.cues.map((cue) => [cue.start + 0.1, cue.end - 0.05] as [number, number]));
    const between = scenes.slice(1).flatMap((scene) => {
      const next = scene.cues[0];
      return next ? [[next.start - 0.35, next.start - 0.05] as [number, number]] : [];
    });
    const band = bgmBand(result.outFile);
    const drop =
      meanLevel(
        band,
        between.filter(([a, b]) => inside(a, b)),
      ) -
      meanLevel(
        band,
        during.filter(([a, b]) => inside(a, b)),
      );
    console.log(`BGM の下がり量: ${drop.toFixed(1)} dB、全体 ${measured.integrated} LUFS・${measured.truePeak} dBTP`);
    expect(drop).toBeGreaterThanOrEqual(6);
  });
});
