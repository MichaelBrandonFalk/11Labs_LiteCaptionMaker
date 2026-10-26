const API_URL = "https://api.elevenlabs.io/v1/speech-to-text";
const MAX_CUE_SECS = 5;
const MAX_CUE_CHARS = 84;
const GAP_SPLIT_SECS = 1;
const SENTENCE_END = [".", "?", "!", "..."];

let selectedFile = null;

const els = {
  apiKey: document.getElementById("apiKey"),
  testConnectionButton: document.getElementById("testConnectionButton"),
  connectionStatus: document.getElementById("connectionStatus"),
  language: document.getElementById("language"),
  numSpeakers: document.getElementById("numSpeakers"),
  model: document.getElementById("model"),
  diarize: document.getElementById("diarize"),
  tagEvents: document.getElementById("tagEvents"),
  fileInput: document.getElementById("fileInput"),
  dropZone: document.getElementById("dropZone"),
  runButton: document.getElementById("runButton"),
  clearButton: document.getElementById("clearButton"),
  status: document.getElementById("status"),
  results: document.getElementById("results"),
  formats: {
    srt: document.getElementById("srt"),
    vtt: document.getElementById("vtt"),
    docx: document.getElementById("docx"),
    json: document.getElementById("json"),
  },
};

els.apiKey.addEventListener("input", () => setConnectionStatus("Connection not tested."));

els.testConnectionButton.addEventListener("click", async () => {
  const apiKey = els.apiKey.value.trim();
  if (!apiKey) {
    setConnectionStatus("Add your ElevenLabs API key first.", "error");
    return;
  }
  els.testConnectionButton.disabled = true;
  els.runButton.disabled = true;
  els.apiKey.disabled = true;
  setConnectionStatus("Checking ElevenLabs...");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);
  try {
    const response = await fetch("https://api.elevenlabs.io/v1/user", {
      headers: { "xi-api-key": apiKey },
      signal: controller.signal,
      cache: "no-store",
    });
    if (response.status === 200) {
      setConnectionStatus("Connection successful. API key verified. No audio uploaded.", "success");
    } else {
      const body = await response.json().catch(() => ({}));
      const detail = body.detail && typeof body.detail === "object" ? body.detail : body;
      const code = detail.status || detail.code || "";
      const reason = safeConnectionReason(detail.message || (typeof body.detail === "string" ? body.detail : ""), apiKey);
      if ([400, 401, 403].includes(response.status) && code === "missing_permissions") {
        setConnectionStatus("ElevenLabs is reachable; this key is restricted. Speech-to-text permission was not verified.");
      } else if ([400, 401, 403].includes(response.status) && code === "invalid_api_key") {
        setConnectionStatus("ElevenLabs rejected this API key. Copy the full secret key, not the masked preview, and check that it is enabled.", "error");
      } else if ([401, 403].includes(response.status)) {
        setConnectionStatus(`ElevenLabs denied access (HTTP ${response.status}). ${reason || "Check your API key and permissions."}`, "error");
      } else if (response.status === 429) {
        setConnectionStatus("ElevenLabs is rate-limiting requests. Try again shortly.", "error");
      } else {
        setConnectionStatus(`ElevenLabs rejected the connection check (HTTP ${response.status}). ${reason || "No error explanation was returned. Try the desktop connection test to compare."}`, "error");
      }
    }
  } catch (error) {
    setConnectionStatus(error.name === "AbortError"
      ? "Connection check timed out. Check your network and try again."
      : "Could not reach ElevenLabs. Check your network or use the desktop app if your browser blocks the request.", "error");
  } finally {
    clearTimeout(timeout);
    els.testConnectionButton.disabled = false;
    els.runButton.disabled = false;
    els.apiKey.disabled = false;
  }
});

function setConnectionStatus(message, kind = "") {
  els.connectionStatus.textContent = message;
  els.connectionStatus.className = `status ${kind}`.trim();
}

function safeConnectionReason(value, apiKey) {
  if (typeof value !== "string") return "";
  return value.split(apiKey).join("[redacted]")
    .replace(/sk_[A-Za-z0-9_-]+/g, "[redacted]")
    .replace(/\s+/g, " ").slice(0, 300);
}

