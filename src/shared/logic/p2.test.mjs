/**
 * P2 指令快照测试（scoreboard / fill / clone / enchant / attribute / execute）。
 * 覆盖 1.20.5+，重点验证 /attribute 的两条版本边界。
 * Run: node src/shared/logic/p2.test.mjs   （经 tsx）
 */

import {
  buildFillCommand,
  buildCloneCommand,
  buildEnchantCommand,
  buildExecuteCommand,
  buildScoreboardCommand,
  buildAttributeCommand,
  sub,
} from "./builder.ts";

let passed = 0;
let failed = 0;

function expect(label, actual, expected) {
  if (actual === expected) {
    console.log(`  PASS  ${label}`);
    passed++;
  } else {
    console.error(`  FAIL  ${label}`);
    console.error(`        expected: ${expected}`);
    console.error(`        actual:   ${actual}`);
    failed++;
  }
}

// ------------------------------------------------------------------ fill
expect(
  "fill basic",
  buildFillCommand({ from: ["0", "0", "0"], to: ["10", "5", "10"], block: "stone" }),
  "fill 0 0 0 10 5 10 minecraft:stone",
);
expect(
  "fill with blockstate + mode keep",
  buildFillCommand({
    from: ["~", "~", "~"],
    to: ["~5", "~5", "~5"],
    block: "oak_log",
    blockstate: "axis=x",
    mode: "keep",
  }),
  "fill ~ ~ ~ ~5 ~5 ~5 minecraft:oak_log[axis=x] keep",
);
expect(
  "fill replace filter",
  buildFillCommand({
    from: ["~", "~", "~"],
    to: ["~5", "~5", "~5"],
    block: "air",
    replaceFilter: { block: "water" },
  }),
  "fill ~ ~ ~ ~5 ~5 ~5 minecraft:air replace minecraft:water",
);

// ------------------------------------------------------------------ clone
expect(
  "clone basic",
  buildCloneCommand({
    begin: ["0", "0", "0"],
    end: ["10", "10", "10"],
    destination: ["20", "0", "20"],
  }),
  "clone 0 0 0 10 10 10 20 0 20",
);
expect(
  "clone masked + force",
  buildCloneCommand({
    begin: ["0", "0", "0"],
    end: ["10", "10", "10"],
    destination: ["20", "0", "20"],
    maskMode: "masked",
    cloneMode: "force",
  }),
  "clone 0 0 0 10 10 10 20 0 20 masked force",
);
expect(
  "clone filtered",
  buildCloneCommand({
    begin: ["0", "0", "0"],
    end: ["10", "10", "10"],
    destination: ["20", "0", "20"],
    maskMode: "filtered",
    filter: { block: "stone" },
  }),
  "clone 0 0 0 10 10 10 20 0 20 filtered minecraft:stone",
);
expect(
  "clone cross-dimension (1.19.4+ / 1.20.5+)",
  buildCloneCommand({
    fromDimension: "overworld",
    begin: ["0", "64", "0"],
    end: ["5", "69", "5"],
    toDimension: "the_nether",
    destination: ["0", "64", "0"],
  }),
  "clone from minecraft:overworld 0 64 0 5 69 5 to minecraft:the_nether 0 64 0",
);
expect(
  "clone move forces default replace mask before mode",
  buildCloneCommand({
    begin: ["0", "0", "0"],
    end: ["1", "1", "1"],
    destination: ["5", "0", "5"],
    cloneMode: "move",
  }),
  "clone 0 0 0 1 1 1 5 0 5 replace move",
);

// ------------------------------------------------------------------ enchant
expect(
  "enchant with level",
  buildEnchantCommand({ targets: "@s", enchantment: "sharpness", level: 5 }),
  "enchant @s minecraft:sharpness 5",
);
expect(
  "enchant without level",
  buildEnchantCommand({ targets: "@a", enchantment: "minecraft:unbreaking" }),
  "enchant @a minecraft:unbreaking",
);

