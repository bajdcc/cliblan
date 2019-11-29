$(document).ready(function() {
    function gup(name) {
        name = name.replace(/[\[]/, "\\\[").replace(/[\]]/, "\\\]");
        var regexS = "[\\?&]" + name + "=([^&#]*)";
        var regex = new RegExp(regexS);
        var results = regex.exec(location.href);
        if (results === null) {
            return null;
        } else {
            return results[1];
        }
    }

    layx.load('init', "正在查询房间信息...");

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

    var begin_match = function() {
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
        turnText.y = 360;
        app.stage.addChild(turnText);
        window.pixi.set_text = function(t) {
            turnText.text = t;
        };
        window.pixi.get_text = function(t) {
            return turnText.text;
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
        window.pixi.get_player = function(t) {
            return playerText.text;
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

        background.interactive = false;

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

        function failed() {
            layx.alert("错误", "房间已关闭！");
            layx.msg("10秒后跳转到主页");
            setTimeout(function() { location.href = '/' }, 10000);
        }

        function post_rank_update() {
            layx.destroy('init');
            var id = gup('id');
            if (!id) {
                return failed();
            }
            $.getJSON('/api', {
                    query: "{watch(id:" + id + ",time:\"" + (+new Date()) + "\"){room{id,player1,player1_info,player2,player2_info}pts}}"
                },
                function(data) {
                    if (!data.data.watch) {
                        return failed();
                    }
                    var pts = JSON.parse(data.data.watch.pts);
                    var type = window.pixi.ptlist.length % 2 == 0 ? 1 : 0;
                    if (window.pixi.get_player() == '') {
                        var p1 = '匿名';
                        if (data.data.watch.room.player1_info)
                            p1 = JSON.parse(data.data.watch.room.player1_info).name;
                        var p2 = '匿名';
                        if (data.data.watch.room.player2_info)
                            p2 = JSON.parse(data.data.watch.room.player2_info).name;
                        var ss = '黑方：' + p1;
                        ss += '\n';
                        ss += '白方：' + p2;
                        window.pixi.set_player(ss);
                    }
                    if (window.pixi.ptlist.length > pts.length) {
                        window.pixi.ptlist = [];
                        window.pixi.focus_circle = null;
                        chess_layer.removeChildren();
                        window.pixi.set_text('');
                        window.pixi.set_player('');
                    } else {
                        for (var i = window.pixi.ptlist.length; i < pts.length; i++) {
                            window.pixi.draw_pt({
                                type: type,
                                pos: pts[i]
                            }, window.pixi);
                            type = 1 - type;
                        }
                        window.pixi.set_text('当前执子：' + (type != 0 ? '黑方' : '白方'));
                    }
                    setTimeout(post_rank_update, 1000);
                }
            ).fail(function() {
                return failed();
            });
        }

        setTimeout(post_rank_update, 100);
    };
    setTimeout(begin_match, 1000);

});