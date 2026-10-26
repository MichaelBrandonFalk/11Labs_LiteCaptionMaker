const { test } = require("node:test");
const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const { File } = require("node:buffer");
const vm = require("node:vm");

function browser() {
  const elements = new Map();
  const requests = [];
  const document = { getElementById(id) {
    if (!elements.has(id)) elements.set(id, {
      value: "", checked: false, files: [], handlers: {},
      classList: { add() {}, remove() {} },
      addEventListener(event, handler) { this.handlers[event] = handler; },
    });
    return elements.get(id);
  }};
  const context = vm.createContext({ document, FormData, AbortController,
    setTimeout, clearTimeout, fetch: async (url, options) => {
      requests.push({ url, options });
      return { ok: true, json: async () => ({ text: "Test transcript", words: [] }) };
    }});
  vm.runInContext(readFileSync(require.resolve("../docs/browser-app.js"), "utf8"), context);
  return { context, document, requests };
}

test("MP3 and WAV uploads preserve bytes, filename, and MIME type", async () => {
  for (const [name, type] of [["clip.mp3", "audio/mpeg"], ["clip.wav", "audio/wav"], ["clip.WAV", "audio/x-wav"]]) {
    const { context, document, requests } = browser();
    const bytes = Buffer.from("unchanged audio bytes");
    context.file = new File([bytes], name, { type });
    document.getElementById("fileInput").files = [context.file];
    document.getElementById("fileInput").handlers.change();
    assert.equal(vm.runInContext("selectedFile.name", context), name);
    await vm.runInContext('transcribe(selectedFile, "dummy-key")', context);
    const uploaded = requests[0].options.body.get("file");
    assert.equal(requests[0].options.method, "POST");
    assert.equal(uploaded.name, name);
    assert.equal(uploaded.type, type);
    assert.deepEqual(Buffer.from(await uploaded.arrayBuffer()), bytes);
  }
});

test("drop and picker accept WAV and reject unsupported files before upload", async () => {
  const { context, document, requests } = browser();
  const picker = document.getElementById("fileInput");
  const drop = document.getElementById("dropZone");
  const key = document.getElementById("apiKey");
  key.value = "dummy-key";
  for (const viaDrop of [false, true]) {
    for (const [name, accepted] of [["clip.WAV", true], ["clip.MP3", true], ["clip.mp4", false], ["clip.wav.exe", false]]) {
      const file = new File(["bytes"], name);
      if (viaDrop) drop.handlers.drop({ preventDefault() {}, dataTransfer: { files: [file] } });
      else { picker.files = [file]; picker.handlers.change(); }
      assert.equal(vm.runInContext("selectedFile !== null", context), accepted);
      if (!accepted) {
        await document.getElementById("runButton").handlers.click();
        assert.equal(requests.length, 0);
      }
    }
  }
});
