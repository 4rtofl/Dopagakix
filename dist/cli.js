#!/usr/bin/env node
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { Command, InvalidArgumentError, Option } from "commander";
import { describeBgm, parseVolume, probeBgm, resolveBgm } from "./audio/bgm.js";
import { describeSfx, probeSfx, resolveSfx } from "./audio/sfx.js";
import { buildBrief, checkEnvironment } from "./brief.js";
import { personaMismatch, resolvePersona } from "./persona.js";
import { assertVoiceAllowed, createSynthesizer, DEFAULT_OUT_DIR, digestSession, inputKind, inspectUnits, loadConversation, loadReport, loadSession, prepareOutputRoot, renderConversation, renderFree, renderReport, resolveRenderPaths, saveCheckedReadings, verifyReadings, verifyUnits, } from "./pipeline.js";
import { checkConversationScript } from "./conversation/check.js";
import { checkFormatDefinition, checkFreeFile } from "./free/check.js";
import { checkFormatFiles, loadFormatFile, loadFree, probeImages } from "./free/files.js";
import { defaultFormatDefinition, resolveFormat } from "./free/format.js";
import { checkScript, narrationBudget } from "./script/check.js";
import { BUILTIN_READINGS, conversationSpeechUnits, freeSpeechUnits, loadProjectReadings, resolveReadings, speechUnits, } from "./script/readings.js";
import { STATUS_LABELS } from "./script/schema.js";
import { installSkill, SKILL_NAME, skillsDir } from "./skill.js";
import { DEFAULT_MAX_DIGEST_CHARS } from "./transcript/digest.js";
import { listTranscripts } from "./transcript/locate.js";
import { readTranscript } from "./transcript/parse.js";
import { START_TIMEOUT_MS } from "./tts/start.js";
import { DEFAULT_SPEAKER, DEFAULT_VOICEVOX_URL, VoicevoxClient, VoicevoxSynthesizer } from "./tts/voicevox.js";
import { log, progress } from "./util/log.js";
import { formatDateTime, formatStamp } from "./util/time.js";
import { bundledFreeStyle } from "./video/free.js";
const { version } = createRequire(import.meta.url)("../package.json");
/** 長さがこの倍率を超えたら話速を上げる */
const LENGTH_TOLERANCE = 1.25;
const DEFAULT_SPEED = 1.25;
const MAX_SPEED = 1.45;
const DEFAULT_SECONDS = 60;
function positiveNumber(value) {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0)
        throw new InvalidArgumentError("正の数を指定してください。");
    return n;
}
function positiveInteger(value) {
    const n = positiveNumber(value);
    if (!Number.isInteger(n))
        throw new InvalidArgumentError("正の整数を指定してください。");
    return n;
}
function nonNegativeInteger(value) {
    const n = Number(value);
    if (!Number.isInteger(n) || n < 0)
        throw new InvalidArgumentError("0 以上の整数を指定してください。");
    return n;
}
function withSessionOptions(command) {
    return command
        .option("--transcript <file>", "セッションログ(.jsonl)のパス")
        .option("-s, --session <id>", "セッション ID(前方一致)。省略時は実行中の Claude Code のセッション、なければプロジェクトの最新のログ")
        .option("-p, --project <dir>", "ログを探すプロジェクトのディレクトリ", process.cwd());
}
function withVoiceOptions(command) {
    return command
        .option("--no-voice", "読み上げなし(字幕のみ)で作る。VOICEVOX は不要。動画の柱に「音声なし」と出る")
        .addOption(new Option("--speaker <id>", "VOICEVOX の話者(スタイル)ID。`dopagakix speakers` で一覧")
        .argParser(nonNegativeInteger)
        .default(DEFAULT_SPEAKER)
        .env("DOPAGAKIX_SPEAKER"))
        .addOption(new Option("--voicevox-url <url>", "VOICEVOX エンジンの URL").default(DEFAULT_VOICEVOX_URL).env("VOICEVOX_URL"))
        .addOption(new Option("--persona <name>", "読み上げ文の口調。auto=話者から判断 / none=丁寧語 / zundamon / 口調設定の JSON ファイル")
        .default("auto")
        .env("DOPAGAKIX_PERSONA"));
}
function withCreditOption(command) {
    return command.addOption(new Option("--credit <text>", "動画に表示する音声のクレジット表記。省略時は話者から決める(音声ライブラリの規約で書式が決まっているものは規約どおり)").env("DOPAGAKIX_CREDIT"));
}
function withVideoDirOption(command) {
    return command.addOption(new Option("--video-dir <dir>", "完成した動画だけを置くフォルダ。動画の名前は「台本のフォルダ名-タイトル.mp4」になり、作業ファイルは台本と同じ場所に残す").env("DOPAGAKIX_VIDEO_DIR"));
}
function volume(value) {
    try {
        return parseVolume(value);
    }
    catch {
        throw new InvalidArgumentError("dB の数値を指定してください(例: -6)。");
    }
}
/** BGM の設定。環境変数と script.json の記録は resolveBgm で扱う(優先順位: オプション > 環境変数 > script.json) */
function withBgmOptions(command) {
    return command
        .option("--bgm <file>", "BGM の曲ファイル(mp3 / wav / ogg / m4a など)。環境変数 DOPAGAKIX_BGM でも可。曲は同梱しないので、利用者が用意する")
        .option("--no-bgm", "BGM を付けない(環境変数や script.json で設定していても)")
        .option("--bgm-credit <text>", "BGM のクレジット。最終ページにそのまま表示する(例: 音楽：魔王魂)。環境変数 DOPAGAKIX_BGM_CREDIT でも可")
        .option("--bgm-volume <dB>", "BGM の音量。基準(-30 LUFS)からの増減。環境変数 DOPAGAKIX_BGM_VOLUME でも可(既定: 0)", volume);
}
/** 効果音の設定。環境変数と script.json の記録は resolveSfx で扱う(優先順位: オプション > 環境変数 > script.json) */
function withSfxOptions(command) {
    return command
        .option("--sfx-dir <dir>", "効果音のファイル(page.* / result.* / end.*)を置いたディレクトリ。環境変数 DOPAGAKIX_SFX_DIR でも可。音源は同梱しないので、利用者が用意する")
        .option("--no-sfx", "効果音を付けない(環境変数や script.json で設定していても)")
        .option("--sfx-credit <text>", "効果音のクレジット。最終ページにそのまま表示する(例: 効果音：効果音ラボ)。環境変数 DOPAGAKIX_SFX_CREDIT でも可")
        .option("--sfx-volume <dB>", "効果音の音量。基準(ピーク -12 dBFS)からの増減。環境変数 DOPAGAKIX_SFX_VOLUME でも可(既定: 0)", volume);
}
function withSecondsOption(command) {
    return command.option("--seconds <n>", "動画の長さの目安(秒)。読み上げ文の文字数の目安と、話速の調整に使う", positiveNumber, DEFAULT_SECONDS);
}
function withRenderOptions(command) {
    return command
        .option("--speed <x>", "話速(1 が標準)", positiveNumber, DEFAULT_SPEED)
        .option("--fps <n>", "フレームレート", positiveInteger, 30)
        .option("--chromium <path>", "描画に使う Chromium の実行ファイル(環境変数 DOPAGAKIX_CHROMIUM でも可)");
}
function locateOptions(flags) {
    return { transcript: flags.transcript, session: flags.session, projectDir: flags.project };
}
const FOUND_BY = {
    path: "指定したファイル",
    session: "指定したセッション",
    current: "実行中のセッション",
    latest: "プロジェクトの最新のログ",
};
async function choosePersona(flags) {
    return resolvePersona({ option: flags.persona, speaker: flags.speaker, voice: flags.voice, voicevoxUrl: flags.voicevoxUrl });
}
/** VOICEVOX に接続できないときに実行する、エンジンの起動コマンド */
const engineStart = {
    command: process.env.DOPAGAKIX_VOICEVOX_START || undefined,
    onStart: (command) => log(`VOICEVOX エンジンに接続できないため、起動します(応答を最大 ${START_TIMEOUT_MS / 1000} 秒待ちます): ${command}`),
};
/** コマンドの表示用に、cwd の中なら相対パスにする */
function displayPath(file) {
    const relative = path.relative(process.cwd(), file);
    return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? relative : file;
}
function shellQuote(arg) {
    return /^[\w@%+=:,./-]+$/.test(arg) ? arg : `'${arg.replaceAll("'", "'\\''")}'`;
}
const commandLine = (args) => args.map(shellQuote).join(" ");
/** prepare に明示した設定を、案内する check / render / digest のコマンドに引き継ぐ */
function explicitArgs(command, flags, keys) {
    const values = flags;
    const args = [];
    for (const key of keys) {
        if (command.getOptionValueSource(key) !== "cli")
            continue;
        const flag = `--${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
        const value = values[key];
        if (typeof value === "boolean") {
            if (value === false)
                args.push(flag.replace(/^--/, "--no-"));
            continue;
        }
        // 負の数(--bgm-volume -6 など)も 1 つの引数で渡す
        if (typeof value === "number")
            args.push(`${flag}=${value}`);
        else
            args.push(flag, String(value));
    }
    return args;
}
/** 1 文字の表記の読みの指定は、意図しない箇所を置き換えやすいので警告する */
function readingIssues(resolved) {
    return resolved.singleChars.map(({ key, source }) => ({
        at: `readings["${key}"]`,
        message: `1 文字の表記の読みの指定(${source})は、意図しない箇所も置き換えます。前後を含めた表記で指定してください。`,
    }));
}
const program = new Command()
    .name("dopagakix")
    .description("AI エージェントが書いた作業報告の台本から、指示者向けの縦型動画を作る")
    .version(version)
    .hook("preAction", (_program, action) => assertVoiceAllowed(action.opts().voice));
withSfxOptions(withBgmOptions(withVideoDirOption(withCreditOption(withSecondsOption(withVoiceOptions(withSessionOptions(program
    .command("prepare")
    .description("動画レポートの準備。出力先を作り、台本を書くのに必要な情報(画面に出る数値・口調・長さ・環境)を表示する"))))))))
    .option("--out-dir <dir>", "出力先の親ディレクトリ(中身は git の管理対象から外す)", DEFAULT_OUT_DIR)
    .option("--timezone <tz>", "時刻表示のタイムゾーン(例: Asia/Tokyo)。省略時は実行環境の設定")
    .option("--chromium <path>", "描画に使う Chromium の実行ファイル")
    .action(async (flags, command) => {
    const outRoot = path.resolve(flags.outDir);
    const loaded = await loadSession(locateOptions(flags), [outRoot]);
    log(`ログ: ${loaded.file}(${FOUND_BY[loaded.how]})`);
    // 口調は話者名から決めるため、エンジンを起動する場合は先に起動しておく
    const environment = await checkEnvironment({
        ...flags,
        bgm: resolveBgm(flags),
        sfx: resolveSfx(flags),
        startCommand: engineStart.command,
        onStart: engineStart.onStart,
    });
    const persona = await choosePersona(flags);
    const project = await loadProjectReadings();
    await prepareOutputRoot(outRoot);
    const runDir = path.join(outRoot, `${formatStamp(new Date(), flags.timezone)}-${loaded.sessionId.slice(0, 8)}`);
    await mkdir(runDir, { recursive: true });
    const report = displayPath(path.join(runDir, "report.json"));
    const session = flags.transcript ? ["--transcript", loaded.file] : ["--session", loaded.sessionId];
    const shared = [...session, ...explicitArgs(command, flags, ["voice", "speaker", "voicevoxUrl", "persona", "seconds"])];
    const timezone = explicitArgs(command, flags, ["timezone"]);
    process.stdout.write(buildBrief({
        facts: loaded.facts,
        reportFile: report,
        checkCommand: commandLine(["dopagakix", "check", report, ...shared]),
        renderCommand: commandLine([
            "dopagakix",
            "render",
            report,
            ...shared,
            ...timezone,
            ...explicitArgs(command, flags, ["credit", "chromium", "videoDir", "bgm", "bgmCredit", "bgmVolume", "sfx", "sfxDir", "sfxCredit", "sfxVolume"]),
        ]),
        digestCommand: commandLine(["dopagakix", "digest", ...session, ...timezone, "-o", displayPath(path.join(runDir, "digest.md"))]),
        persona,
        readings: {
            builtin: Object.keys(BUILTIN_READINGS).length,
            project: Object.keys(project.readings).length,
            projectFile: project.file ? displayPath(project.file) : undefined,
        },
        seconds: flags.seconds,
        environment,
        timeZone: flags.timezone,
    }));
    if (environment.some((item) => item.status === "missing"))
        process.exitCode = 1;
});
function checkText(output, status) {
    const { narration, readings } = output;
    const lines = [
        `形式: 正しい(「${output.title}」、${status})`,
        ...(output.kind === "format"
            ? []
            : [
                `読み上げ文: ${narration.sentences} 文、計 ${narration.chars} 文字(目安 ${narration.budget} 文字、約 ${narration.seconds} 秒)`,
                `口調: ${output.persona ? `${output.persona}(文末を確認)` : "丁寧語"}`,
            ]),
        ...(output.facts ? [`数値: ${output.facts}`] : []),
        output.issues.length > 0 ? `警告 ${output.issues.length} 件:` : "警告: なし",
        ...output.issues.map((issue) => `- ${issue.at}: ${issue.message}`),
    ];
    if (readings.status === "skipped")
        lines.push(`読み: 省略(${readings.reason})`);
    else if (readings.status === "failed")
        lines.push("", `読み: 確かめられませんでした(${readings.error})`);
    else {
        lines.push("", `読み(VOICEVOX ENGINE ${readings.engine}、${readings.speaker.name}): ${readings.sentences.length} 文${readings.review > 0 ? `、うち要確認 ${readings.review} 文` : ""}`, ...readings.sentences.flatMap((sentence) => [
            `- ${sentence.review ? "[要確認] " : ""}${sentence.at}「${sentence.text}」`,
            `  → ${sentence.reading}`,
            ...(sentence.sent !== sentence.text ? [`  (VOICEVOX に送る文: ${sentence.sent})`] : []),
            ...sentence.reasons.map((reason) => `  要確認: ${reason}`),
        ]), "", "全文の読みを 1 文ずつ確かめてください。誤読があれば台本の readings で直し、もう一度 check を実行します。");
    }
    return `${lines.join("\n")}\n`;
}
/** 全文を VOICEVOX に通して読みを確かめ、確かめた読みを保存する(render が照らし合わせる) */
async function checkReadings(reportPath, units, readings, flags) {
    if (!flags.voice)
        return { status: "skipped", reason: "読み上げなし" };
    try {
        const synth = await createSynthesizer({ ...flags, readings, startCommand: engineStart.command, onStart: engineStart.onStart });
        if (!(synth instanceof VoicevoxSynthesizer))
            throw new Error("VOICEVOX の合成器を作れませんでした。");
        const engineVersion = await synth.engineVersion();
        const inspected = await inspectUnits(units, synth);
        const saved = await saveCheckedReadings(reportPath, inspected, {
            version: engineVersion,
            speaker: synth.voice.speaker,
            name: synth.voice.name,
        });
        log(`確かめた読みを保存しました(render はこの読みと照らし合わせます): ${saved}`);
        return {
            status: "checked",
            engine: engineVersion,
            speaker: { id: synth.voice.speaker, name: synth.voice.name },
            review: inspected.filter((sentence) => sentence.reasons.length > 0).length,
            sentences: inspected.map(({ at, text, sent, reading, reasons }) => ({ at, text, sent, reading, review: reasons.length > 0, reasons })),
            savedTo: saved,
        };
    }
    catch (error) {
        return { status: "failed", error: error.message };
    }
}
withSecondsOption(withVoiceOptions(withSessionOptions(program
    .command("check")
    .description("台本を確かめる(形式、口調、長さ、読み上げにくい表記、数値との食い違い、全文の読み)。確かめた読みは render が照らし合わせる。描画はしない")
    .argument("<report>", "台本(report.json)、script.json、会話の要約のファイル(kind: conversation)、自由形式のファイル(kind: free)、または形式の定義(kind: format)のパス"))))
    .option("--json", "結果を JSON で出す(読みの確認の結果を、プログラムや AI が読みやすい形で出す)")
    .option("--format <file>", "自由形式の形式の定義(format.json)。ファイルに書いた format より優先する")
    .action(async (reportPath, flags) => {
    const persona = await choosePersona(flags);
    let output;
    let status;
    const kind = await inputKind(reportPath);
    if (flags.format && kind !== "free")
        throw new Error("--format は、自由形式のファイル(kind: free)にだけ使えます。");
    if (kind === "format") {
        const loaded = await loadFormatFile(reportPath);
        const format = resolveFormat(loaded.definition);
        const files = await checkFormatFiles(format, loaded.dir);
        status = "形式の定義";
        output = {
            kind: "format",
            file: loaded.file,
            title: loaded.definition.name ?? path.basename(loaded.dir),
            narration: { sentences: 0, chars: 0, budget: narrationBudget(flags.seconds), seconds: flags.seconds },
            persona: persona?.name ?? null,
            issues: [...checkFormatDefinition(format), ...files.issues],
            readings: { status: "skipped", reason: "形式の定義だけを確かめた" },
        };
    }
    else if (kind === "free") {
        const loaded = await loadFree(reportPath, flags.format);
        const result = checkFreeFile(loaded.raw, { format: loaded.format, persona, seconds: flags.seconds });
        const files = await checkFormatFiles(loaded.format, loaded.formatDir, "format.");
        const images = await probeImages(loaded);
        const resolved = await resolveReadings(loaded.raw.script, loaded.raw.readings);
        status = `自由形式、${loaded.format.name ? `形式「${loaded.format.name}」` : loaded.formatFile || loaded.raw.format ? "形式の定義あり" : "既定の形式"}`;
        output = {
            kind: "free",
            file: path.resolve(reportPath),
            title: loaded.script.title,
            narration: { sentences: result.sentences, chars: result.narrationChars, budget: result.budget, seconds: flags.seconds },
            persona: persona?.name ?? null,
            issues: [...result.issues, ...files.issues, ...images.issues, ...readingIssues(resolved)],
            readings: await checkReadings(reportPath, freeSpeechUnits(loaded.raw.script, loaded.format.limits, loaded.facts), resolved.readings, flags),
        };
    }
    else if (kind === "conversation") {
        const conversation = await loadConversation(reportPath);
        const result = checkConversationScript(conversation.raw, { persona, seconds: flags.seconds });
        const resolved = await resolveReadings(conversation.raw, conversation.readings);
        status = "会話の要約";
        output = {
            kind: "conversation",
            file: path.resolve(reportPath),
            title: conversation.script.title,
            narration: { sentences: result.sentences, chars: result.narrationChars, budget: result.budget, seconds: flags.seconds },
            persona: persona?.name ?? null,
            issues: [...result.issues, ...readingIssues(resolved)],
            readings: await checkReadings(reportPath, conversationSpeechUnits(conversation.raw), resolved.readings, flags),
        };
    }
    else {
        const report = await loadReport(reportPath);
        let facts = report.facts;
        let compared = "script.json に記録された数値と照合";
        if (!facts) {
            try {
                const loaded = await loadSession(locateOptions(flags), [path.dirname(path.resolve(reportPath))]);
                facts = loaded.facts;
                compared = `セッション ${loaded.sessionId.slice(0, 8)} のログ(${FOUND_BY[loaded.how]})と照合`;
            }
            catch (error) {
                compared = `省略(${error.message})`;
            }
        }
        const result = checkScript(report.raw, { persona, facts, seconds: flags.seconds });
        const resolved = await resolveReadings(report.raw, report.readings);
        status = STATUS_LABELS[report.script.status];
        output = {
            kind: "report",
            file: path.resolve(reportPath),
            title: report.script.title,
            narration: { sentences: result.sentences, chars: result.narrationChars, budget: result.budget, seconds: flags.seconds },
            persona: persona?.name ?? null,
            facts: compared,
            issues: [...result.issues, ...readingIssues(resolved)],
            readings: await checkReadings(reportPath, speechUnits(report.raw), resolved.readings, flags),
        };
    }
    process.stdout.write(flags.json ? `${JSON.stringify(output, null, 2)}\n` : checkText(output, status));
    if (output.readings.status === "failed")
        throw new Error(`読み上げ文の読みを確かめられませんでした。${output.readings.error}`);
});
withSfxOptions(withBgmOptions(withVideoDirOption(withCreditOption(withRenderOptions(withSecondsOption(withVoiceOptions(withSessionOptions(program
    .command("render")
    .description("台本から動画を作る。画面の数値はセッションログから集計する")
    .argument("<report>", "台本(report.json)、描画済みの script.json(記録された数値で描画し直す)、会話の要約のファイル(kind: conversation)、または自由形式のファイル(kind: free)")))))))))
    .option("-o, --out <file>", "動画の出力先。作業ファイルも同じ場所に置き、--video-dir より優先する(既定: 台本と同じ場所の summary.mp4)")
    .option("--timezone <tz>", "時刻表示のタイムゾーン(例: Asia/Tokyo)。省略時は実行環境の設定")
    .option("--work-dir <dir>", "作業ファイル(narration.wav・audio.wav・timeline.json・script.json)を置くフォルダ。-o と組み合わせ、出力先に動画だけを置くのに使う")
    .option("--format <file>", "自由形式の形式の定義(format.json)。ファイルに書いた format より優先する")
    .action(async (reportPath, flags) => {
    const kind = await inputKind(reportPath);
    if (flags.format && kind !== "free")
        throw new Error("--format は、自由形式のファイル(kind: free)にだけ使えます。");
    if (kind === "format")
        throw new Error("形式の定義だけでは動画を作れません。動画ごとのファイル(kind: free)を渡し、形式の定義は --format で指定してください。");
    if (kind === "conversation") {
        await renderConversationCommand(reportPath, flags);
        return;
    }
    if (kind === "free") {
        await renderFreeCommand(reportPath, flags);
        return;
    }
    const report = await loadReport(reportPath);
    let facts = report.facts;
    if (facts) {
        log("数値: script.json に記録されたものを使います");
    }
    else {
        const loaded = await loadSession(locateOptions(flags), [path.dirname(path.resolve(reportPath))]);
        facts = loaded.facts;
        log(`ログ: ${loaded.file}(${FOUND_BY[loaded.how]})`);
    }
    // 曲ファイルが無い・読めない場合は、時間のかかる音声合成と描画の前に止める
    const bgmSetting = resolveBgm(flags, process.env, report.bgm);
    const bgm = bgmSetting ? await probeBgm(bgmSetting) : undefined;
    log(`BGM: ${bgm ? describeBgm(bgm) : "なし"}`);
    // 効果音のファイルが無い・読めない場合も、同じく音声合成と描画の前に止める
    const sfxSetting = resolveSfx(flags, process.env, report.sfx);
    const sfx = sfxSetting ? await probeSfx(sfxSetting) : undefined;
    log(`効果音: ${sfx ? describeSfx(sfx) : "なし"}`);
    const resolved = await resolveReadings(report.raw, report.readings);
    // 読み上げありで VOICEVOX に接続できなければ、ここで止める(字幕のみには切り替えない)
    const synth = await createSynthesizer({
        ...flags,
        readings: resolved.readings,
        startCommand: engineStart.command,
        onStart: engineStart.onStart,
    });
    if (!flags.voice)
        log("読み上げ: なし(字幕のみ。動画の柱に「音声なし」と表示します)");
    if (synth instanceof VoicevoxSynthesizer) {
        // check で確かめた読みと一致しなければ、音声を作る前に止める
        const count = await verifyReadings(reportPath, report.raw, synth);
        log(`読み: check で確かめた読みと一致(${count} 文)`);
    }
    const persona = await choosePersona(flags);
    log(`口調: ${persona?.name ?? "丁寧語"}`);
    for (const issue of [...checkScript(report.raw, { persona, facts, seconds: flags.seconds }).issues, ...readingIssues(resolved)]) {
        log(`注意: ${issue.at}: ${issue.message}`);
    }
    const mismatch = flags.voice ? personaMismatch(report.persona, flags.speaker) : undefined;
    if (mismatch)
        log(`注意: ${mismatch}`);
    const { outFile, workDir } = resolveRenderPaths({
        report: reportPath,
        title: report.script.title,
        out: flags.out,
        videoDir: flags.videoDir,
        workDir: flags.workDir,
    });
    await mkdir(workDir, { recursive: true });
    await mkdir(path.dirname(outFile), { recursive: true });
    const result = await renderReport({
        script: report.script,
        facts,
        author: report.author,
        persona: persona ? { id: persona.id, name: persona.name } : report.persona,
        bgm,
        sfx,
        readings: resolved.readings,
    }, {
        outFile,
        workDir,
        synth,
        speed: flags.speed,
        maxSpeed: MAX_SPEED,
        maxSeconds: flags.seconds * LENGTH_TOLERANCE,
        fps: flags.fps,
        chromiumPath: flags.chromium,
        timeZone: flags.timezone,
        onSpeechProgress: progress(flags.voice ? "音声合成" : "字幕の時間割り当て"),
        onFrameProgress: progress("描画"),
    });
    log(`完了: ${result.outFile}(${result.duration.toFixed(1)} 秒、話速 ${result.speed}` +
        `、撮影 ${result.stats.captured}/${result.stats.frames} フレーム)`);
    if (result.credit)
        log(`クレジット表記: ${result.credit}(VOICEVOX の利用規約により必要です)`);
    if (bgm?.credit)
        log(`BGM のクレジット: ${bgm.credit}`);
    process.stdout.write(`${result.outFile}\n`);
});
/** 会話の要約を描画する。数値はファイルの facts を使い、BGM と効果音は付けない */
async function renderConversationCommand(reportPath, flags) {
    const conversation = await loadConversation(reportPath);
    log("数値: ファイルの facts を使います");
    if (resolveBgm(flags) || resolveSfx(flags))
        log("BGM・効果音: 会話の要約では使いません(指定は無視します)");
    const resolved = await resolveReadings(conversation.raw, conversation.readings);
    // 読み上げありで VOICEVOX に接続できなければ、ここで止める(字幕のみには切り替えない)
    const synth = await createSynthesizer({ ...flags, readings: resolved.readings, startCommand: engineStart.command, onStart: engineStart.onStart });
    if (!flags.voice)
        log("読み上げ: なし(字幕のみ。動画の柱に「音声なし」と表示します)");
    if (synth instanceof VoicevoxSynthesizer) {
        // check で確かめた読みと一致しなければ、音声を作る前に止める
        const count = await verifyUnits(reportPath, conversationSpeechUnits(conversation.raw), synth);
        log(`読み: check で確かめた読みと一致(${count} 文)`);
    }
    const persona = await choosePersona(flags);
    log(`口調: ${persona?.name ?? "丁寧語"}`);
    for (const issue of [...checkConversationScript(conversation.raw, { persona, seconds: flags.seconds }).issues, ...readingIssues(resolved)]) {
        log(`注意: ${issue.at}: ${issue.message}`);
    }
    const mismatch = flags.voice ? personaMismatch(conversation.persona, flags.speaker) : undefined;
    if (mismatch)
        log(`注意: ${mismatch}`);
    const { outFile, workDir } = resolveRenderPaths({
        report: reportPath,
        title: conversation.script.title,
        out: flags.out,
        videoDir: flags.videoDir,
        workDir: flags.workDir,
    });
    await mkdir(workDir, { recursive: true });
    await mkdir(path.dirname(outFile), { recursive: true });
    const result = await renderConversation({
        raw: conversation.raw,
        facts: conversation.facts,
        persona: persona ? { id: persona.id, name: persona.name } : conversation.persona,
        readings: resolved.readings,
    }, {
        outFile,
        workDir,
        synth,
        speed: flags.speed,
        maxSpeed: MAX_SPEED,
        maxSeconds: flags.seconds * LENGTH_TOLERANCE,
        fps: flags.fps,
        chromiumPath: flags.chromium,
        timeZone: flags.timezone,
        onSpeechProgress: progress(flags.voice ? "音声合成" : "字幕の時間割り当て"),
        onFrameProgress: progress("描画"),
    });
    log(`完了: ${result.outFile}(${result.duration.toFixed(1)} 秒、話速 ${result.speed}、撮影 ${result.stats.captured}/${result.stats.frames} フレーム)`);
    if (result.credit)
        log(`クレジット表記: ${result.credit}(VOICEVOX の利用規約により必要です)`);
    process.stdout.write(`${result.outFile}\n`);
}
/** 自由形式を描画する。数値はファイルの facts を使い、BGM と効果音は作業報告と同じく付けられる */
async function renderFreeCommand(reportPath, flags) {
    const loaded = await loadFree(reportPath, flags.format);
    log(`形式: ${loaded.formatFile ?? (loaded.raw.format ? "ファイルに書いた定義" : "既定の形式")}${loaded.format.name ? `(${loaded.format.name})` : ""}`);
    log("数値: ファイルの facts を使います");
    // 形式の CSS・書体・画像のファイルが無い・読めない場合は、時間のかかる音声合成と描画の前に止める
    const files = await checkFormatFiles(loaded.format, loaded.formatDir, "format.");
    const images = await probeImages(loaded);
    const missing = [...files.missing, ...images.missing];
    if (missing.length > 0)
        throw new Error(`描画に使うファイルを読めません:\n${missing.map((issue) => `- ${issue.at}: ${issue.message}`).join("\n")}`);
    const bgmSetting = resolveBgm(flags, process.env, loaded.raw.bgm);
    const bgm = bgmSetting ? await probeBgm(bgmSetting) : undefined;
    log(`BGM: ${bgm ? describeBgm(bgm) : "なし"}`);
    const sfxSetting = resolveSfx(flags, process.env, loaded.raw.sfx);
    const sfx = sfxSetting ? await probeSfx(sfxSetting) : undefined;
    log(`効果音: ${sfx ? describeSfx(sfx) : "なし"}`);
    const resolved = await resolveReadings(loaded.raw.script, loaded.raw.readings);
    // 読み上げありで VOICEVOX に接続できなければ、ここで止める(字幕のみには切り替えない)
    const synth = await createSynthesizer({ ...flags, readings: resolved.readings, startCommand: engineStart.command, onStart: engineStart.onStart });
    if (!flags.voice)
        log("読み上げ: なし(字幕のみ。動画の柱に「音声なし」と表示します)");
    if (synth instanceof VoicevoxSynthesizer) {
        // check で確かめた読みと一致しなければ、音声を作る前に止める
        const count = await verifyUnits(reportPath, freeSpeechUnits(loaded.raw.script, loaded.format.limits, loaded.facts), synth);
        log(`読み: check で確かめた読みと一致(${count} 文)`);
    }
    const persona = await choosePersona(flags);
    log(`口調: ${persona?.name ?? "丁寧語"}`);
    const issues = [
        ...checkFreeFile(loaded.raw, { format: loaded.format, persona, seconds: flags.seconds }).issues,
        ...files.issues,
        ...images.issues,
        ...readingIssues(resolved),
    ];
    for (const issue of issues)
        log(`注意: ${issue.at}: ${issue.message}`);
    const mismatch = flags.voice ? personaMismatch(loaded.raw.persona, flags.speaker) : undefined;
    if (mismatch)
        log(`注意: ${mismatch}`);
    const { outFile, workDir } = resolveRenderPaths({
        report: reportPath,
        title: loaded.script.title,
        out: flags.out,
        videoDir: flags.videoDir,
        workDir: flags.workDir,
    });
    await mkdir(workDir, { recursive: true });
    await mkdir(path.dirname(outFile), { recursive: true });
    const result = await renderFree({
        loaded,
        images: images.images,
        persona: persona ? { id: persona.id, name: persona.name } : loaded.raw.persona,
        readings: resolved.readings,
        bgm,
        sfx,
    }, {
        outFile,
        workDir,
        synth,
        speed: flags.speed,
        maxSpeed: MAX_SPEED,
        maxSeconds: flags.seconds * LENGTH_TOLERANCE,
        fps: flags.fps,
        chromiumPath: flags.chromium,
        timeZone: flags.timezone,
        onSpeechProgress: progress(flags.voice ? "音声合成" : "字幕の時間割り当て"),
        onFrameProgress: progress("描画"),
    });
    // 内容が本文の枠からあふれ、縮めたシーンと、最小まで縮めても収まらなかったシーンを知らせる(動画は作る)
    const { fitScales, overflows, blocked } = result.stats;
    const pages = fitScales.length;
    fitScales.forEach((scale, i) => {
        if (overflows[i])
            log(`注意: ${i + 1} / ${pages} ページは、${scale} 倍まで縮めても本文の枠に収まりません。文字を減らすか、上限を見直してください。`);
        else if (scale < 1)
            log(`注意: ${i + 1} / ${pages} ページは、本文の枠に収めるため ${scale} 倍に縮めました。`);
    });
    for (const url of blocked)
        log(`注意: 外部への読み込みを止めました(描画では外部と通信しません): ${url}`);
    log(`完了: ${result.outFile}(${result.duration.toFixed(1)} 秒、話速 ${result.speed}、撮影 ${result.stats.captured}/${result.stats.frames} フレーム)`);
    if (result.credit)
        log(`クレジット表記: ${result.credit}(VOICEVOX の利用規約により必要です)`);
    if (bgm?.credit)
        log(`BGM のクレジット: ${bgm.credit}`);
    process.stdout.write(`${result.outFile}\n`);
}
const formatCommand = program.command("format").description("自由形式の形式の定義を扱う");
formatCommand
    .command("init")
    .description("形式を作り始める。既定の値をすべて書いた format.json と、同梱のスタイルを写した style.css を作る")
    .argument("<dir>", "形式のフォルダー(なければ作る)")
    .option("--name <name>", "形式の名前(省略時はフォルダーの名前)")
    .option("--force", "既にある format.json と style.css を上書きする")
    .action(async (dir, flags) => {
    const root = path.resolve(dir);
    const formatFile = path.join(root, "format.json");
    const styleFile = path.join(root, "style.css");
    const existing = [formatFile, styleFile].filter((file) => existsSync(file));
    if (existing.length > 0 && !flags.force)
        throw new Error(`既にあります: ${existing.join("、")}。上書きするときは --force を付けてください。`);
    await mkdir(root, { recursive: true });
    const definition = defaultFormatDefinition(flags.name ?? path.basename(root), "style.css");
    await writeFile(formatFile, `${JSON.stringify(definition, null, 2)}\n`);
    const header = [
        "/*",
        " * 同梱のスタイル(base: paper)を写したもの。dopagakix format init が作成。",
        " * base が paper のままなら、同梱のスタイルの後にこのファイルを読み込むので、ここに書いた規則が上書きします。",
        " * base を none にすると、同梱のスタイルは読み込まず、このファイルだけで紙面を組みます。",
        " * 色と書体のトークン(:root の CSS 変数)、大きさ、動きの長さ(登場と罫線)は format.json の colors、fonts、size、motion に書きます。",
        " * 公開している要素とクラスの名前は docs/format.md を参照してください。",
        " */",
    ].join("\n");
    await writeFile(styleFile, `${header}\n${bundledFreeStyle(resolveFormat(definition)).trimStart()}`);
    log(`作りました: ${formatFile}、${styleFile}`);
    process.stdout.write(`${formatFile}\n`);
});
withSessionOptions(program.command("digest").description("セッションログを時系列のダイジェストにする(作業の振り返り用)"))
    .option("-o, --out <file>", "書き出し先(省略時は標準出力)")
    .option("--max-digest-chars <n>", "ダイジェストの最大文字数。超える場合はツールの出力から順に削る", positiveInteger, DEFAULT_MAX_DIGEST_CHARS)
    .option("--timezone <tz>", "時刻表示のタイムゾーン(例: Asia/Tokyo)")
    .action(async (flags) => {
    const result = await digestSession({ ...locateOptions(flags), maxDigestChars: flags.maxDigestChars, timeZone: flags.timezone });
    const notes = [
        `${result.digest.length.toLocaleString()} 文字`,
        result.level > 0 ? `文字数に合わせて要約度 ${result.level}` : undefined,
        result.omittedLines > 0 ? `${result.omittedLines} 行を省略` : undefined,
        result.redactions > 0 ? `秘匿情報らしき文字列 ${result.redactions} 件をマスク` : undefined,
    ].filter(Boolean);
    log(`ログ: ${result.file}`);
    log(`ダイジェスト: ${notes.join("、")}`);
    if (flags.out) {
        await mkdir(path.dirname(path.resolve(flags.out)), { recursive: true });
        await writeFile(flags.out, result.digest);
        log(`書き出しました: ${path.resolve(flags.out)}`);
    }
    else {
        process.stdout.write(result.digest);
    }
});
program
    .command("sessions")
    .description("プロジェクトのセッションログを新しい順に表示する")
    .option("-p, --project <dir>", "プロジェクトのディレクトリ", process.cwd())
    .option("-n, --limit <n>", "表示件数", positiveInteger, 10)
    .option("--timezone <tz>", "時刻表示のタイムゾーン")
    .action(async (flags) => {
    const transcripts = (await listTranscripts(flags.project)).slice(0, flags.limit);
    if (transcripts.length === 0) {
        log(`${path.resolve(flags.project)} のセッションログはありません。`);
        return;
    }
    for (const info of transcripts) {
        const session = await readTranscript(info.file);
        const size = `${Math.max(1, Math.round(info.size / 1024)).toLocaleString()} KB`;
        process.stdout.write(`${info.sessionId}  ${formatDateTime(info.modified.toISOString(), flags.timezone)}  ${size.padStart(9)}  ${session.title ?? "(無題)"}\n`);
    }
});
program
    .command("speakers")
    .description("VOICEVOX エンジンの話者とスタイル ID を表示する")
    .addOption(new Option("--voicevox-url <url>", "VOICEVOX エンジンの URL").default(DEFAULT_VOICEVOX_URL).env("VOICEVOX_URL"))
    .action(async (flags) => {
    const speakers = await new VoicevoxClient(flags.voicevoxUrl).speakers();
    for (const speaker of speakers) {
        for (const style of speaker.styles) {
            if (style.type && style.type !== "talk")
                continue;
            process.stdout.write(`${String(style.id).padStart(4)}  ${speaker.name}(${style.name})\n`);
        }
    }
    log("各キャラクターの利用規約を確認のうえで選んでください。動画には「VOICEVOX:キャラクター名」が表示されます。");
});
program
    .command("install-skill")
    .description(`Claude Code 用のスキル(${SKILL_NAME})を導入する。「動画で報告して」と頼むとエージェントが使う`)
    .option("-p, --project <dir>", "導入先のプロジェクト(<dir>/.claude/skills に入れる)", process.cwd())
    .option("--user", "個人用(~/.claude/skills)に入れ、すべてのプロジェクトで使えるようにする")
    .option("--force", "内容の異なる既存のスキルを上書きする")
    .action(async (flags) => {
    const target = skillsDir({ user: Boolean(flags.user), projectDir: flags.project });
    const newDirectory = !existsSync(target);
    const result = await installSkill({ target, force: flags.force });
    log({ installed: "導入しました", updated: "更新しました", unchanged: "既に同じ内容です" }[result.status] + `: ${result.dir}`);
    if (newDirectory) {
        log("実行中の Claude Code のセッションで使うには /reload-skills を実行してください(新しいセッションでは自動で読み込まれます)。");
    }
    process.stdout.write(`${result.dir}\n`);
});
program.parseAsync(process.argv).catch((error) => {
    log(`エラー: ${error instanceof Error ? error.message : String(error)}`);
    if (process.env.DEBUG && error instanceof Error && error.stack)
        log(error.stack);
    process.exitCode = 1;
});
