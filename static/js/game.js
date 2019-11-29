$(document).ready(function() {

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
            match: function() {
                layx.confirm('提示', '要开始匹配吗？', null, {
                    buttons: [{
                            label: '确定',
                            callback: function(id, button, event) {
                                layx.destroy(id);
                                layx.load('match', "正在寻找玩家...");
                                ws.send(JSON.stringify({
                                    code: "matching",
                                    data: "123"
                                }));
                            }
                        },
                        {
                            label: '取消',
                            callback: function(id, button, event) {
                                layx.destroy(id);
                            }
                        }
                    ]
                });
            },
            clear: function() {
                this.tinput = "";
                this.toutput = "";
            },
            view_info: function() { layx.iframe(1, "查看玩家", '/info.html') },
            view_rank: function() { layx.iframe(1, "查看排名", '/rank.html') },
            view_room: function() { layx.iframe(1, "查看房间", '/room.html') },
        }
    });

    var ws = new WebSocket('ws://lan-ws.learn.io:7458');
    var ws_open = false;
    ws.onopen = function() {
        console.log('ws::open');
        ws_open = true;
        setTimeout(function() {
            ws.send(JSON.stringify({
                code: "hello",
                data: "123"
            }));
        }, 100);
    };
    ws.onmessage = function(data) {
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
            layx.msg("请点击匹配按钮开始游戏");
        } else if (obj.code === 'matched') {
            Vue.set(app.player, 'enemy', obj.data);
            layx.destroy('match');
            begin_match();
        } else if (obj.code === 'match_disconnect') {
            if (window.pixi.restarting) {
                clearTimeout(window.pixi.restarting);
                window.pixi.restarting = null;
                if (window.pixi.ptlist) window.pixi.ptlist = [];
                if (window.pixi.focus_circle) window.pixi.focus_circle = null;
                layx.destroy('restart');
            }
            Vue.set(app.player, 'enemy', "");
            layx.msg("对方已断开连接");
            layx.load('reload', "正在刷新……");
            reset();
            layx.msg("请点击匹配按钮开始游戏");
        } else if (obj.code === 'error') {
            layx.msg(obj.data);
        } else if (obj.code === 'rank') {
            if (window.pixi && window.pixi.set_rank) window.pixi.set_rank(obj.data);
        } else if (obj.code === 'game_turn_on') {
            window.pixi.set_text("轮到你下棋了！");
            if (window.pixi.stu) {
                layx.msg("30秒超时将判负！");
                window.settime = setTimeout(function() {
                    location.reload();
                }, 30000);
            }
        } else if (obj.code === 'game_turn_off') {
            window.pixi.set_text("等待对方下棋……");
            if (window.settime) {
                clearTimeout(window.settime);
                window.settime = null;
            }
        } else if (obj.code === 'game_set') {
            window.pixi.draw_pt(obj.data, window.pixi);
        } else if (obj.code === 'game_broadcast') {
            if (obj.data.code == 1) {
                window.pixi.set_enemy(obj.data.enemy);
            }
        } else if (obj.code === 'game_set_player') {
            var text = ["", "你是黑方", "你是白方", "你赢了！", "你输了！", "平手！"];
            if (text[obj.data])
                window.pixi.set_player(text[obj.data]);
            if (obj.data >= 3 && obj.data <= 5) {
                if (window.settime) {
                    clearTimeout(window.settime);
                    window.settime = null;
                }
                layx.msg('比赛已结束！');
                window.pixi.restart();
            }
        }
    }
    ws.onclose = function() {
        console.log('ws::close');
        layx.load('reload', "服务器已断开连接...");
        ws_open = false;
        setTimeout(function re() {
            $.get("/api2/ping", function() { location.reload(); }).error(function() {
                setTimeout(re, 2000);
            });
        }, 2000);
    }
    ws.οnerrοr = function() {
        console.error('ws::error');
        ws_open = false;
    }

    $("#send").click(function() {
        if (app.tinput.length)
            ws.send(JSON.stringify({
                code: "broadcast",
                data: app.tinput
            }));
        else
            layx.alert('错误', '请输入内容');
    });

    $(window).unload(function() {
        if (ws_open)
            ws.send(JSON.stringify({
                code: "close",
                data: "client disconnect"
            }));
    });

    (function() {
        let type = "WebGL"
        if (!PIXI.utils.isWebGLSupported()) {
            type = "Canvas"
        }

        PIXI.utils.sayHello(type)
    });

    $(window).resize(function() {
        if (window.pixi && window.pixi.resize_cb)
            window.pixi.resize_cb();
    });

    function show_info() {
        layx.html('need-to-know', '游戏须知', layx.multiLine(function() {
            /*
<style type="text/css">
#about-layx{
       padding:10px;
       line-height:1.5;

about-layx h2{
   border-bottom:1px solid #ccc;

about-layx label {
   margin: 0 2px;
   padding: 0 5px;
   white-space: nowrap;
   border: 0;
   background-color: #f8f8f8;
   border-radius: 3px;
   display:inline-block;

</style>
<div id="about-layx">
   <h2>游戏须知</h2>
   <br>
   <ul>
       <li><label>（一）</label>游戏分胜、负、平三种结果，胜得一分，负和平不得分</li>
       <li><label>（二）</label>回合超过30秒即判负，并重新匹配，记入逃跑次数</li>
       <li><label>（三）</label>积分 = 赢的次数 - 逃跑次数</li>
       <li><label>（四）</label>开局后未下子前以及棋局结束后未开始的10秒内离开将不视为逃跑</li>
   </ul>
   <hr>
   <div style="float:right">
       <button type="button" class="layui-btn" onclick="window.close_info()">关闭</button>
   </div>
</div>
            */
        }), {
            shadable: true,
            alwaysOnTop: true,
        });
        layx.setSize('need-to-know', { width: 500, height: 250 }, true);
        layx.setPosition('need-to-know', 'ct');
    }

    window.close_info = function() {
        layx.destroy('need-to-know');
    };

    var begin_match = function() {

        layx.load('gaming', "游戏初始化中……");

        var app = new PIXI.Application({
            antialias: true,
            autoDensity: true
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
        turnText.y = 320;
        app.stage.addChild(turnText);
        window.pixi.set_text = function(t) {
            turnText.text = t;
        };

        const rankText = new PIXI.Text('', new PIXI.TextStyle({
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
        rankText.x = 920;
        rankText.y = 60;
        rankText.text = "== 排行榜 ==";
        app.stage.addChild(rankText);

        var old_rank = [];
        window.pixi.set_rank = function(t) {
            for (var oldi in old_rank) {
                app.stage.removeChild(old_rank[oldi]);
            }
            var h = 90;
            var ii = 1;
            if (!t.length) {
                const rplayerText = new PIXI.Text('', new PIXI.TextStyle({
                    fontFamily: "Kaiti,Arial",
                    fontSize: 24,
                    fill: "white",
                    stroke: '#0033ff',
                    strokeThickness: 4,
                    dropShadow: true,
                    dropShadowColor: "#000000",
                    dropShadowBlur: 4,
                    dropShadowAngle: Math.PI / 6,
                    dropShadowDistance: 6,
                }));
                rplayerText.x = 920;
                rplayerText.y = h;
                rplayerText.text = "没有纪录";
                app.stage.addChild(rplayerText);
                old_rank.push(rplayerText);
            } else
                for (var ti in t) {
                    const rplayerText = new PIXI.Text('', new PIXI.TextStyle({
                        fontFamily: "Kaiti,Arial",
                        fontSize: 24,
                        fill: "white",
                        stroke: '#0033ff',
                        strokeThickness: 4,
                        dropShadow: true,
                        dropShadowColor: "#000000",
                        dropShadowBlur: 4,
                        dropShadowAngle: Math.PI / 6,
                        dropShadowDistance: 6,
                    }));
                    rplayerText.x = 920;
                    rplayerText.y = h;
                    rplayerText.text = "No." + (ii) + " " + t[ti].cls + " " + t[ti].name + "  积分：" + (t[ti].win - t[ti].run);
                    h += 30;
                    ii++;
                    app.stage.addChild(rplayerText);
                    old_rank.push(rplayerText);
                }
        };

        const playerText = new PIXI.Text('', new PIXI.TextStyle({
            fontFamily: "Kaiti,Arial",
            fontSize: 24,
            fill: "white",
            stroke: '#0033ff',
            strokeThickness: 4,
            dropShadow: true,
            dropShadowColor: "#000000",
            dropShadowBlur: 4,
            dropShadowAngle: Math.PI / 6,
            dropShadowDistance: 6,
        }));
        playerText.x = 80;
        playerText.y = 280;
        app.stage.addChild(playerText);
        window.pixi.set_player = function(t) {
            playerText.text = t;
        };

        const enemyText = new PIXI.Text('', new PIXI.TextStyle({
            fontFamily: "Kaiti,Arial",
            fontSize: 24,
            fill: "white",
            stroke: '#0033ff',
            strokeThickness: 4,
            dropShadow: true,
            dropShadowColor: "#000000",
            dropShadowBlur: 4,
            dropShadowAngle: Math.PI / 6,
            dropShadowDistance: 6,
        }));
        enemyText.x = 80;
        enemyText.y = 400;
        app.stage.addChild(enemyText);
        window.pixi.set_enemy = function(t) {
            enemyText.text = t;
        };

        const graphics = new PIXI.Graphics();

        var r = 30;
        var edges = 30 * 19;
        var offset_w = 315;
        var offset_h = 10;

        graphics.beginFill(0xeeb766);
        graphics.drawRect(offset_w, offset_h, edges, edges);
        graphics.endFill();
        graphics.lineStyle(1, 0x444444, 1);
        for (var i = 15; i <= edges; i += r) {
            graphics.moveTo(offset_w + 15, offset_h + i);
            graphics.lineTo(offset_w + edges - 15, offset_h + i);
            graphics.moveTo(offset_w + i, offset_h + 15);
            graphics.lineTo(offset_w + i, offset_h + edges - 15);
        }

        var background = new PIXI.Container();
        background.addChild(graphics);
        background.cacheAsBitmap = true;
        app.stage.addChild(background);

        background.interactive = true;
        background.click = function(data) {
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

        var chess_layer = new PIXI.Container();
        app.stage.addChild(chess_layer);

        window.pixi.ptlist = [];
        window.pixi.focus_circle = null;
        window.pixi.draw_pt = function(obj, _pixi) {
            const graphics = new PIXI.Graphics();
            graphics.beginFill(obj.type == 1 ? 0x222222 : 0xffffff);
            graphics.drawCircle(obj.pos.x * r + offset_w - r / 2, obj.pos.y * r + offset_h - r / 2, r / 2 - 2);
            graphics.endFill();
            chess_layer.addChild(graphics);
            _pixi.ptlist.push(obj);
            var mapsf = [
                [],
                [10, 6, 16],
                [6, 6, 16],
                [5, 7, 12],
            ];
            var txt = "" + _pixi.ptlist.length;
            if (txt.length < mapsf.length) {
                const numberText = new PIXI.Text(txt, new PIXI.TextStyle({
                    fontFamily: "Arial",
                    fontSize: mapsf[txt.length][2],
                    fill: obj.type != 1 ? 0x222222 : 0xffffff,
                    stroke: obj.type != 1 ? 0x222222 : 0xffffff
                }));
                numberText.x = obj.pos.x * r + offset_w - r + mapsf[txt.length][0];
                numberText.y = obj.pos.y * r + offset_h - r + mapsf[txt.length][1];
                chess_layer.addChild(numberText);
                if (_pixi.focus_circle) {
                    chess_layer.removeChild(_pixi.focus_circle);
                }
                const graphics = new PIXI.Graphics();
                graphics.lineStyle(2, 0xff0000, 1);
                graphics.drawCircle(obj.pos.x * r + offset_w - r / 2, obj.pos.y * r + offset_h - r / 2, r / 2 - 2);
                chess_layer.addChild(graphics);
                _pixi.focus_circle = graphics;
            }
        };

        /*requestAnimationFrame(animate);

        function animate() {
            requestAnimationFrame(animate);
            //app.renderer.render(app.stage);
        }*/

        window.pixi.resize_cb = function() {
            app.renderer.resize(window.innerWidth, window.innerHeight);
        };

        window.pixi.restart = function() {
            setTimeout(function() {
                layx.load('restart', '棋局准备中，10秒后开始<br>现在可以退出游戏');
                window.pixi.restarting = setTimeout(function() {
                    chess_layer.removeChildren();
                    window.pixi.ptlist = [];
                    window.pixi.focus_circle = null;
                    layx.destroy('restart');
                    ws.send(JSON.stringify({
                        code: "game_restart",
                        data: "123"
                    }));
                }, 10000);
            }, 2000);
        };

        layx.destroy('gaming');

        window.pixi.stu = false;

        function post_rank_update() {
            if (window._login && window._login.s && window._login.st && window._login.st.stuname) {
                ws.send(JSON.stringify({
                    code: "game_rank",
                    data: {
                        st: window._login.st
                    }
                }));
                window.pixi.stu = true;
                return;
            }
            setTimeout(post_rank_update, 1000);
        }
        setTimeout(post_rank_update, 1000);
    };

    var reset = function() {
        $("#app").css('display', 'block');
        $("#game").html("");
        delete window.pixi;
        layx.destroy('reload');
    };
    setTimeout(show_info, 1000);
});