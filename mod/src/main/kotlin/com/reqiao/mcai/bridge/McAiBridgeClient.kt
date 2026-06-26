package com.reqiao.mcai.bridge

import com.google.gson.JsonObject
import com.google.gson.JsonParser
import com.sun.net.httpserver.HttpExchange
import com.sun.net.httpserver.HttpServer
import net.fabricmc.api.ClientModInitializer
import net.minecraft.client.MinecraftClient
import org.slf4j.LoggerFactory
import java.net.InetSocketAddress
import java.nio.charset.StandardCharsets

/**
 * MC AI Bridge — 客户端入口。
 *
 * 在本机 127.0.0.1:25580 启动一个极小 HTTP 服务器（仅 JDK 标准库），
 * 接收桌面端（mc-ai-command-generator exe）下发的命令并在客户端执行。
 *
 * 设计原则（见 PLAN.md）：
 *   - 纯接收端，无业务逻辑，几乎不需维护。
 *   - 只绑定 loopback，外部网络无法访问。
 *   - 所有 Minecraft API 调用都切回客户端主线程（client.execute{}）。
 */
class McAiBridgeClient : ClientModInitializer {

    private val logger = LoggerFactory.getLogger("mc-ai-bridge")
    private var server: HttpServer? = null

    override fun onInitializeClient() {
        val port = System.getProperty("mcai.bridge.port")?.toIntOrNull() ?: DEFAULT_PORT
        try {
            val srv = HttpServer.create(InetSocketAddress("127.0.0.1", port), 0)
            srv.createContext("/health", ::handleHealth)
            srv.createContext("/command", ::handleCommand)
            srv.createContext("/setblock", ::handleSetblock)
            srv.executor = null // 默认单线程 executor，足够低频指令下发
            srv.start()
            server = srv
            logger.info("MC AI Bridge HTTP 服务器已启动: http://127.0.0.1:$port")
        } catch (e: Exception) {
            logger.error("MC AI Bridge 启动失败（端口 $port 可能被占用）", e)
        }

        // 客户端退出时关闭服务器
        Runtime.getRuntime().addShutdownHook(Thread { server?.stop(0) })
    }

    // --- 路由处理 -----------------------------------------------------------

    private fun handleHealth(exchange: HttpExchange) {
        val client = MinecraftClient.getInstance()
        val player = client.player
        val resp = JsonObject().apply {
            addProperty("ok", true)
            addProperty("inGame", player != null)
            addProperty("isOp", player?.hasPermissionLevel(2) ?: false)
            addProperty("player", player?.name?.string ?: "")
        }
        respond(exchange, 200, resp)
    }

    private fun handleCommand(exchange: HttpExchange) {
        if (!requirePost(exchange)) return
        val body = readBody(exchange)
        val cmd = body?.get("cmd")?.asString
        if (cmd.isNullOrBlank()) {
            respond(exchange, 400, error("缺少 cmd 字段"))
            return
        }
        executeOnClient(cmd) { ok, message ->
            respond(exchange, if (ok) 200 else 503, result(ok, message))
        }
    }

    private fun handleSetblock(exchange: HttpExchange) {
        if (!requirePost(exchange)) return
        val body = readBody(exchange)
        val pos = body?.getAsJsonArray("pos")
        val cmd = body?.get("cmd")?.asString
        if (pos == null || pos.size() != 3 || cmd.isNullOrBlank()) {
            respond(exchange, 400, error("需要 pos:[x,y,z] 和 cmd 字段"))
            return
        }
        val x = pos[0].asInt
        val y = pos[1].asInt
        val z = pos[2].asInt
        // 用一条 setblock 在该坐标放置带 Command NBT 的命令方块。
        // 注意：需要 OP（permissionLevel >= 2），否则服务器会拒绝。
        val escaped = cmd.replace("\\", "\\\\").replace("\"", "\\\"")
        val setblockCmd =
            "setblock $x $y $z minecraft:command_block{Command:\"$escaped\",auto:1b}"
        executeOnClient(setblockCmd) { ok, message ->
            respond(exchange, if (ok) 200 else 503, result(ok, message))
        }
    }

    // --- 客户端线程执行 -----------------------------------------------------

    /**
     * 切回客户端主线程执行命令，并异步回调结果。
     * sendChatCommand 期望不带前导斜杠的命令字符串。
     */
    private fun executeOnClient(rawCmd: String, callback: (ok: Boolean, message: String) -> Unit) {
        val client = MinecraftClient.getInstance()
        client.execute {
            val player = client.player
            val handler = player?.networkHandler
            if (player == null || handler == null) {
                callback(false, "玩家不在游戏中，无法执行命令。")
                return@execute
            }
            val cmd = rawCmd.removePrefix("/")
            try {
                handler.sendChatCommand(cmd)
                callback(true, "已发送: /$cmd")
            } catch (e: Exception) {
                callback(false, "执行失败: ${e.message}")
            }
        }
    }

    // --- HTTP 工具 ----------------------------------------------------------

    private fun requirePost(exchange: HttpExchange): Boolean {
        if (exchange.requestMethod != "POST") {
            respond(exchange, 405, error("仅支持 POST"))
            return false
        }
        return true
    }

    private fun readBody(exchange: HttpExchange): JsonObject? = try {
        val text = exchange.requestBody.readBytes().toString(StandardCharsets.UTF_8)
        JsonParser.parseString(text).asJsonObject
    } catch (e: Exception) {
        null
    }

    private fun respond(exchange: HttpExchange, code: Int, json: JsonObject) {
        val bytes = json.toString().toByteArray(StandardCharsets.UTF_8)
        exchange.responseHeaders.add("Content-Type", "application/json; charset=utf-8")
        exchange.sendResponseHeaders(code, bytes.size.toLong())
        exchange.responseBody.use { it.write(bytes) }
    }

    private fun result(ok: Boolean, message: String) = JsonObject().apply {
        addProperty("ok", ok)
        addProperty("message", message)
    }

    private fun error(message: String) = result(false, message)

    companion object {
        const val DEFAULT_PORT = 25580
    }
}
