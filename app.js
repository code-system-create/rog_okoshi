const SAMPLE_TRANSCRIPT = `山田: 今日はよろしくお願いします。
佐藤: よろしくお願いします。
山田: まず、今回のプロジェクトの概要を教えてください。
佐藤: えーと、社内のインタビュー記事をもっと早く整えるために、文字起こしを見やすい形に変える仕組みを考えています。
山田: その背景にはどんな課題がありましたか。
佐藤: うーん、毎回手作業で整えていて時間がかかっていたのと、担当者ごとに書式が少しずつ違っていました。
山田: なるほど。今後はどう改善したいですか。
佐藤: 事実を説明しているところの余分なフィラーは減らしつつ、迷って考えているニュアンスは残したいです。`;

const interviewerNameInput = document.querySelector("#interviewerName");
const inputTranscript = document.querySelector("#inputTranscript");
const outputTranscript = document.querySelector("#outputTranscript");
const statusMessage = document.querySelector("#statusMessage");

document.querySelector("#formatButton").addEventListener("click", handleFormat);
document.querySelector("#loadSampleButton").addEventListener("click", loadSample);
document.querySelector("#clearButton").addEventListener("click", clearAll);
document.querySelector("#copyButton").addEventListener("click", copyOutput);
document.querySelector("#downloadButton").addEventListener("click", downloadOutput);

function loadSample() {
  interviewerNameInput.value = "山田";
  inputTranscript.value = SAMPLE_TRANSCRIPT;
  handleFormat();
}

function clearAll() {
  interviewerNameInput.value = "";
  inputTranscript.value = "";
  outputTranscript.value = "";
  setStatus("");
}

function handleFormat() {
  const rawText = inputTranscript.value.trim();
  const interviewerName = interviewerNameInput.value.trim();

  if (!rawText) {
    outputTranscript.value = "";
    setStatus("文字起こしテキストを入力してください。");
    return;
  }

  const segments = parseTranscript(rawText);

  if (segments.length === 0) {
    outputTranscript.value = "";
    setStatus("話者つきのテキストとして読み取れませんでした。入力形式を確認してください。");
    return;
  }

  const resolvedInterviewer = interviewerName || segments[0].speaker;
  const normalizedSegments = mergeConsecutiveSegments(
    segments.map((segment) => ({
      ...segment,
      text: cleanSpeechText(segment.text, {
        trimFiller: true,
        keepThinkingFiller: true,
      }),
    })),
  );

  outputTranscript.value = renderInterview(normalizedSegments, resolvedInterviewer);
  setStatus(`整形しました。インタビュアーは「${resolvedInterviewer}」として扱っています。`);
}

function parseTranscript(rawText) {
  const lines = rawText
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isIgnorableTranscriptLine(line));

  const segments = [];

  for (const line of lines) {
    const parsed = parseSpeakerLine(line);

    if (parsed) {
      segments.push(parsed);
      continue;
    }

    if (segments.length > 0) {
      segments[segments.length - 1].text += ` ${line}`;
    }
  }

  return segments;
}

function isIgnorableTranscriptLine(line) {
  if (line === "WEBVTT") {
    return true;
  }

  if (/^\d+$/.test(line)) {
    return true;
  }

  if (/^\d{2}:\d{2}:\d{2}[.,]\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}[.,]\d{3}$/.test(line)) {
    return true;
  }

  if (/^\d{2}:\d{2}[.,]\d{3}\s+-->\s+\d{2}:\d{2}[.,]\d{3}$/.test(line)) {
    return true;
  }

  return false;
}

function parseSpeakerLine(line) {
  const colonMatch = line.match(/^([^:：]{1,60})[:：]\s*(.+)$/);
  if (colonMatch) {
    return {
      speaker: normalizeSpeakerName(colonMatch[1]),
      text: colonMatch[2].trim(),
    };
  }

  const timedMatch = line.match(/^(.+?)\s+(\d{1,2}:\d{2}(?::\d{2})?)\s+(.+)$/);
  if (timedMatch) {
    return {
      speaker: normalizeSpeakerName(timedMatch[1]),
      text: timedMatch[3].trim(),
    };
  }

  return null;
}

function normalizeSpeakerName(name) {
  return name.replace(/\s+/g, " ").trim();
}