// ------------------------------------------------------------------ execute
expect(
  "execute as/at/run",
  buildExecuteCommand({ subcommands: [sub.as("@a"), sub.at("@s")], run: "say hi" }),
  "execute as @a at @s run say hi",
);
expect(
  "execute strips leading slash on run",
  buildExecuteCommand({ subcommands: [sub.at("@s")], run: "/setblock ~ ~ ~ stone" }),
  "execute at @s run setblock ~ ~ ~ stone",
);
expect(
  "execute conditional-only (ends with if)",
  buildExecuteCommand({
    subcommands: [sub.as("@a"), sub.ifBlock(["~", "~-1", "~"], "minecraft:stone")],
  }),
  "execute as @a if block ~ ~-1 ~ minecraft:stone",
);
expect(
  "execute store result score",
  buildExecuteCommand({
    subcommands: [sub.storeResultScore("@s", "out")],
    run: "data get entity @s Pos",
  }),
  "execute store result score @s out run data get entity @s Pos",
);

// ------------------------------------------------------------------ scoreboard
expect(
  "scoreboard objectives add with displayName",
  buildScoreboardCommand({
    action: { kind: "objectives_add", objective: "kills", criteria: "playerKillCount", displayName: "Kills" },
  }),
  'scoreboard objectives add kills playerKillCount {"text":"Kills"}',
);
expect(
  "scoreboard players set",
  buildScoreboardCommand({ action: { kind: "players_set", targets: "@a", objective: "kills", score: 0 } }),
  "scoreboard players set @a kills 0",
);
expect(
  "scoreboard players operation",
  buildScoreboardCommand({
    action: {
      kind: "players_operation",
      targets: "@s",
      objective: "a",
      operation: "+=",
      source: "@p",
      sourceObjective: "b",
    },
  }),
  "scoreboard players operation @s a += @p b",
);
expect(
  "scoreboard setdisplay",
  buildScoreboardCommand({ action: { kind: "objectives_setdisplay", slot: "sidebar", objective: "kills" } }),
  "scoreboard objectives setdisplay sidebar kills",
);

// ------------------------------------------------------------------ attribute（版本敏感）
// 边界 B：1.20.5/1.20.6 旧 modifier 格式（UUID + name + 旧运算名）
expect(
  "attribute modifier add — 1.20.5 legacy (uuid+name, op=add)",
  buildAttributeCommand({
    version: "java_1_20_5",
    target: "@s",
    attribute: "max_health",
    action: { kind: "modifier_add", id: "ec3d9d97-0c1e-4c8b-bf1a-111111111111", name: "buff", value: 10, operation: "add" },
  }),
  "attribute @s minecraft:generic.max_health modifier add ec3d9d97-0c1e-4c8b-bf1a-111111111111 buff 10 add",
);
// 边界 B：1.21（new modifier 格式：id + 新运算名），边界 A：仍带 generic. 前缀
expect(
  "attribute modifier add — 1.21 new format, generic prefix retained",
  buildAttributeCommand({
    version: "java_1_21",
    target: "@s",
    attribute: "max_health",
    action: { kind: "modifier_add", id: "buff", value: 10, operation: "add" },
  }),
  "attribute @s minecraft:generic.max_health modifier add minecraft:buff 10 add_value",
);
// 边界 A：1.21.5+ 去 generic. 前缀；新运算名 multiply_base → add_multiplied_base
expect(
  "attribute modifier add — 1.21.5 no-prefix + add_multiplied_base",
  buildAttributeCommand({
    version: "java_1_21_5",
    target: "@s",
    attribute: "generic.max_health",
    action: { kind: "modifier_add", id: "buff", value: 10, operation: "multiply_base" },
  }),
  "attribute @s minecraft:max_health modifier add minecraft:buff 10 add_multiplied_base",
);
expect(
  "attribute base set — 1.21.11+ no prefix",
  buildAttributeCommand({
    version: "java_1_21_11_plus",
    target: "@s",
    attribute: "minecraft:max_health",
    action: { kind: "base_set", value: 30 },
  }),
  "attribute @s minecraft:max_health base set 30",
);
expect(
  "attribute base set — 1.20.6 generic prefix",
  buildAttributeCommand({
    version: "java_1_20_5",
    target: "@s",
    attribute: "max_health",
    action: { kind: "base_set", value: 30 },
  }),
  "attribute @s minecraft:generic.max_health base set 30",
);
expect(
  "attribute get with scale",
  buildAttributeCommand({
    version: "java_1_21_11_plus",
    target: "@s",
    attribute: "armor",
    action: { kind: "get", scale: 1 },
  }),
  "attribute @s minecraft:armor get 1",
);

// ------------------------------------------------------------------ summary
console.log(`\nP2: ${passed} passed, ${failed} failed`);
if (failed > 0) process.exit(1);