els.fileInput.addEventListener("change", () => {
  selectedFile = els.fileInput.files[0] || null;
  setStatus(selectedFile ? `Ready: ${selectedFile.name}` : "Waiting for an MP3 and API key.");
});

for (const eventName of ["dragenter", "dragover"]) {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.add("dragging");
  });
}

for (const eventName of ["dragleave", "drop"]) {
  els.dropZone.addEventListener(eventName, (event) => {
    event.preventDefault();
    els.dropZone.classList.remove("dragging");
  });
}

els.dropZone.addEventListener("drop", (event) => {
  selectedFile = event.dataTransfer.files[0] || null;
  if (selectedFile && !selectedFile.name.toLowerCase().endsWith(".mp3")) {
    selectedFile = null;
    setStatus("Only .mp3 files are supported in V1.", "error");
    return;
  }
  setStatus(selectedFile ? `Ready: ${selectedFile.name}` : "Waiting for an MP3 and API key.");
});

els.clearButton.addEventListener("click", () => {
  selectedFile = null;
  els.fileInput.value = "";
  els.results.innerHTML = "";
  setStatus("Waiting for an MP3 and API key.");
});

els.runButton.addEventListener("click", async () => {
  const apiKey = els.apiKey.value.trim();
  if (!apiKey) {
    setStatus("Add your ElevenLabs API key first.", "error");
    return;
  }
  if (!selectedFile) {
    setStatus("Choose or drop an MP3 first.", "error");
    return;
  }
  if (!Object.values(els.formats).some((checkbox) => checkbox.checked)) {
    setStatus("Select at least one output format.", "error");
    return;
  }

  els.runButton.disabled = true;
  els.testConnectionButton.disabled = true;
  els.results.innerHTML = "";
  setStatus("Uploading to ElevenLabs. Long files can take several minutes.");

  try {
    const result = await transcribe(selectedFile, apiKey);
    const transcript = buildTranscript(result);
    const stem = selectedFile.name.replace(/\.[^.]+$/, "");
    const downloads = [];
    if (els.formats.srt.checked) downloads.push(fileDownload(`${stem}.srt`, renderSrt(transcript), "text/plain"));
    if (els.formats.vtt.checked) downloads.push(fileDownload(`${stem}.vtt`, renderVtt(transcript), "text/vtt"));
    if (els.formats.docx.checked) downloads.push(await docxDownload(`${stem}.docx`, transcript));
    if (els.formats.json.checked) {
      downloads.push(fileDownload(`${stem}.raw.json`, JSON.stringify(result, null, 2), "application/json"));
    }
    renderDownloads(downloads);
    setStatus(`Finished ${selectedFile.name}. Download your deliverables below.`, "success");
  } catch (error) {
    setStatus(friendlyError(error), "error");
  } finally {
    els.runButton.disabled = false;
    els.testConnectionButton.disabled = false;
  }
});

async function transcribe(file, apiKey) {
  const data = new FormData();
  data.append("file", file, file.name);
  data.append("model_id", els.model.value);
  data.append("diarize", String(els.diarize.checked));
  data.append("timestamps_granularity", "word");
  data.append("tag_audio_events", String(els.tagEvents.checked));
  if (els.language.value.trim()) data.append("language_code", els.language.value.trim());
  if (els.numSpeakers.value.trim()) data.append("num_speakers", els.numSpeakers.value.trim());

  const response = await fetch(API_URL, {
    method: "POST",
    headers: { "xi-api-key": apiKey },
    body: data,
  });
  if (!response.ok) {
    let detail = await response.text();
    try {
      detail = JSON.stringify(JSON.parse(detail));
    } catch {
      // Keep plain text details.
    }
    throw new Error(`ElevenLabs returned HTTP ${response.status}: ${detail}`);
  }
  return response.json();
}

