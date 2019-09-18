$(document).ready(function () {

    layx.load('init', "正在获取用户ID...");

    var app = new Vue({
        el: '#app',
        data: {
            player: {
                uid: "",
                enemy: ""
            },
            tinput: "",
            toutput: ""
        },
        methods: {
            match: function () {
                layx.load('match', "正在寻找玩家...");
                ws.send(JSON.stringify({
                    code: "matching",
                    data: "123"
                }));
            },
            clear: function () {
                this.tinput = "";
                this.toutput = "";
            }
        }
    });

    var ws = new WebSocket('ws://localhost:8081');
    var ws_open = false;
    ws.onopen = function () {
        console.log('ws::open');
        ws_open = true;
        setTimeout(function () {
            ws.send(JSON.stringify({
                code: "hello",
                data: "123"
            }));
        }, 100);
    };
    ws.onmessage = function (data) {
        data = data.data;
        console.info("data", data);
        var obj = JSON.parse(data);
        if (obj.code === 'broadcast') {
            app.toutput = obj.data;
            if (obj.data === "matching" && !app.player.enemy.length) {
                layx.load('match', "自动：正在寻找玩家...");
                ws.send(JSON.stringify({
                    code: "matching",
                    data: "321"
                }));
            }
        } else if (obj.code === 'uid') {
            Vue.set(app.player, 'uid', obj.data);
            console.info("uid", obj.data);
            layx.destroy('init');
            layx.msg("准备匹配中...");
            setTimeout(function () {
                app.match();
            }, 2000);
        } else if (obj.code === 'matched') {
            Vue.set(app.player, 'enemy', obj.data);
            layx.destroy('match');
            begin_match();
        } else if (obj.code === 'match_disconnect') {
            Vue.set(app.player, 'enemy', "");
            layx.msg("对方已断开连接");
            layx.load('reload', "正在刷新……");
            reset();
        } else if (obj.code === 'error') {
            layx.msg(obj.data);
        } else if (obj.code === 'game_turn_on') {
            window.pixi.turnText.text = "轮到你下棋了！";
        } else if (obj.code === 'game_turn_off') {
            window.pixi.turnText.text = "等待对方下棋……";
        }
    }
    ws.onclose = function () {
        console.log('ws::close');
        layx.load('reload', "服务器已断开连接...");
        ws_open = false;
        setTimeout(function re() {
            $.get("/api2/ping", function () { location.reload(); }).error(function () {
                setTimeout(re, 2000);
            });
        }, 2000);
    }
    ws.οnerrοr = function () {
        console.error('ws::error');
        ws_open = false;
    }

    $("#send").click(function () {
        if (app.tinput.length)
            ws.send(JSON.stringify({
                code: "broadcast",
                data: app.tinput
            }));
        else
            layx.alert('错误', '请输入内容');
    });

    $(window).unload(function () {
        if (ws_open)
            ws.send(JSON.stringify({
                code: "close",
                data: "client disconnect"
            }));
    });

    (function () {
        let type = "WebGL"
        if (!PIXI.utils.isWebGLSupported()) {
            type = "Canvas"
        }

        PIXI.utils.sayHello(type)
    });

    $(window).resize(function () {
        if (window.pixi && window.pixi.resize_cb)
            window.resize_cb();
    });

    var begin_match = function () {

        layx.load('gaming', "游戏初始化中……");

        var app = new PIXI.Application({
            antialias: true
        });
        window.pixi = {
            pixi: app
        };

        app.renderer.backgroundColor = 0xeeeeee;
        app.renderer.view.style.position = "absolute";
        app.renderer.view.style.display = "block";
        app.renderer.autoDensity = true;
        app.renderer.resize(window.innerWidth, window.innerHeight);

        $("#app").css('display', 'none');
        $(app.view).appendTo($("#game"));

        const richText = new PIXI.Text('-- 五子棋 --',
            new PIXI.TextStyle({
                fontFamily: 'Arial',
                fontSize: 36,
                fontStyle: 'italic',
                fontWeight: 'bold',
                fill: ['#ffffff', '#00ff99'], // gradient
                stroke: '#4a1850',
                strokeThickness: 5,
                dropShadow: true,
                dropShadowColor: '#000000',
                dropShadowBlur: 4,
                dropShadowAngle: Math.PI / 6,
                dropShadowDistance: 6,
                wordWrap: true,
                wordWrapWidth: 440,
            }));
        richText.x = 80;
        richText.y = 200;
        app.stage.addChild(richText);

        const turnText = new PIXI.Text('', new PIXI.TextStyle({
            fontFamily: "Arial",
            fontSize: 24,
            fill: "white",
            stroke: '#ff3300',
            strokeThickness: 4,
            dropShadow: true,
            dropShadowColor: "#000000",
            dropShadowBlur: 4,
            dropShadowAngle: Math.PI / 6,
            dropShadowDistance: 6,
        }));
        turnText.x = 80;
        turnText.y = 300;
        app.stage.addChild(turnText);
        window.pixi.turnText = turnText;

        const graphics = new PIXI.Graphics();

        var r = 30;
        var edges = 30 * 19;
        var offset_w = 315;
        var offset_h = 10;

        graphics.lineStyle(1, 0x444444, 1);
        for (var i = 15; i <= edges; i += r) {
            graphics.moveTo(offset_w + 15, offset_h + i);
            graphics.lineTo(offset_w + edges - 15, offset_h + i);
            graphics.moveTo(offset_w + i, offset_h + 15);
            graphics.lineTo(offset_w + i, offset_h + edges - 15);
        }

        graphics.interactive = true;
        graphics.hitArea = graphics.getBounds();
        graphics.click = function (data) {
            var d = data.data;
            console.group("鼠标消息");
            console.info("PIXI::Click", d.global.x, d.global.y);
            var x = Math.ceil((d.global.x - offset_w) / r); // 列
            var y = Math.ceil((d.global.y - offset_h) / r); // 行
            console.info("Game::Click", x, y);
            ws.send(JSON.stringify({
                code: "game_go",
                data: JSON.stringify({ x: x, y: y })
            }));
            console.groupEnd();
        }

        app.stage.addChild(graphics);

        const chess = new PIXI.Graphics();
        app.stage.addChild(chess);

        requestAnimationFrame(animate);

        function animate() {
            requestAnimationFrame(animate);
            app.renderer.render(app.stage);
        }

        window.pixi.resize_cb = function () {
            app.renderer.resize(window.innerWidth, window.innerHeight);
        };

        layx.destroy('gaming');
    };

    var reset = function () {
        $("#app").css('display', 'block');
        $("#game").html("");
        delete window.pixi;
        layx.destroy('reload');
    };
});