var express = require('express');
var app = new express();

app.use(express.static('static'));

app.listen(8080);
console.log('start app');

var users = {};
var userid = 1;
var users_matching = [];

const broadcast = (server, info) => {
    console.log('ws::broadcast', info)
    server.connections.forEach(function (conn) {
        conn.sendText(JSON.stringify({ code: "broadcast", data: info }))
    })
}

var ws = require('nodejs-websocket');
var uuid = require('node-uuid');
var server = ws.createServer(function (conn) {
    console.info("new connection")
    conn.on('text', function (data) {
        if (users[conn.key])
            console.info('ws::text', users[conn.key].id, data);
        let obj = JSON.parse(data);
        let code = obj.code;
        if (code === 'close') {
            try {
                conn.close(obj.data);
            } catch (error) {
                console.error('ws::error', error);
            }
        } else if (code === 'broadcast') {
            broadcast(server, obj.data)
        } else if (code === 'hello') {
            var uid = uuid.v1();
            users[conn.key] = {
                uid: uid,
                conn: conn,
                id: userid
            };
            console.info("new users", userid, uid);
            conn.sendText(JSON.stringify({ code: "uid", data: uid }));
            console.info("now users", Object.keys(users).length);
            userid++;
        } else if (code === 'matching') {
            if (users[conn.key].enemy && users[users[conn.key].enemy]) {
                conn.sendText(JSON.stringify({ code: "matched", data: users[users[conn.key].enemy].uid }));
                return;
            } else {
                delete users[conn.key].enemy;
            }
            if (users_matching.length >= 1) {
                var enemy = users_matching[0];
                users_matching = users_matching.slice(1);
                users[conn.key].enemy = enemy;
                users[enemy].enemy = conn.key;
                users[enemy].conn.sendText(JSON.stringify({ code: "matched", data: users[conn.key].uid }));
                conn.sendText(JSON.stringify({ code: "matched", data: users[enemy].uid }));
            } else {
                users_matching.push(conn.key);
            }
        }
    });
    conn.on('connect', function (code) {
        console.log('ws::connect', code);
    });
    conn.on('close', function (code) {
        console.log('ws::close', code);
        if (users[conn.key]) {
            if (users[conn.key].enemy && users[users[conn.key].enemy] && users[users[conn.key].enemy].enemy) {
                users[users[conn.key].enemy].conn.sendText(JSON.stringify({ code: "match_disconnect", data: users[conn.key].uid }));
                delete users[users[conn.key].enemy].enemy;
            }
            delete users[conn.key];
        }
        console.info("now users", Object.keys(users).length);
    });
    conn.on('error', function (code) {
        console.log('ws::error', code);
        try {
            conn.close('force close');
        } catch (error) {
            console.error('ws::error', error);
        }
    });
})

server.listen(8081);
console.log('start ws');