function buildTranscript(result) {
  const tokens = (result.words || []).filter((word) =>
    ["word", "audio_event"].includes(word.type) && word.start != null && word.end != null
  );
  const speakers = new Set(tokens.map((word) => word.speaker_id).filter(Boolean));
  const cues = [];
  let current = [];
  let currentLength = 0;

  const flush = () => {
    if (!current.length) return;
    const text = current.map(tokenText).join(" ").replace(/\s+/g, " ").trim();
    cues.push({
      index: cues.length + 1,
      start: current[0].start,
      end: current[current.length - 1].end,
      text,
      speakerId: current[0].speaker_id || null,
      isAudioEvent: current.every((word) => word.type === "audio_event"),
    });
  };

  for (const word of tokens) {
    if (current.length) {
      const previous = current[current.length - 1];
      const previousText = tokenText(previous).trim();
      const split =
        word.speaker_id !== previous.speaker_id ||
        word.start - previous.end > GAP_SPLIT_SECS ||
        word.end - current[0].start > MAX_CUE_SECS ||
        currentLength >= MAX_CUE_CHARS ||
        (SENTENCE_END.some((ending) => previousText.endsWith(ending)) && currentLength > 30);
      if (split) {
        flush();
        current = [];
        currentLength = 0;
      }
    }
    current.push(word);
    currentLength += tokenText(word).length + 1;
  }
  flush();

  return {
    cues,
    fullText: (result.text || tokens.map(tokenText).join(" ")).trim(),
    languageCode: result.language_code || null,
    multiSpeaker: speakers.size > 1,
  };
}

function tokenText(word) {
  if (word.type === "audio_event") {
    return `(${String(word.text || "").trim().replace(/^[([]|[)\]]$/g, "")})`;
  }
  return word.text || "";
}

function captionLines(transcript) {
  const lines = [];
  let previousSpeaker = null;
  let seenDialogue = false;
  for (const cue of transcript.cues) {
    if (cue.isAudioEvent) {
      lines.push(cue.text);
      continue;
    }
    let text = cue.text;
    if (seenDialogue && cue.speakerId !== previousSpeaker) text = `- ${text}`;
    previousSpeaker = cue.speakerId;
    seenDialogue = true;
    lines.push(text);
  }
  return lines;
}

function renderSrt(transcript) {
  const lines = captionLines(transcript);
  return transcript.cues
    .map((cue, index) => `${index + 1}\n${tsSrt(cue.start)} --> ${tsSrt(cue.end)}\n${lines[index]}\n`)
    .join("\n");
}

function renderVtt(transcript) {
  const output = ["WEBVTT", "", "NOTE Generated by ElevenLabs Scribe (AI); verify accuracy.", ""];
  const lines = captionLines(transcript);
  transcript.cues.forEach((cue, index) => {
    output.push(`${tsVtt(cue.start)} --> ${tsVtt(cue.end)}`);
    output.push(lines[index]);
    output.push("");
  });
  return output.join("\n");
}

function tsSrt(seconds) {
  return timestamp(seconds, ",");
}

function tsVtt(seconds) {
  return timestamp(seconds, ".");
}

function timestamp(seconds, separator) {
  let ms = Math.max(0, Math.round(seconds * 1000));
  const h = Math.floor(ms / 3600000);
  ms %= 3600000;
  const m = Math.floor(ms / 60000);
  ms %= 60000;
  const s = Math.floor(ms / 1000);
  ms %= 1000;
  return `${pad(h)}:${pad(m)}:${pad(s)}${separator}${String(ms).padStart(3, "0")}`;
}

function pad(value) {
  return String(value).padStart(2, "0");
}

