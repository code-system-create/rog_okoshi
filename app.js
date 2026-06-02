const SAMPLE_TRANSCRIPT = `インタビュー担当: 今日はよろしくお願いします。
佐藤: よろしくお願いします。
インタビュー担当: まず、今回のプロジェクトの概要を教えてください。
佐藤: えーと、社内のインタビュー記事をもっと早く整えるために、文字起こしを見やすい形に変える仕組みを考えています。
インタビュー担当: その背景にはどんな課題がありましたか。
佐藤: うーん、毎回手作業で整えていて時間がかかっていたのと、担当者ごとに書式が少しずつ違っていました。
インタビュー担当: なるほど。今後はどう改善したいですか。
佐藤: 事実を説明しているところの余分なフィラーは減らしつつ、迷って考えているニュアンスは残したいです。`;

const inputTranscript = document.querySelector("#inputTranscript");
const outputTranscript = document.querySelector("#outputTranscript");
const statusMessage = document.querySelector("#statusMessage");
const DEFAULT_INTERVIEWER_NAME = "インタビュー担当";
const GLOBAL_ACKNOWLEDGMENTS = [/ありがとうございます/g, /ありがとうございました/g];
const INTERVIEWER_SAFE_PREFIX_PATTERNS = [
  /^(そうしましたら[、。]?\s*)+/,
  /^(それでは[、。]?\s*)+/,
  /^(続きまして[、。]?\s*)+/,
  /^(続いて[、。]?\s*)+/,
  /^(ではまず[、。]?\s*)+/,
  /^(えっと[、。]?\s*)+/,
  /^(えーっと[、。]?\s*)+/,
  /^(えーと[、。]?\s*)+/,
  /^(ええと[、。]?\s*)+/,
  /^(えと[、。]?\s*)+/,
  /^(あのー?[、。]?\s*)+/,
  /^(そのー[、。]?\s*)+/,
];
const INTERVIEWER_CONDITIONAL_PREFIX_PATTERNS = [
  /^(なるほど[、。]?\s*)+/,
  /^(そうですね[、。]?\s*)+/,
  /^(あ、?はい[、。]?\s*)+/,
  /^(はい[、。]?\s*)+/,
  /^(すみません[、。]?\s*)+/,
  /^(失礼しました[、。]?\s*)+/,
  /^(では[、。]?\s*)+/,
  /^(じゃあ[、。]?\s*)+/,
  /^(まあ[、。]?\s*)+/,
  /^(ちょっと[、。]?\s*)+/,
  /^(一旦[、。]?\s*)+/,
  /^(ちなみに[、。]?\s*)+/,
  /^(次に[、。]?\s*)+/,
];
const INTERVIEWER_SINGLE_SEGMENT_DROP_PATTERNS = [
  /^ありがとうございます[。！!]?$/,
  /^ありがとうございました[。！!]?$/,
  /^なるほど[。！!]?$/,
  /^そうですね[。！!]?$/,
  /^はい[。！!]?$/,
  /^あ[。！!]?はい[。！!]?$/,
  /^すみません[。！!]?$/,
  /^失礼しました[。！!]?$/,
  /^19歳はい[。！!]?$/,
];
const INTERVIEWER_INLINE_FILLER_PATTERNS = [
  /([、。？！]\s*)(えっと|えーっと|えーと|ええと|えと|あの|あのー|そのー)([、。？！]\s*)/g,
  /([、。？！]\s*)(なるほど|そうですね|はい|あ、?はい|すみません|失礼しました|では|じゃあ|まあ|ちなみに)([、。？！]\s*)/g,
];

document.querySelector("#formatButton").addEventListener("click", handleFormat);
document.querySelector("#loadSampleButton").addEventListener("click", loadSample);
document.querySelector("#clearButton").addEventListener("click", clearAll);
document.querySelector("#copyButton").addEventListener("click", copyOutput);
document.querySelector("#downloadButton").addEventListener("click", downloadOutput);

function loadSample() {
  inputTranscript.value = SAMPLE_TRANSCRIPT;
  handleFormat();
}

function clearAll() {
  inputTranscript.value = "";
  outputTranscript.value = "";
  setStatus("");
}

