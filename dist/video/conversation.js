import { CONVERSATION_SCENE_LABELS } from "../conversation/schema.js";
import { formatDateTime } from "../util/time.js";
import { enter, escapeHtml, number, pageHtml, sectionHead, titleClass } from "./template.js";
/*
 * デザインの方針は docs/design.md を参照(「会話の要約」の節)。作業報告と同じ紙面の作法で組み、
 * 題字を「会話の要約」にする。数値は台本ではなく、発言を集めたプログラムが数えたもの(facts)だけを出す。
 */
/** 最初と最後の発言の間の長さ。1 時間未満は分、48 時間未満は時間、それ以上は日 */
export function formatSpan(first, last) {
    const minutes = Math.max(0, Math.round((Date.parse(last) - Date.parse(first)) / 60_000));
    if (!Number.isFinite(minutes))
        return { value: "-", unit: "" };
    if (minutes < 60)
        return { value: String(minutes), unit: "分" };
    const hours = minutes / 60;
    if (hours < 48)
        return { value: hours >= 10 ? String(Math.round(hours)) : hours.toFixed(1), unit: "時間" };
    return { value: String(Math.round(hours / 24)), unit: "日" };
}
/** 期間の表示。同じ日なら終わりは時刻だけ、日をまたぐなら月日も付ける */
export function formatPeriod(facts, timeZone) {
    const start = formatDateTime(facts.firstMessageAt, timeZone);
    const end = formatDateTime(facts.lastMessageAt, timeZone);
    if (!start)
        return "";
    return `${start} – ${end.slice(0, 10) === start.slice(0, 10) ? end.slice(11) : end.slice(5)}`;
}
function openingScene(script, facts, timeZone) {
    const span = formatSpan(facts.firstMessageAt, facts.lastMessageAt);
    const period = formatPeriod(facts, timeZone);
    return `
    <h1 ${enter(titleClass(script.title), 0)}>${escapeHtml(script.title)}</h1>
    <div class="facts">
      <div class="rule rule-in" style="--i:1"></div>
      <div ${enter("fact-row", 2)}>
        <div class="fact-label">要旨</div>
        <div class="fact-body"><p class="lede gist">${escapeHtml(script.headline)}</p></div>
      </div>
      <div class="rule thin rule-in" style="--i:3"></div>
      <div ${enter("figures even", 4)}>
        <div class="figure"><div class="fact-label">参加者</div><div class="num">${number(facts.participants)}<small>人</small></div></div>
        <div class="figure"><div class="fact-label">発言</div><div class="num">${number(facts.messages)}<small>件</small></div></div>
        <div class="figure"><div class="fact-label">期間</div><div class="num">${span.value}<small>${span.unit}</small></div></div>
      </div>
      <div class="rule thin rule-in" style="--i:5"></div>
    </div>
    ${period ? `<div ${enter("when", 6)}>${escapeHtml(period)}</div>` : ""}`;
}
const rows = (items, mark, cls = "row", from = 1) => items.map((item, i) => `<li ${enter(cls, i + from)}>${mark(i)}<span class="row-text">${escapeHtml(item)}</span></li>`).join("");
function sceneBody(scene) {
    const head = () => sectionHead(CONVERSATION_SCENE_LABELS[scene.type]);
    switch (scene.type) {
        case "topic":
            // 見出しの上に「話題」のラベルを重ねない(docs/design.md の「避けるもの」)。罫線の下に、話題の見出しを大きく置く
            return `<div class="section"><div class="rule rule-in"></div><h2 ${enter("topic-heading", 0)}>${escapeHtml(scene.heading || CONVERSATION_SCENE_LABELS.topic)}</h2></div>
    <div class="topic-lines">${scene.lines.map((line, i) => `<p ${enter("topic-line", i + 1)}>${escapeHtml(line)}</p>`).join("")}</div>`;
        case "flow":
            // 時間の順に並べる。番号は順序を示すだけで、数値の主張ではない
            return `${head()}<ol class="rows flow-rows">${rows(scene.items, (i) => `<span class="num-mark">${i + 1}</span>`)}</ol>`;
        case "quote":
            return `${head()}
    <figure ${enter("quote", 1)}>
      <blockquote class="quote-text">${escapeHtml(scene.text)}</blockquote>
      ${scene.by ? `<figcaption class="quote-by">${escapeHtml(scene.by)}</figcaption>` : ""}
    </figure>`;
        case "points":
            return `${head()}
    <p ${enter("point", 1)}><span class="hl">${escapeHtml(scene.point)}</span></p>
    ${scene.opinions.length ? `<ul class="rows opinions">${rows(scene.opinions, () => '<span class="dash">―</span>', "row", 2)}</ul>` : ""}`;
        case "outcome": {
            const group = (label, cls, mark, items, from) => items.length
                ? `<div class="outcome ${cls}"><div ${enter("outcome-label", from)}>${label}</div>` +
                    `<ul class="rows">${rows(items, () => `<span class="check-mark">${mark}</span>`, "row", from + 1)}</ul></div>`
                : "";
            return `${head()}
    ${group("決まったこと", "decided", "○", scene.decided, 1)}
    ${group("残ったこと", "open", "△", scene.open, scene.decided.length + 2)}`;
        }
    }
}
function closingScene(facts, credit, timeZone) {
    const credits = [
        // AI が会話を要約したもので、誤りがありうることと、数値の出どころを明記する
        "要約: AI による要約。内容に誤りがある場合があります。数値は要約に使った発言から自動集計",
        credit ? `音声: ${credit}` : undefined,
        [facts.channel, formatPeriod(facts, timeZone)].filter(Boolean).join(" ・ "),
    ]
        .filter(Boolean)
        .map((line) => `<div>${escapeHtml(line)}</div>`)
        .join("");
    return `
    <div ${enter("end-mark", 1)}>以上</div>
    <div ${enter("credits", 2)}>${credits}</div>`;
}
/** 会話の要約に固有のスタイル。色と書体は作業報告と同じトークンだけを使う */
const CONVERSATION_STYLE = String.raw `
.lede.gist { margin-top: 0; color: var(--ink); font-weight: 700; }
.figures.even { grid-template-columns: 1fr 1fr 1fr; }
.topic-heading {
  font-family: var(--serif); font-weight: 900; font-size: calc(72 * var(--u)); line-height: 1.3;
  font-feature-settings: "palt"; text-wrap: balance;
}
.topic-lines { display: flex; flex-direction: column; gap: calc(14 * var(--u)); border-top: 1px solid var(--rule); padding-top: calc(28 * var(--u)); }
.topic-line { font-size: calc(44 * var(--u)); font-weight: 500; line-height: 1.6; color: var(--ink-2); text-wrap: pretty; }
/* 引用: 明朝の大きな文字を鉤括弧で囲む。枠・色帯・背景の塗りは使わない */
.quote { display: flex; flex-direction: column; gap: calc(28 * var(--u)); padding-top: calc(12 * var(--u)); }
.quote-text {
  font-family: var(--serif); font-weight: 700; font-size: calc(58 * var(--u)); line-height: 1.6;
  font-feature-settings: "palt"; text-wrap: pretty; text-indent: -0.5em; padding-left: 0.5em;
}
.quote-text::before { content: "「"; }
.quote-text::after { content: "」"; }
.quote-by { align-self: flex-end; font-size: calc(36 * var(--u)); font-weight: 700; color: var(--ink-2); }
.quote-by::before { content: "― "; color: var(--ink-3); }
.point { font-size: calc(52 * var(--u)); font-weight: 900; line-height: 1.45; text-wrap: balance; }
/* 論点は蛍光ペンの下線で示す(判断事項と同じ --marker) */
.point .hl { background: linear-gradient(transparent 62%, var(--marker) 62%); -webkit-box-decoration-break: clone; box-decoration-break: clone; }
.opinions .row, .outcome .row { grid-template-columns: calc(56 * var(--u)) 1fr; }
.dash { font-family: var(--serif); font-weight: 700; font-size: calc(40 * var(--u)); color: var(--ink-3); }
.outcome { display: flex; flex-direction: column; gap: calc(6 * var(--u)); }
.outcome-label { font-size: calc(30 * var(--u)); font-weight: 700; color: var(--ink-2); letter-spacing: 0.04em; }
.outcome.decided .check-mark { color: var(--pass); }
.outcome.open .check-mark { color: #9a6200; }
`;
/** 会話の要約の動画 1 本分のページを作る。フォントは /fonts/ 以下から読み込む前提。 */
export function buildConversationHtml(input) {
    const { script, facts, scenes, credit, silent, timeZone } = input;
    // 冒頭と締めの間のシーンは、台本の scenes と同じ順に並ぶ
    let body = 0;
    const bodies = scenes.map((scene) => {
        if (scene.kind === "opening")
            return openingScene(script, facts, timeZone);
        if (scene.kind === "closing")
            return closingScene(facts, credit, timeZone);
        const content = script.scenes[body++];
        return content ? sceneBody(content) : "";
    });
    return pageHtml({
        mastTitle: "会話の要約",
        date: formatDateTime(facts.lastMessageAt, timeZone).slice(0, 10).replaceAll("/", "."),
        bodies,
        scenes,
        where: facts.channel ?? "",
        labels: ["AI による要約", credit, silent ? "音声なし" : undefined].filter((l) => Boolean(l)),
        extraStyle: CONVERSATION_STYLE,
    });
}
