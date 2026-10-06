// =====================================
// Chat Reconnect
// Author: China Blue
// Version: 1.12
//
// Manual chat recovery tool for the TSO client.
// Adds one Tools menu item, "Chat Reconnect", which attempts to
// restore a broken chat-server connection without restarting the client.
// It refreshes client-server communication, nudges the zone/chat state,
// rejoins the global chat channel, refreshes friend/chat UI state, and
// wakes the guild chat tab when possible.
//
// If you like my work, you can support me:
// https://buymeacoffee.com/china_blue

// Visit [CodeByCB on GitHub](https://github.com/CodeByCB)
// to discover other current and future projects.
//
// Community maintenance notice:
// The community is welcome to continue improving, fixing,
// modifying and redistributing it, while preserving credits
// to China Blue in the source code.
//
// Provided as-is, without warranty.
// =====================================

(function () {
    var SCRIPT_FILE = "user_cb_ChatReconnect.js";
    var SCRIPT_VERSION = "1.12";

    try {
        if (typeof customScripts === "object" && customScripts) {
            customScripts[SCRIPT_FILE] = {
                name: "ChatReconnect",
                author: "China Blue",
                title: "Reconnects lost chat-server connection v" + SCRIPT_VERSION,
                description: "Manual rescue button that restores in-game chat and rejoins guild channels without restarting the client."
            };
        }
    }
    catch (e) {
    }

    if (window._chatReconnectInstalled) {
        return;
    }

    window._chatReconnectInstalled = true;

    var ChatReconnect = {
        Version: SCRIPT_VERSION,
        MenuTitle: "CB Chat Reconnect",
        LogTag: "ChatReconnect",
        Verbose: false,
        TraceReconnectPaths: false,
        EnableDashboardChatReset: false,
        EnableDirectChatMediatorInit: false,
        MenuRetryCount: 0,
        MenuRetryMax: 20,
        MenuRetryMs: 1000,
        AttemptDelayMs: 1200,
        ForceServerRefreshDelayMs: 1500,
        SuccessCheckDelayMs: 2500,
        CooldownMs: 30000,
        Commands: ["/joinchat global-1"],
        LastRunAt: 0,
        IsRunning: false,
        AvatarLightHiddenNodes: [],
        AvatarLightMaxHidden: 8,

        init: function () {
            this.installMenu();
            this.debug("Loaded v" + this.Version + ".");
            return this;
        },

        nowStamp: function () {
            var now = new Date();
            function pad(value) {
                return value < 10 ? "0" + value : String(value);
            }
            return "[" + pad(now.getDate()) + "/" + pad(now.getMonth() + 1) + "/" +
                String(now.getFullYear()).slice(-2) + " " +
                pad(now.getHours()) + ":" + pad(now.getMinutes()) + ":" + pad(now.getSeconds()) + "]";
        },

        log: function (message) {
            var text = this.nowStamp() + " [" + this.LogTag + "] " + message;

            try {
                if (typeof console !== "undefined" && console && typeof console.log === "function") {
                    console.log(text);
                }
            } catch (e) {
            }

            try {
                if (typeof game !== "undefined" && game && typeof game.chatMessage === "function") {
                    game.chatMessage(message, this.LogTag);
                }
            } catch (e2) {
            }
        },

        debug: function (message) {
            var text = this.nowStamp() + " [" + this.LogTag + "] " + message;

            try {
                if (typeof console !== "undefined" && console && typeof console.log === "function") {
                    console.log(text);
                }
            } catch (e) {
            }

            if (this.Verbose) {
                try {
                    if (typeof game !== "undefined" && game && typeof game.chatMessage === "function") {
                        game.chatMessage(message, this.LogTag);
                    }
                } catch (e2) {
                }
            }
        },

        tracePath: function (code, description) {
            if (!this.TraceReconnectPaths) {
                return;
            }
            this.debug("TRACE " + code + ": " + description);
        },

        getRoot: function (path) {
            var parts = path.split(".");
            var current = window;

            for (var i = 0; i < parts.length; i++) {
                if (!current) {
                    return null;
                }
                current = current[parts[i]];
            }

            return current || null;
        },

        safeCall: function (label, fn) {
            try {
                fn();
                return {
                    ok: true,
                    label: label
                };
            } catch (e) {
                return {
                    ok: false,
                    label: label,
                    error: String(e && e.message ? e.message : e)
                };
            }
        },

        getDefinition: function (name) {
            try {
                if (typeof swmmo !== "undefined" && swmmo && typeof swmmo.getDefinitionByName === "function") {
                    return swmmo.getDefinitionByName(name);
                }
            } catch (e) {
            }
            return null;
        },

        getApplication: function () {
            var globalDef = this.getDefinition("global");
            try {
                if (globalDef && typeof globalDef.getApplication === "function") {
                    return globalDef.getApplication();
                }
            } catch (e) {
            }
            return null;
        },

        getGameInterface: function () {
            var app;
            var globalDef;

            try {
                if (typeof EXUDM_GI === "function" && EXUDM_GI()) {
                    return EXUDM_GI();
                }
            } catch (e) {
            }

            try {
                if (typeof game !== "undefined" && game && game.gi) {
                    return game.gi;
                }
            } catch (e2) {
            }

            try {
                globalDef = this.getDefinition("global");
                if (globalDef && globalDef.ui) {
                    return globalDef.ui;
                }
            } catch (e3) {
            }

            try {
                app = this.getApplication();
                if (app && app.mGameInterface) {
                    return app.mGameInterface;
                }
            } catch (e4) {
            }

            return null;
        },

        getChatPanel: function () {
            try {
                if (typeof EXUDM_GLOBALFLASH === "function" &&
                    EXUDM_GLOBALFLASH() &&
                    EXUDM_GLOBALFLASH().gui &&
                    EXUDM_GLOBALFLASH().gui.mChatPanel) {
                    return EXUDM_GLOBALFLASH().gui.mChatPanel;
                }
            } catch (e) {
            }

            try {
                if (typeof globalFlash !== "undefined" && globalFlash && globalFlash.gui && globalFlash.gui.mChatPanel) {
                    return globalFlash.gui.mChatPanel;
                }
            } catch (e2) {
            }

            return null;
        },

        getCurrentPlayerGuild: function () {
            var gi = this.getGameInterface();

            try {
                if (gi && typeof gi.GetCurrentPlayerGuild === "function") {
                    return gi.GetCurrentPlayerGuild();
                }
            } catch (e) {
            }

            try {
                if (gi && gi.mCurrentPlayerGuild) {
                    return gi.mCurrentPlayerGuild;
                }
            } catch (e2) {
            }

            return null;
        },

        getGuiRoots: function () {
            var app = this.getApplication();
            var roots = [
                { label: "game", value: this.getRoot("game") },
                { label: "game.gi", value: this.getRoot("game.gi") },
                { label: "globalFlash", value: this.getRoot("globalFlash") },
                { label: "globalFlash.gui", value: this.getRoot("globalFlash.gui") }
            ];

            if (app) {
                roots.push({ label: "global.application", value: app });
                roots.push({ label: "global.application.mGameInterface", value: app.mGameInterface });
            }

            return roots;
        },

        collectChatObjects: function () {
            var roots = this.getGuiRoots();
            var queue = [];
            var out = [];
            var seen = [];
            var maxDepth = 4;
            var maxNodes = 250;
            var chatName = /chat|xmpp/i;

            function seenIndex(value) {
                for (var i = 0; i < seen.length; i++) {
                    if (seen[i] === value) {
                        return i;
                    }
                }
                return -1;
            }

            function addCandidate(label, value, depth) {
                if (!value || (typeof value !== "object" && typeof value !== "function")) {
                    return;
                }
                if (seenIndex(value) >= 0) {
                    return;
                }
                seen.push(value);
                queue.push({
                    label: label,
                    value: value,
                    depth: depth
                });
                if (chatName.test(label)) {
                    out.push({
                        label: label,
                        value: value
                    });
                }
            }

            for (var r = 0; r < roots.length; r++) {
                addCandidate(roots[r].label, roots[r].value, 0);
            }

            while (queue.length && seen.length < maxNodes) {
                var item = queue.shift();
                if (item.depth >= maxDepth) {
                    continue;
                }

                var names;
                try {
                    names = [];
                    for (var key in item.value) {
                        if (Object.prototype.hasOwnProperty.call(item.value, key)) {
                            names.push(key);
                        }
                    }
                } catch (e) {
                    continue;
                }

                for (var n = 0; n < names.length; n++) {
                    var name = names[n];
                    if (!chatName.test(name)) {
                        continue;
                    }

                    try {
                        addCandidate(item.label + "." + name, item.value[name], item.depth + 1);
                    } catch (e2) {
                    }
                }
            }

            return out;
        },

        resetChatMediator: function () {
            var self = this;
            var results = [];

            if (this.EnableDashboardChatReset && typeof _exudDashboard_ResetChats === "function") {
                this.tracePath("CR-M1", "dashboard _exudDashboard_ResetChats()");
                results.push(this.safeCall("_exudDashboard_ResetChats()", function () {
                    _exudDashboard_ResetChats(null);
                }));
            } else {
                this.tracePath("CR-M1-SKIP", "skipped dashboard reset; it contains InitChat(true)");
            }

            if (this.EnableDirectChatMediatorInit) {
                this.tracePath("CR-M2", "direct TSOChatMediator.InitChat(true)");
                results.push(this.safeCall("TSOChatMediator.InitChat(true)", function () {
                    var mediator = self.getDefinition("GUI.GAME.Chat::TSOChatMediator");
                    if (!mediator || typeof mediator.InitChat !== "function") {
                        throw new Error("TSOChatMediator.InitChat is not available.");
                    }
                    mediator.InitChat(true);
                }));
            } else {
                this.tracePath("CR-M2-SKIP", "skipped direct TSOChatMediator.InitChat(true)");
            }

            this.tracePath("CR-M3", "direct SendGetZoneMessageToServer(1002)");
            results.push(this.safeCall("SendGetZoneMessageToServer(1002)", function () {
                var msg = (typeof EXUDM_MSG === "function") ? EXUDM_MSG() : null;
                var zone = (typeof EXUDM_CURRENT_VIEW_ZONE === "function") ? EXUDM_CURRENT_VIEW_ZONE() : null;
                if (!msg || typeof msg.SendGetZoneMessageToServer !== "function") {
                    throw new Error("SendGetZoneMessageToServer is not available.");
                }
                msg.SendGetZoneMessageToServer(1002, zone, false);
            }));

            return results;
        },

        callReconnectMethods: function () {
            var objects = this.collectChatObjects();
            var methodNames = [
                "Reconnect", "reconnect",
                "Connect", "connect",
                "Login", "login",
                "Join", "join",
                "Start", "start"
            ];
            var results = [];
            var traceIndex = 0;

            for (var i = 0; i < objects.length; i++) {
                for (var m = 0; m < methodNames.length; m++) {
                    var methodName = methodNames[m];
                    var obj = objects[i].value;
                    var label = objects[i].label + "." + methodName + "()";

                    try {
                        if (obj && typeof obj[methodName] === "function") {
                            traceIndex += 1;
                            this.tracePath(
                                "CR-R" + (traceIndex < 10 ? "0" : "") + traceIndex,
                                "generic reconnect method " + label
                            );
                            results.push(this.safeCall(label, function () {
                                obj[methodName]();
                            }));
                        }
                    } catch (e) {
                    }
                }
            }

            return results;
        },

        sendViaChatInputObject: function (command) {
            var objects = this.collectChatObjects();
            var methodNames = [
                "SendChatMessage", "sendChatMessage",
                "SendMessage", "sendMessage",
                "ProcessChatInput", "processChatInput",
                "HandleInput", "handleInput",
                "Submit", "submit"
            ];
            var results = [];

            for (var i = 0; i < objects.length; i++) {
                for (var m = 0; m < methodNames.length; m++) {
                    var methodName = methodNames[m];
                    var obj = objects[i].value;

                    try {
                        if (obj && typeof obj[methodName] === "function") {
                            results.push(this.safeCall(objects[i].label + "." + methodName + "(" + command + ")", function () {
                                obj[methodName](command);
                            }));
                        }
                    } catch (e) {
                    }
                }
            }

            return results;
        },

        focusChatAndType: function (command) {
            var inputPaths = [
                "EXUDM_GLOBALFLASH().gui.mChatPanel.getViewComponent().messageInput",
                "globalFlash.gui.mChatPanel.mInput",
                "globalFlash.gui.mChatPanel.mTextInput",
                "globalFlash.gui.mChatWindow.mInput",
                "globalFlash.gui.mChatWindow.mTextInput",
                "globalFlash.gui.mChat.mInput",
                "globalFlash.gui.mChat.mTextInput"
            ];
            var results = [];

            for (var i = 0; i < inputPaths.length; i++) {
                var input = inputPaths[i] === "EXUDM_GLOBALFLASH().gui.mChatPanel.getViewComponent().messageInput"
                    ? this.safeGetDashboardChatInput()
                    : this.getRoot(inputPaths[i]);
                if (!input) {
                    continue;
                }

                results.push(this.safeCall(inputPaths[i] + " text submit", function () {
                    if ("text" in input) {
                        input.text = command;
                    } else if ("htmlText" in input) {
                        input.htmlText = command;
                    }

                    if (typeof input.dispatchEvent === "function") {
                        var KeyboardEventDef = ChatReconnect.getDefinition("flash.events::KeyboardEvent");
                        if (KeyboardEventDef) {
                            input.dispatchEvent(new KeyboardEventDef("keyDown", true, false, 0, 13));
                            input.dispatchEvent(new KeyboardEventDef("keyUp", true, false, 0, 13));
                        }
                    }
                }));
            }

            return results;
        },

        safeGetDashboardChatInput: function () {
            try {
                if (typeof EXUDM_GLOBALFLASH === "function") {
                    return EXUDM_GLOBALFLASH().gui.mChatPanel.getViewComponent().messageInput;
                }
            } catch (e) {
            }
            return null;
        },

        getChatSearchRoots: function () {
            var roots = [];

            try {
                if (typeof EXUDM_APPLICATION === "function" && EXUDM_APPLICATION() &&
                    EXUDM_APPLICATION().GAMESTATE_ID_CHAT_PANEL) {
                    roots.push(EXUDM_APPLICATION().GAMESTATE_ID_CHAT_PANEL);
                }
            } catch (e) {
            }

            try {
                if (typeof EXUDM_GLOBALFLASH === "function" &&
                    EXUDM_GLOBALFLASH() &&
                    EXUDM_GLOBALFLASH().gui &&
                    EXUDM_GLOBALFLASH().gui.mChatPanel) {
                    roots.push(EXUDM_GLOBALFLASH().gui.mChatPanel);
                    if (typeof EXUDM_GLOBALFLASH().gui.mChatPanel.getViewComponent === "function") {
                        roots.push(EXUDM_GLOBALFLASH().gui.mChatPanel.getViewComponent());
                    }
                }
            } catch (e2) {
            }

            return roots;
        },

        hasAnyChannelTab: function (roots) {
            var pattern = /channelbaritemrenderer.*(global|help|trade|guild|officers|looking for group)|\b(global|help|trade|guild|officers|looking for group)\b/i;

            for (var i = 0; i < roots.length; i++) {
                if (this.findDisplayTarget(roots[i], pattern)) {
                    return true;
                }
            }

            return false;
        },

        hasGuildChannelTab: function (roots) {
            var pattern = /channelbaritemrenderer.*\bguild\b|gassetmanager_chattabiconguild/i;

            for (var i = 0; i < roots.length; i++) {
                if (this.findDisplayTarget(roots[i], pattern)) {
                    return true;
                }
            }

            return false;
        },

        findDisplayTarget: function (root, pattern) {
            var queue;
            var seen = [];
            var best = null;
            var current;
            var node;
            var depth;
            var score;
            var childrenCount;
            var i;

            if (!root) {
                return null;
            }

            queue = [{ node: root, depth: 0 }];

            while (queue.length && seen.length < 1600) {
                current = queue.shift();
                node = current.node;
                depth = current.depth;

                if (!node || this.seenContains(seen, node)) {
                    continue;
                }
                seen.push(node);

                score = this.scoreDisplayNode(node, pattern);
                if (score > 0) {
                    if (!best || score > best.score || (score === best.score && depth < best.depth)) {
                        best = {
                            node: node,
                            score: score,
                            depth: depth
                        };
                    }
                }

                if (depth >= 10) {
                    continue;
                }

                try {
                    if (typeof node.numChildren === "number" && typeof node.getChildAt === "function") {
                        childrenCount = Math.min(node.numChildren, 80);
                        for (i = 0; i < childrenCount; i++) {
                            queue.push({ node: node.getChildAt(i), depth: depth + 1 });
                        }
                    }
                } catch (walkError) {
                }
            }

            return best && best.node ? best.node : null;
        },

        seenContains: function (seen, value) {
            for (var i = 0; i < seen.length; i++) {
                if (seen[i] === value) {
                    return true;
                }
            }
            return false;
        },

        scoreDisplayNode: function (node, pattern) {
            var text = this.getDisplayNodeText(node);
            var score = 0;

            if (!text) {
                return 0;
            }

            if (pattern.test(text)) {
                score += 10;
            }

            try {
                if (node && typeof node.label === "string" && pattern.test(node.label)) {
                    score += 6;
                }
            } catch (e) {
            }

            try {
                if (node && typeof node.text === "string" && pattern.test(node.text)) {
                    score += 5;
                }
            } catch (e2) {
            }

            try {
                if (node && typeof node.name === "string" && pattern.test(node.name)) {
                    score += 2;
                }
            } catch (e3) {
            }

            return score;
        },

        getDisplayNodeText: function (node) {
            var out = [];

            function pushString(value) {
                if (typeof value === "string" && value) {
                    out.push(value);
                }
            }

            try {
                pushString(node.label);
            } catch (e) {
            }

            try {
                pushString(node.text);
            } catch (e2) {
            }

            try {
                pushString(node.htmlText);
            } catch (e3) {
            }

            try {
                pushString(node.name);
            } catch (e4) {
            }

            try {
                pushString(node.toolTip);
            } catch (e5) {
            }

            return out.join(" ").toLowerCase();
        },

        collectChatStatusText: function () {
            var roots = this.getChatSearchRoots();
            var seen = [];
            var texts = [];
            var queue;
            var current;
            var node;
            var text;
            var childrenCount;
            var i;
            var r;

            for (r = 0; r < roots.length; r++) {
                queue = [{ node: roots[r], depth: 0 }];

                while (queue.length && seen.length < 1600) {
                    current = queue.shift();
                    node = current.node;

                    if (!node || this.seenContains(seen, node)) {
                        continue;
                    }
                    seen.push(node);

                    text = this.getDisplayNodeText(node);
                    if (/chatstatus|statusbox|connecting to chat server/i.test(text)) {
                        texts.push(text);
                    }

                    if (current.depth >= 10) {
                        continue;
                    }

                    try {
                        if (typeof node.numChildren === "number" && typeof node.getChildAt === "function") {
                            childrenCount = Math.min(node.numChildren, 80);
                            for (i = 0; i < childrenCount; i++) {
                                queue.push({ node: node.getChildAt(i), depth: current.depth + 1 });
                            }
                        }
                    } catch (walkError) {
                    }
                }
            }

            return texts.join(" ");
        },

        checkChatHealth: function () {
            var input;
            var roots;
            var statusText;
            var panel;

            try {
                if (typeof EXUDM_GI === "function" && EXUDM_GI()) {
                    if (EXUDM_GI().mConnectionLost) {
                        return { ok: false, reason: "client reports connection lost" };
                    }
                    if (EXUDM_GI().mPacketLost) {
                        return { ok: false, reason: "client reports packet loss" };
                    }
                }
            } catch (flagError) {
            }

            panel = this.getChatPanel();
            try {
                if (panel && "connectionEstablished" in panel && panel.connectionEstablished === false) {
                    return { ok: false, reason: "chat connection is not established" };
                }
            } catch (panelError) {
            }

            input = this.safeGetDashboardChatInput();
            if (!input) {
                return { ok: false, reason: "chat input is missing" };
            }

            if (typeof input.dispatchEvent !== "function") {
                return { ok: false, reason: "chat input cannot submit messages" };
            }

            roots = this.getChatSearchRoots();
            if (!roots.length) {
                return { ok: false, reason: "chat panel is missing" };
            }

            if (!this.hasAnyChannelTab(roots)) {
                return { ok: false, reason: "chat channel tabs are missing" };
            }

            statusText = this.collectChatStatusText();
            if (/connecting|login failed|failed|disconnect|offline|not connected/i.test(statusText)) {
                return { ok: false, reason: "chat status is not ready" };
            }

            return { ok: true, reason: "ready" };
        },

        getAvatarLightRoots: function () {
            var roots = [];

            function addRoot(root) {
                if (!root) {
                    return;
                }
                for (var i = 0; i < roots.length; i++) {
                    if (roots[i] === root) {
                        return;
                    }
                }
                roots.push(root);
            }

            try {
                if (typeof EXUDM_APPLICATION === "function" && EXUDM_APPLICATION()) {
                    addRoot(EXUDM_APPLICATION().GAMESTATE_ID_AVATAR);
                }
            } catch (e) {
            }

            try {
                if (typeof swmmo !== "undefined" && swmmo && swmmo.application) {
                    addRoot(swmmo.application.GAMESTATE_ID_AVATAR);
                }
            } catch (e2) {
            }

            try {
                if (typeof globalFlash !== "undefined" && globalFlash && globalFlash.gui) {
                    addRoot(globalFlash.gui.mAvatarPanel);
                    addRoot(globalFlash.gui.mAvatar);
                    addRoot(globalFlash.gui.mAvatarInfo);
                    addRoot(globalFlash.gui.mAvatarBar);
                }
            } catch (e3) {
            }

            try {
                if (typeof EXUDM_GLOBALFLASH === "function" && EXUDM_GLOBALFLASH() && EXUDM_GLOBALFLASH().gui) {
                    addRoot(EXUDM_GLOBALFLASH().gui.mAvatarPanel);
                    addRoot(EXUDM_GLOBALFLASH().gui.mAvatar);
                    addRoot(EXUDM_GLOBALFLASH().gui.mAvatarInfo);
                    addRoot(EXUDM_GLOBALFLASH().gui.mAvatarBar);
                }
            } catch (e4) {
            }

            return roots;
        },

        findAvatarLightCandidates: function () {
            var roots = this.getAvatarLightRoots();
            var candidates = [];
            var seen = [];
            var root;
            var queue;
            var current;
            var node;
            var depth;
            var score;
            var childrenCount;
            var i;
            var r;

            for (r = 0; r < roots.length; r++) {
                root = roots[r];
                queue = [{ node: root, depth: 0 }];

                while (queue.length && seen.length < 1800) {
                    current = queue.shift();
                    node = current.node;
                    depth = current.depth;

                    if (!node || this.seenContains(seen, node)) {
                        continue;
                    }
                    seen.push(node);

                    if (depth > 0) {
                        score = this.scoreAvatarLightNode(node);
                        if (score > 0) {
                            candidates.push({
                                node: node,
                                score: score,
                                depth: depth
                            });
                        }
                    }

                    if (depth >= 10) {
                        continue;
                    }

                    try {
                        if (typeof node.numChildren === "number" && typeof node.getChildAt === "function") {
                            childrenCount = Math.min(node.numChildren, 80);
                            for (i = 0; i < childrenCount; i++) {
                                queue.push({ node: node.getChildAt(i), depth: depth + 1 });
                            }
                        }
                    } catch (walkError) {
                    }
                }
            }

            candidates.sort(function (a, b) {
                return b.score - a.score || a.depth - b.depth;
            });

            return candidates;
        },

        scoreAvatarLightNode: function (node) {
            var text = this.getDisplayNodeText(node);
            var score = 0;
            var width;
            var height;
            var x;
            var y;

            try {
                if (node.visible === false) {
                    return 0;
                }
            } catch (e) {
            }

            if (/online|presence|status|connection|indicator|light|led/i.test(text)) {
                score += 50;
            }

            try {
                width = Number(node.width);
                height = Number(node.height);
                if (isFinite(width) && isFinite(height) && width > 0 && height > 0 && width <= 34 && height <= 34) {
                    score += 12;
                }
            } catch (e2) {
            }

            try {
                x = Number(node.x);
                y = Number(node.y);
                if (isFinite(x) && isFinite(y) && x >= 0 && x <= 45 && y >= 0 && y <= 45) {
                    score += 12;
                }
            } catch (e3) {
            }

            return score >= 12 ? score : 0;
        },

        setAvatarLightVisible: function (visible) {
            var candidates;
            var target;
            var changed = 0;
            var limit;
            var i;

            if (visible) {
                return this.restoreAvatarLight();
            }

            if (this.AvatarLightHiddenNodes.length) {
                this.log("Avatar light test is already off. Use Chat Light Restore first.");
                return false;
            }

            candidates = this.findAvatarLightCandidates();
            if (!candidates.length) {
                this.log("No avatar light candidate found.");
                return false;
            }

            limit = Math.min(candidates.length, this.AvatarLightMaxHidden);

            for (i = 0; i < limit; i++) {
                target = candidates[i].node;
                try {
                    this.AvatarLightHiddenNodes.push({
                        node: target,
                        visible: target.visible,
                        alpha: target.alpha
                    });
                    target.visible = false;
                    if ("alpha" in target) {
                        target.alpha = 0;
                    }
                    changed += 1;
                    this.debug("Avatar light candidate hidden. score=" + candidates[i].score +
                        ", text=" + this.getDisplayNodeText(target));
                } catch (e) {
                }
            }

            if (changed > 0) {
                this.log("Avatar light test: hidden " + changed + " UI candidate(s). Chat is not disconnected.");
                return true;
            }

            this.AvatarLightHiddenNodes = [];
            this.log("Avatar light test failed.");
            return false;
        },

        restoreAvatarLight: function () {
            var restored = 0;
            var item;

            while (this.AvatarLightHiddenNodes.length) {
                item = this.AvatarLightHiddenNodes.pop();
                try {
                    item.node.visible = item.visible;
                    if ("alpha" in item.node) {
                        item.node.alpha = item.alpha;
                    }
                    restored += 1;
                } catch (e) {
                }
            }

            this.log(restored ? "Avatar light test restored." : "No avatar light test change to restore.");
            return restored > 0;
        },

        sendJoinCommands: function () {
            var results = [];

            for (var i = 0; i < this.Commands.length; i++) {
                var command = this.Commands[i];
                this.tracePath("CR-J" + (i + 1), "chat input join command " + command);
                results = results.concat(this.sendViaChatInputObject(command));
                results = results.concat(this.focusChatAndType(command));
            }

            return results;
        },

        refreshFriends: function () {
            var self = this;
            this.tracePath("CR-F1", "friends refresh request");
            return this.safeCall("friends refresh request", function () {
                var gi = self.getRoot("game.gi");
                var requestType = self.getDefinition("Communication.VO::dGetFriendsVO");
                var defines = self.getDefinition("defines");
                var request;

                if (!gi || !gi.mClientMessages || typeof gi.mClientMessages.SendMessagetoServer !== "function") {
                    throw new Error("Client message sender is not available.");
                }

                if (!requestType) {
                    throw new Error("dGetFriendsVO is not available.");
                }

                request = new requestType();
                if (defines && defines.VERSION_NR !== undefined) {
                    request.version = defines.VERSION_NR;
                }

                gi.mClientMessages.SendMessagetoServer(1014, gi.mCurrentPlayerZone, request);
            });
        },

        refreshServerCommunication: function () {
            var self = this;
            var results = [];

            this.tracePath("CR-S1", "InitializeServerCommunication()");
            results.push(this.safeCall("InitializeServerCommunication()", function () {
                var msg = (typeof EXUDM_MSG === "function") ? EXUDM_MSG() : null;
                var globalDef;

                if (msg && typeof msg.InitializeServerCommunication === "function") {
                    msg.InitializeServerCommunication();
                    return;
                }

                globalDef = self.getDefinition("global");
                if (globalDef && globalDef.ui && globalDef.ui.mClientMessages &&
                    typeof globalDef.ui.mClientMessages.InitializeServerCommunication === "function") {
                    globalDef.ui.mClientMessages.InitializeServerCommunication();
                    return;
                }

                throw new Error("InitializeServerCommunication is not available.");
            }));

            this.tracePath("CR-S2", "SendGetUpdates(1004)");
            results.push(this.safeCall("SendGetUpdates(1004)", function () {
                var updateType = self.getDefinition("Communication.VO::dUpdateVO");
                var update;
                var zone = (typeof EXUDM_CURRENT_VIEW_ZONE === "function") ? EXUDM_CURRENT_VIEW_ZONE() : null;
                var callId = (typeof SERVER_CALL_GET_UPDATES !== "undefined") ? SERVER_CALL_GET_UPDATES : 1004;

                if (!updateType) {
                    throw new Error("dUpdateVO is not available.");
                }
                if (typeof EXUDM_SEND !== "function") {
                    throw new Error("EXUDM_SEND is not available.");
                }

                update = new updateType();
                try {
                    if (typeof EXUDM_GI === "function" && EXUDM_GI() && typeof EXUDM_GI().GetClientTime === "function") {
                        update.synchronisationClientTime = EXUDM_GI().GetClientTime();
                    }
                } catch (timeError) {
                }

                try {
                    if (typeof EXUDM_GI === "function" && EXUDM_GI()) {
                        EXUDM_GI().mConnectionLost = false;
                    }
                } catch (flagError) {
                }

                EXUDM_SEND(callId, zone, update, null);
            }));

            return results;
        },

        getChatPanelCandidates: function () {
            var panels = [];

            function addPanel(panel) {
                if (!panel) {
                    return;
                }
                for (var i = 0; i < panels.length; i++) {
                    if (panels[i] === panel) {
                        return;
                    }
                }
                panels.push(panel);
            }

            try {
                if (typeof globalFlash !== "undefined" && globalFlash && globalFlash.gui) {
                    addPanel(globalFlash.gui.mChatPanel);
                    if (globalFlash.gui.mChatPanel && typeof globalFlash.gui.mChatPanel.getViewComponent === "function") {
                        addPanel(globalFlash.gui.mChatPanel.getViewComponent());
                    }
                    addPanel(globalFlash.gui.mChatWindow);
                    addPanel(globalFlash.gui.mChat);
                }
            } catch (e) {
            }

            try {
                if (typeof EXUDM_GLOBALFLASH === "function" && EXUDM_GLOBALFLASH() && EXUDM_GLOBALFLASH().gui) {
                    addPanel(EXUDM_GLOBALFLASH().gui.mChatPanel);
                    if (EXUDM_GLOBALFLASH().gui.mChatPanel &&
                        typeof EXUDM_GLOBALFLASH().gui.mChatPanel.getViewComponent === "function") {
                        addPanel(EXUDM_GLOBALFLASH().gui.mChatPanel.getViewComponent());
                    }
                    addPanel(EXUDM_GLOBALFLASH().gui.mChatWindow);
                    addPanel(EXUDM_GLOBALFLASH().gui.mChat);
                }
            } catch (e2) {
            }

            return panels;
        },

        tryActivateNamedChannel: function (channelNames) {
            var panels = this.getChatPanelCandidates();
            var noArgMethods = [
                "ActivateGuildChat",
                "activateGuildChat",
                "ShowGuildChat",
                "showGuildChat",
                "SelectGuildChat",
                "selectGuildChat"
            ];
            var channelMethods = [
                "ActivateChat",
                "activateChat",
                "ActivateChannel",
                "activateChannel",
                "SelectChannel",
                "selectChannel",
                "ActivateTab",
                "activateTab",
                "SelectTab",
                "selectTab",
                "SetActiveTab",
                "setActiveTab",
                "SetChannel",
                "setChannel",
                "SwitchChannel",
                "switchChannel",
                "ShowChannel",
                "showChannel"
            ];
            var i;
            var m;
            var c;

            for (i = 0; i < panels.length; i++) {
                for (m = 0; m < noArgMethods.length; m++) {
                    try {
                        if (typeof panels[i][noArgMethods[m]] === "function") {
                            panels[i][noArgMethods[m]]();
                            return true;
                        }
                    } catch (e) {
                    }
                }

                for (m = 0; m < channelMethods.length; m++) {
                    try {
                        if (typeof panels[i][channelMethods[m]] !== "function") {
                            continue;
                        }

                        for (c = 0; c < channelNames.length; c++) {
                            try {
                                panels[i][channelMethods[m]](channelNames[c]);
                                return true;
                            } catch (e2) {
                            }
                        }
                    } catch (e3) {
                    }
                }
            }

            return false;
        },

        findClickableAncestor: function (node) {
            var current = node;
            var steps = 0;

            while (current && steps < 8) {
                try {
                    if (typeof current.dispatchEvent === "function") {
                        return current;
                    }
                } catch (e) {
                }

                try {
                    current = current.parent;
                } catch (e2) {
                    current = null;
                }

                steps += 1;
            }

            return node;
        },

        clickDisplayObject: function (node) {
            var MouseEventType = window.runtime && window.runtime.flash && window.runtime.flash.events
                ? window.runtime.flash.events.MouseEvent
                : null;

            if (!node || typeof node.dispatchEvent !== "function") {
                throw new Error("Clickable chat tab target not available.");
            }

            try {
                if (typeof node.setFocus === "function") {
                    node.setFocus();
                }
            } catch (focusError) {
            }

            if (MouseEventType) {
                try {
                    node.dispatchEvent(new MouseEventType(MouseEventType.MOUSE_DOWN, true, false));
                } catch (mouseDownError) {
                }
                try {
                    node.dispatchEvent(new MouseEventType(MouseEventType.CLICK, true, false));
                } catch (clickError) {
                }
                try {
                    node.dispatchEvent(new MouseEventType(MouseEventType.MOUSE_UP, true, false));
                } catch (mouseUpError) {
                }
            }

            try {
                if (typeof node.onRelease === "function") {
                    node.onRelease();
                }
            } catch (releaseError) {
            }
        },

        tryClickChannelTab: function (pattern) {
            var roots = this.getChatSearchRoots();
            var target;
            var i;

            for (i = 0; i < roots.length; i++) {
                target = this.findDisplayTarget(roots[i], pattern);
                if (target) {
                    this.clickDisplayObject(this.findClickableAncestor(target));
                    return true;
                }
            }

            return false;
        },

        wakeGuildChat: function () {
            var self = this;
            this.tracePath("CR-G2", "guild chat wake/activate");
            return this.safeCall("guild chat wake", function () {
                if (self.tryActivateNamedChannel(["Guild", "guild", "GUILD"])) {
                    return;
                }
                if (self.tryClickChannelTab(/guild/i)) {
                    return;
                }
                throw new Error("Guild chat target was not found.");
            });
        },

        rejoinGuildChannels: function () {
            var self = this;

            this.tracePath("CR-G1", "join guild/officers channels");
            return this.safeCall("join guild/officers channels", function () {
                var gi = self.getGameInterface();
                var panel = self.getChatPanel();
                var guild = self.getCurrentPlayerGuild();

                if (panel && typeof panel.leaveGuildChannels === "function") {
                    panel.leaveGuildChannels();
                }

                if (gi && typeof gi.joinGuildChannels === "function") {
                    gi.joinGuildChannels();
                    return;
                }

                if (panel && guild && typeof panel.joinGuildChannel === "function") {
                    panel.joinGuildChannel(guild);
                    try {
                        if (guild.playerPermissions &&
                            typeof guild.playerPermissions.OfficersChannel === "function" &&
                            guild.playerPermissions.OfficersChannel() &&
                            typeof panel.joinOfficersChannel === "function") {
                            panel.joinOfficersChannel(guild);
                        }
                    } catch (officersError) {
                    }
                    return;
                }

                throw new Error("Guild join entry point was not found.");
            });
        },

        repairGuildChat: function () {
            return [
                this.rejoinGuildChannels(),
                this.wakeGuildChat()
            ];
        },

        scheduleGuildRepairRetries: function () {
            var self = this;
            var delays = [1500, 3500, 6000];

            for (var i = 0; i < delays.length; i++) {
                setTimeout(function () {
                    self.repairGuildChat();
                }, delays[i]);
            }
        },

        refreshGui: function () {
            var results = [];

            this.tracePath("CR-U1", "globalFlash.gui.UpdateGuiOnZoneLoad()");
            results.push(this.safeCall("globalFlash.gui.UpdateGuiOnZoneLoad()", function () {
                if (typeof globalFlash !== "undefined" && globalFlash && globalFlash.gui &&
                    typeof globalFlash.gui.UpdateGuiOnZoneLoad === "function") {
                    globalFlash.gui.UpdateGuiOnZoneLoad();
                    return;
                }
                throw new Error("UpdateGuiOnZoneLoad is not available.");
            }));

            return results;
        },

        countSuccess: function (results) {
            var count = 0;
            for (var i = 0; i < results.length; i++) {
                if (results[i] && results[i].ok) {
                    count += 1;
                }
            }
            return count;
        },

        summarize: function (results) {
            var labels = [];
            for (var i = 0; i < results.length; i++) {
                if (results[i] && results[i].ok) {
                    labels.push(results[i].label);
                }
            }
            return labels.join(", ");
        },

        run: function (reason) {
            var self = this;
            var now = new Date().getTime();
            var health;
            var useServerRefresh;
            var guildOnly;

            if (this.IsRunning) {
                this.log("Reconnect is already running.");
                return false;
            }

            if (reason !== "manual" && this.LastRunAt && now - this.LastRunAt < this.CooldownMs) {
                return false;
            }

            health = this.checkChatHealth();
            useServerRefresh = reason === "manual" && !health.ok;
            guildOnly = reason === "manual" && health.ok;

            if (reason !== "manual") {
                if (health.ok) {
                    this.log("Chat already looks connected; reconnect skipped.");
                    this.debug("Health check: " + health.reason + ".");
                    return false;
                }
            }
            this.debug("Reconnect health check: " + health.reason + ".");

            this.IsRunning = true;
            this.LastRunAt = now;
            this.log(guildOnly ? "Refreshing guild chat, please wait..." : "Trying to reconnect the chat, please wait...");
            this.tracePath("CR-START", "diagnostic reconnect path markers enabled");
            if (reason) {
                this.debug("Reconnect reason: " + reason + ".");
            }

            setTimeout(function () {
                var results = [];
                var finish;
                var runReconnectSteps;

                finish = function () {
                    self.IsRunning = false;

                    var successCount = self.countSuccess(results);
                    if (successCount > 0) {
                        self.debug("Reconnect nudge sent via " + successCount + " path(s): " + self.summarize(results));
                        self.scheduleGuildRepairRetries();
                        setTimeout(function () {
                            var afterHealth = self.checkChatHealth();
                            if (afterHealth.ok) {
                                self.log(guildOnly ? "Guild chat refresh sent." : "Chat reconnected successfully.");
                            } else {
                                self.log("Reconnect command sent, but chat is not ready yet.");
                                self.debug("Post-reconnect health check: " + afterHealth.reason + ".");
                            }
                        }, self.SuccessCheckDelayMs);
                    } else {
                        self.log("No direct chat reconnect path was found. Try the menu again, or restart the client if chat stays dead.");
                    }
                };

                runReconnectSteps = function () {
                    if (guildOnly) {
                        results = results.concat(self.repairGuildChat());
                    } else {
                        results = results.concat(self.resetChatMediator());
                        results = results.concat(self.callReconnectMethods());
                        results = results.concat(self.sendJoinCommands());
                        results.push(self.refreshFriends());
                        results = results.concat(self.refreshGui());
                        results = results.concat(self.repairGuildChat());
                    }
                    finish();
                };

                if (useServerRefresh) {
                    results = results.concat(self.refreshServerCommunication());
                    setTimeout(runReconnectSteps, self.ForceServerRefreshDelayMs);
                    return;
                }

                runReconnectSteps();
            }, this.AttemptDelayMs);

            return true;
        },

        installMenu: function () {
            var self = this;

            function addMenu() {
                if (typeof addToolsMenuItem === "function") {
                    addToolsMenuItem(self.MenuTitle, function () {
                        self.run("manual");
                    });
                    self.debug("Tools menu added.");
                    return true;
                }
                return false;
            }

            if (addMenu()) {
                return;
            }

            var waitHandle = setInterval(function () {
                self.MenuRetryCount += 1;
                if (addMenu()) {
                    clearInterval(waitHandle);
                    return;
                }

                if (self.MenuRetryCount >= self.MenuRetryMax) {
                    clearInterval(waitHandle);
                    self.log("Tools menu was not available in time.");
                }
            }, this.MenuRetryMs);
        }
    };

    window._chatReconnect = ChatReconnect;
    window.runChatReconnect = function () {
        return window._chatReconnect.run("manual");
    };

    ChatReconnect.init();
})();