async function docxDownload(name, transcript) {
  const paragraphs = [];
  paragraphs.push({ text: "Transcript", heading: true });
  paragraphs.push({ text: "Generated by ElevenLabs Scribe (AI); verify accuracy before relying on it.", italic: true });
  if (transcript.languageCode) paragraphs.push({ text: `Detected language: ${transcript.languageCode}`, italic: true });

  let currentSpeaker = null;
  for (const cue of transcript.cues) {
    const prefixParts = [`[${tsDoc(cue.start)}]`];
    if (transcript.multiSpeaker && !cue.isAudioEvent) prefixParts.push(`${speakerLabel(cue.speakerId)}:`);
    if (cue.speakerId !== currentSpeaker || cue.isAudioEvent) {
      paragraphs.push({ text: `${prefixParts.join(" ")} ${cue.text}` });
      currentSpeaker = cue.speakerId;
    } else {
      paragraphs[paragraphs.length - 1].text += ` ${cue.text}`;
    }
  }

  const files = {
    "[Content_Types].xml": contentTypesXml(),
    "_rels/.rels": relsXml(),
    "word/document.xml": documentXml(paragraphs),
  };
  return { name, url: URL.createObjectURL(new Blob([zip(files)], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" })) };
}

function tsDoc(seconds) {
  seconds = Math.max(0, Math.round(seconds));
  const h = Math.floor(seconds / 3600);
  seconds %= 3600;
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${pad(h)}:${pad(m)}:${pad(s)}`;
}

function speakerLabel(speakerId) {
  if (!speakerId) return "Speaker";
  const digits = String(speakerId).match(/\d+/);
  return digits ? `Speaker ${Number(digits[0]) + 1}` : speakerId;
}

function documentXml(paragraphs) {
  const body = paragraphs.map((paragraph) => {
    if (paragraph.heading) {
      return `<w:p><w:pPr><w:pStyle w:val="Title"/></w:pPr><w:r><w:t>${xml(paragraph.text)}</w:t></w:r></w:p>`;
    }
    const props = paragraph.italic ? "<w:rPr><w:i/></w:rPr>" : "";
    return `<w:p><w:r>${props}<w:t>${xml(paragraph.text)}</w:t></w:r></w:p>`;
  }).join("");
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>${body}<w:sectPr><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body>
</w:document>`;
}

function contentTypesXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;
}

function relsXml() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;
}

function xml(value) {
  return String(value).replace(/[<>&"]/g, (char) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[char]));
}

function fileDownload(name, content, type) {
  return { name, url: URL.createObjectURL(new Blob([content], { type })) };
}

function renderDownloads(downloads) {
  els.results.innerHTML = "";
  for (const item of downloads) {
    const row = document.createElement("div");
    row.className = "download-row";
    const label = document.createElement("strong");
    label.textContent = item.name;
    const link = document.createElement("a");
    link.className = "button secondary";
    link.href = item.url;
    link.download = item.name;
    link.textContent = "Download";
    row.append(label, link);
    els.results.append(row);
  }
}

function setStatus(message, kind = "") {
  els.status.textContent = message;
  els.status.className = `status ${kind}`.trim();
}

function friendlyError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const lower = message.toLowerCase();
  if (lower.includes("failed to fetch")) return "The browser could not reach ElevenLabs. This may be a network or CORS block; use the Mac app if it persists.";
  if (lower.includes("401") || lower.includes("403")) return "ElevenLabs rejected the API key. Check or rotate the key.";
  if (lower.includes("429")) return "Rate-limited by ElevenLabs. Try again shortly.";
  if (lower.includes("413")) return "The file is too large for ElevenLabs.";
  return message;
}

function zip(files) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  let offset = 0;
  let index = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = concat(
      u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0),
      nameBytes, data
    );
    localParts.push(local);
    centralParts.push(concat(
      u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0),
      u32(crc), u32(data.length), u32(data.length), u16(nameBytes.length), u16(0), u16(0),
      u16(0), u16(0), u32(0), u32(offset), nameBytes
    ));
    offset += local.length;
    index += 1;
  }
  const central = concat(...centralParts);
  return concat(
    ...localParts,
    central,
    u32(0x06054b50), u16(0), u16(0), u16(index), u16(index), u32(central.length), u32(offset), u16(0)
  );
}

function concat(...arrays) {
  const length = arrays.reduce((sum, array) => sum + array.length, 0);
  const output = new Uint8Array(length);
  let offset = 0;
  for (const array of arrays) {
    output.set(array, offset);
    offset += array.length;
  }
  return output;
}

function u16(value) {
  const array = new Uint8Array(2);
  new DataView(array.buffer).setUint16(0, value, true);
  return array;
}

function u32(value) {
  const array = new Uint8Array(4);
  new DataView(array.buffer).setUint32(0, value >>> 0, true);
  return array;
}

function crc32(data) {
  let crc = 0xffffffff;
  for (const byte of data) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