function cleanSpeechText(text, options) {
  let cleaned = text.replace(/\s+/g, " ").trim();

  if (!options.keepThinkingFiller) {
    cleaned = cleaned.replace(/(^|[。、「\s])(うーん|えー|えーと|えっと|あのー|そのー|まあ)(?=[、。\s]|$)/g, "$1");
  }

  if (options.trimFiller) {
    cleaned = cleaned
      .replace(/(^|[。]\s*)(えーと|えっと|あのー|そのー|まあ、?|えー、?)(?=\s|[^ぁ-んァ-ヶ一-龠]|$)/g, "$1")
      .replace(/([。]\s*)(えーと|えっと|あのー|そのー|まあ、?|えー、?)(?=\s|[^ぁ-んァ-ヶ一-龠]|$)/g, "$1");
  }

  cleaned = cleaned
    .replace(/\s+([、。])/g, "$1")
    .replace(/、{2,}/g, "、")
    .replace(/。\s*、/g, "。")
    .replace(/、\s*。/g, "。")
    .replace(/。\s*。/g, "。")
    .replace(/([。？])\s*([。？])/g, "$2")
    .replace(/\s+([？])/g, "$1")
    .replace(/^[、\s]+/g, "")
    .replace(/^(と|で|あの|えっと)\s*/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  return cleaned;
}

function normalizeInterviewerText(text) {
  const acknowledgmentOnlyPatterns = [
    /^ありがとうございます[。！!]?$/,
    /^なるほど[。！!]?$/,
    /^そうですね[。！!]?$/,
    /^はい[。！!]?$/,
    /^あ[。！!]?はい[。！!]?$/,
    /^すみません[。！!]?$/,
    /^19歳はい[。！!]?$/,
  ];

  if (acknowledgmentOnlyPatterns.some((pattern) => pattern.test(text))) {
    return "";
  }

  let normalized = text
    .replace(/^(なるほど[、。]?\s*)?(ありがとうございます[。！!]?[\s]*)+/g, "")
    .replace(/^(ありがとうございますと[\s]*)+/g, "")
    .replace(/^そうしましたら、?\s*/g, "")
    .replace(/^とそうしましたら、?\s*/g, "")
    .replace(/^続きまして、?\s*/g, "")
    .replace(/^えっと、?そうしましたら\s*/g, "")
    .replace(/^えっと、?続きまして\s*/g, "")
    .trim();

  normalized = normalized
    .replace(/^(と|で)\s+/g, "")
    .replace(/^と(?=[^ぁ-んァ-ヶー])/g, "")
    .replace(/^の(?=[^ぁ-んァ-ヶー])/g, "")
    .replace(/^の役職としては/g, "役職としては")
    .replace(/^と現在/g, "現在")
    .trim();

  normalized = normalizeInterviewerQuestionEnding(normalized);

  return normalized;
}

function normalizeInterviewerQuestionEnding(text) {
  if (!text) {
    return "";
  }

  const normalizedBase = text.replace(/[。？！!?]+$/g, "").trim();
  const questionLikeEnding =
    /(でしょうか|ますか|ですか|ないですか|ありますか|ございますか|いかがですか|教えていただけますか|お伺いできますか|お聞かせください|教えてください|どうでしょうか|大丈夫|どのようなお役職|どういったお役職|何歳|ご年齢)$/;
  const questionLikeCue =
    /(でしょうか|ますか|ですか|ありますか|ございますか|教えていただけますか|お伺いできますか|いかがですか|どのよう|どういった|何か|いつ頃|どこまで|大丈夫)/;

  if (/[？?]$/.test(text)) {
    return text.replace(/[？?]+$/g, "？");
  }

  if (questionLikeEnding.test(normalizedBase) || questionLikeCue.test(normalizedBase)) {
    return normalizedBase + "？";
  }

  return text;
}

function mergeConsecutiveSegments(segments) {
  if (segments.length === 0) {
    return [];
  }

  return segments.reduce((merged, segment) => {
    const last = merged[merged.length - 1];

    if (last && last.speaker === segment.speaker) {
      last.text = `${last.text} ${segment.text}`.trim();
      return merged;
    }

    merged.push({ ...segment });
    return merged;
  }, []);
}

function renderInterview(segments, interviewerName) {
  const blocks = [];
  let currentQuestion = null;

  for (const segment of segments) {
    const isInterviewer = segment.speaker === interviewerName;

    if (isInterviewer) {
      const questionText = normalizeInterviewerText(segment.text);

      if (!questionText) {
        continue;
      }

      if (currentQuestion) {
        blocks.push(currentQuestion);
      }

      currentQuestion = {
        question: `・${questionText}`,
        answers: [],
      };
      continue;
    }

    if (!currentQuestion) {
      currentQuestion = {
        question: "・（冒頭確認）",
        answers: [],
      };
    }

    currentQuestion.answers.push(segment.text);
  }

  if (currentQuestion) {
    blocks.push(currentQuestion);
  }

  return blocks
    .map((block) => [block.question, ...block.answers].filter(Boolean).join("\n"))
    .join("\n\n");
}

async function copyOutput() {
  if (!outputTranscript.value) {
    setStatus("先に整形結果を作成してください。");
    return;
  }

  try {
    await navigator.clipboard.writeText(outputTranscript.value);
    setStatus("整形結果をコピーしました。");
  } catch (error) {
    setStatus("コピーに失敗しました。ブラウザの権限設定を確認してください。");
  }
}

function downloadOutput() {
  if (!outputTranscript.value) {
    setStatus("先に整形結果を作成してください。");
    return;
  }

  const blob = new Blob([outputTranscript.value], { type: "text/plain;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = "formatted-interview.txt";
  anchor.click();
  URL.revokeObjectURL(url);
  setStatus("txtファイルを保存しました。");
}

function setStatus(message) {
  statusMessage.textContent = message;
}
