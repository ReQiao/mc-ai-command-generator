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

function copyOne(cmd: string) {
  navigator.clipboard.writeText(cmd);
  showToast("已复制");
}

function copyAll() {
  const cmds = results.value.map((r) => r.command).filter(Boolean).join("\n");
  if (cmds) {
    navigator.clipboard.writeText(cmds);
    showToast(`已复制 ${results.value.filter((r) => r.command).length} 条命令`);
  }
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
        目标版本
        <select v-model="version" class="builtin-template-select">
          <option v-for="v in VERSIONS" :key="v.value" :value="v.value">{{ v.label }}</option>
        </select>
        API Key
        <input v-model="apiKey" type="password" placeholder="sk-...（留空用 .env）" style="flex:1;min-width:160px" />
        <span class="status-text" style="display:flex;align-items:center;gap:6px;white-space:nowrap;margin-left:auto">
          <span
            :style="{
              width:'8px', height:'8px', borderRadius:'50%', display:'inline-block', flexShrink:0,
              background: modOnline === null ? '#666' : modOnline ? '#3ba55d' : '#ed4245'
            }"
          ></span>
          Mod {{ modOnline === null ? "检测中" : modOnline ? "在线" : "离线" }}
          <span v-if="balance !== null" style="color:#e7ecff">· 余额 {{ balance }}</span>
        </span>
      </div>
    </div>

    <!-- 主体 -->
    <div class="split-layout">
      <!-- 左侧：输入 -->
      <div class="card side-panel">
        <div>
          <label style="display:block;margin-bottom:8px">用自然语言描述你想要的效果</label>
          <textarea
            v-model="input"
            rows="7"
            style="width:100%;resize:vertical"
            placeholder="例如：给我一把附魔弓和 64 个钻石"
          ></textarea>
        </div>

        <div style="flex:1"></div>

        <div style="display:flex;flex-direction:column;gap:8px">
          <button class="primary-btn" :disabled="loading" @click="generate" style="width:100%">
            {{ loading ? "生成中…" : "生成命令" }}
          </button>
          <div style="display:flex;gap:8px">
            <button
              class="normal-btn"
              :disabled="!results.length"
              @click="copyAll"
              style="flex:1"
            >复制全部</button>
            <button
              class="normal-btn"
              :disabled="!results.length || !modOnline"
              @click="sendAll"
              style="flex:1"
            >下发到游戏</button>
          </div>
        </div>
      </div>

      <!-- 右侧：结果 -->
      <div class="card tab-panel" style="gap:10px">
        <p v-if="explanation" class="status-text" style="margin:0;color:#9fd3a0;font-size:13px">{{ explanation }}</p>
        <p v-if="error" style="margin:0;color:#ed4245;font-size:13px">{{ error }}</p>

        <div
          v-if="!results.length && !error && !loading"
          class="status-text"
          style="margin:auto;text-align:center;opacity:0.4;font-size:13px"
        >
          输入描述后点击「生成命令」
        </div>

        <div v-if="loading" class="status-text" style="margin:auto;text-align:center;opacity:0.55;font-size:13px">
          AI 思考中…
        </div>

        <div class="item-list" v-if="results.length" style="flex:1">
          <div
            v-for="(r, i) in results"
            :key="i"
            style="padding:10px 12px;margin:2px 0;border-radius:10px;border:1px solid transparent"
            :style="r.error ? { borderColor: 'rgba(237,66,69,0.3)', background: 'rgba(237,66,69,0.05)' } : {}"
          >
            <div style="display:flex;align-items:flex-start;gap:8px">
              <code
                v-if="r.command"
                style="flex:1;font-family:'JetBrains Mono',Consolas,monospace;font-size:12px;line-height:1.6;word-break:break-all;color:#e7ecff;white-space:pre-wrap"
              >{{ r.command }}</code>
              <span v-else style="flex:1;color:#ed4245;font-size:12px">✗ {{ r.error }}</span>
              <button
                v-if="r.command"
                class="table-btn"
                @click="copyOne(r.command!)"
                style="flex-shrink:0;margin-top:1px"
              >复制</button>
            </div>
            <div style="margin-top:5px;color:#8fa0cd;font-size:11px">{{ r.intent.command }}</div>
          </div>
        </div>
      </div>
    </div>

    <!-- 底部占位 -->
    <div style="height:2px"></div>
  </div>

  <!-- Toast -->
  <Transition name="toast">
    <div v-if="toastMsg" class="toast">{{ toastMsg }}</div>
  </Transition>
</template>
