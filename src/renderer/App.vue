<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { GiveVersion } from "../shared/logic/types";

interface DispatchResult {
  intent: { command: string; form: Record<string, unknown> };
  command: string | null;
  error: string | null;
}

const VERSIONS: { value: GiveVersion; label: string }[] = [
  { value: "java_1_21_11_plus", label: "Java 1.21.11+" },
  { value: "java_1_21_5", label: "Java 1.21.5" },
  { value: "java_1_21_2", label: "Java 1.21.2" },
  { value: "java_1_21", label: "Java 1.21 / 1.21.1" },
  { value: "java_1_20_5", label: "Java 1.20.5 / 1.20.6" },
];

const input = ref("做一个能射 TNT 的弓，并给我 64 个钻石");
const version = ref<GiveVersion>("java_1_21_11_plus");
const apiKey = ref("");
const loading = ref(false);
const explanation = ref("");
const results = ref<DispatchResult[]>([]);
const error = ref("");
const balance = ref<number | null>(null);
const modOnline = ref<boolean | null>(null);
const toastMsg = ref("");
let toastTimer: ReturnType<typeof setTimeout> | null = null;

async function refreshState() {
  const s = await window.mcai.billingState();
  balance.value = s.balance;
  const ping = await window.mcai.pingMod();
  modOnline.value = ping.ok;
}

onMounted(refreshState);

async function generate() {
  error.value = "";
  results.value = [];
  explanation.value = "";
  loading.value = true;
  try {
    const res = await window.mcai.generate(input.value, version.value, apiKey.value || undefined);
    if (!res.ok) {
      error.value = res.error;
      return;
    }
    explanation.value = res.explanation;
    results.value = res.results;
    balance.value = res.balance;
  } catch (e) {
    error.value = String(e);
  } finally {
    loading.value = false;
  }
}

async function sendAll() {
  const cmds = results.value.map((r) => r.command).filter((c): c is string => !!c);
  if (!cmds.length) return;
  const res = await window.mcai.sendToMod(cmds);
  const failed = res.filter((r: any) => !r.ok);
  if (failed.length) {
    error.value = `下发 Mod 失败 ${failed.length}/${res.length} 条：${failed[0]?.message ?? ""}`;
  } else {
    error.value = "";
    showToast(`已下发 ${cmds.length} 条命令到游戏`);
  }
}

function copy(cmd: string) {
  navigator.clipboard.writeText(cmd);
  showToast("已复制");
}

function showToast(msg: string) {
  toastMsg.value = msg;
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (toastMsg.value = ""), 2000);
}
</script>

<template>
  <div class="app-shell">
    <!-- 顶栏 -->
    <div class="card top-card">
      <div class="brand-group">
        <div class="logo">⚡</div>
        <h1>MC AI 指令生成器</h1>
      </div>
      <div class="top-form">
        <label>
          目标版本
          <select v-model="version" class="template-input">
            <option v-for="v in VERSIONS" :key="v.value" :value="v.value">{{ v.label }}</option>
          </select>
        </label>
        <label style="flex:1">
          Qwen API Key（可选，留空用 .env）
          <input v-model="apiKey" type="password" placeholder="sk-..." style="width:100%" />
        </label>
        <label>
          <span style="visibility:hidden;display:block;font-size:12px">占位</span>
          <div class="status-text" style="display:flex;align-items:center;gap:6px;white-space:nowrap">
            <span
              :style="{
                width:'9px', height:'9px', borderRadius:'50%', display:'inline-block', flexShrink:0,
                background: modOnline === null ? '#888' : modOnline ? '#3ba55d' : '#ed4245'
              }"
            ></span>
            Mod {{ modOnline === null ? "检测中" : modOnline ? "在线" : "离线" }}
            <span v-if="balance !== null" style="color:#e7ecff">· 余额 {{ balance }}</span>
          </div>
        </label>
      </div>
    </div>

    <!-- 主体 -->
    <div class="split-layout">
      <!-- 左侧：输入 -->
      <div class="card side-panel">
        <div>
          <label style="display:block;margin-bottom:6px;color:rgba(235,246,255,0.9)">
            用自然语言描述你想要的效果
          </label>
          <textarea
            v-model="input"
            rows="6"
            style="width:100%;resize:vertical"
            placeholder="例如：做一个能射 TNT 的弓，并给我 64 个钻石"
          ></textarea>
        </div>

        <div style="flex:1"></div>

        <div style="display:flex;flex-direction:column;gap:8px">
          <button id="primary" :disabled="loading" @click="generate" style="width:100%">
            {{ loading ? "生成中…" : "生成命令" }}
          </button>
          <button
            class="normal-btn"
            :disabled="!results.length || !modOnline"
            @click="sendAll"
            style="width:100%"
          >
            下发到游戏
          </button>
        </div>
      </div>

      <!-- 右侧：结果 -->
      <div class="card tab-panel">
        <div v-if="explanation" class="status-text" style="margin-bottom:10px;color:#9fd3a0">
          {{ explanation }}
        </div>
        <p v-if="error" style="margin:0 0 10px;color:#ed4245">{{ error }}</p>

        <div v-if="!results.length && !error && !loading" class="status-text" style="margin:auto;text-align:center;opacity:0.5">
          输入描述后点击「生成命令」
        </div>

        <div v-if="loading" class="status-text" style="margin:auto;text-align:center;opacity:0.6">
          AI 思考中…
        </div>

        <div class="item-list" v-if="results.length" style="flex:1">
          <div
            v-for="(r, i) in results"
            :key="i"
            style="padding:10px;margin:2px 0;border-radius:10px;border:1px solid transparent"
            :style="r.error ? { borderColor: 'rgba(237,66,69,0.35)', background: 'rgba(237,66,69,0.06)' } : {}"
          >
            <div style="display:flex;align-items:center;gap:8px">
              <code
                v-if="r.command"
                style="flex:1;font-family:'JetBrains Mono',Consolas,monospace;font-size:12px;word-break:break-all;color:#e7ecff"
              >{{ r.command }}</code>
              <span v-else style="flex:1;color:#ed4245;font-size:13px">✗ {{ r.error }}</span>
              <button
                v-if="r.command"
                class="table-btn"
                @click="copy(r.command!)"
                style="flex-shrink:0"
              >复制</button>
            </div>
            <div style="margin-top:4px;color:#8fa0cd;font-size:11px">{{ r.intent.command }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部占位（与 give 保持三行 grid） -->
    <div style="height:4px"></div>
  </div>

  <!-- Toast -->
  <Transition name="toast">
    <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
  </Transition>
</template>
