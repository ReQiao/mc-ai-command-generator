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
  const failed = res.filter((r) => !r.ok);
  if (failed.length) {
    error.value = `下发 Mod 失败 ${failed.length}/${res.length} 条：${failed[0]?.message ?? ""}`;
  } else {
    error.value = "";
    alert(`已下发 ${cmds.length} 条命令到游戏。`);
  }
}

function copy(cmd: string) {
  navigator.clipboard.writeText(cmd);
}
</script>

<template>
  <main>
    <header>
      <h1>MC AI 指令生成器</h1>
      <div class="status">
        <span :class="['dot', modOnline ? 'on' : 'off']"></span>
        Mod {{ modOnline === null ? "检测中" : modOnline ? "在线" : "离线" }}
        <span class="balance" v-if="balance !== null">· 余额 {{ balance }}</span>
      </div>
    </header>

    <section class="controls">
      <label>
        目标版本
        <select v-model="version">
          <option v-for="v in VERSIONS" :key="v.value" :value="v.value">{{ v.label }}</option>
        </select>
      </label>
      <label class="key">
        Qwen API Key（可选，留空用 .env）
        <input v-model="apiKey" type="password" placeholder="sk-..." />
      </label>
    </section>

    <textarea v-model="input" rows="3" placeholder="用自然语言描述你想要的物品 / 效果 / 实体…"></textarea>

    <div class="actions">
      <button :disabled="loading" @click="generate">{{ loading ? "生成中…" : "生成命令" }}</button>
      <button class="ghost" :disabled="!results.length || !modOnline" @click="sendAll">下发到游戏</button>
    </div>

    <p v-if="error" class="error">{{ error }}</p>
    <p v-if="explanation" class="explanation">{{ explanation }}</p>

    <ul class="results">
      <li v-for="(r, i) in results" :key="i" :class="{ bad: r.error }">
        <div class="cmd-row">
          <code v-if="r.command">{{ r.command }}</code>
          <span v-else class="err-text">✗ {{ r.error }}</span>
          <button v-if="r.command" class="copy" @click="copy(r.command)">复制</button>
        </div>
        <small>{{ r.intent.command }}</small>
      </li>
    </ul>
  </main>
</template>