function handleFormat() {
  const rawText = inputTranscript.value.trim();

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

  const normalizedSegments = mergeConsecutiveSegments(
    segments.map((segment) => ({
      ...segment,
      text: cleanSpeechText(segment.text),
    })),
  );

  outputTranscript.value = renderInterview(normalizedSegments, DEFAULT_INTERVIEWER_NAME);
  setStatus(`成形しました。インタビュアーは「${DEFAULT_INTERVIEWER_NAME}」として扱っています。`);
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

function cleanSpeechText(text) {
  let cleaned = text.replace(/\s+/g, " ").trim();

  return cleanupDanglingPunctuation(cleaned);
}

function normalizeInterviewerText(text) {
  let normalized = normalizeInterviewerLeadingFillers(text);

  if (!normalized) {
    return "";
  }

  normalized = removeInterviewerInlineFillers(normalized);
  normalized = cleanupDanglingPunctuation(normalized);
  normalized = normalizeInterviewerQuestionEnding(normalized);
  normalized = cleanupDanglingPunctuation(normalized);

  return normalized;
}

function normalizeInterviewerLeadingFillers(text) {
  let normalized = text;
  let previous = null;

  while (normalized !== previous) {
    previous = normalized;
    normalized = removeGlobalAcknowledgments(normalized);
    normalized = cleanupDanglingPunctuation(normalized);

    if (INTERVIEWER_SINGLE_SEGMENT_DROP_PATTERNS.some((pattern) => pattern.test(normalized))) {
      return "";
    }

    normalized = stripInterviewerPrefixes(normalized);
    normalized = normalized
      .replace(/^とそうしましたら[、。]?\s*/g, "")
      .replace(/^えっと[、。]?\s*そうしましたら[、。]?\s*/g, "")
      .replace(/^えっと[、。]?\s*続きまして[、。]?\s*/g, "")
      .replace(/^ありがとうございますと/g, "")
      .replace(/^と(?=現在)/g, "")
      .replace(/^の(?=役職としては)/g, "")
      .replace(/^の役職としては/g, "役職としては")
      .replace(/^(と|で)\s+/g, "")
      .trim();

    normalized = cleanupDanglingPunctuation(normalized);
  }

  return normalized;
}

function removeGlobalAcknowledgments(text) {
  return GLOBAL_ACKNOWLEDGMENTS.reduce(
    (current, pattern) => current.replace(pattern, " "),
    text,
  );
}

function stripInterviewerPrefixes(text) {
  let normalized = text;
  let previous = null;

  while (normalized !== previous) {
    previous = normalized;

    for (const pattern of INTERVIEWER_SAFE_PREFIX_PATTERNS) {
      normalized = normalized.replace(pattern, "");
    }

    for (const pattern of INTERVIEWER_CONDITIONAL_PREFIX_PATTERNS) {
      normalized = normalized.replace(pattern, "");
    }
  }

  return normalized.trim();
}

function removeInterviewerInlineFillers(text) {
  let normalized = text;
  let previous = null;

  while (normalized !== previous) {
    previous = normalized;

    for (const pattern of INTERVIEWER_INLINE_FILLER_PATTERNS) {
      normalized = normalized.replace(pattern, (_, left, __, right) =>
        selectRemainingPunctuation(left, right),
      );
    }

    normalized = cleanupDanglingPunctuation(normalized);
  }

  return normalized;
}

function selectRemainingPunctuation(left, right) {
  const leftTrimmed = left.trim();
  const rightTrimmed = right.trim();
  const combined = `${leftTrimmed}${rightTrimmed}`;

  if (/[。？！]/.test(combined)) {
    if (/[。]/.test(combined)) {
      return "。";
    }

    if (/[？]/.test(combined)) {
      return "？";
    }

    if (/[！]/.test(combined)) {
      return "！";
    }
  }

  return "、";
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

function cleanupDanglingPunctuation(text) {
  let normalized = text
    .replace(/\s+([、。？！])/g, "$1")
    .replace(/([、。？！])\s+([、。？！])/g, "$2")
    .replace(/、{2,}/g, "、")
    .replace(/。{2,}/g, "。")
    .replace(/？{2,}/g, "？")
    .replace(/！{2,}/g, "！")
    .replace(/。\s*、/g, "。")
    .replace(/、\s*。/g, "。")
    .replace(/。\s*。/g, "。")
    .replace(/？\s*？/g, "？")
    .replace(/！\s*！/g, "！")
    .replace(/^[、。？！\s]+/g, "")
    .replace(/\s{2,}/g, " ")
    .trim();

  let previous = null;

  while (normalized !== previous) {
    previous = normalized;
    normalized = normalized
      .replace(/([ぁ-んァ-ヶ一-龠々ー])\s+([ぁ-んァ-ヶ一-龠々ー])/g, "$1$2")
      .replace(/([ぁ-んァ-ヶ一-龠々ー])\s+([、。？！])/g, "$1$2")
      .replace(/([、。？！])\s+([ぁ-んァ-ヶ一-龠々ー])/g, "$1$2")
      .replace(/\(\s+/g, "(")
      .replace(/\s+\)/g, ")");
  }

  return normalized;
}

function cleanupBulletQuestion(text) {
  return text.replace(/^[、。？！\s]+/g, "").trim();
}

function formatQuestionBullet(text) {
  return `・${text}`.replace(/^・[、。？！\s]+/g, "・").trim();
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
      const questionText = cleanupBulletQuestion(normalizeInterviewerText(segment.text));

      if (!questionText) {
        continue;
      }

      if (currentQuestion) {
        blocks.push(currentQuestion);
      }

      currentQuestion = {
        question: formatQuestionBullet(questionText),
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
    setStatus("先に成形結果を作成してください。");
    return;
  }

  try {
    await navigator.clipboard.writeText(outputTranscript.value);
    setStatus("成形結果をコピーしました。");
  } catch (error) {
    setStatus("コピーに失敗しました。ブラウザの権限設定を確認してください。");
  }
}

function downloadOutput() {
  if (!outputTranscript.value) {
    setStatus("先に成形結果を作成してください。");
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
